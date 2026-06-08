import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface QuestionTimelineProps {
  totalQuestions: number;
  currentIndex: number;
  answeredCount: number;
}

export default function QuestionTimeline({
  totalQuestions,
  currentIndex,
  answeredCount,
}: QuestionTimelineProps) {
  const steps = useMemo(() =>
    Array.from({ length: totalQuestions }, (_, i) => ({
      index: i,
      answered: i < answeredCount,
      isCurrent: i === currentIndex,
    })),
    [totalQuestions, currentIndex, answeredCount]
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center flex-1">
            {/* Step dot */}
            <div className="relative flex items-center justify-center">
              <motion.div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                  transition-colors duration-300
                  ${step.answered
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                    : step.isCurrent
                      ? 'bg-primary-500 text-white ring-4 ring-primary-500/20'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                  }`}
                animate={step.isCurrent ? {
                  scale: [1, 1.1, 1],
                } : {}}
                transition={step.isCurrent ? {
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                } : {}}
              >
                {step.answered ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span>{step.index + 1}</span>
                )}
              </motion.div>
            </div>

            {/* Connector line */}
            {i < totalQuestions - 1 && (
              <div className="flex-1 h-0.5 mx-2 relative">
                <div className="absolute inset-0 bg-slate-200 dark:bg-slate-700 rounded-full" />
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{
                    width: step.answered ? '100%' : '0%',
                  }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between mt-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center flex-1">
            <span
              className={`text-[10px] font-medium whitespace-nowrap text-center w-8
                ${step.answered
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : step.isCurrent
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
            >
              第{i + 1}题
            </span>
            {i < totalQuestions - 1 && <div className="flex-1" />}
          </div>
        ))}
      </div>
    </div>
  );
}
