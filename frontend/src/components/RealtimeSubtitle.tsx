import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'ai';
  text: string;
  id: string;
}

interface RealtimeSubtitleProps {
  messages: Message[];
  userText: string;
  aiText: string;
  isAiSpeaking: boolean;
}

export default function RealtimeSubtitle({
  messages,
  userText,
  aiText,
  isAiSpeaking
}: RealtimeSubtitleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeAiText = aiText.trim();
  const latestAiMessage = [...messages].reverse().find(msg => msg.role === 'ai');
  const shouldShowActiveAi =
    isAiSpeaking &&
    !!activeAiText &&
    latestAiMessage?.text.trim() !== activeAiText.trim();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, userText, activeAiText]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide uppercase">对话实录</h4>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">共 {messages.length} 条</span>
        </div>
      </div>

      {/* List-style conversation log */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5 scroll-smooth"
      >
        {messages.length === 0 && !userText && !isAiSpeaking ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">暂无对话记录</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: msg.role === 'ai' ? -8 : 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex items-start gap-2 px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  msg.role === 'ai'
                    ? 'bg-sky-50 dark:bg-sky-900/20 text-slate-700 dark:text-slate-300'
                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span
                  className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                    msg.role === 'ai'
                      ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                      : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {msg.role === 'ai' ? 'Q' : 'A'}
                </span>
                <span className="flex-1">{msg.text}</span>
              </motion.div>
            ))}

            {/* Live AI entry */}
            {shouldShowActiveAi && (
              <motion.div
                key="active-ai"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 px-3 py-2 rounded-xl text-sm leading-relaxed bg-sky-50 dark:bg-sky-900/20 text-slate-700 dark:text-slate-300"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                  Q
                </span>
                <span className="flex-1">
                  {activeAiText}
                  <motion.span
                    className="inline-block w-1 h-3.5 bg-sky-500 ml-0.5 align-middle"
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                </span>
              </motion.div>
            )}

            {/* Live user entry */}
            {userText && !shouldShowActiveAi && (
              <motion.div
                key="active-user"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 px-3 py-2 rounded-xl text-sm leading-relaxed bg-emerald-50 dark:bg-emerald-900/20 text-slate-700 dark:text-slate-300 italic"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                  A
                </span>
                <span className="flex-1">{userText}</span>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
