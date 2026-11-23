import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Search, Send, Users } from 'lucide-react';
import type {
  ChatMessage,
  MapTheme,
  MatchmakingStatus,
  OnlinePlayer,
} from '../shared/types';
import { AvatarBadge } from './AvatarBadge';

const THEME_SWATCHES: { id: MapTheme; label: string; swatch: string }[] = [
  { id: 'Obsidian Grid', label: 'Royal Navy & Gold', swatch: 'from-[#0D1E42] to-[#B45309]' },
  { id: 'Alpine Bastion', label: 'Ivory & Slate', swatch: 'from-slate-200 to-sky-700' },
  { id: 'Solaris Circuit', label: 'Bronze & Obsidian', swatch: 'from-stone-900 to-amber-500' },
];

interface MatchmakingViewProps {
  matchmaking: MatchmakingStatus;
  loungeMessages: ChatMessage[];
  onlinePlayers: OnlinePlayer[];
  isSignedIn: boolean;
  onRequestSignIn: () => void;
  onJoinQueue: (opts: { mapTheme: MapTheme; maxPlayers: 2 | 4 | 6; isRanked: boolean }) => void;
  onLeaveQueue: () => void;
  onSendLounge: (text: string) => void;
}

export function MatchmakingView({
  matchmaking,
  loungeMessages,
  onlinePlayers,
  isSignedIn,
  onRequestSignIn,
  onJoinQueue,
  onLeaveQueue,
  onSendLounge,
}: MatchmakingViewProps) {
  const [maxPlayers, setMaxPlayers] = useState<2 | 4 | 6>(4);
  const [mapTheme, setMapTheme] = useState<MapTheme>('Obsidian Grid');
  const [isRanked, setIsRanked] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [loungeInput, setLoungeInput] = useState('');
  const loungeEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSignedIn && isRanked) {
      setIsRanked(false);
    }
  }, [isSignedIn, isRanked]);

  useEffect(() => {
    if (!matchmaking.inQueue || !matchmaking.joinedAt) {
      setElapsedSec(0);
      return;
    }
    const update = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - matchmaking.joinedAt!) / 1000)));
    };
    update();
    const id = window.setInterval(update, 500);
    return () => window.clearInterval(id);
  }, [matchmaking.inQueue, matchmaking.joinedAt]);

  useEffect(() => {
    loungeEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [loungeMessages.length]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#1B2E54]">
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Real-Time Ludo Pairing · Guest &amp; Ranked
            </p>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              Quick Matchmaking
            </h1>
          </div>
          <div className="text-right font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
            <p>{matchmaking.queueSize} in queue</p>
            <p>{onlinePlayers.length} online</p>
          </div>
        </div>

        {/* Table Format Selector (2, 4, or 6 Players) */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Select Player Count
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { count: 2 as const, title: '2-Player Duel', desc: 'Fast 1v1 diagonal match' },
              { count: 4 as const, title: '4-Player Classic', desc: 'Standard 4-color table' },
              { count: 6 as const, title: '6-Player Royal Hex', desc: 'Full 6-arm hexagonal arena' },
            ]).map((opt) => (
              <button
                key={opt.count}
                type="button"
                disabled={matchmaking.inQueue}
                onClick={() => setMaxPlayers(opt.count)}
                className={`p-3.5 rounded-xl border text-left transition-colors min-h-[68px] cursor-pointer disabled:opacity-60 ${
                  maxPlayers === opt.count
                    ? 'border-amber-500 bg-amber-500/10 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-[#1B2E54] text-slate-600 dark:text-slate-400 hover:border-slate-400'
                }`}
              >
                <p className="text-sm font-bold">{opt.title}</p>
                <p className="text-xs opacity-80 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Board Finish */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Preferred 3D Box Finish
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {THEME_SWATCHES.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={matchmaking.inQueue}
                onClick={() => setMapTheme(m.id)}
                className={`rounded-xl border overflow-hidden text-left transition-all cursor-pointer disabled:opacity-60 ${
                  mapTheme === m.id
                    ? 'border-amber-500 ring-2 ring-amber-500/25'
                    : 'border-slate-200 dark:border-[#1B2E54] opacity-85 hover:opacity-100'
                }`}
              >
                <div className={`h-10 bg-gradient-to-r ${m.swatch}`} />
                <div className="p-2.5">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{m.label}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Queue Type */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-200 dark:border-[#1B2E54]">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#071126] border border-slate-200 dark:border-[#1B2E54] rounded-lg">
            <button
              type="button"
              disabled={matchmaking.inQueue}
              onClick={() => setIsRanked(false)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                !isRanked
                  ? 'bg-white dark:bg-[#193060] text-slate-900 dark:text-amber-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Casual (No Login)
            </button>
            <button
              type="button"
              disabled={matchmaking.inQueue}
              onClick={() => {
                if (!isSignedIn) {
                  onRequestSignIn();
                  return;
                }
                setIsRanked(true);
              }}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                isRanked
                  ? 'bg-white dark:bg-[#193060] text-slate-900 dark:text-amber-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Ranked ELO {!isSignedIn ? '· Sign In' : ''}
            </button>
          </div>

          {matchmaking.inQueue ? (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Searching {matchmaking.maxPlayers}P table...
                </p>
                <p className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                  {formatDuration(elapsedSec)}
                </p>
              </div>
              <button
                type="button"
                onClick={onLeaveQueue}
                className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors min-h-[42px] cursor-pointer"
              >
                Leave Queue
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onJoinQueue({ mapTheme, maxPlayers, isRanked: isSignedIn ? isRanked : false })}
              className="px-5 py-2.5 text-sm font-bold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all inline-flex items-center gap-2 min-h-[44px] cursor-pointer"
            >
              <Search className="w-4 h-4" />
              Find {maxPlayers}P Ludo Match
            </button>
          )}
        </div>

        {/* Active Online Players */}
        <div className="pt-4 border-t border-slate-200 dark:border-[#1B2E54] space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Users className="w-4 h-4 text-amber-500" />
            <span>Players Online Now ({onlinePlayers.length})</span>
          </div>
          {onlinePlayers.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Connecting to live player roster...
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {onlinePlayers.slice(0, 6).map((op) => (
                <div
                  key={op.uid}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-[#1B2E54] bg-slate-50/70 dark:bg-[#08132B] flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AvatarBadge avatar={op.avatar} name={op.username} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {op.username}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-slate-500">
                        {op.isGuest ? 'Guest' : `${op.rating} ELO`}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 capitalize whitespace-nowrap">
                    {op.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Global Ludo Lounge Chat */}
      <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] flex flex-col h-[540px]">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#1B2E54] flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <MessageSquare className="w-4 h-4 text-amber-500" />
            <span>Global Ludo Lounge</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Live Chat</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loungeMessages.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-10">
              Lounge is quiet. Invite players to your 2–6 player table.
            </p>
          ) : (
            loungeMessages.map((m) => (
              <div key={m.id} className="text-sm space-y-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-xs text-slate-900 dark:text-white">
                    {m.senderName}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 break-words">{m.text}</p>
              </div>
            ))
          )}
          <div ref={loungeEndRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!loungeInput.trim()) return;
            onSendLounge(loungeInput);
            setLoungeInput('');
          }}
          className="p-3 border-t border-slate-200 dark:border-[#1B2E54] flex items-center gap-2"
        >
          <input
            type="text"
            value={loungeInput}
            onChange={(e) => setLoungeInput(e.target.value)}
            maxLength={280}
            placeholder="Chat in global lounge..."
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[40px]"
          />
          <button
            type="submit"
            aria-label="Send lounge message"
            className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
