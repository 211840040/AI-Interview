import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, PhoneOff, AlertCircle, Bot, Mic, ArrowLeft, SendHorizonal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AudioRecorder from '../components/AudioRecorder';
import RealtimeSubtitle from '../components/RealtimeSubtitle';
import { skillApi, type SkillDTO } from '../api/skill';
import { getTemplateName } from '../utils/voiceInterview';
import {
  voiceInterviewApi,
  connectWebSocket,
  VoiceInterviewWebSocket,
} from '../api/voiceInterview';

type VoiceConfig = {
  skillId: string;
  difficulty?: string;
  techEnabled: boolean;
  projectEnabled: boolean;
  hrEnabled: boolean;
  plannedDuration: number;
  resumeId?: number;
  llmProvider?: string;
};

const SKILL_NAMES: Record<string, string> = {
  'java-backend': 'Java 后端',
  'frontend': '前端开发',
  'algorithm': '算法',
  'system-design': '系统设计',
  'test-development': '测试开发',
  'ai-agent-dev': 'AI Agent 开发',
};

export default function VoiceInterviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const entryState = (location.state as {
    voiceConfig?: VoiceConfig;
    voiceSessionId?: number;
  } | null) || {};
  const resumeSessionId = entryState.voiceSessionId;
  const queryParams = new URLSearchParams(location.search);
  const urlSkillId = queryParams.get('skillId') || undefined;
  const urlDifficulty = queryParams.get('difficulty') || undefined;
  const urlDuration = Number(queryParams.get('duration') || queryParams.get('plannedDuration'));
  const queryVoiceConfig: VoiceConfig | undefined = urlSkillId
    ? {
        skillId: urlSkillId,
        difficulty: urlDifficulty,
        techEnabled: true,
        projectEnabled: true,
        hrEnabled: true,
        plannedDuration: Number.isFinite(urlDuration) && urlDuration > 0 ? urlDuration : 15,
      }
    : undefined;
  const presetVoiceConfig = entryState.voiceConfig ?? queryVoiceConfig;
  const effectiveSkillId = presetVoiceConfig?.skillId ?? urlSkillId ?? 'java-backend';

  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('INTRO');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const [userText, setUserText] = useState('');
  const [aiText, setAiText] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string; id: string }[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [aiAudio, setAiAudio] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAsrReady, setIsAsrReady] = useState(false);

  const [skills, setSkills] = useState<SkillDTO[]>([]);

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<VoiceInterviewWebSocket | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const autoStartRef = useRef(false);
  const endedByUserRef = useRef(false);
  const isAiSpeakingRef = useRef(false);
  const isAsrReadyRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const aiAudioPendingRef = useRef(false);
  const lastAiCommittedTextRef = useRef('');
  const pendingAiTextCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioPlaybackWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chunked audio playback refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunkQueueRef = useRef<AudioBuffer[]>([]);
  const isChunkPlayingRef = useRef(false);
  const chunkPlaybackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const drainCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref to track latest aiText for async callbacks (avoids stale closure)
  const aiTextRef = useRef('');
  useEffect(() => { aiTextRef.current = aiText; }, [aiText]);
  useEffect(() => { isAsrReadyRef.current = isAsrReady; }, [isAsrReady]);
  useEffect(() => { isSubmittingRef.current = isSubmitting; }, [isSubmitting]);

  const setAiSpeaking = useCallback((value: boolean) => {
    isAiSpeakingRef.current = value;
    setIsAiSpeaking(value);
  }, []);

  const clearPendingAiTextCommit = useCallback(() => {
    if (pendingAiTextCommitRef.current) {
      clearTimeout(pendingAiTextCommitRef.current);
      pendingAiTextCommitRef.current = null;
    }
  }, []);

  const clearAudioPlaybackWatchdog = useCallback(() => {
    if (audioPlaybackWatchdogRef.current) {
      clearTimeout(audioPlaybackWatchdogRef.current);
      audioPlaybackWatchdogRef.current = null;
    }
  }, []);

  const commitAiMessage = useCallback((rawText: string) => {
    const normalized = (rawText || '').trim();
    if (!normalized || normalized === lastAiCommittedTextRef.current) {
      return;
    }
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'ai' && last.text.trim() === normalized) {
        return prev;
      }
      return [
        ...prev,
        { role: 'ai', text: normalized, id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
      ];
    });
    lastAiCommittedTextRef.current = normalized;
    setAiText(prev => prev?.trim() === normalized ? '' : prev);
  }, []);

  const estimateWavDurationMs = useCallback((base64Wav: string) => {
    try {
      const binary = atob(base64Wav.slice(0, 128));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      if (bytes.length < 44) {
        return 15_000;
      }
      const view = new DataView(bytes.buffer);
      const byteRate = view.getUint32(28, true);
      const dataSize = view.getUint32(40, true);
      if (byteRate <= 0 || dataSize <= 0) {
        return 15_000;
      }
      return Math.ceil((dataSize / byteRate) * 1000);
    } catch {
      return 15_000;
    }
  }, []);

  const finishAiPlayback = useCallback(() => {
    aiAudioPendingRef.current = false;
    clearAudioPlaybackWatchdog();
    setAiSpeaking(false);
    setIsSubmitting(false);
    clearPendingAiTextCommit();
    commitAiMessage(aiTextRef.current.trim());
    setAiText('');
    setAiAudio('');
  }, [clearAudioPlaybackWatchdog, clearPendingAiTextCommit, commitAiMessage, setAiSpeaking]);

  // --- Chunked audio playback via AudioContext ---
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  }, []);

  const playNextChunk = useCallback(() => {
    if (chunkQueueRef.current.length === 0) {
      isChunkPlayingRef.current = false;
      return;
    }
    isChunkPlayingRef.current = true;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const buffer = chunkQueueRef.current.shift()!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    chunkPlaybackSourceRef.current = source;
    source.onended = () => {
      chunkPlaybackSourceRef.current = null;
      playNextChunk();
    };
    source.start(0);
  }, [getAudioContext]);

  const scheduleChunkDrainCompletion = useCallback(() => {
    const startedAt = Date.now();
    const maxDrainWaitMs = 30_000;
    if (drainCheckRef.current) {
      clearInterval(drainCheckRef.current);
    }
    drainCheckRef.current = setInterval(() => {
      if (chunkQueueRef.current.length === 0 && !isChunkPlayingRef.current) {
        clearInterval(drainCheckRef.current!);
        drainCheckRef.current = null;
        setAiSpeaking(false);
        setIsSubmitting(false);
        clearPendingAiTextCommit();
        commitAiMessage(aiTextRef.current.trim());
        setAiText('');
      } else if (Date.now() - startedAt > maxDrainWaitMs) {
        clearInterval(drainCheckRef.current!);
        drainCheckRef.current = null;
        setAiSpeaking(false);
        setIsSubmitting(false);
      }
    }, 100);
  }, [clearPendingAiTextCommit, commitAiMessage, setAiSpeaking]);

  const handleAudioChunk = useCallback((base64Wav: string, _index: number, isLast: boolean) => {
    try {
      aiAudioPendingRef.current = false;
      clearPendingAiTextCommit();
      const binaryStr = atob(base64Wav);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const pcmOffset = 44;
      const pcmData = new Int16Array(bytes.buffer, pcmOffset, (bytes.length - pcmOffset) / 2);
      const float32 = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32[i] = pcmData[i] / 32768.0;
      }

      const ctx = getAudioContext();
      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      chunkQueueRef.current.push(audioBuffer);
      if (!isChunkPlayingRef.current) {
        playNextChunk();
      }

      setAiSpeaking(true);

      if (isLast) {
        scheduleChunkDrainCompletion();
      }
    } catch (e) {
      console.error('[ChunkAudio] Decode/play error:', e);
    }
  }, [getAudioContext, playNextChunk, scheduleChunkDrainCompletion, setAiSpeaking]);

  // Load skills for template name display
  useEffect(() => {
    skillApi.listSkills().then(setSkills).catch(console.error);
  }, []);

  // Derive template name from skills
  useEffect(() => {
    if (skills.length > 0 && effectiveSkillId) {
      setTemplateName(getTemplateName(effectiveSkillId, skills));
    }
  }, [skills, effectiveSkillId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
      clearAudioPlaybackWatchdog();
      chunkPlaybackSourceRef.current?.stop();
      audioContextRef.current?.close();
      if (drainCheckRef.current) {
        clearInterval(drainCheckRef.current);
        drainCheckRef.current = null;
      }
      clearPendingAiTextCommit();
      const currentSessionId = sessionId;
      if (currentSessionId && !endedByUserRef.current) {
        voiceInterviewApi.pauseSession(currentSessionId).catch(() => {});
      }
    };
  }, [clearAudioPlaybackWatchdog, clearPendingAiTextCommit, sessionId]);

  // Start interview timer
  useEffect(() => {
    if (sessionId && connectionStatus === 'connected') {
      startTimer();
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [sessionId, connectionStatus]);

  // Auto-play audio when aiAudio changes
  useEffect(() => {
    if (aiAudio && audioPlayerRef.current) {
      const playPromise = audioPlayerRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          setError('请点击页面任意位置以启用音频播放');
          finishAiPlayback();
        });
      }
    }
  }, [aiAudio, finishAiPlayback]);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setCurrentTime((prev) => prev + 1);
    }, 1000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPhaseLabel = (phase: string) => {
    const phaseMap: Record<string, string> = {
      INTRO: '自我介绍',
      TECH: '技术问题',
      PROJECT: '项目深挖',
      HR: 'HR问题',
    };
    return phaseMap[phase] || phase;
  };

  // 手动提交回答
  const handleSubmitAnswer = useCallback(() => {
    if (!wsRef.current || !wsRef.current.isConnected()) {
      return;
    }
    if (!userText.trim() || isAiSpeakingRef.current || isSubmitting) {
      return;
    }
    setIsRecording(false);
    setIsSubmitting(true);
    const text = userText.trim();
    setMessages(prev => [
      ...prev,
      { role: 'user', text, id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
    ]);
    setUserText('');
    wsRef.current.sendControl('submit', { text });
  }, [userText, isSubmitting]);

  const createWebSocketHandlers = useCallback(() => ({
    onOpen: () => {
      setConnectionStatus('connected');
      setIsAsrReady(false);
    },
    onMessage: () => {},
    onSubtitle: (text: string, isFinal: boolean) => {
      if (isFinal && text.trim()) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'user' && last.text.trim() === text.trim()) {
            return prev;
          }
          return [
            ...prev,
            { role: 'user', text: text.trim(), id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
          ];
        });
        setUserText('');
      } else {
        setUserText(text);
      }
    },
    onAudioResponse: (audioData: string, text: string) => {
      const hasAudio = !!(audioData && audioData.length > 0);
      const normalized = (text || '').trim();
      if (hasAudio) {
        clearPendingAiTextCommit();
        clearAudioPlaybackWatchdog();
        aiAudioPendingRef.current = false;
        setAiAudio(audioData);
        setAiText(normalized);
        setAiSpeaking(true);
        const duration = estimateWavDurationMs(audioData);
        audioPlaybackWatchdogRef.current = setTimeout(
          finishAiPlayback,
          Math.min(Math.max(duration + 1500, 4000), 60_000)
        );
        return;
      }
      setAiAudio('');
      setAiText(normalized);
      setAiSpeaking(false);
      if (!normalized) {
        setIsSubmitting(false);
        return;
      }
      clearPendingAiTextCommit();
      pendingAiTextCommitRef.current = setTimeout(() => {
        commitAiMessage(normalized);
        setIsSubmitting(false);
        setAiSpeaking(false);
        pendingAiTextCommitRef.current = null;
      }, 2500);
    },
    onTextResponse: (text: string, isFinal: boolean) => {
      const normalized = (text || '').trim();
      if (!normalized) {
        return;
      }
      aiAudioPendingRef.current = isFinal;
      setAiText(normalized);
      setAiSpeaking(true);
      if (!isFinal) {
        return;
      }

      clearPendingAiTextCommit();
      pendingAiTextCommitRef.current = setTimeout(() => {
        if (aiAudioPendingRef.current) {
          aiAudioPendingRef.current = false;
        }
        commitAiMessage(normalized);
        setIsSubmitting(false);
        setAiSpeaking(false);
        pendingAiTextCommitRef.current = null;
      }, 15000);
    },
    onClose: (event: { code: number }) => {
      setConnectionStatus('disconnected');
      setIsAsrReady(false);
      clearPendingAiTextCommit();
      if (event.code !== 1000) {
        setError('连接已断开，请刷新页面重试');
      }
    },
    onError: () => {
      clearPendingAiTextCommit();
      clearAudioPlaybackWatchdog();
      setError('WebSocket 连接错误，请检查网络后重试');
      setConnectionStatus('disconnected');
      setIsAsrReady(false);
    },
    onAudioChunk: (data: string, index: number, isLast: boolean) => {
      handleAudioChunk(data, index, isLast);
    },
    onControl: (action: string, message?: string) => {
      if (action === 'asr_ready') {
        setIsAsrReady(true);
        setError(null);
        return;
      }
      if (action === 'asr_reconnecting') {
        setIsAsrReady(false);
        if (message) {
          setError(message);
        }
        return;
      }
      if (action === 'audio_complete') {
        scheduleChunkDrainCompletion();
        return;
      }
      if (action === 'pause_timeout_warning' && message) {
        setError(message);
        return;
      }
      if (action === 'pause_timeout' && message) {
        setError(message);
        setConnectionStatus('disconnected');
        setIsAsrReady(false);
      }
    },
    onErrorMessage: (message: string) => {
      setError(message || '语音面试服务异常，请稍后重试');
      if (message.includes('语音识别')) {
        setIsAsrReady(false);
      }
    },
  }), [
    clearAudioPlaybackWatchdog,
    clearPendingAiTextCommit,
    commitAiMessage,
    estimateWavDurationMs,
    finishAiPlayback,
    handleAudioChunk,
    scheduleChunkDrainCompletion,
    setAiSpeaking,
  ]);

  const connectWithHandlers = useCallback((sessionId: number, wsUrl: string) => {
    setIsAsrReady(false);
    setTimeout(() => {
      try {
        wsRef.current = connectWebSocket(sessionId, wsUrl, createWebSocketHandlers());
      } catch (error) {
        setError('无法建立 WebSocket 连接: ' + (error instanceof Error ? error.message : '未知错误'));
        setConnectionStatus('disconnected');
        setIsAsrReady(false);
      }
    }, 500);
  }, [createWebSocketHandlers]);

  const handlePhaseConfig = useCallback(async (config: {
    skillId: string;
    difficulty?: string;
    techEnabled: boolean;
    projectEnabled: boolean;
    hrEnabled: boolean;
    plannedDuration: number;
    resumeId?: number;
    llmProvider?: string;
  }) => {
    setError(null);
    setConnectionStatus('connecting');
    setIsAsrReady(false);

    try {
      const session = await voiceInterviewApi.createSession({
        skillId: config.skillId,
        difficulty: config.difficulty,
        introEnabled: false,
        techEnabled: config.techEnabled,
        projectEnabled: config.projectEnabled,
        hrEnabled: config.hrEnabled,
        plannedDuration: config.plannedDuration,
        resumeId: config.resumeId,
        llmProvider: config.llmProvider,
      });

      setSessionId(session.sessionId);
      setCurrentPhase(session.currentPhase);

      const wsUrl = session.webSocketUrl || `ws://localhost:8080/ws/voice-interview/${session.sessionId}`;
      connectWithHandlers(session.sessionId, wsUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建面试会话失败，请重试';
      setError(errorMessage);
      setConnectionStatus('disconnected');
      setIsAsrReady(false);
      alert('创建会话失败：' + errorMessage);
    }
  }, [connectWithHandlers]);

  const handleResumeSession = useCallback(async (id: number) => {
    setError(null);
    setConnectionStatus('connecting');
    setIsAsrReady(false);

    try {
      const [session, history] = await Promise.all([
        voiceInterviewApi.resumeSession(id),
        voiceInterviewApi.getMessages(id),
      ]);
      setSessionId(session.sessionId);
      setCurrentPhase(session.currentPhase);

      if (session.startTime) {
        const elapsedSec = Math.floor((Date.now() - new Date(session.startTime).getTime()) / 1000);
        setCurrentTime(elapsedSec > 0 ? elapsedSec : 0);
      }

      const restored: { role: 'user' | 'ai'; text: string; id: string }[] = [];
      let pendingAi: { text: string; id: string } | null = null;
      for (const msg of history) {
        const aiText = msg.aiGeneratedText?.trim();
        const userText = msg.userRecognizedText?.trim();

        if (pendingAi) {
          restored.push({ role: 'ai', text: pendingAi.text, id: pendingAi.id });
          pendingAi = null;
          if (userText) {
            restored.push({ role: 'user', text: userText, id: `user-${msg.id}` });
          }
          if (aiText) {
            pendingAi = { text: aiText, id: `ai-${msg.id}` };
          }
          continue;
        }

        if (aiText && userText) {
          restored.push({ role: 'ai', text: aiText, id: `ai-${msg.id}` });
          restored.push({ role: 'user', text: userText, id: `user-${msg.id}` });
        } else if (aiText) {
          pendingAi = { text: aiText, id: `ai-${msg.id}` };
        } else if (userText) {
          restored.push({ role: 'user', text: userText, id: `user-${msg.id}` });
        }
      }
      if (pendingAi) {
        restored.push({ role: 'ai', text: pendingAi.text, id: pendingAi.id });
      }
      setMessages(restored);

      const wsUrl = session.webSocketUrl || `ws://localhost:8080/ws/voice-interview/${session.sessionId}`;
      connectWithHandlers(session.sessionId, wsUrl);
    } catch (error) {
      setError(error instanceof Error ? error.message : '恢复会话失败');
      setConnectionStatus('disconnected');
      setIsAsrReady(false);
    }
  }, [connectWithHandlers]);

  // Auto-start
  useEffect(() => {
    if (autoStartRef.current) return;

    if (presetVoiceConfig) {
      autoStartRef.current = true;
      handlePhaseConfig({
        skillId: presetVoiceConfig.skillId,
        difficulty: presetVoiceConfig.difficulty,
        techEnabled: presetVoiceConfig.techEnabled,
        projectEnabled: presetVoiceConfig.projectEnabled,
        hrEnabled: presetVoiceConfig.hrEnabled,
        plannedDuration: presetVoiceConfig.plannedDuration,
        resumeId: presetVoiceConfig.resumeId,
        llmProvider: presetVoiceConfig.llmProvider,
      });
    } else if (resumeSessionId) {
      autoStartRef.current = true;
      handleResumeSession(resumeSessionId);
    }
  }, [handlePhaseConfig, handleResumeSession, presetVoiceConfig, resumeSessionId]);

  // 麦克风音频持续发送给服务端做 ASR
  const handleAudioData = (audioData: string) => {
    if (isAiSpeakingRef.current || isSubmittingRef.current) {
      return;
    }
    if (!isAsrReadyRef.current) {
      return;
    }
    if (wsRef.current && wsRef.current.isConnected()) {
      wsRef.current.sendAudio(audioData);
    } else {
      setError('未连接到服务器，请刷新页面重试');
    }
  };

  const handleSpeechStart = () => {};
  const handleSpeechEnd = () => {};

  const handleEndInterview = async () => {
    endedByUserRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.disconnect();
    }
    if (sessionId) {
      try {
        await voiceInterviewApi.endSession(sessionId);
      } catch (error) {
        console.error('Failed to end session:', error);
      }
    }
    navigate('/interviews');
  };

  const handleCloseModal = () => {
    navigate('/history');
  };

  const canSubmit = !!userText.trim() && !isAiSpeaking && !isSubmitting && connectionStatus === 'connected';
  const canRecord = connectionStatus === 'connected' && isAsrReady && !isAiSpeaking && !isSubmitting;

  const skillName = SKILL_NAMES[effectiveSkillId] || templateName || effectiveSkillId;

  if (!autoStartRef.current && !presetVoiceConfig && !resumeSessionId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-8 text-center max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <p className="text-slate-700 dark:text-slate-200 text-lg font-semibold mb-2">未检测到语音面试配置</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">请从面试记录或"语音面试"入口开始</p>
          <button
            onClick={handleCloseModal}
            className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            返回重新开始
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 5rem)' }}>
      {/* Immersive top bar */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.button
              onClick={() => navigate('/interviews')}
              className="p-2 -ml-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">语音模拟面试</h1>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{skillName}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Phase badge */}
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-xs font-medium text-primary-600 dark:text-primary-400">
              {getPhaseLabel(currentPhase)}
            </span>
            {/* Connection status */}
            <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
              connectionStatus === 'connected'
                ? isAsrReady
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                : connectionStatus === 'connecting'
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                connectionStatus === 'connected' && isAsrReady
                  ? 'bg-emerald-500'
                  : connectionStatus === 'connected'
                    ? 'bg-amber-500 animate-pulse'
                    : connectionStatus === 'connecting'
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-red-500'
              }`} />
              {connectionStatus === 'connected'
                ? isAsrReady ? '就绪' : '准备中'
                : connectionStatus === 'connecting' ? '连接中' : '断开'}
            </span>
            {/* Timer */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {formatTime(currentTime)}
            </div>
          </div>
        </div>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 px-4 py-2.5 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content area — 3 cards */}
      <div className="flex-1 min-h-0 p-4">
        <div className="max-w-7xl mx-auto h-full grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* ===== Left 2/3: Avatar card + Answer card ===== */}
          <div className="xl:col-span-2 h-full flex flex-col gap-4">
            {/* --- Card 1: Interviewer Avatar --- */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex-1 flex flex-col items-center justify-center relative overflow-hidden">
              {/* Sound wave rings — only when AI speaking */}
              <AnimatePresence>
                {isAiSpeaking && (
                  <>
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={`wave-${i}`}
                        className="absolute rounded-full border border-primary-400/30 dark:border-primary-500/20"
                        initial={{ width: 128, height: 128, opacity: 0.5 }}
                        animate={{
                          width: [128, 128 + (i + 1) * 70],
                          height: [128, 128 + (i + 1) * 70],
                          opacity: [0.5, 0],
                        }}
                        transition={{
                          duration: 1.8,
                          repeat: Infinity,
                          delay: i * 0.35,
                          ease: 'easeOut',
                        }}
                        style={{
                          marginLeft: -(64 + (i + 1) * 35),
                          marginTop: -(64 + (i + 1) * 35),
                          top: '50%',
                          left: '50%',
                        }}
                      />
                    ))}
                    {/* Extra outer breathing ring */}
                    <motion.div
                      className="absolute rounded-full border-2 border-primary-300/20 dark:border-primary-400/10"
                      initial={{ width: 140, height: 140, opacity: 0.3 }}
                      animate={{
                        width: [140, 260],
                        height: [140, 260],
                        opacity: [0.3, 0],
                      }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                      style={{
                        marginLeft: -70,
                        marginTop: -70,
                        top: '50%',
                        left: '50%',
                      }}
                    />
                  </>
                )}
              </AnimatePresence>

              {/* Avatar */}
              <motion.div
                animate={isAiSpeaking ? {
                  scale: [1, 1.08, 1],
                  transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
                } : {}}
                className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
                  isAiSpeaking
                    ? 'bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 shadow-xl shadow-primary-500/30'
                    : 'bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 shadow-lg'
                }`}
              >
                <Bot className={`w-14 h-14 ${isAiSpeaking ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
              </motion.div>

              {/* Question text below avatar */}
              <div className="relative z-10 w-full max-w-lg mt-5 min-h-[56px]">
                <AnimatePresence mode="wait">
                  {isAiSpeaking && aiText ? (
                    <motion.p
                      key="ai-q"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-center text-base font-medium text-slate-800 dark:text-slate-100 leading-relaxed px-4"
                    >
                      {aiText}
                      <motion.span
                        className="inline-block w-1.5 h-1.5 bg-primary-500 ml-1 rounded-full"
                        animate={{ opacity: [1, 0.25, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      />
                    </motion.p>
                  ) : !isAiSpeaking && !isSubmitting && messages.length === 0 ? (
                    <motion.p
                      key="waiting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center text-sm text-slate-400 dark:text-slate-500 px-4"
                    >
                      面试即将开始，请准备...
                    </motion.p>
                  ) : (
                    <motion.p
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center text-sm text-slate-400 dark:text-slate-500 px-4"
                    >
                      {isSubmitting ? '正在思考...' : '等待下一题...'}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* --- Card 2: User Answer + Controls --- */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-4">
              {/* ASR recognized text display */}
              <div className="mb-3 min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                <AnimatePresence mode="wait">
                  {userText ? (
                    <motion.p
                      key="asr-text"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                    >
                      {userText}
                      {isRecording && (
                        <span className="inline-block w-2 h-4 bg-primary-500 ml-0.5 animate-pulse" />
                      )}
                    </motion.p>
                  ) : (
                    <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                      {isRecording ? '正在聆听...' : '点击麦克风开始说话'}
                    </p>
                  )}
                </AnimatePresence>
              </div>

              {/* 3 buttons: End | Mic | Submit — equal width */}
              <div className="flex items-center gap-3">
                {/* End button (left) */}
                <button
                  onClick={handleEndInterview}
                  disabled={connectionStatus !== 'connected'}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PhoneOff className="w-4 h-4" />
                  结束
                </button>

                {/* Mic button (center) */}
                <div className="flex-1 flex items-center justify-center">
                  <AudioRecorder
                    isRecording={isRecording}
                    disabled={!isRecording && !canRecord}
                    onRecordingChange={setIsRecording}
                    onAudioData={handleAudioData}
                    onSpeechStart={handleSpeechStart}
                    onSpeechEnd={handleSpeechEnd}
                  />
                </div>

                {/* Submit button (right) */}
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!canSubmit}
                  className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                    canSubmit
                      ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/25 hover:shadow-lg'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <SendHorizonal className="w-4 h-4" />
                  提交回答
                </button>
              </div>
            </div>
          </div>

          {/* ===== Right 1/3: Conversation Log (list style) ===== */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col min-h-0">
            <RealtimeSubtitle
              messages={messages}
              userText={userText}
              aiText={aiText}
              isAiSpeaking={isAiSpeaking}
            />
          </div>
        </div>
      </div>

      {aiAudio && (
        <audio
          ref={audioPlayerRef}
          src={`data:audio/wav;base64,${aiAudio}`}
          onEnded={() => {
            finishAiPlayback();
          }}
          onPlay={() => setAiSpeaking(true)}
          autoPlay
          style={{ display: 'none' }}
        />
      )}
    </div>
  );
}
