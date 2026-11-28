import { useEffect, useState } from 'react';
import { Award, Bell, Check, Crown, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import {
  ACHIEVEMENTS_CATALOG,
  type AvatarCode,
  type MatchRecord,
  type PlatformCode,
  type PlayerPrivateSettings,
  type PlayerProfile,
  type RegionCode,
} from '../shared/types';
import { AvatarBadge } from './AvatarBadge';

interface DashboardViewProps {
  profile: PlayerProfile | null;
  privateSettings: PlayerPrivateSettings | null;
  matches: MatchRecord[];
  isSignedIn: boolean;
  guestName: string;
  onUpdateGuestName: (name: string) => void;
  darkMode: boolean;
  soundOn: boolean;
  pushEnabled: boolean;
  onToggleDarkMode: () => void;
  onToggleSound: () => void;
  onTogglePushNotifications: () => void;
  onRequestSignIn: () => void;
  onSignOut: () => void;
  onSaveProfile: (updates: {
    username: string;
    bio: string;
    region: RegionCode;
    preferredPlatform: PlatformCode;
    avatarCode: AvatarCode;
    photoUrl: string;
  }) => Promise<void>;
}

export function DashboardView({
  profile,
  privateSettings,
  matches,
  isSignedIn,
  guestName,
  onUpdateGuestName,
  darkMode,
  soundOn,
  pushEnabled,
  onToggleDarkMode,
  onToggleSound,
  onTogglePushNotifications,
  onRequestSignIn,
  onSignOut,
  onSaveProfile,
}: DashboardViewProps) {
  const [username, setUsername] = useState(profile?.username || '');
  const [avatarCode, setAvatarCode] = useState<AvatarCode>(profile?.avatarCode || 'emblem-amber');
  const [guestDraft, setGuestDraft] = useState(guestName);
  const [guestSaved, setGuestSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setGuestDraft(guestName);
  }, [guestName]);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setAvatarCode(profile.avatarCode);
    }
  }, [profile]);

  if (!isSignedIn || !profile) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
              <Crown className="w-5 h-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Guest Player Profile
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Play 2–6 player multiplayer Ludo instantly without logging in.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = guestDraft.trim().slice(0, 24);
              if (trimmed.length >= 2) {
                onUpdateGuestName(trimmed);
                setGuestSaved(true);
                window.setTimeout(() => setGuestSaved(false), 2000);
              }
            }}
            className="space-y-3"
          >
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Guest Display Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                minLength={2}
                maxLength={24}
                value={guestDraft}
                onChange={(e) => setGuestDraft(e.target.value)}
                className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white min-h-[42px]"
              />
              <button
                type="submit"
                className="px-4 py-2 text-sm font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors min-h-[42px] cursor-pointer"
              >
                {guestSaved ? 'Saved' : 'Update'}
              </button>
            </div>
          </form>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-[#1B2E54] flex items-center justify-between text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#132245] min-h-[44px] cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                {darkMode ? <Moon className="w-4 h-4 text-amber-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                <span>Display Theme</span>
              </span>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                {darkMode ? 'Royal Dark' : 'Daylight'}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleSound}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-[#1B2E54] flex items-center justify-between text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#132245] min-h-[44px] cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                {soundOn ? <Volume2 className="w-4 h-4 text-amber-500" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                <span>Sound Effects</span>
              </span>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                {soundOn ? 'On' : 'Muted'}
              </span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-[#1B2E54] space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Want to track Ranked ELO, unlock achievements, and save your match history?
            </p>
            <button
              type="button"
              onClick={onRequestSignIn}
              className="w-full py-2.5 text-sm font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors min-h-[44px] cursor-pointer"
            >
              Sign In with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  const winRate =
    profile.matchesPlayed > 0
      ? Math.round((profile.wins / profile.matchesPlayed) * 100)
      : 0;

  const ludoCategories = [
    {
      label: 'Ranked Ludo Matches',
      subset: matches.filter((m) => m.isRanked),
    },
    {
      label: '2-Player Duels',
      subset: matches.filter((m) => m.playerIds.length === 2),
    },
    {
      label: '3–4 Player Tables',
      subset: matches.filter((m) => m.playerIds.length >= 3 && m.playerIds.length <= 4),
    },
    {
      label: '5–6 Player Hex Tables',
      subset: matches.filter((m) => m.playerIds.length >= 5),
    },
  ].map((cat) => ({
    label: cat.label,
    total: cat.subset.length,
    wins: cat.subset.filter((m) => m.winnerId === profile.uid).length,
  }));

  const displayAvatar =
    avatarCode === 'google' && profile.photoUrl ? profile.photoUrl : avatarCode;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#1B2E54]">
        <div className="flex items-center gap-4">
          <AvatarBadge avatar={displayAvatar} name={profile.username} size="lg" />
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {profile.username}
            </h1>
            {privateSettings?.email && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {privateSettings.email}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#243A68] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#132245] transition-colors min-h-[38px] cursor-pointer"
        >
          Sign Out
        </button>
      </div>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">ELO Rating</p>
          <p className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {profile.rating}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            {profile.matchesPlayed} matches played
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Win Rate</p>
          <p className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
            {winRate}%
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            {profile.wins}W · {profile.losses}L · {profile.draws}D
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Win Streak</p>
          <p className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
            {profile.winStreak}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            Best streak: {profile.bestStreak}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Season XP</p>
          <p className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
            {profile.xp}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            {profile.achievements.length}/{ACHIEVEMENTS_CATALOG.length} unlocked
          </p>
        </div>
      </section>

      {/* Table Breakdown & Achievements */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Ludo Mode Breakdown
          </h2>

          <div className="space-y-3.5">
            {ludoCategories.map((item) => {
              const pct = item.total > 0 ? Math.round((item.wins / item.total) * 100) : 0;
              return (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {item.label}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {item.wins}/{item.total} wins ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-[#071126] overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Achievements
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {profile.achievements.length} / {ACHIEVEMENTS_CATALOG.length}
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-[#1B2E54]">
            {ACHIEVEMENTS_CATALOG.filter((a) => a.id !== 'social_sharer').map((ach) => {
              const unlocked = profile.achievements.includes(ach.id);
              return (
                <div key={ach.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Award
                      className={`w-5 h-5 shrink-0 ${
                        unlocked ? 'text-amber-500' : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold ${
                          unlocked
                            ? 'text-slate-900 dark:text-white'
                            : 'text-slate-500 dark:text-slate-500'
                        }`}
                      >
                        {ach.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {ach.description}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {unlocked ? 'Unlocked' : `+${ach.xpReward} XP`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Match History & Preferences */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Recent Match History
          </h2>

          {matches.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              No matches recorded yet. Complete a table against online players to log history.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#1B2E54] text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4">Table</th>
                    <th className="py-2.5 px-3">Players</th>
                    <th className="py-2.5 px-3 text-right">Scores</th>
                    <th className="py-2.5 pl-3 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#1B2E54]/80">
                  {matches.slice(0, 10).map((m) => {
                    const outcomeLabel =
                      m.winnerId === 'draw'
                        ? 'Draw'
                        : m.winnerId === profile.uid
                        ? 'Victory'
                        : 'Defeat';
                    return (
                      <tr key={m.matchId}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {m.playerIds.length}P Ludo
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {m.isRanked ? 'Ranked' : 'Casual'}
                          </p>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300 max-w-[115px] sm:max-w-[200px] truncate">
                          {m.playerNames.join(', ')}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {m.scores.join(' - ')}
                        </td>
                        <td
                          className={`py-3 pl-3 text-right text-xs font-semibold ${
                            outcomeLabel === 'Victory'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : outcomeLabel === 'Defeat'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {outcomeLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Streamlined Profile & Theme Controls */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            await onSaveProfile({
              username,
              bio: profile.bio || 'Ausa Ludo Master player.',
              region: profile.region || 'Global',
              preferredPlatform: profile.preferredPlatform || 'Cross-Play',
              avatarCode,
              photoUrl: profile.photoUrl,
            });
            setSaving(false);
            setSavedNotice(true);
            window.setTimeout(() => setSavedNotice(false), 2500);
          }}
          className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-6 space-y-4"
        >
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Profile &amp; Preferences
          </h2>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Display Handle
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={24}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white min-h-[40px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Avatar Style
            </label>
            <div className="flex flex-wrap gap-2">
              {(['google', 'emblem-amber', 'emblem-cobalt', 'emblem-emerald', 'emblem-slate'] as AvatarCode[]).map(
                (code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setAvatarCode(code)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      avatarCode === code
                        ? 'border-amber-500 bg-amber-500/15 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-[#1B2E54] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {code === 'google' ? 'Google Photo' : code.replace('emblem-', '')}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-[#1B2E54] space-y-2.5">
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-[#1B2E54] flex items-center justify-between text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#132245] min-h-[44px] cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                {darkMode ? <Moon className="w-4 h-4 text-amber-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                <span>Display Theme</span>
              </span>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                {darkMode ? 'Royal Dark' : 'Daylight'}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleSound}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-[#1B2E54] flex items-center justify-between text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#132245] min-h-[44px] cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                {soundOn ? <Volume2 className="w-4 h-4 text-amber-500" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                <span>Sound Effects</span>
              </span>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                {soundOn ? 'On' : 'Muted'}
              </span>
            </button>

            <button
              type="button"
              onClick={onTogglePushNotifications}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-[#1B2E54] flex items-center justify-between text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#132245] min-h-[44px] cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-500" />
                <span>Browser Alerts</span>
              </span>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                {pushEnabled ? 'Enabled' : 'Enable'}
              </span>
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 text-sm font-bold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all inline-flex items-center justify-center gap-2 min-h-[42px] cursor-pointer"
          >
            {savedNotice ? (
              <>
                <Check className="w-4 h-4" />
                Profile Saved
              </>
            ) : saving ? (
              'Saving...'
            ) : (
              'Save Profile'
            )}
          </button>
        </form>
      </section>
    </div>
  );
}
