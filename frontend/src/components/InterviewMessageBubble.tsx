import { motion } from 'framer-motion';
import { Bot, Copy, Check, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

export type InterviewMessageRole = 'interviewer' | 'user';

interface InterviewMessageBubbleProps {
  role: InterviewMessageRole;
  text: string;
  category?: string;
  questionIndex?: number;
  highlight?: boolean;
  italic?: boolean;
  suffix?: ReactNode;
}

const CATEGORY_ACCENT: Record<string, string> = {
  '技术基础': 'border-l-sky-500',
  '项目经验': 'border-l-violet-500',
  '算法': 'border-l-emerald-500',
  '系统设计': 'border-l-amber-500',
  'HR': 'border-l-rose-500',
};

const CATEGORY_BADGE: Record<string, string> = {
  '技术基础': 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  '项目经验': 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  '算法': 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  '系统设计': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  'HR': 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
};

export default function InterviewMessageBubble({
  role,
  text,
  category,
  questionIndex,
  highlight = false,
  italic = false,
  suffix,
}: InterviewMessageBubbleProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  if (role === 'interviewer') {
    const accentColor = category ? CATEGORY_ACCENT[category] || 'border-l-primary-500' : 'border-l-primary-500';
    const badgeColor = category ? CATEGORY_BADGE[category] || 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : '';

    return (
      <motion.div
        initial={{ opacity: 0, x: -24, y: 8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex items-start gap-3 group"
      >
        <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-primary-500/20">
          <Bot className="w-[18px] h-[18px] text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">面试官</span>
            {questionIndex !== undefined && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                Q{questionIndex + 1}
              </span>
            )}
            {category && (
              <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${badgeColor}`}>
                {category}
              </span>
            )}
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="ml-auto opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
              title="复制题目"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <div
            className={`rounded-2xl rounded-tl-sm p-4 leading-relaxed shadow-sm border-l-4 ${accentColor}
              ${highlight
                ? 'bg-slate-100 dark:bg-slate-700/80 border-primary-300/60 dark:border-primary-700/40 text-slate-700 dark:text-slate-200'
                : 'bg-white dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200'
              } ${italic ? 'italic' : ''}`}
          >
            <p className="whitespace-pre-wrap break-words">{text}</p>
            {suffix}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24, y: 8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex items-start gap-3 justify-end"
    >
      <div className="flex-1 max-w-[85%] min-w-0">
        <div className="flex items-center gap-2 mb-1.5 justify-end">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">我</span>
        </div>
        <div
          className={`rounded-2xl rounded-tr-sm p-4 leading-relaxed shadow-sm
            bg-gradient-to-br from-primary-50 to-primary-100/80 dark:from-primary-900/40 dark:to-primary-800/30
            text-slate-800 dark:text-slate-200 border border-primary-200/60 dark:border-primary-700/30
            ${highlight ? 'ring-2 ring-primary-400/30' : ''} ${italic ? 'italic' : ''}`}
        >
          <p className="whitespace-pre-wrap break-words">{text}</p>
          {suffix}
        </div>
      </div>
      <div className="w-9 h-9 bg-slate-200 dark:bg-slate-600 rounded-xl flex items-center justify-center flex-shrink-0">
        <User className="w-[18px] h-[18px] text-slate-500 dark:text-slate-400" />
      </div>
    </motion.div>
  );
}
