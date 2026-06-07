import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileStack, FileText, Loader2, Mic,
  Sparkles, Check, Globe, Coffee, Code,
  Volume2, HelpCircle, ListChecks,
} from 'lucide-react';
import { getSkillIcon } from '../utils/skillIcons';
import StepsBar from '../components/StepsBar';
import {
  useInterviewConfig,
  CUSTOM_SKILL_ID,
  DEFAULT_SKILL_ID,
  type InterviewMode,
  DIFFICULTY_OPTIONS,
  type Difficulty,
} from '../hooks/useInterviewConfig';

const EXCLUDED_SKILLS = new Set(['ali-backend', 'bytedance-backend', 'java-backend-tencent', 'python-backend']);

/** skillId → 兜底图标颜色（选中态用高饱和，未选中态用浅色） */
const SKILL_COLORS: Record<string, { bg: string; color: string; lightBg: string; lightColor: string }> = {
  'java-backend': { bg: 'bg-orange-100 dark:bg-orange-900/30', color: 'text-orange-600 dark:text-orange-400', lightBg: 'bg-orange-50 dark:bg-orange-900/10', lightColor: 'text-orange-500 dark:text-orange-400' },
  'frontend': { bg: 'bg-sky-100 dark:bg-sky-900/30', color: 'text-sky-600 dark:text-sky-400', lightBg: 'bg-sky-50 dark:bg-sky-900/10', lightColor: 'text-sky-500 dark:text-sky-400' },
  'algorithm': { bg: 'bg-violet-100 dark:bg-violet-900/30', color: 'text-violet-600 dark:text-violet-400', lightBg: 'bg-violet-50 dark:bg-violet-900/10', lightColor: 'text-violet-500 dark:text-violet-400' },
  'system-design': { bg: 'bg-rose-100 dark:bg-rose-900/30', color: 'text-rose-600 dark:text-rose-400', lightBg: 'bg-rose-50 dark:bg-rose-900/10', lightColor: 'text-rose-500 dark:text-rose-400' },
  'test-development': { bg: 'bg-teal-100 dark:bg-teal-900/30', color: 'text-teal-600 dark:text-teal-400', lightBg: 'bg-teal-50 dark:bg-teal-900/10', lightColor: 'text-teal-500 dark:text-teal-400' },
  'ai-agent-dev': { bg: 'bg-cyan-100 dark:bg-cyan-900/30', color: 'text-cyan-600 dark:text-cyan-400', lightBg: 'bg-cyan-50 dark:bg-cyan-900/10', lightColor: 'text-cyan-500 dark:text-cyan-400' },
};

const STEPS = [
  { key: 'mode', label: '选模式' },
  { key: 'direction', label: '选方向' },
  { key: 'config', label: '设配置' },
  { key: 'start', label: '开始' },
];

const MODE_OPTIONS = [
  { value: 'text' as InterviewMode, label: '文字面试', icon: FileText, recommended: true },
  { value: 'voice' as InterviewMode, label: '语音面试', icon: Mic, recommended: false },
];

/** 为预设方向返回专属图标组件 */
function getDirectionIcon(skillId: string) {
  const map: Record<string, typeof Coffee> = {
    'java-backend': Coffee,
    'frontend': Globe,
    'algorithm': Code,
  };
  return map[skillId];
}

const STEP = { MODE: 0, DIRECTION: 1, CONFIG: 2, READY: 3 } as const;

export default function InterviewHubPage() {
  const navigate = useNavigate();
  const config = useInterviewConfig({ autoLoad: false });

  // === 本地选择状态（不依赖 hook 默认值） ===
  const [pickedMode, setPickedMode] = useState<InterviewMode | null>(null);
  const [pickedSkill, setPickedSkill] = useState<string | null>(null);
  const [pickedDifficulty, setPickedDifficulty] = useState<Difficulty | null>(null);

  // === 步骤状态：用户主动完成后才显示下一步卡片 ===
  const [activeStep, setActiveStep] = useState<0 | 1 | 2 | 3>(STEP.MODE);

  const currentStep = useMemo(() => {
    if (activeStep >= STEP.READY) return 3;
    if (activeStep >= STEP.CONFIG) return 2;
    if (activeStep >= STEP.DIRECTION) return 1;
    return 0;
  }, [activeStep]);

  // 用户点击模式按钮后推进到方向
  const handleModeSelect = (mode: InterviewMode) => {
    setPickedMode(mode);
    config.setMode(mode);
    if (activeStep === STEP.MODE) setActiveStep(STEP.DIRECTION);
  };

  // 用户选择方向后推进到配置
  const handleSkillSelect = (skillId: string) => {
    setPickedSkill(skillId);
    config.setSkillId(skillId);
    if (skillId !== CUSTOM_SKILL_ID) {
      if (activeStep >= STEP.DIRECTION) setActiveStep(STEP.CONFIG);
    }
  };

  // 用户选择难度后推进到就绪
  const handleDifficultySelect = (difficulty: Difficulty) => {
    setPickedDifficulty(difficulty);
    config.setDifficulty(difficulty);
    if (activeStep >= STEP.CONFIG) setActiveStep(STEP.READY);
  };

  // 自定义 JD 解析成功后推进到配置
  useEffect(() => {
    if (config.customCategories.length > 0 && activeStep === STEP.DIRECTION) {
      setActiveStep(STEP.CONFIG);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.customCategories.length]);

  // === 音频检测 ===
  const [micStatus, setMicStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [speakerStatus, setSpeakerStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const testMicrophone = async () => {
    setMicStatus('testing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // 如果能获取到流，说明麦克风可用
      setTimeout(() => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        setMicStatus('ok');
      }, 500);
    } catch {
      setMicStatus('fail');
    }
  };

  const testSpeaker = () => {
    setSpeakerStatus('testing');
    try {
      // 使用 AudioContext 生成一个简单的测试音
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
        setSpeakerStatus('ok');
      }, 800);
    } catch {
      setSpeakerStatus('fail');
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // 初始加载 skills 和 resumes
  useEffect(() => {
    config.loadSkills();
    config.loadResumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    const selectedSkill = config.selectedSkill;
    const skillName = selectedSkill?.name || '自定义';

    if (pickedDifficulty === null) return;
    if (pickedSkill === CUSTOM_SKILL_ID && (config.customCategories.length === 0 || config.jdNeedsReparse || config.parsingJd)) return;

    if (pickedMode === 'text') {
      navigate('/interview', {
        state: {
          resumeId: config.resumeId,
          interviewConfig: {
            skillId: config.skillId,
            skillName,
            difficulty: config.difficulty,
            questionCount: config.questionCount,
            llmProvider: config.llmProvider,
            jdText: pickedSkill === CUSTOM_SKILL_ID ? config.parsedCustomJdText : undefined,
            customCategories: pickedSkill === CUSTOM_SKILL_ID ? config.customCategories : undefined,
          },
        },
      });
    } else {
      const params = new URLSearchParams({ skillId: config.skillId, difficulty: config.difficulty });
      navigate(`/voice-interview?${params.toString()}`, {
        state: {
          voiceConfig: {
            skillId: config.skillId,
            difficulty: config.difficulty,
            techEnabled: true,
            projectEnabled: true,
            hrEnabled: true,
            plannedDuration: config.plannedDuration,
            resumeId: config.resumeId,
            llmProvider: config.llmProvider,
          },
        },
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-28 relative">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
          <Sparkles className="w-7 h-7 text-primary-500" />
          模拟面试
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">配置面试参数，快速开始练习</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ===== 左侧：引导面板 ===== */}
        <div className="w-full lg:w-[480px] flex-shrink-0 space-y-5 lg:sticky lg:top-20">
          {/* AI 模拟说明 */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <Sparkles className="w-6 h-6 text-primary-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-white">AI 模拟面试</h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              基于大语言模型驱动的智能面试模拟系统，支持文字与语音两种模式。
              系统会根据您选择的方向和难度，动态生成贴合真实面试场景的题目，
              并在面试结束后提供多维度评估与改进建议。
            </p>
          </div>

          {/* 操作引导 */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <ListChecks className="w-6 h-6 text-primary-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-white">操作步骤</h2>
            </div>
            <ul className="space-y-3">
              {[
                { step: '1', text: '选择面试模式（文字或语音）' },
                { step: '2', text: '选择面试方向或填写自定义 JD' },
                { step: '3', text: '设置难度等级与题目数量' },
                { step: '4', text: '可选：关联简历获取个性化提问' },
                { step: '5', text: '点击底部按钮开始面试' },
              ].map(item => (
                <li key={item.step} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">
                    {item.step}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 音频检测 */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <HelpCircle className="w-6 h-6 text-primary-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-white">音频检测</h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              开始语音面试前，请确认麦克风和扬声器正常工作。
            </p>

            {/* 麦克风检测 */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-600 dark:text-slate-300">麦克风</span>
              </div>
              <button
                onClick={testMicrophone}
                disabled={micStatus === 'testing'}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  micStatus === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                    : micStatus === 'fail'
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {micStatus === 'testing' ? (
                  <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 检测中</span>
                ) : micStatus === 'ok' ? (
                  <span className="flex items-center gap-1"><Check className="w-3 h-3" /> 正常</span>
                ) : micStatus === 'fail' ? (
                  '未检测到'
                ) : (
                  '点击检测'
                )}
              </button>
            </div>

            {/* 扬声器检测 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {speakerStatus === 'testing' ? (
                  <Volume2 className="w-4 h-4 text-primary-500 animate-pulse" />
                ) : (
                  <Volume2 className="w-4 h-4 text-slate-400" />
                )}
                <span className="text-xs text-slate-600 dark:text-slate-300">扬声器</span>
              </div>
              <button
                onClick={testSpeaker}
                disabled={speakerStatus === 'testing'}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  speakerStatus === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                    : speakerStatus === 'fail'
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {speakerStatus === 'testing' ? (
                  <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 检测中</span>
                ) : speakerStatus === 'ok' ? (
                  <span className="flex items-center gap-1"><Check className="w-3 h-3" /> 正常</span>
                ) : speakerStatus === 'fail' ? (
                  '检测失败'
                ) : (
                  '播放测试音'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ===== 右侧：配置面板 ===== */}
        <div className="flex-1 min-w-0">
          {/* 步骤条 */}
          <StepsBar steps={STEPS} currentStep={currentStep} className="mb-4 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 sticky top-0 z-10" />

          {/* === 卡片1: 面试模式 === */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5 mb-4">
            <label className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">1</span>
              面试模式
            </label>
            <div className="grid grid-cols-2 gap-3">
              {MODE_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const selected = pickedMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleModeSelect(opt.value)}
                    className={`relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 text-left
                      ${selected
                        ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/20 ring-2 ring-primary-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                  >
                    {selected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <Icon className={`w-6 h-6 flex-shrink-0 ${selected ? 'text-primary-500' : 'text-slate-400'}`} />
                    <div className="min-w-0">
                      <p className={`font-semibold text-sm flex items-center gap-2 ${selected ? 'text-primary-700 dark:text-primary-300' : 'text-slate-900 dark:text-white'}`}>
                        <span>{opt.label}</span>
                        {opt.recommended && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            推荐
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {opt.value === 'text' ? '更稳定，适合系统化刷题与复盘' : '实时语音对话，偏临场模拟'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* === 卡片2: 面试方向 === */}
          {activeStep >= STEP.DIRECTION && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5 mb-4"
          >
            <label className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">2</span>
              面试方向
            </label>

            {config.loadingSkills ? (
              <div className="flex items-center gap-2 py-4 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">加载中...</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {config.skills.filter(s => !EXCLUDED_SKILLS.has(s.id)).map(skill => {
                    const selected = pickedSkill === skill.id;
                    const IconComponent = getSkillIcon(skill.id);
                    const DirectionIcon = getDirectionIcon(skill.id);
                    const fallbackEmoji = skill.display?.icon || '📋';
                    return (
                      <button
                        key={skill.id}
                        onClick={() => handleSkillSelect(skill.id)}
                        className={`relative flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all duration-200 text-left
                          ${selected
                            ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/20 ring-2 ring-primary-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                      >
                        {selected && (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary-500 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${
                          selected
                            ? (skill.display?.iconBg || SKILL_COLORS[skill.id]?.bg || 'bg-primary-100 dark:bg-primary-900/50')
                            : (SKILL_COLORS[skill.id]?.lightBg || 'bg-slate-100 dark:bg-slate-700')
                        }`}>
                          {DirectionIcon ? (
                            <DirectionIcon className={`w-4 h-4 ${selected ? (skill.display?.iconColor || SKILL_COLORS[skill.id]?.color || 'text-primary-600') : (SKILL_COLORS[skill.id]?.lightColor || 'text-slate-500 dark:text-slate-400')}`} />
                          ) : IconComponent ? (
                            <IconComponent className={`w-4 h-4 ${selected ? (skill.display?.iconColor || SKILL_COLORS[skill.id]?.color || 'text-primary-600') : (SKILL_COLORS[skill.id]?.lightColor || 'text-slate-500 dark:text-slate-400')}`} />
                          ) : (
                            <span className={selected ? (skill.display?.iconColor || 'text-primary-600') : ''}>{fallbackEmoji}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-medium block truncate ${selected ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-300'}`}>
                            {skill.name}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 自定义 JD */}
                <div className="mt-3">
                  {pickedSkill !== CUSTOM_SKILL_ID ? (
                    <button
                      onClick={() => handleSkillSelect(CUSTOM_SKILL_ID)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 transition-all text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </div>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        点击填写专属职位描述（自定义 JD）
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-xl border-2 border-primary-500/50 bg-primary-50/80 dark:bg-primary-900/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary-500" />
                          <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">自定义 JD</span>
                        </div>
                        <button
                          onClick={() => handleSkillSelect(DEFAULT_SKILL_ID)}
                          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                      <textarea
                        value={config.customJdText}
                        onChange={e => config.setCustomJdText(e.target.value)}
                        placeholder="粘贴目标岗位的职位描述（JD），至少 50 字..."
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700
                          bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white
                          placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2
                          focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={config.handleParseJd}
                          disabled={config.parsingJd || !config.customJdText}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg
                            bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50
                            disabled:cursor-not-allowed transition-colors"
                        >
                          {config.parsingJd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          解析面试方向
                        </button>
                        {config.customCategories.length > 0 && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">
                            已解析 {config.customCategories.length} 个方向
                          </span>
                        )}
                      </div>
                      {config.customCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {config.customCategories.map((cat, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-1 text-xs font-medium rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                            >
                              {cat.label}
                              <span className="ml-1 text-[10px] text-primary-500">({cat.priority})</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {config.jdNeedsReparse && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          JD 已修改，请重新解析后再开始面试。
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
          )}

          {/* === 卡片3: 难度与配置 === */}
          {pickedSkill !== null && activeStep >= STEP.CONFIG && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5 mb-4"
          >
            <label className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">3</span>
              难度与配置
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">难度等级</p>
                <div className="grid grid-cols-3 gap-2">
                  {DIFFICULTY_OPTIONS.map(opt => {
                    const selected = pickedDifficulty === opt.value;
                    const colors = opt.value === 'junior'
                      ? { border: 'border-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', ring: 'ring-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-300', lightBorder: 'border-emerald-200 dark:border-emerald-800/40', lightText: 'text-emerald-600 dark:text-emerald-400' }
                      : opt.value === 'mid'
                        ? { border: 'border-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', ring: 'ring-amber-500/20', text: 'text-amber-700 dark:text-amber-300', lightBorder: 'border-amber-200 dark:border-amber-800/40', lightText: 'text-amber-600 dark:text-amber-400' }
                        : { border: 'border-red-500', bg: 'bg-red-50 dark:bg-red-900/20', ring: 'ring-red-500/20', text: 'text-red-700 dark:text-red-300', lightBorder: 'border-red-200 dark:border-red-800/40', lightText: 'text-red-600 dark:text-red-400' };
                    return (
                      <button
                        key={opt.value}
                        onClick={() => handleDifficultySelect(opt.value)}
                        className={`py-2.5 px-3 rounded-xl border-2 transition-all duration-200 text-center
                          ${selected
                            ? `${colors.border} ${colors.bg} ring-2 ${colors.ring}`
                            : `${colors.lightBorder} ${colors.bg} hover:opacity-80`
                          }`}
                      >
                        <p className={`text-sm font-semibold ${selected ? colors.text : colors.lightText}`}>
                          {opt.label}
                        </p>
                        <p className={`text-[11px] ${selected ? colors.text : 'text-slate-400'}`}>{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {pickedMode === 'text' ? '题目数量' : '面试时长'}
                </p>
                <div className="bg-slate-50/80 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 px-4 flex items-center h-[46px]">
                  <span className="text-lg font-bold tabular-nums text-primary-600 dark:text-primary-400 w-12 flex-shrink-0">
                    {pickedMode === 'text' ? config.questionCount : config.plannedDuration}
                    <span className="text-xs font-normal text-slate-400 ml-0.5">
                      {pickedMode === 'text' ? '题' : 'min'}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={pickedMode === 'text' ? 3 : 15}
                    max={pickedMode === 'text' ? 12 : 60}
                    step={pickedMode === 'text' ? 1 : 5}
                    value={pickedMode === 'text' ? config.questionCount : config.plannedDuration}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      if (pickedMode === 'text') config.setQuestionCount(v);
                      else config.setPlannedDuration(v);
                    }}
                    className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer mx-3
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-primary-500/30"
                  />
                  <span className="text-xs text-slate-400 w-8 text-right flex-shrink-0">
                    {pickedMode === 'text' ? '12题' : '60min'}
                  </span>
                </div>
              </div>
            </div>

            {/* 简历选择 */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <FileStack className="w-4 h-4 text-slate-400" />
                <select
                  value={config.resumeId || ''}
                  onChange={e => config.setResumeId(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700
                    bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white
                    focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-shadow"
                >
                  <option value="">不使用简历（通用提问）</option>
                  {config.resumes.map(r => (
                    <option key={r.id} value={r.id}>{r.filename}</option>
                  ))}
                </select>
                <Link
                  to="/history"
                  className="text-xs text-primary-500 hover:text-primary-600 font-medium whitespace-nowrap transition-colors flex-shrink-0"
                >
                  管理简历→
                </Link>
              </div>
            </div>
          </motion.div>
          )}
        </div>
      </div>

      {/* 开始面试按钮 — 固定底部 */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-700 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <motion.button
            onClick={handleStart}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            disabled={pickedDifficulty === null || (pickedSkill === CUSTOM_SKILL_ID && (config.customCategories.length === 0 || config.jdNeedsReparse || config.parsingJd))}
            className="w-full py-4 rounded-xl font-semibold text-sm transition-all
              bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
              text-white shadow-lg shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            开始{pickedMode === 'text' ? '文字' : '语音'}面试
          </motion.button>
        </div>
      </div>

    </div>
  );
}
