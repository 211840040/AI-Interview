import type { DimensionScore } from '../api/evaluation';

interface Props {
  dimensions: DimensionScore[];
}

function scoreColor(s: number): string {
  if (s >= 90) return 'text-green-600 dark:text-green-400';
  if (s >= 70) return 'text-blue-600 dark:text-blue-400';
  if (s >= 50) return 'text-yellow-600 dark:text-yellow-400';
  if (s >= 30) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBgColor(s: number): string {
  if (s >= 90) return 'bg-green-500';
  if (s >= 70) return 'bg-blue-500';
  if (s >= 50) return 'bg-yellow-500';
  if (s >= 30) return 'bg-orange-500';
  return 'bg-red-500';
}

const dimensionNames: Record<string, string> = {
  Communication: '口头表达',
  'Technical Knowledge': '技术知识',
  'Problem Solving': '问题解决',
  'Project Storytelling': '项目叙述',
};

export default function EvaluationSummary({ dimensions }: Props) {
  if (!dimensions || dimensions.length === 0) return null;

  return (
    <div className="space-y-4 mt-6">
      {/* 四维度卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dimensions.map((dim) => (
          <div
            key={dim.dimension}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            {/* 标题 + 分数 */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
                {dimensionNames[dim.dimension] || dim.dimension}
              </h3>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${scoreColor(dim.score)}`}>
                  {dim.score}
                </span>
              </div>
            </div>

            {/* 等级标签 */}
            <div className="mb-3">
              <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${scoreBgColor(dim.score)} text-white`}>
                {dim.anchorLabel}
              </span>
            </div>

            {/* 评分理由 */}
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {dim.rationale}
            </p>

            {/* 提升建议 */}
            {dim.actionItems && dim.actionItems.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  提升建议
                </span>
                <div className="mt-2 space-y-2">
                  {dim.actionItems.slice(0, 2).map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-sm text-blue-700 dark:text-blue-400">
                        {item.exercise}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 相关回答 */}
            {dim.evidence && dim.evidence.length > 0 && (
              <div className="mt-3">
                <details className="group">
                  <summary className="text-xs text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none">
                    相关回答 ({dim.evidence.length})
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {dim.evidence.map((ev, i) => (
                      <div
                        key={i}
                        className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 p-2.5 rounded-lg"
                      >
                        &ldquo;{ev.text}&rdquo;
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
