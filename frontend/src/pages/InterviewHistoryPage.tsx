import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {AnimatePresence, motion} from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {historyApi} from '../api/history';
import {interviewApi, type TextSessionMeta} from '../api/interview';
import {voiceInterviewApi, type SessionMeta} from '../api/voiceInterview';
import {evaluationApi, type TrendGroup} from '../api/evaluation';
import {formatDate} from '../utils/date';
import {getScoreProgressColor} from '../utils/score';
import {skillApi, type SkillDTO} from '../api/skill';
import {getTemplateName} from '../utils/voiceInterview';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';
import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  Mic,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';

type InterviewType = 'all' | 'text' | 'voice';

interface UnifiedInterviewItem {
  id: string;
  type: 'text' | 'voice';
  title: string;
  sessionId: string | number;
  status: string;
  evaluateStatus?: string;
  evaluateError?: string;
  overallScore: number | null;
  totalQuestions?: number;
  actualDuration?: number;
  createdAt: string;
  resumeId?: number;
  voiceSessionId?: number | string;
}

interface InterviewStats {
  totalCount: number;
  completedCount: number;
  averageScore: number;
}

function isCompletedStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'EVALUATED';
}

function isLiveStatus(status: string): boolean {
  return status === 'IN_PROGRESS' || status === 'PAUSED';
}

function isEvaluateCompleted(item: UnifiedInterviewItem): boolean {
  if (item.evaluateStatus === 'COMPLETED') return true;
  if (item.evaluateStatus === null && item.status === 'EVALUATED') return true;
  return false;
}

function isEvaluating(item: UnifiedInterviewItem): boolean {
  return item.evaluateStatus === 'PENDING' || item.evaluateStatus === 'PROCESSING';
}

function isEvaluateFailed(item: UnifiedInterviewItem): boolean {
  return item.evaluateStatus === 'FAILED';
}

function StatusIcon({ item }: { item: UnifiedInterviewItem }) {
  if (isEvaluateFailed(item)) return <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400"/>;
  if (isEvaluating(item)) return <RefreshCw className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin"/>;
  if (isEvaluateCompleted(item)) return <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400"/>;
  if (item.status === 'IN_PROGRESS') return <PlayCircle className="w-4 h-4 text-blue-500 dark:text-blue-400"/>;
  return <Clock className="w-4 h-4 text-yellow-500 dark:text-yellow-400"/>;
}

function getStatusText(item: UnifiedInterviewItem): string {
  if (isEvaluateFailed(item)) return '评估失败';
  if (isEvaluating(item)) return item.evaluateStatus === 'PROCESSING' ? '评估中' : '等待评估';
  if (isEvaluateCompleted(item)) return '已完成';
  if (item.status === 'IN_PROGRESS') return '进行中';
  if (item.status === 'PAUSED') return '已暂停';
  if (isCompletedStatus(item.status)) return '已提交';
  return '已创建';
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs}秒`;
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

const DIMENSION_LABELS: Record<string, string> = {
  Communication: '口头表达',
  'Technical Knowledge': '技术知识',
  'Problem Solving': '问题解决',
  'Project Storytelling': '项目叙述',
};

const DIMENSION_COLORS = ['#8B5CF6', '#3B82F6', '#F59E0B', '#10B981'];

function TypeBadge({ type }: { type: 'text' | 'voice' }) {
  if (type === 'voice') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-xs font-medium">
        <Mic className="w-3 h-3" />
        语音
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
      <FileText className="w-3 h-3" />
      文字
    </span>
  );
}

interface InterviewHistoryPageProps {
  onBack: () => void;
  onViewInterview: (sessionId: string, resumeId?: number) => void;
  onRestartInterview?: (resumeId: number) => void;
  onContinueInterview?: (sessionId: string) => void;
}

/** Shallow comparison for polling change-detection */
function itemsEqual(a: UnifiedInterviewItem[], b: UnifiedInterviewItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i], bi = b[i];
    if (ai.id !== bi.id || ai.status !== bi.status ||
        ai.evaluateStatus !== bi.evaluateStatus || ai.overallScore !== bi.overallScore) return false;
  }
  return true;
}

export default function InterviewHistoryPage({ onBack: _onBack, onViewInterview, onRestartInterview, onContinueInterview }: InterviewHistoryPageProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<UnifiedInterviewItem[]>([]);
  const [stats, setStats] = useState<InterviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<InterviewType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'incomplete'>('all');
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'time_desc' | 'time_asc' | 'score_desc' | 'score_asc'>('time_desc');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deleteItem, setDeleteItem] = useState<UnifiedInterviewItem | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const pollingRef = useRef<number | null>(null);
  const skillsRef = useRef<SkillDTO[]>([]);
  const skillsLoadedRef = useRef(false);
  const voiceSessionIdsRef = useRef<Set<number>>(new Set());
  const [trendGroups, setTrendGroups] = useState<TrendGroup[]>([]);
  const [dimensionAverages, setDimensionAverages] = useState<{ dimension: string; averageScore: number }[]>([]);
  const [recentSuggestions, setRecentSuggestions] = useState<string[]>([]);
  const [chartRange, setChartRange] = useState<'5' | '10' | '20' | '1d' | '7d' | '30d'>('5');

  const loadAll = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);

    try {
      // Only fetch skills on first load; reuse cached ref on polling
      if (!skillsLoadedRef.current) {
        skillsRef.current = await skillApi.listSkills().catch(() => [] as SkillDTO[]);
        skillsLoadedRef.current = true;
      }
      const loadedSkills = skillsRef.current;

      // 获取文字面试
      const textInterviews = await loadTextInterviews(loadedSkills);

      // 获取语音面试列表
      const voiceSessionsList = await voiceInterviewApi.getAllSessions().catch(() => [] as SessionMeta[]);

      // 更新语音面试会话ID缓存
      voiceSessionIdsRef.current = new Set(voiceSessionsList.map((s: SessionMeta) => s.sessionId));

      // 并发获取所有已完成的语音面试评估详情
      const voiceSessions = await Promise.all(
        voiceSessionsList.map(async (session) => {
          if (session.evaluateStatus === 'COMPLETED' && voiceSessionIdsRef.current.has(session.sessionId)) {
            try {
              const response = await voiceInterviewApi.getEvaluation(Number(session.sessionId)).catch(() => null);
              return {
                id: `voice-${session.sessionId}`,
                type: 'voice' as const,
                title: session.roleType,
                sessionId: String(session.sessionId),
                status: session.status,
                evaluateStatus: session.evaluateStatus,
                evaluateError: session.evaluateError,
                overallScore: response?.evaluation?.overallScore ?? null,
                actualDuration: session.actualDuration,
                createdAt: session.createdAt,
                voiceSessionId: session.sessionId,
              };
            } catch {
              // 评估接口失败，使用基础数据
              return {
                id: `voice-${session.sessionId}`,
                type: 'voice' as const,
                title: session.roleType,
                sessionId: String(session.sessionId),
                status: session.status,
                evaluateStatus: session.evaluateStatus,
                evaluateError: session.evaluateError,
                overallScore: null,
                actualDuration: session.actualDuration,
                createdAt: session.createdAt,
                voiceSessionId: session.sessionId,
              };
            }
          } else {
            // 评估未完成或会话不在缓存中，使用基础数据
            return {
              id: `voice-${session.sessionId}`,
              type: 'voice' as const,
              title: session.roleType,
              sessionId: String(session.sessionId),
              status: session.status,
              evaluateStatus: session.evaluateStatus,
              evaluateError: session.evaluateError,
              overallScore: null,
              actualDuration: session.actualDuration,
              createdAt: session.createdAt,
              voiceSessionId: session.sessionId,
            };
          }
        })
      );

      const voiceWithNames = voiceSessions.map(item => {
        const skillName = getTemplateName(item.title, loadedSkills);
        return skillName !== item.title ? { ...item, title: skillName } : item;
      });

      const all = [...textInterviews, ...voiceWithNames];
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setItems(prev => {
        if (isPolling && itemsEqual(prev, all)) return prev;
        return all;
      });

      // Compute stats
      const evaluated = all.filter(i => isEvaluateCompleted(i));
      const totalScore = evaluated.reduce((sum, i) => sum + (i.overallScore || 0), 0);
      const newStats = {
        totalCount: all.length,
        completedCount: evaluated.length,
        averageScore: evaluated.length > 0 ? Math.round(totalScore / evaluated.length) : 0,
      };
      setStats(prev => {
        if (isPolling && prev &&
            prev.totalCount === newStats.totalCount &&
            prev.completedCount === newStats.completedCount &&
            prev.averageScore === newStats.averageScore) return prev;
        return newStats;
      });

      // 加载维度评估趋势数据（只在非轮询状态下加载，避免高频请求）
      if (!isPolling) {
        try {
          const agg = await evaluationApi.getAggregatedTrends();
          setTrendGroups(agg.trendGroups);
          setDimensionAverages(agg.dimensionAverages);
          setRecentSuggestions(agg.recentSuggestions);
        } catch {
          console.warn('获取维度趋势数据失败');
        }
      }
    } catch (err) {
      console.error('加载面试记录失败', err);
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, []);

  // Load text interviews from dedicated API
  async function loadTextInterviews(skills: SkillDTO[]): Promise<UnifiedInterviewItem[]> {
    try {
      const sessions = await interviewApi.listSessions();
      return sessions.map((session: TextSessionMeta) => ({
        id: session.sessionId,
        type: 'text' as const,
        title: getTemplateName(session.skillId, skills),
        sessionId: session.sessionId,
        status: session.status,
        evaluateStatus: session.evaluateStatus ?? undefined,
        evaluateError: session.evaluateError ?? undefined,
        overallScore: session.overallScore,
        totalQuestions: session.totalQuestions,
        createdAt: session.createdAt,
        resumeId: session.resumeId ?? undefined,
      }));
    } catch {
      return [];
    }
  }

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Polling for evaluation status
  useEffect(() => {
    const hasEvaluating = items.some(i => isEvaluating(i));

    if (hasEvaluating && !pollingRef.current) {
      pollingRef.current = window.setInterval(() => loadAll(true), 3000);
    } else if (!hasEvaluating && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [items, loadAll]);

  const handleRowClick = (item: UnifiedInterviewItem) => {
    if (item.type === 'text') {
      onViewInterview(String(item.sessionId), item.resumeId);
    } else if (item.voiceSessionId) {
      const isLive = isLiveStatus(item.status);
      if (isLive) {
        navigate('/voice-interview', { state: { voiceSessionId: Number(item.voiceSessionId) } });
      } else {
        navigate(`/voice-interview/${Number(item.voiceSessionId)}/evaluation`);
      }
    }
  };

  const handleDeleteClick = (item: UnifiedInterviewItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteItem(item);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;
    setDeletingSessionId(String(deleteItem.sessionId));
    try {
      if (deleteItem.type === 'voice' && deleteItem.voiceSessionId) {
        await voiceInterviewApi.deleteSession(Number(deleteItem.voiceSessionId));
      } else {
        await historyApi.deleteInterview(String(deleteItem.sessionId));
      }
      await loadAll();
      setDeleteItem(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败，请稍后重试');
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleExport = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(sessionId);
    try {
      const blob = await historyApi.exportInterviewPdf(sessionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `面试报告_${sessionId.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert('导出失败，请重试');
    } finally {
      setExporting(null);
    }
  };

  /** 根据 refSessionId 精确查找对应的面试记录（用于图表悬浮详情） */
  function findSessionByRefId(refSessionId: string): UnifiedInterviewItem | null {
    if (!refSessionId) return null;
    for (const item of items) {
      if (String(item.sessionId) === refSessionId) return item;
      // 文字面试的 sessionId 是 UUID，voice 用 voiceSessionId 匹配
      if (item.type === 'voice' && item.voiceSessionId != null && String(item.voiceSessionId) === refSessionId) return item;
    }
    return null;
  }

  /** 面试类型中文 */
  const typeLabel = (t: 'text' | 'voice') => t === 'text' ? '文字' : '语音';

  // 自定义 Tooltip 内容
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const refId = payload[0]?.payload?.__sessionRef;
    const session = refId ? findSessionByRefId(refId) : null;
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-600 p-4 text-sm max-w-xs">
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
          {new Date(label).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
        {session && (
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              {typeLabel(session.type)}
            </span>
            <span className="text-slate-800 dark:text-slate-200 font-medium truncate">
              {session.title}
            </span>
            <span className="text-slate-400 dark:text-slate-500 text-xs">
              #{String(session.id).slice(-8)}
            </span>
          </div>
        )}
        {payload.map((entry: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-3 py-0.5">
            <span style={{ color: entry.color }}>{entry.name}</span>
            <span className="font-bold" style={{ color: entry.color }}>{entry.value}分</span>
          </div>
        ))}
      </div>
    );
  };

  // 将 TrendGroup[] 转换为 Recharts 可接受的数据格式
  const chartData = useMemo(() => {
    if (trendGroups.length === 0) return [];

    // 收集所有时间点
    const timeSet = new Set<string>();
    for (const group of trendGroups) {
      for (const dp of group.dataPoints) {
        timeSet.add(dp.createdAt);
      }
    }
    const times = [...timeSet].sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    return times.map(time => {
      const point: Record<string, any> = { createdAt: time };
      // 从第一个找到的 dataPoint 中提取 refSessionId
      let refSessionId: string | undefined;
      for (const group of trendGroups) {
        const dp = group.dataPoints.find(p => p.createdAt === time);
        if (dp) {
          point[group.dimension] = dp.score;
          if (!refSessionId) refSessionId = dp.refSessionId;
        }
      }
      point.__sessionRef = refSessionId;
      return point;
    });
  }, [trendGroups]);

  // 图表筛选：按时间范围或最近N次
  const filteredChartData = useMemo(() => {
    if (chartData.length === 0) return [];

    if (chartRange === '1d') {
      const cutoff = Date.now() - 86_400_000;
      return chartData.filter(p => new Date(p.createdAt).getTime() >= cutoff);
    }
    if (chartRange === '7d') {
      const cutoff = Date.now() - 604_800_000;
      return chartData.filter(p => new Date(p.createdAt).getTime() >= cutoff);
    }
    if (chartRange === '30d') {
      const cutoff = Date.now() - 2_592_000_000;
      return chartData.filter(p => new Date(p.createdAt).getTime() >= cutoff);
    }

    // 按最近N次: 5 / 10 / 20
    const limit = parseInt(chartRange);
    // 从 chartData 中取有 __sessionRef 的唯一会话数
    const seen = new Set<string>();
    const result: typeof chartData = [];
    // 从最新开始取
    for (let i = chartData.length - 1; i >= 0; i--) {
      const ref = chartData[i].__sessionRef;
      if (ref) {
        if (!seen.has(ref)) {
          seen.add(ref);
          if (seen.size > limit) break;
        }
        result.unshift(chartData[i]);
      } else {
        result.unshift(chartData[i]);
      }
    }
    // 无 __sessionRef 的数据点也显示（兜底）
    return result;
  }, [chartData, chartRange]);

  // Extract unique skill titles from items
  const uniqueSkills = useMemo(() => {
    const set = new Set(items.map(item => item.title).filter(Boolean));
    return [...set].sort();
  }, [items]);

  // Filter + search + sort
  const filtered = useMemo(() => {
    let result = items.filter(item => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (statusFilter === 'completed' && !isEvaluateCompleted(item)) return false;
      if (statusFilter === 'incomplete' && isEvaluateCompleted(item)) return false;
      if (skillFilter !== 'all' && item.title !== skillFilter) return false;
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case 'time_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'time_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'score_desc':
          return (b.overallScore ?? 0) - (a.overallScore ?? 0);
        case 'score_asc':
          return (a.overallScore ?? 0) - (b.overallScore ?? 0);
      }
    });

    return result;
  }, [items, typeFilter, searchTerm, statusFilter, skillFilter, sortBy]);

  return (
    <motion.div className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-8 flex-wrap gap-6">
        <div>
          <motion.h1
            className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Users className="w-7 h-7 text-primary-500" />
            面试记录
          </motion.h1>
          <motion.p
            className="text-slate-500 dark:text-slate-400 mt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            查看和管理所有模拟面试记录
          </motion.p>
        </div>

        <motion.div
          className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 min-w-[280px] focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/30 transition-all"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Search className="w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="搜索名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400 bg-transparent"
          />
        </motion.div>
      </div>

      {/* 顶部：趋势折线图 + 总体信息 */}
      {stats && (
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary-500" />
              面试总览
            </h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500 dark:text-slate-400">
                总平均: <strong className="text-indigo-600 dark:text-indigo-400">{stats.averageScore}分</strong>
              </span>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <span className="text-slate-500 dark:text-slate-400">
                已完成: <strong className="text-emerald-600 dark:text-emerald-400">{stats.completedCount}</strong> / {stats.totalCount} 次
              </span>
            </div>
          </div>

          {/* 折线图筛选按钮 */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <span className="text-xs text-slate-400 dark:text-slate-500 mr-1">显示:</span>
            {([
              { key: '5', label: '近5次' },
              { key: '10', label: '近10次' },
              { key: '20', label: '近20次' },
              { key: '1d', label: '近1天' },
              { key: '7d', label: '近1周' },
              { key: '30d', label: '近1月' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => setChartRange(opt.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  chartRange === opt.key
                    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 维度趋势折线图 */}
          {filteredChartData.length > 0 && (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="createdAt"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                    stroke="#94a3b8"
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {trendGroups.map((g, i) => (
                    <Line
                      key={g.dimension}
                      type="monotone"
                      dataKey={g.dimension}
                      name={DIMENSION_LABELS[g.dimension] || g.dimension}
                      stroke={DIMENSION_COLORS[i % DIMENSION_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 1.5 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 无趋势数据时展示简单统计 */}
          {filteredChartData.length === 0 && (
            <div className="flex items-center justify-center h-32 text-slate-400 dark:text-slate-500">
              <p className="text-sm">暂无维度评估数据，完成面试评估后趋势图表将显示在这里</p>
            </div>
          )}

          {/* 维度平均分 */}
          {dimensionAverages.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {dimensionAverages.map(da => (
                <div
                  key={da.dimension}
                  className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 text-center"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    {DIMENSION_LABELS[da.dimension] || da.dimension}
                  </p>
                  <p className={`text-lg font-bold ${getScoreTextColor(da.averageScore)}`}>
                    {da.averageScore}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 最近建议 */}
          {recentSuggestions.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                近期提升建议
              </h3>
              <div className="flex flex-wrap gap-2">
                {recentSuggestions.slice(0, 4).map((s, i) => (
                  <span
                    key={i}
                    className="inline-block text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-2.5 py-1.5 rounded-lg border border-amber-100 dark:border-amber-800/30"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* 面试类型 — 展开列表 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 dark:text-slate-500">类型:</span>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as InterviewType)}
            className="px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-all cursor-pointer"
          >
            <option value="all">全部</option>
            <option value="text">文字面试</option>
            <option value="voice">语音面试</option>
          </select>
        </div>

        {/* 面试状态 — 展开列表 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 dark:text-slate-500">状态:</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | 'completed' | 'incomplete')}
            className="px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-all cursor-pointer"
          >
            <option value="all">全部</option>
            <option value="completed">已完成</option>
            <option value="incomplete">未完成</option>
          </select>
        </div>

        {/* 面试岗位 — 展开列表 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 dark:text-slate-500">岗位:</span>
          <select
            value={skillFilter}
            onChange={e => setSkillFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-all cursor-pointer"
          >
            <option value="all">全部</option>
            {uniqueSkills.map(skill => (
              <option key={skill} value={skill}>{skill}</option>
            ))}
          </select>
        </div>

        {/* 排序 — 单按钮切换 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 dark:text-slate-500">排序:</span>
          <button
            onClick={() => setSortBy(prev => prev === 'time_desc' ? 'time_asc' : 'time_desc')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortBy === 'time_desc' || sortBy === 'time_asc'
                ? 'bg-primary-500 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600'
            }`}
          >
            {sortBy === 'time_asc' ? '时间 ↑' : '时间 ↓'}
          </button>
          <button
            onClick={() => setSortBy(prev => prev === 'score_desc' ? 'score_asc' : 'score_desc')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortBy === 'score_desc' || sortBy === 'score_asc'
                ? 'bg-primary-500 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600'
            }`}
          >
            {sortBy === 'score_asc' ? '分数 ↑' : '分数 ↓'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <motion.div
          className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Users className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">暂无面试记录</h3>
          <p className="text-slate-500 dark:text-slate-400">开始一次模拟面试后，记录将显示在这里</p>
        </motion.div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-600">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">类型</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">名称</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">状态</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">得分</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">详情</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">时间</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((item, index) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleRowClick(item)}
                    className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <TypeBadge type={item.type} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {item.type === 'text' ? (
                          <FileText className="w-5 h-5 text-slate-400" />
                        ) : (
                          <Mic className="w-5 h-5 text-purple-400" />
                        )}
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">{item.title}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">#{item.id.slice(-8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <StatusIcon item={item} />
                        <span className="text-sm text-slate-600 dark:text-slate-300">{getStatusText(item)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {isEvaluateCompleted(item) && item.overallScore !== null ? (
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full ${getScoreProgressColor(item.overallScore)} rounded-full`}
                              initial={{ width: 0 }}
                              animate={{ width: `${item.overallScore}%` }}
                              transition={{ duration: 0.8, delay: index * 0.05 }}
                            />
                          </div>
                          <span className="font-bold text-slate-800 dark:text-white">{item.overallScore}</span>
                        </div>
                      ) : isEvaluating(item) ? (
                        <span className="text-blue-500 dark:text-blue-400 text-sm">生成中...</span>
                      ) : isEvaluateFailed(item) ? (
                        <span className="text-red-500 dark:text-red-400 text-sm" title={item.evaluateError}>失败</span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {item.type === 'text' && item.totalQuestions != null ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm">
                          {item.totalQuestions} 题
                        </span>
                      ) : item.type === 'voice' ? (
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {formatDuration(item.actualDuration)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.type === 'text' && !isCompletedStatus(item.status) && !isEvaluateCompleted(item) && onContinueInterview && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onContinueInterview(String(item.sessionId)); }}
                            className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="继续面试"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </button>
                        )}
                        {item.type === 'voice' && isLiveStatus(item.status) && item.voiceSessionId && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate('/voice-interview', { state: { voiceSessionId: Number(item.voiceSessionId) } }); }}
                            className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="继续面试"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </button>
                        )}
                        {isEvaluateCompleted(item) && item.type === 'text' && (
                          <button
                            onClick={(e) => handleExport(String(item.sessionId), e)}
                            disabled={exporting === item.sessionId}
                            className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors disabled:opacity-50"
                            title="导出PDF"
                          >
                            {exporting === item.sessionId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {isEvaluateCompleted(item) && item.type === 'text' && item.resumeId && onRestartInterview && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onRestartInterview(item.resumeId!); }}
                            className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                            title="重新面试"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                            onClick={(e) => handleDeleteClick(item, e)}
                            disabled={deletingSessionId === item.sessionId}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 group-hover:translate-x-1 transition-all"/>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </motion.div>
      )}

      <DeleteConfirmDialog
        open={deleteItem !== null}
        item={deleteItem ? { id: 0, sessionId: deleteItem.sessionId } : null}
        itemType="面试记录"
        loading={deletingSessionId !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteItem(null)}
      />
    </motion.div>
  );
}
