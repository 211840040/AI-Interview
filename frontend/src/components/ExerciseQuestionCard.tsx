import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Eye, EyeOff, Star, Loader2 } from 'lucide-react';
import type { ExerciseQuestionDTO } from '../types/exercise';

interface ExerciseQuestionCardProps {
  question: ExerciseQuestionDTO;
  userAnswer: string;
  onAnswerChange: (answer: string) => void;
  onToggleAnswer: () => void;
  showAnswer: boolean;
  onFavorite: () => void;
  favoriting?: boolean;
  answerLoading?: boolean;
}

export default function ExerciseQuestionCard({
  question,
  userAnswer,
  onAnswerChange,
  onToggleAnswer,
  showAnswer,
  onFavorite,
  favoriting = false,
  answerLoading = false,
}: ExerciseQuestionCardProps) {
  const hasReferenceAnswer = !!question.referenceAnswer;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Question */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
        <div className="flex items-start gap-3 mb-4">
          <BookOpen className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white leading-relaxed">
            {question.question}
          </h3>
        </div>

        <textarea
          value={userAnswer}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder="输入你的回答..."
          rows={6}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700
            bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-900 dark:text-white
            placeholder:text-slate-400 resize-vertical focus:outline-none focus:ring-2
            focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {hasReferenceAnswer && (
          <button
            onClick={onToggleAnswer}
            disabled={answerLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
              bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300
              hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {answerLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : showAnswer ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            {showAnswer ? '隐藏答案' : '查看答案'}
          </button>
        )}

        <button
          onClick={onFavorite}
          disabled={favoriting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
            bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300
            hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {favoriting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Star className="w-4 h-4" />
          )}
          收藏本题
        </button>
      </div>

      {/* Reference Answer */}
      <AnimatePresence>
        {showAnswer && question.referenceAnswer && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  参考答案
                </span>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed">
                {question.referenceAnswer.split('\n').map((line, i) => (
                  <p key={i} className="mb-2 last:mb-0">{line}</p>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
