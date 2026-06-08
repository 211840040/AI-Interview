const TAG_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300' },
  { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
  { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300' },
];

/** Assign a consistent color to a tag string via hash */
function getTagColor(tag: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash |= 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

/** Parse comma-separated tags string into array, trimming whitespace */
export function parseTags(tagsStr: string | undefined | null): string[] {
  if (!tagsStr || !tagsStr.trim()) return [];
  return tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
}

/** Render tags as colored badges */
export function TagBadges({ tags, className = '' }: { tags: string | undefined | null; className?: string }) {
  const list = parseTags(tags);
  if (list.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {list.map((tag) => {
        const { bg, text } = getTagColor(tag);
        return (
          <span
            key={tag}
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}
          >
            {tag}
          </span>
        );
      })}
    </div>
  );
}
