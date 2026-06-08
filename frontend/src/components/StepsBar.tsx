import { Check } from 'lucide-react';

interface Step {
  key: string;
  label: string;
}

interface StepsBarProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export default function StepsBar({ steps, currentStep, className = '' }: StepsBarProps) {
  return (
    <div className={`flex items-center gap-0 ${className}`}>
      {steps.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done
                    ? 'bg-primary-500 text-white'
                    : active
                      ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 ring-2 ring-primary-500/30'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span
                className={`text-xs font-medium hidden sm:inline ${
                  done || active
                    ? 'text-slate-700 dark:text-slate-300'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-px mx-3 ${
                  done
                    ? 'bg-primary-300 dark:bg-primary-600'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
