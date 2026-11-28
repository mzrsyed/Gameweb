import { Crown } from 'lucide-react';

export type NavSection = 'lobbies' | 'leaderboard' | 'dashboard';

interface TopNavProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  onPrimaryAction: () => void;
}

const NAV_ITEMS: { id: NavSection; label: string; mobileLabel: string }[] = [
  { id: 'lobbies', label: 'Play Ludo', mobileLabel: 'Play' },
  { id: 'leaderboard', label: 'Leaderboard', mobileLabel: 'Ranks' },
  { id: 'dashboard', label: 'Profile', mobileLabel: 'Profile' },
];

export function TopNav({
  activeSection,
  onNavigate,
  onPrimaryAction,
}: TopNavProps) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-[#1B2E54] bg-white/95 dark:bg-[#071126]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-13 sm:h-16 flex items-center justify-between gap-3 md:gap-8">
          <button
            type="button"
            onClick={() => onNavigate('lobbies')}
            className="inline-flex items-center gap-2 sm:gap-2.5 font-display text-base sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500 cursor-pointer"
          >
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center shadow-sm">
              <Crown className="w-4 h-4 fill-slate-950/20" />
            </span>
            <span>
              Ausa <span className="text-amber-600 dark:text-amber-400">Ludo Master</span>
            </span>
          </button>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-8 text-sm font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`relative py-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500 ${
                    active
                      ? 'text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-amber-500 dark:bg-amber-400"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onPrimaryAction}
              className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-sm transition-all whitespace-nowrap shrink-0 min-h-[38px] sm:min-h-[40px] touch-manipulation cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
            >
              New Room
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-[#1B2E54] bg-white/95 dark:bg-[#071126]/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-3 h-13">
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex items-center justify-center text-xs font-medium min-h-[44px] px-1 whitespace-nowrap truncate touch-manipulation transition-colors ${
                  active
                    ? 'text-amber-600 dark:text-amber-400 font-semibold border-t-2 border-amber-500 dark:border-amber-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {item.mobileLabel}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
