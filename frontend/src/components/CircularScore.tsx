import { motion } from 'framer-motion';

interface CircularScoreProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export default function CircularScore({ score, size = 120, strokeWidth = 8, className = '' }: CircularScoreProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clampedScore / 100);

  const getColor = (s: number) => {
    if (s >= 80) return '#22c55e';  // 绿色
    if (s >= 60) return '#eab308';  // 黄色
    if (s >= 40) return '#f97316';  // 橙色
    return '#ef4444';               // 红色
  };

  const color = getColor(clampedScore);

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-slate-100 dark:text-slate-700"
          strokeWidth={strokeWidth}
        />
        {/* 分数圆环 */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      {/* 中心文字 */}
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-slate-900 dark:text-white" style={{ color }}>
          {clampedScore}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">总分</span>
      </div>
    </div>
  );
}
