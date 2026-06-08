import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { InterviewQuestion, InterviewSession } from '../types/interview';
import { Send, ChevronDown, Sparkles } from 'lucide-react';
import InterviewMessageBubble from './InterviewMessageBubble';
import QuestionTimeline from './QuestionTimeline';

interface Message {
  type: 'interviewer' | 'user';
  content: string;
  category?: string;
  questionIndex?: number;
}

interface InterviewChatPanelProps {
  session: InterviewSession;
  currentQuestion: InterviewQuestion | null;
  messages: Message[];
  answer: string;
  onAnswerChange: (answer: string) => void;
  onSubmit: () => void;
  onCompleteEarly: () => void;
  isSubmitting: boolean;
  showCompleteConfirm: boolean;
  onShowCompleteConfirm: (show: boolean) => void;
}

export default function InterviewChatPanel({
  session,
  currentQuestion,
  messages,
  answer,
  onAnswerChange,
  onSubmit,
  isSubmitting,
  onShowCompleteConfirm,
}: InterviewChatPanelProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const answeredCount = useMemo(() =>
    messages.filter(m => m.type === 'user').length,
    [messages]
  );

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (isAtBottom) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [messages.length, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      behavior: 'smooth',
    });
    setIsAtBottom(true);
    setShowScrollBtn(false);
  }, [messages.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [answer]);

  const wordCount = useMemo(() =>
    answer.trim() ? answer.trim().split(/\s+/).length : 0,
    [answer]
  );

  const isFirstQuestion = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Question Timeline */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 mb-3">
        <QuestionTimeline
          totalQuestions={session.totalQuestions}
          currentIndex={currentQuestion?.questionIndex ?? 0}
          answeredCount={answeredCount}
        />
        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-primary-500" />
            <span>
              已回答 <span className="font-semibold text-primary-600 dark:text-primary-400">{answeredCount}</span> / {session.totalQuestions} 题
            </span>
          </div>
          <button
            onClick={() => onShowCompleteConfirm(true)}
            disabled={answeredCount === 0}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            提前交卷
          </button>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col min-h-0 relative">
        {isFirstQuestion ? (
          <div className="flex-1 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center px-6"
            >
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900/30 dark:to-primary-800/20 rounded-2xl flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">面试已开始</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                下方已显示第一道题目，请在输入框中写下你的回答，完成后点击提交。
              </p>
            </motion.div>
          </div>
        ) : (
          <>
            <Virtuoso
              ref={virtuosoRef}
              data={messages}
              initialTopMostItemIndex={messages.length - 1}
              followOutput="smooth"
              className="flex-1"
              atBottomThreshold={80}
              atBottomStateChange={(atBottom) => {
                setIsAtBottom(atBottom);
                setShowScrollBtn(!atBottom);
              }}
              itemContent={(_index, msg) => (
                <div className="pb-3 px-4 first:pt-4">
                  <InterviewMessageBubble
                    role={msg.type === 'interviewer' ? 'interviewer' : 'user'}
                    text={msg.content}
                    category={msg.category}
                    questionIndex={msg.questionIndex}
                  />
                </div>
              )}
            />

            {/* Scroll to bottom FAB */}
            <AnimatePresence>
              {showScrollBtn && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                  onClick={scrollToBottom}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-10 h-10 bg-white dark:bg-slate-700 rounded-full shadow-lg border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:shadow-xl transition-all"
                >
                  <ChevronDown className="w-5 h-5" />
                </motion.button>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Typing indicator */}
        <AnimatePresence>
          {isSubmitting && messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="px-4 pb-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
                <div className="bg-white dark:bg-slate-700/60 rounded-2xl rounded-tl-sm p-4 border border-slate-200 dark:border-slate-600 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <div className="border-t border-slate-200 dark:border-slate-600 p-4 bg-slate-50/80 dark:bg-slate-700/30">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={answer}
                onChange={(e) => onAnswerChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入你的回答..."
                rows={2}
                disabled={isSubmitting}
                className="w-full px-4 py-3 pr-16 border border-slate-300 dark:border-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 resize-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-shadow"
              />
              <span className="absolute right-3 bottom-2.5 text-[11px] text-slate-400 dark:text-slate-500 select-none pointer-events-none">
                {wordCount}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <motion.button
                onClick={onSubmit}
                disabled={!answer.trim() || isSubmitting}
                className="px-5 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm shadow-primary-500/20 hover:shadow-md hover:shadow-primary-500/30"
                whileHover={{ scale: isSubmitting || !answer.trim() ? 1 : 1.02 }}
                whileTap={{ scale: isSubmitting || !answer.trim() ? 1 : 0.98 }}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    提交中
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    提交
                  </>
                )}
              </motion.button>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 text-center select-none">
                Ctrl+Enter
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
