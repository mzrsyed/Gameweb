import { useState } from 'react';

interface AvatarBadgeProps {
  avatar?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const EMBLEM_STYLES: Record<string, { bg: string; fg: string; shape: 'diamond' | 'hex' | 'ring' | 'grid' }> = {
  'emblem-cobalt': { bg: 'bg-blue-600/15 dark:bg-blue-500/20 border-blue-600/30', fg: 'text-blue-600 dark:text-blue-400', shape: 'diamond' },
  'emblem-amber': { bg: 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500/30', fg: 'text-amber-600 dark:text-amber-400', shape: 'hex' },
  'emblem-emerald': { bg: 'bg-emerald-600/15 dark:bg-emerald-500/20 border-emerald-600/30', fg: 'text-emerald-600 dark:text-emerald-400', shape: 'ring' },
  'emblem-slate': { bg: 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700', fg: 'text-slate-700 dark:text-slate-300', shape: 'grid' },
};

export function AvatarBadge({ avatar = 'emblem-cobalt', name, size = 'md' }: AvatarBadgeProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const dims =
    size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-10 h-10 text-sm';

  if (avatar.startsWith('https://') && !imgFailed) {
    return (
      <img
        src={avatar}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${dims} rounded-lg object-cover border border-slate-200 dark:border-slate-800 shrink-0`}
      />
    );
  }

  const style = EMBLEM_STYLES[avatar] || EMBLEM_STYLES['emblem-cobalt'];
  const initials = name.trim().slice(0, 2).toUpperCase() || 'PL';

  return (
    <div
      className={`${dims} ${style.bg} ${style.fg} border rounded-lg flex items-center justify-center font-display font-bold shrink-0 select-none`}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
