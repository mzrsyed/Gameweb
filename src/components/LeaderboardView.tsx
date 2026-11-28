import { useState } from 'react';
import { Crown, Trophy } from 'lucide-react';
import type { PlayerProfile } from '../shared/types';
import { AvatarBadge } from './AvatarBadge';

interface LeaderboardViewProps {
  players: PlayerProfile[];
  currentUid: string | null;
}

export function LeaderboardView({ players, currentUid }: LeaderboardViewProps) {
  const [search, setSearch] = useState('');

  const filtered = players.filter((p) => {
    if (search.trim()) {
      return p.username.toLowerCase().includes(search.trim().toLowerCase());
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#1B2E54]">
        <div>
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            Ausa Ludo Master · Global Standings
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-0.5">
            Royal Leaderboard
          </h1>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find player..."
          className="px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[40px] w-full sm:w-56"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-10 text-center space-y-2">
          <Trophy className="w-8 h-8 text-amber-500 mx-auto" />
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            No ranked players yet
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sign in with Google and complete ranked Ludo matches to climb the standings.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1B2E54] text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-4 w-20">Rank</th>
                  <th className="py-3.5 px-4">Player</th>
                  <th className="py-3.5 px-4 text-right">ELO</th>
                  <th className="py-3.5 px-4 text-right">W-L-D</th>
                  <th className="py-3.5 px-4 text-right hidden sm:table-cell">Win Rate</th>
                  <th className="py-3.5 px-4 text-right hidden md:table-cell">Best Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#1B2E54]/80 text-sm">
                {filtered.map((p, index) => {
                  const winRate =
                    p.matchesPlayed > 0
                      ? Math.round((p.wins / p.matchesPlayed) * 100)
                      : 0;
                  const isMe = p.uid === currentUid;
                  const avatar =
                    p.avatarCode === 'google' && p.photoUrl ? p.photoUrl : p.avatarCode;

                  return (
                    <tr
                      key={p.uid}
                      className={`hover:bg-slate-50 dark:hover:bg-[#132245]/60 transition-colors ${
                        isMe ? 'bg-amber-50/70 dark:bg-amber-500/10' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1.5">
                          {index === 0 && <Crown className="w-4 h-4 text-amber-500" />}
                          #{index + 1}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 max-w-[140px] sm:max-w-none">
                          <AvatarBadge avatar={avatar} name={p.username} size="sm" />
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {p.username}
                            {isMe && (
                              <span className="ml-1.5 text-xs font-normal text-amber-600 dark:text-amber-400">
                                (You)
                              </span>
                            )}
                          </p>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                        {p.rating}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {p.wins}-{p.losses}-{p.draws}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                        {winRate}%
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 hidden md:table-cell">
                        {p.bestStreak}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
