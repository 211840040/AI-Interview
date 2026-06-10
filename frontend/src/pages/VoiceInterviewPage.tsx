import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, PhoneOff, AlertCircle, Mic, ArrowLeft, SendHorizonal } from 'lucide-react';
import VideoAvatar from '../components/VideoAvatar';
import defaultBgVideo from '../assets/bg_video.mp4?url';
console.log('Video path:', defaultBgVideo); // 检查打包后的路径
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
  const [aiText, setAiText] = useState('');           // 实时字幕
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string; id: string }[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAsrReady, setIsAsrReady] = useState(false);

  const [skills, setSkills] = useState<SkillDTO[]>([]);

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<VoiceInterviewWebSocket | null>(null);
  const autoStartRef = useRef(false);
  const endedByUserRef = useRef(false);
  const isAiSpeakingRef = useRef(false);
  const isAsrReadyRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const lastAiCommittedTextRef = useRef('');
  const aiTextRef = useRef('');        // 用于保存最新字幕，供视频结束回调使用
  const pendingAiCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 在现有 ref 区域添加
  const pendingAiTextRef = useRef<string>('');   // 暂存 AI 最终文本

  // 视频相关
  const [dynamicVideoSrc, setDynamicVideoSrc] = useState<string | null>(null);
  const activeVideoRequestRef = useRef<AbortController | null>(null);
  const chunkedPcmBuffersRef = useRef<Float32Array[]>([]);

  // 在现有 ref 定义区域附近添加
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.isConnected()) {
        // 发送心跳消息，具体 action 可根据后端要求调整，这里使用 'ping'
        wsRef.current.sendControl('ping', { timestamp: Date.now() });
        console.log('[Heartbeat] sent');
      }
    }, 15000); // 15秒发送一次，小于服务端超时阈值
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // 在现有 ref/state 定义区域添加
  const isFirstQuestionCompletedRef = useRef(false);
  const [isFirstQuestionCompleted, setIsFirstQuestionCompleted] = useState(false);

  useEffect(() => { aiTextRef.current = aiText; }, [aiText]);
  useEffect(() => { isAsrReadyRef.current = isAsrReady; }, [isAsrReady]);
  useEffect(() => { isSubmittingRef.current = isSubmitting; }, [isSubmitting]);

  const setAiSpeaking = useCallback((value: boolean) => {
    isAiSpeakingRef.current = value;
    setIsAiSpeaking(value);
  }, []);

  const finishAiPlayback = useCallback(() => {
    console.log('[finishAiPlayback] 开始执行');
    setAiSpeaking(false);
    setIsSubmitting(false);
    isAiSpeakingRef.current = false;
    isSubmittingRef.current = false;
    if (pendingAiCommitRef.current) {
      clearTimeout(pendingAiCommitRef.current);
      pendingAiCommitRef.current = null;
    }
    chunkedPcmBuffersRef.current = [];
    setIsAsrReady(true);
    stopHeartbeat();
    console.log('[finishAiPlayback] 完成');
  }, [setAiSpeaking, setIsSubmitting, setIsAsrReady, stopHeartbeat]);

  // 合并分块 PCM 为 WAV base64
  const mergeChunksToWavBase64 = useCallback(async (chunks: Float32Array[]): Promise<string> => {
    if (!chunks.length) return '';
    let totalLength = 0;
    for (const chunk of chunks) totalLength += chunk.length;
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = combined.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (view: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    let offsetBytes = 44;
    for (let i = 0; i < combined.length; i++) {
      const sample = Math.max(-1, Math.min(1, combined[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offsetBytes, int16, true);
      offsetBytes += 2;
    }
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
      reader.readAsDataURL(blob);
    });
  }, []);

  const requestAndPlayVideo = useCallback(async (audioBase64: string, responseText: string) => {
    // 启动心跳，防止连接空闲断开
    startHeartbeat();

    if (!audioBase64) return;
    if (activeVideoRequestRef.current) activeVideoRequestRef.current.abort();

    const controller = new AbortController();
    activeVideoRequestRef.current = controller;
    try {
      const response = await fetch('http://localhost:5001/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: audioBase64 }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Generate video failed: ${response.status}`);
      const data = await response.json();
      const videoBase64 = data.video;
      if (!videoBase64) throw new Error('No video data in response');
      const byteCharacters = atob(videoBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      setDynamicVideoSrc(prev => {
        if (prev && prev !== defaultBgVideo && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return blobUrl;
      });
      const normalized = responseText.trim();
      if (normalized) {
        // 暂存，等待视频播放时再显示
        pendingAiTextRef.current = normalized;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('[VideoGen] Error:', error);
      if (responseText.trim()) {
        setAiText(responseText.trim());
        setAiSpeaking(true);
        if (pendingAiCommitRef.current) clearTimeout(pendingAiCommitRef.current);
        pendingAiCommitRef.current = setTimeout(() => finishAiPlayback(), 2500);
      } else {
        finishAiPlayback();
      }
    } finally {
      if (activeVideoRequestRef.current === controller) activeVideoRequestRef.current = null;
      // 视频请求完成，但心跳还需要继续维持直到视频播放结束（视频播放期间也不能断开）
      // 所以不在 finally 中停止心跳，而是在 finishAiPlayback 中停止
    }
  }, [finishAiPlayback, setAiSpeaking, setAiText, startHeartbeat]);

  // 处理分块音频（仅累积数据，不播放）
  const handleAudioChunk = useCallback((base64Wav: string, _index: number, isLast: boolean) => {
    try {
      const binaryStr = atob(base64Wav);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const pcmOffset = 44;
      const pcmData = new Int16Array(bytes.buffer, pcmOffset, (bytes.length - pcmOffset) / 2);
      const float32 = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) float32[i] = pcmData[i] / 32768.0;
      const copy = new Float32Array(float32.length);
      copy.set(float32);
      chunkedPcmBuffersRef.current.push(copy);
      setAiSpeaking(true);
      if (isLast) {
        // 等待 audio_complete 消息触发合并生成
      }
    } catch (e) {
      console.error('[ChunkAudio] Decode error:', e);
    }
  }, [setAiSpeaking]);

  // 加载技能列表
  useEffect(() => { skillApi.listSkills().then(setSkills).catch(console.error); }, []);
  useEffect(() => {
    if (skills.length && effectiveSkillId) setTemplateName(getTemplateName(effectiveSkillId, skills));
  }, [skills, effectiveSkillId]);

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (wsRef.current) wsRef.current.disconnect();
      if (pendingAiCommitRef.current) clearTimeout(pendingAiCommitRef.current);
      const currentSessionId = sessionId;
      if (currentSessionId && !endedByUserRef.current) voiceInterviewApi.pauseSession(currentSessionId).catch(() => {});
      // 注意：动态视频 URL 的清理已经在 setDynamicVideoSrc 中手动 revoke，此处无需再 revoke
      stopHeartbeat();
    };
  }, [sessionId, stopHeartbeat]); // 移除 dynamicVideoSrc 依赖
  // 计时器
  useEffect(() => {
    if (sessionId && connectionStatus === 'connected') startTimer();
    else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sessionId, connectionStatus]);

  const startTimer = () => { timerRef.current = setInterval(() => setCurrentTime(p => p + 1), 1000); };
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const getPhaseLabel = (phase: string) => ({ INTRO: '自我介绍', TECH: '技术问题', PROJECT: '项目深挖', HR: 'HR问题' }[phase] || phase);

  // 提交回答
  const handleSubmitAnswer = useCallback(() => {
    if (!wsRef.current?.isConnected()) return;
    if (!userText.trim() || isAiSpeakingRef.current || isSubmitting) return;
    setIsRecording(false);
    setIsSubmitting(true);
    const text = userText.trim();
    setMessages(prev => [...prev, { role: 'user', text, id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]);
    setUserText('');
    setAiText('');
    wsRef.current.sendControl('submit', { text });
  }, [userText, isSubmitting]);

  // WebSocket 处理器
  const createWebSocketHandlers = useCallback(() => ({
    onOpen: () => { setConnectionStatus('connected'); setIsAsrReady(false); },
    onMessage: () => {},
    onSubtitle: (text: string, isFinal: boolean) => {
      if (isFinal && text.trim()) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'user' && last.text.trim() === text.trim()) return prev;
          return [...prev, { role: 'user', text: text.trim(), id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }];
        });
        setUserText('');
      } else setUserText(text);
    },
    onAudioResponse: (audioData: string, text: string) => {
      // 清空分块缓存
      chunkedPcmBuffersRef.current = [];
      const normalized = (text || '').trim();
      if (audioData && audioData.length > 0) {
        requestAndPlayVideo(audioData, normalized);
      } else if (normalized) {
        // 没有音频时，延迟提交（模拟视频播放）
        setAiText(normalized);
        setAiSpeaking(true);
        if (pendingAiCommitRef.current) clearTimeout(pendingAiCommitRef.current);
        pendingAiCommitRef.current = setTimeout(() => finishAiPlayback(), 2500);
      }
    },
    onTextResponse: (text: string, isFinal: boolean) => {
      console.log('[onTextResponse] 收到文本', text, isFinal);
      const normalized = (text || '').trim();
      if (!normalized) return;
      if (isFinal) {
        // 只在最终文本时暂存，等待视频播放
        pendingAiTextRef.current = normalized;
        aiTextRef.current = normalized;
      }
      // 不再实时显示字幕
    },
    onClose: (event: { code: number }) => {
      setConnectionStatus('disconnected');
      setIsAsrReady(false);
      if (event.code !== 1000) setError('连接已断开，请刷新页面重试');
    },
    onError: () => {
      setError('WebSocket 连接错误，请检查网络后重试');
      setConnectionStatus('disconnected');
      setIsAsrReady(false);
    },
    onAudioChunk: (data: string, index: number, isLast: boolean) => {
      console.log('[onAudioChunk] 收到分块音频', index, isLast);
      // 累积 PCM 数据用于视频生成
      handleAudioChunk(data, index, isLast);
      // 注意：字幕应该在收到 text 消息时显示，而不是在音频分块时
    },
    onControl: (action: string, message?: string) => {
      if (action === 'asr_ready') { setIsAsrReady(true); setError(null); return; }
      if (action === 'asr_reconnecting') { setIsAsrReady(false); if (message) setError(message); return; }
      if (action === 'audio_complete') {
        console.log('[onControl] 收到 audio_complete，完成视频生成');
        (async () => {
          if (chunkedPcmBuffersRef.current.length === 0) return;
          try {
            const wavBase64 = await mergeChunksToWavBase64(chunkedPcmBuffersRef.current);
            if (wavBase64) {
              const currentText = aiTextRef.current;
              if (currentText) {
                // 已经有字幕文本，直接生成视频
                await requestAndPlayVideo(wavBase64, currentText);
              } else {
                // 没有字幕文本，说明 text 消息还没到，等待一下
                console.log('[onControl] 等待字幕文本...');
                setTimeout(async () => {
                  const text = aiTextRef.current;
                  if (text) {
                    await requestAndPlayVideo(wavBase64, text);
                  } else {
                    console.warn('[onControl] 超时未收到字幕文本');
                  }
                }, 2000);
              }
            }
          } catch (err) { console.error('[ChunkAudio] Generate video error', err); }
          finally { chunkedPcmBuffersRef.current = []; }
        })();
        return;
      }
      if (action === 'pause_timeout_warning' && message) setError(message);
      if (action === 'pause_timeout' && message) { setError(message); setConnectionStatus('disconnected'); setIsAsrReady(false); }
    },
    onErrorMessage: (message: string) => { setError(message || '语音面试服务异常，请稍后重试'); if (message.includes('语音识别')) setIsAsrReady(false); },
  }), [requestAndPlayVideo, handleAudioChunk, mergeChunksToWavBase64, finishAiPlayback]);

  const connectWithHandlers = useCallback((sessionId: number, wsUrl: string) => {
    setIsAsrReady(false);
    setTimeout(() => {
      try { wsRef.current = connectWebSocket(sessionId, wsUrl, createWebSocketHandlers()); }
      catch (error) { setError('无法建立 WebSocket 连接: ' + (error instanceof Error ? error.message : '未知错误')); setConnectionStatus('disconnected'); setIsAsrReady(false); }
    }, 500);
  }, [createWebSocketHandlers]);

  // 创建会话
  const handlePhaseConfig = useCallback(async (config: any) => {
    setError(null); setConnectionStatus('connecting'); setIsAsrReady(false);
    try {
      const session = await voiceInterviewApi.createSession({ ...config, introEnabled: false });
      setSessionId(session.sessionId);
      setCurrentPhase(session.currentPhase);
      const wsUrl = session.webSocketUrl || `ws://localhost:8080/ws/voice-interview/${session.sessionId}`;
      connectWithHandlers(session.sessionId, wsUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建面试会话失败，请重试';
      setError(errorMessage); setConnectionStatus('disconnected'); setIsAsrReady(false);
      alert('创建会话失败：' + errorMessage);
    }
  }, [connectWithHandlers]);

  // 恢复会话
  const handleResumeSession = useCallback(async (id: number) => {
    setError(null); setConnectionStatus('connecting'); setIsAsrReady(false);
    try {
      const [session, history] = await Promise.all([voiceInterviewApi.resumeSession(id), voiceInterviewApi.getMessages(id)]);
      setSessionId(session.sessionId);
      setCurrentPhase(session.currentPhase);
      if (session.startTime) setCurrentTime(Math.floor((Date.now() - new Date(session.startTime).getTime()) / 1000));
      const restored: { role: 'user' | 'ai'; text: string; id: string }[] = [];
      let pendingAi: { text: string; id: string } | null = null;
      for (const msg of history) {
        const aiText = msg.aiGeneratedText?.trim();
        const userText = msg.userRecognizedText?.trim();
        if (pendingAi) {
          restored.push({ role: 'ai', text: pendingAi.text, id: pendingAi.id });
          pendingAi = null;
          if (userText) restored.push({ role: 'user', text: userText, id: `user-${msg.id}` });
          if (aiText) pendingAi = { text: aiText, id: `ai-${msg.id}` };
          continue;
        }
        if (aiText && userText) { restored.push({ role: 'ai', text: aiText, id: `ai-${msg.id}` }, { role: 'user', text: userText, id: `user-${msg.id}` }); }
        else if (aiText) pendingAi = { text: aiText, id: `ai-${msg.id}` };
        else if (userText) restored.push({ role: 'user', text: userText, id: `user-${msg.id}` });
      }
      if (pendingAi) restored.push({ role: 'ai', text: pendingAi.text, id: pendingAi.id });
      setMessages(restored);
      const wsUrl = session.webSocketUrl || `ws://localhost:8080/ws/voice-interview/${session.sessionId}`;
      connectWithHandlers(session.sessionId, wsUrl);
    } catch (error) { setError(error instanceof Error ? error.message : '恢复会话失败'); setConnectionStatus('disconnected'); setIsAsrReady(false); }
  }, [connectWithHandlers]);

  // 自动开始
  useEffect(() => {
    if (autoStartRef.current) return;
    if (presetVoiceConfig) {
      autoStartRef.current = true;
      handlePhaseConfig(presetVoiceConfig);
    } else if (resumeSessionId) {
      autoStartRef.current = true;
      handleResumeSession(resumeSessionId);
    }
  }, [handlePhaseConfig, handleResumeSession, presetVoiceConfig, resumeSessionId]);

  const handleAudioData = (audioData: string) => {
    if (isAiSpeakingRef.current || isSubmittingRef.current) return;
    if (!isAsrReadyRef.current) return;
    if (wsRef.current?.isConnected()) wsRef.current.sendAudio(audioData);
    else setError('未连接到服务器，请刷新页面重试');
  };

  const handleEndInterview = async () => {
    endedByUserRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (wsRef.current) wsRef.current.disconnect();
    if (sessionId) { try { await voiceInterviewApi.endSession(sessionId); } catch (e) { console.error(e); } }
    navigate('/interviews');
  };

  const handleCloseModal = () => navigate('/history');

  const canSubmit = !!userText.trim() && !isAiSpeaking && !isSubmitting && connectionStatus === 'connected';
  const canRecord =
      connectionStatus === 'connected' &&
      isAsrReady &&
      !isAiSpeaking &&
      !isSubmitting &&
      isFirstQuestionCompleted; // 🔒 必须等首个视频播完
  const skillName = SKILL_NAMES[effectiveSkillId] || templateName || effectiveSkillId;

  if (!autoStartRef.current && !presetVoiceConfig && !resumeSessionId) {
    return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-8 text-center max-w-md w-full">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <p className="text-slate-700 dark:text-slate-200 text-lg font-semibold mb-2">未检测到语音面试配置</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">请通过「模拟面试」页面选择语音模式开始</p>
            <button onClick={handleCloseModal} className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors">返回重新开始</button>
          </div>
        </div>
    );
  }

  return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 5rem)' }}>
        {/* 顶部栏（保持不变） */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.button onClick={() => navigate('/interviews')} className="p-2 -ml-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}><ArrowLeft className="w-5 h-5" /></motion.button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center"><Mic className="w-4 h-4 text-white" /></div>
                <div><h1 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">语音模拟面试</h1><p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{skillName}</p></div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-xs font-medium text-primary-600 dark:text-primary-400">{getPhaseLabel(currentPhase)}</span>
              <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${connectionStatus === 'connected' ? (isAsrReady ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400') : connectionStatus === 'connecting' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' && isAsrReady ? 'bg-emerald-500' : connectionStatus === 'connected' ? 'bg-amber-500 animate-pulse' : connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`} />
                {connectionStatus === 'connected' ? (isAsrReady ? '就绪' : '准备中') : connectionStatus === 'connecting' ? '连接中' : '断开'}
            </span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-mono font-bold text-slate-600 dark:text-slate-300"><Clock className="w-3.5 h-3.5 text-slate-400" />{formatTime(currentTime)}</div>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 px-4 py-2.5 flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span className="text-sm">{error}</span></div>
              </motion.div>
          )}
        </AnimatePresence>

        {/* 主要内容区 */}
        <div className="flex-1 min-h-0 p-4">
          <div className="max-w-7xl mx-auto h-full grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 h-full flex flex-col gap-4">
              {/* 面试官视频卡片 */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex-1 flex flex-col items-center justify-center relative overflow-visible">
                <AnimatePresence>
                  {isAiSpeaking && (
                      <>
                        {[0, 1, 2].map((i) => (
                            <motion.div key={`wave-${i}`} className="absolute rounded-full border border-primary-400/30 dark:border-primary-500/20" initial={{ width: 128, height: 128, opacity: 0.5 }} animate={{ width: [128, 128 + (i + 1) * 70], height: [128, 128 + (i + 1) * 70], opacity: [0.5, 0] }} transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.35, ease: 'easeOut' }} style={{ marginLeft: -(64 + (i + 1) * 35), marginTop: -(64 + (i + 1) * 35), top: '50%', left: '50%' }} />
                        ))}
                        <motion.div className="absolute rounded-full border-2 border-primary-300/20 dark:border-primary-400/10" initial={{ width: 140, height: 140, opacity: 0.3 }} animate={{ width: [140, 260], height: [140, 260], opacity: [0.3, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }} style={{ marginLeft: -70, marginTop: -70, top: '50%', left: '50%' }} />
                      </>
                  )}
                </AnimatePresence>
                {/* 视频容器，设置 overflow-visible 防止裁剪 */}
                <div className="relative w-[280px] h-[280px] md:w-[320px] md:h-[320px] lg:w-[400px] lg:h-[500px] overflow-visible">
                  <VideoAvatar
                      key={dynamicVideoSrc ? 'dynamic' : 'default'} // 强制切换时重新挂载
                      defaultSrc={defaultBgVideo}
                      dynamicSrc={dynamicVideoSrc}
                      onDynamicEnd={() => {
                        console.log('[onDynamicEnd] 视频播放结束，清理动态视频');
                        // 先重置状态，再清理视频资源
                        finishAiPlayback();
                        setDynamicVideoSrc(prev => {
                          if (prev && prev !== defaultBgVideo && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                          return null;
                        });
                        // ✅ 【核心逻辑】如果是首次提问视频播完，解锁麦克风
                        if (!isFirstQuestionCompletedRef.current) {
                          isFirstQuestionCompletedRef.current = true;
                          setIsFirstQuestionCompleted(true);
                          console.log('[onDynamicEnd] 首次提问完成，麦克风已解锁');
                        }
                        // 额外确保 AudioRecorder 的 disabled 状态重新计算（强制触发重渲染）
                        // 注意：finishAiPlayback 已经 setAiSpeaking(false) 和 setIsSubmitting(false)，会自动生效
                      }}
                      onPlayStart={() => {
                        const text = pendingAiTextRef.current;
                        if (text) {
                          console.log('[onPlayStart] 视频开始播放，显示 AI 字幕并记录:', text);
                          setAiText(text);
                          setAiSpeaking(true);
                          // 添加到右侧对话实录
                          if (text !== lastAiCommittedTextRef.current) {
                            setMessages(prev => {
                              const last = prev[prev.length - 1];
                              if (last?.role === 'ai' && last.text.trim() === text) return prev;
                              return [...prev, { role: 'ai', text, id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }];
                            });
                            lastAiCommittedTextRef.current = text;
                          }
                          pendingAiTextRef.current = '';
                        }
                      }}
                      className="w-full h-full object-contain rounded-2xl shadow-xl relative z-10"
                      defaultMuted={true}
                      dynamicMuted={false}
                  />
                </div>
                {/* 字幕 */}
                <div className="relative z-10 w-full max-w-lg mt-5 min-h-[56px]">
                  {/* 字幕区域渲染逻辑优化 */}
                  <AnimatePresence mode="wait">
                    {/* ✅ 优先级 1：只要有 AI 文本（无论是否正在说话），就显示字幕 */}
                    {aiText ? (
                        <motion.p
                            key="ai-q"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-center text-base font-medium text-slate-800 dark:text-slate-100 leading-relaxed px-4"
                        >
                          {aiText}
                          {/* ✅ 仅在 AI 正在说话时显示呼吸点动画 */}
                          {isAiSpeaking && (
                              <motion.span
                                  className="inline-block w-1.5 h-1.5 bg-primary-500 ml-1 rounded-full"
                                  animate={{ opacity: [1, 0.25, 1] }}
                                  transition={{ duration: 0.8, repeat: Infinity }}
                              />
                          )}
                        </motion.p>
                    ) : !isAiSpeaking && !isSubmitting && messages.length === 0 ? (
                        <motion.p key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm text-slate-400 dark:text-slate-500 px-4">
                          面试即将开始，请准备...
                        </motion.p>
                    ) : (
                        <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm text-slate-400 dark:text-slate-500 px-4">
                          {isSubmitting ? '正在思考...' : '等待下一题...'}
                        </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* 用户回答卡片 */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-4">
                <div className="mb-3 min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                  <AnimatePresence mode="wait">
                    {userText ? (
                        <motion.p key="asr-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          {userText}
                          {isRecording && <span className="inline-block w-2 h-4 bg-primary-500 ml-0.5 animate-pulse" />}
                        </motion.p>
                    ) : (
                        <p className="text-sm text-slate-400 dark:text-slate-500 italic">{isRecording ? '正在聆听...' : '点击麦克风开始说话'}</p>
                    )}
                  </AnimatePresence>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={handleEndInterview} disabled={connectionStatus !== 'connected'} className="flex-1 px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed"><PhoneOff className="w-4 h-4" />结束</button>
                  <div className="flex-1 flex items-center justify-center">
                    <AudioRecorder isRecording={isRecording} disabled={!isRecording && !canRecord} onRecordingChange={setIsRecording} onAudioData={handleAudioData} onSpeechStart={()=>{}} onSpeechEnd={()=>{}} />
                  </div>
                  <button onClick={handleSubmitAnswer} disabled={!canSubmit} className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${canSubmit ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/25 hover:shadow-lg' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'}`}><SendHorizonal className="w-4 h-4" />提交回答</button>
                </div>
              </div>
            </div>

            {/* 右侧对话实录 */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col min-h-0">
              <RealtimeSubtitle messages={messages} userText={userText} aiText={aiText} isAiSpeaking={isAiSpeaking} />
            </div>
          </div>
        </div>
      </div>
  );
}