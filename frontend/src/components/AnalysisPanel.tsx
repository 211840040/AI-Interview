import { useMemo } from 'react';
import { motion } from 'framer-motion';
import NightingaleRoseChart from './NightingaleRoseChart';
import CircularScore from './CircularScore';
import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import type { AnalyzeStatus } from '../api/history';

interface AnalysisPanelProps {
  analysis: any;
  analyzeStatus?: AnalyzeStatus;
  analyzeError?: string;
  onExport: () => void;
  exporting: boolean;
  onReanalyze?: () => void;
  reanalyzing?: boolean;
}

export default function AnalysisPanel({
  analysis,
  analyzeStatus,
  analyzeError,
  onExport,
  exporting,
  onReanalyze,
  reanalyzing,
}: AnalysisPanelProps) {
  const isProcessing = analyzeStatus === 'PENDING' ||
    analyzeStatus === 'PROCESSING' ||
    (analyzeStatus === undefined && !analysis);

  const hasErrorKeywords = analysis?.summary && (
    analysis.summary.includes('I/O error') ||
    analysis.summary.includes('分析过程中出现错误') ||
    analysis.summary.includes('简历分析失败') ||
    analysis.summary.includes('Remote host terminated')
  );
  const isAnalysisValid = analysis &&
    analysis.overallScore >= 10 &&
    analysis.summary &&
    !hasErrorKeywords;

  // Loading state
  if (isProcessing) {
    const isExplicitProcessing = analyzeStatus === 'PROCESSING';
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
          {isExplicitProcessing ? (
            <Loader2 className="w-8 h-8 text-blue-500 dark:text-blue-400 animate-spin" />
          ) : (
            <Clock className="w-8 h-8 text-yellow-500 dark:text-yellow-400" />
          )}
        </div>
        <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
          {isExplicitProcessing ? 'AI 分析中...' : '等待分析'}
        </h3>
        <p className="text-slate-500 dark:text-slate-400 mb-4">
          {isExplicitProcessing
            ? '正在对您的简历进行深度分析，请稍候'
            : '简历已上传，即将开始 AI 分析'}
        </p>
        <p className="text-sm text-slate-400 dark:text-slate-500">页面将自动刷新显示结果</p>
      </div>
    );
  }

  // Error state
  if (analyzeStatus === 'FAILED' || !isAnalysisValid) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-6 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">分析失败</h3>
        <p className="text-slate-500 dark:text-slate-400 mb-4">AI 服务暂时不可用，请稍后重试</p>
        {(analyzeError || analysis?.summary) && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-left mb-4">
            <p className="text-sm text-red-600 dark:text-red-400">{analyzeError || analysis.summary}</p>
          </div>
        )}
        {onReanalyze && (
          <motion.button
            onClick={onReanalyze}
            disabled={reanalyzing}
            className="px-6 py-2.5 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <RefreshCw className={`w-4 h-4 ${reanalyzing ? 'animate-spin' : ''}`} />
            {reanalyzing ? '重新分析中...' : '重新分析'}
          </motion.button>
        )}
      </div>
    );
  }

  const projectScore = analysis.projectScore || 0;
  const skillMatchScore = analysis.skillMatchScore || 0;
  const contentScore = analysis.contentScore || 0;
  const structureScore = analysis.structureScore || 0;
  const expressionScore = analysis.expressionScore || 0;
  const overallScore = analysis.overallScore || 0;

  // Nightingale Rose chart data
  const roseData = [
    { subject: '项目经验', score: projectScore, fullMark: 40, color: '#8b5cf6' },
    { subject: '技能匹配', score: skillMatchScore, fullMark: 20, color: '#3b82f6' },
    { subject: '内容完整性', score: contentScore, fullMark: 15, color: '#10b981' },
    { subject: '结构清晰度', score: structureScore, fullMark: 15, color: '#06b6d4' },
    { subject: '表达专业性', score: expressionScore, fullMark: 10, color: '#f97316' },
  ];

  // Suggestions by priority
  const suggestionsByPriority = useMemo(() => {
    if (!analysis?.suggestions) return { high: [], medium: [], low: [] };
    return {
      high: analysis.suggestions.filter((s: any) => s.priority === '高'),
      medium: analysis.suggestions.filter((s: any) => s.priority === '中'),
      low: analysis.suggestions.filter((s: any) => s.priority === '低'),
    };
  }, [analysis]);

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case '高': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case '中': return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
      case '低': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      default: return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case '高': return 'bg-red-500 text-white';
      case '中': return 'bg-amber-500 text-white';
      case '低': return 'bg-blue-500 text-white';
      default: return 'bg-slate-500 text-white';
    }
  };
  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      '项目': 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
      '技能': 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
      '内容': 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
      '格式': 'bg-pink-100 dark:bg-pink-900/50 text-pink-700 dark:text-pink-300',
      '结构': 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300',
      '表达': 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300',
    };
    return colors[category] || 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
  };

  // Progress bar data with evaluation keys
  const barData = [
    { key: 'project', label: '项目经验', score: projectScore, maxScore: 40, barColor: 'bg-purple-500', delay: 0.1 },
    { key: 'skillMatch', label: '技能匹配', score: skillMatchScore, maxScore: 20, barColor: 'bg-blue-500', delay: 0.2 },
    { key: 'content', label: '内容完整性', score: contentScore, maxScore: 15, barColor: 'bg-emerald-500', delay: 0.3 },
    { key: 'structure', label: '结构清晰度', score: structureScore, maxScore: 15, barColor: 'bg-cyan-500', delay: 0.4 },
    { key: 'expression', label: '表达专业性', score: expressionScore, maxScore: 10, barColor: 'bg-orange-500', delay: 0.5 },
  ];

  // Extract dimension evaluations
  const dimEval = analysis?.scoreDetail?.dimensionEvaluations ?? analysis?.dimensionEvaluations ?? null;
  const getEval = (base: string) => {
    if (!dimEval) return null;
    return {
      evaluation: dimEval[`${base}Evaluation`] as string | undefined,
      rationale: dimEval[`${base}Rationale`] as string | undefined,
    };
  };

  return (
    <div className="flex gap-6" style={{ height: 'calc(100vh - 180px)' }}>
      {/* 左侧：核心评价 + 多维度评分 — 55% 宽度 */}
      <div className="flex-[5] min-w-0 space-y-6 overflow-y-auto">
        {/* 核心评价 — 圆圈进度条 + 总结 + 优势标签 */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <TrendingUp className="w-5 h-5" />
              <span className="font-semibold">核心评价</span>
            </div>
            <motion.button
              onClick={onExport}
              disabled={exporting}
              className="px-4 py-2 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-all disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {exporting ? '导出中...' : '导出报告'}
            </motion.button>
          </div>

          <div className="flex items-start gap-6">
            {/* 总分圆圈 */}
            <div className="relative flex items-center justify-center shrink-0">
              <CircularScore score={overallScore} size={120} strokeWidth={8} />
            </div>

            {/* 总结 + 优势标签 */}
            <div className="flex-1 min-w-0">
              <p className="text-base text-slate-800 dark:text-white leading-relaxed mb-4">
                {analysis.summary || '候选人具备扎实的技术基础，有大型项目架构经验。'}
              </p>

              {analysis.strengths && analysis.strengths.length > 0 && (
                <div>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 block mb-2">优势亮点</span>
                  <div className="flex flex-wrap gap-2">
                    {analysis.strengths.map((s: string, i: number) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm font-medium"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* 多维度评分 — 旭日图 + 维度详情列表 */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-4">
            <span className="font-semibold">多维度评分</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            {/* 旭日图 — 居中展示 */}
            <div className="w-[720px] h-[340px]">
              <NightingaleRoseChart data={roseData} height={340} />
            </div>
            {/* 维度列表 — 全宽，字号增大 */}
            <div className="w-full space-y-4">
              {barData.map((item) => {
                const evalInfo = getEval(item.key);
                return (
                  <div key={item.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.label}</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {item.score}/{item.maxScore}
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${item.barColor} rounded-full`}
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.score / item.maxScore) * 100}%` }}
                        transition={{ duration: 0.8, delay: item.delay }}
                      />
                    </div>
                    {/* 维度评价文字 */}
                    {evalInfo?.evaluation && (
                      <div className="mt-2">
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                          {evalInfo.evaluation}
                        </p>
                        {evalInfo?.rationale && (
                          <p className="text-xs text-slate-400 dark:text-slate-400 mt-1 leading-relaxed">
                            理由：{evalInfo.rationale}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>

      {/* 右侧：改进建议（独立滚动，与左侧等高） — 45% 宽度 */}
      <div className="flex-[4] min-w-0 self-stretch">
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-2xl flex flex-col"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{ height: '100%' }}
        >
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 px-6 pt-6 pb-4 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-semibold">改进建议</span>
            <span className="text-sm text-slate-400 dark:text-slate-500">
              ({analysis.suggestions?.length || 0} 条)
            </span>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 px-6 pb-6 space-y-6 scrollbar-thin">
            {(['high', 'medium', 'low'] as const).map((key) => {
              const items = suggestionsByPriority[key];
              const label = key === 'high' ? '高' : key === 'medium' ? '中' : '低';
              if (items.length === 0) return null;
              return (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold
                      ${key === 'high' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                        key === 'medium' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' :
                          'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'}`}
                    >
                      {label}优先级 ({items.length})
                    </span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <div className="space-y-3">
                    {items.map((s: any, i: number) => (
                      <motion.div
                        key={`${key}-${i}`}
                        className={`p-4 rounded-xl border-2 ${getPriorityStyle(label)}`}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <div className="flex items-start gap-3 mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getPriorityBadge(label)}`}>
                            {label}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryBadge(s.category || '其他')}`}>
                            {s.category || '其他'}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                          {s.issue || '问题描述'}
                        </p>
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {s.recommendation || s}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
            {analysis.suggestions?.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">暂无改进建议</div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
