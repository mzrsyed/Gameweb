import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Crown,
  Dices,
  Lock,
  MessageSquare,
  Plus,
  Send,
  Settings2,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  ChatMessage,
  LobbyDetail,
  LobbySummary,
  LudoColor,
  MapTheme,
  OnlinePlayer,
  PlayerProfile,
} from '../shared/types';
import { AvatarBadge } from './AvatarBadge';
import { GameBoard } from './GameBoard';
import { soundFx } from '../lib/sound';

const BOARD_THEME_LABELS: Record<
  MapTheme,
  { name: string; swatch: string; desc: string }
> = {
  'Obsidian Grid': {
    name: 'Royal Navy & Gold',
    swatch: 'from-[#0D1E42] via-[#132956] to-[#B45309]',
    desc: 'Classic Ludo King royal blue frame with gold trim',
  },
  'Alpine Bastion': {
    name: 'Ivory & Slate',
    swatch: 'from-slate-100 via-slate-200 to-sky-700',
    desc: 'Crisp tournament daylight board with cobalt lanes',
  },
  'Solaris Circuit': {
    name: 'Bronze & Obsidian',
    swatch: 'from-stone-900 via-amber-950 to-amber-500',
    desc: 'Engraved amber-gold board with dark obsidian rim',
  },
};

const LUDO_COLOR_DOT: Record<LudoColor, string> = {
  red: 'bg-red-500',
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  cyan: 'bg-cyan-400',
};

interface LobbiesViewProps {
  lobbies: LobbySummary[];
  activeLobby: LobbyDetail | null;
  onlinePlayers: OnlinePlayer[];
  profile: PlayerProfile | null;
  myUid: string | null;
  isSignedIn: boolean;
  displayName: string;
  showCreateModal: boolean;
  onCloseCreateModal: () => void;
  onOpenCreateModal: () => void;
  onRequestSignIn: () => void;
  onCreateLobby: (config: {
    name: string;
    mapTheme: MapTheme;
    maxPlayers: 2 | 3 | 4 | 5 | 6;
    turnTimeSec: 10 | 15 | 30;
    isRanked: boolean;
    isPrivate: boolean;
    accessCode: string;
    allowSpectators: boolean;
    soloPractice: boolean;
  }) => void;
  onJoinLobby: (lobbyId: string, accessCode?: string) => void;
  onLeaveLobby: () => void;
  onCustomizeLobby: (
    updates: Partial<{
      name: string;
      mapTheme: MapTheme;
      maxPlayers: 2 | 3 | 4 | 5 | 6;
      turnTimeSec: 10 | 15 | 30;
      isRanked: boolean;
      allowSpectators: boolean;
      soloPractice: boolean;
    }>
  ) => void;
  onToggleReady: (ready: boolean) => void;
  onStartMatch: () => void;
  onRematch: () => void;
  onRollDice: () => void;
  onMoveToken: (tokenIndex: number) => void;
  onSendChat: (text: string) => void;
  onInvitePlayer: (
    recipient: { uid: string; username: string },
    lobbyId: string,
    lobbyName: string
  ) => void;
  onMatchCompleted: (lobby: LobbyDetail) => void;
}

export function LobbiesView({
  lobbies,
  activeLobby,
  onlinePlayers,
  profile,
  myUid,
  isSignedIn,
  displayName,
  showCreateModal,
  onCloseCreateModal,
  onOpenCreateModal,
  onRequestSignIn,
  onCreateLobby,
  onJoinLobby,
  onLeaveLobby,
  onCustomizeLobby,
  onToggleReady,
  onStartMatch,
  onRematch,
  onRollDice,
  onMoveToken,
  onSendChat,
  onInvitePlayer,
  onMatchCompleted,
}: LobbiesViewProps) {
  const [search, setSearch] = useState('');
  const [capacityFilter, setCapacityFilter] = useState<'All' | 2 | 3 | 4 | 5 | 6>('All');
  const [privateJoinTarget, setPrivateJoinTarget] = useState<LobbySummary | null>(null);
  const [joinCode, setJoinCode] = useState('');

  // Create Ludo Table Form State
  const [roomName, setRoomName] = useState('');
  const [mapTheme, setMapTheme] = useState<MapTheme>('Obsidian Grid');
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4 | 5 | 6>(4);
  const [turnTimeSec, setTurnTimeSec] = useState<10 | 15 | 30>(15);
  const [isRanked, setIsRanked] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [allowSpectators, setAllowSpectators] = useState(true);
  const [soloPractice, setSoloPractice] = useState(false);

  // Active Room State
  const [chatInput, setChatInput] = useState('');
  const [showCustomizeDrawer, setShowCustomizeDrawer] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const recordedOutcomeRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeLobby?.chatMessages.length]);

  useEffect(() => {
    if (
      activeLobby?.status === 'finished' &&
      activeLobby.lastOutcome &&
      recordedOutcomeRef.current !== activeLobby.lastOutcome.matchId
    ) {
      recordedOutcomeRef.current = activeLobby.lastOutcome.matchId;
      if (myUid && activeLobby.lastOutcome.playerIds.includes(myUid)) {
        if (activeLobby.lastOutcome.winnerId === myUid) {
          soundFx.win();
        }
        if (profile && !activeLobby.lastOutcome.hasCpu) {
          onMatchCompleted(activeLobby);
        }
      }
    }
  }, [activeLobby, myUid, profile, onMatchCompleted]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateLobby({
      name: roomName.trim() || `${displayName}'s Royal Table`,
      mapTheme,
      maxPlayers,
      turnTimeSec,
      isRanked: isSignedIn && !soloPractice ? isRanked : false,
      isPrivate,
      accessCode: isPrivate ? accessCode.trim() : '',
      allowSpectators,
      soloPractice,
    });
    setRoomName('');
    setAccessCode('');
    onCloseCreateModal();
  };

  const launchInstantCpuTable = (seats: 4 | 6) => {
    onCreateLobby({
      name: `${displayName}'s ${seats}P CPU Arena`,
      mapTheme: 'Obsidian Grid',
      maxPlayers: seats,
      turnTimeSec: 15,
      isRanked: false,
      isPrivate: false,
      accessCode: '',
      allowSpectators: false,
      soloPractice: true,
    });
  };

  // --- Active Ludo Lobby / Live 3D Box Arena ---
  if (activeLobby) {
    const myPlayer = activeLobby.players.find((p) => p.uid === myUid);
    const isHost = activeLobby.hostId === myUid;
    const themeMeta = BOARD_THEME_LABELS[activeLobby.mapTheme];
    const inviteCandidates = onlinePlayers.filter(
      (op) => op.uid !== myUid && !activeLobby.players.some((pl) => pl.uid === op.uid)
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#1B2E54]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Ludo · {activeLobby.maxPlayers} Players</span>
              <span aria-hidden="true">·</span>
              <span>{themeMeta.name}</span>
              <span aria-hidden="true">·</span>
              <span>{activeLobby.isRanked ? 'Ranked ELO' : 'Casual'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{activeLobby.turnTimeSec}s turn</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {activeLobby.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isHost && activeLobby.status === 'waiting' && (
              <button
                type="button"
                onClick={() => setShowCustomizeDrawer((v) => !v)}
                className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-[#243A68] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#132245] transition-colors inline-flex items-center gap-2 whitespace-nowrap min-h-[40px] cursor-pointer"
              >
                <Settings2 className="w-4 h-4" />
                Customize Table
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-[#243A68] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#132245] transition-colors inline-flex items-center gap-2 whitespace-nowrap min-h-[40px] cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Invite
            </button>
            <button
              type="button"
              onClick={onLeaveLobby}
              className="px-3.5 py-2 text-sm font-medium rounded-lg border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap min-h-[40px] cursor-pointer"
            >
              Leave Table
            </button>
          </div>
        </div>

        {/* Host Inline Table Customization */}
        {showCustomizeDrawer && isHost && activeLobby.status === 'waiting' && (
          <div className="p-5 rounded-xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Player Seats (2–6)
              </label>
              <select
                value={activeLobby.maxPlayers}
                onChange={(e) =>
                  onCustomizeLobby({
                    maxPlayers: Number(e.target.value) as 2 | 3 | 4 | 5 | 6,
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-white dark:bg-[#071126] text-slate-900 dark:text-slate-100 min-h-[40px]"
              >
                <option value={2}>2 Players (Diagonal Duel)</option>
                <option value={3}>3 Players</option>
                <option value={4}>4 Players (Classic Square)</option>
                <option value={5}>5 Players (Hex Star)</option>
                <option value={6}>6 Players (Royal Hex)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Board Finish
              </label>
              <select
                value={activeLobby.mapTheme}
                onChange={(e) => onCustomizeLobby({ mapTheme: e.target.value as MapTheme })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-white dark:bg-[#071126] text-slate-900 dark:text-slate-100 min-h-[40px]"
              >
                {(Object.keys(BOARD_THEME_LABELS) as MapTheme[]).map((m) => (
                  <option key={m} value={m}>
                    {BOARD_THEME_LABELS[m].name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Turn Timer
                </label>
                <select
                  value={activeLobby.turnTimeSec}
                  onChange={(e) =>
                    onCustomizeLobby({ turnTimeSec: Number(e.target.value) as 10 | 15 | 30 })
                  }
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-white dark:bg-[#071126] text-slate-900 dark:text-slate-100 min-h-[40px]"
                >
                  <option value={10}>10s Blitz</option>
                  <option value={15}>15s Standard</option>
                  <option value={30}>30s Tactical</option>
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeLobby.soloPractice}
                  onChange={(e) => onCustomizeLobby({ soloPractice: e.target.checked })}
                  className="rounded border-slate-300 dark:border-slate-700"
                />
                <span>Fill with CPU</span>
              </label>
            </div>
          </div>
        )}

        {/* Main 2-Column 3D Ludo Box + Real-Time Table Chat */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-4 sm:p-6">
            {activeLobby.status === 'waiting' && (
              <div className="space-y-6">
                <div className="rounded-xl bg-gradient-to-r from-[#0B1B3B] via-[#132B5E] to-[#1D3E84] border border-amber-500/30 p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                      Ausa Ludo Master · {activeLobby.maxPlayers}-Player{' '}
                      {activeLobby.maxPlayers >= 5 ? 'Hexagonal 3D Box' : 'Classic 3D Box'}
                    </p>
                    <h2 className="font-display text-xl font-bold text-white mt-1">
                      {themeMeta.name}
                    </h2>
                    <p className="text-xs text-slate-300 mt-0.5">{themeMeta.desc}</p>
                  </div>
                  <div className="text-right font-mono tabular-nums text-xs text-amber-300">
                    <p>
                      {activeLobby.players.length} / {activeLobby.maxPlayers} Seated
                    </p>
                  </div>
                </div>

                {/* 2-6 Seat Roster */}
                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 ${
                    activeLobby.maxPlayers >= 5 ? 'xl:grid-cols-3' : ''
                  } gap-3.5`}
                >
                  {Array.from({ length: activeLobby.maxPlayers }).map((_, idx) => {
                    const slotNum = idx + 1;
                    const occupant = activeLobby.players.find((p) => p.slot === slotNum);
                    return (
                      <div
                        key={slotNum}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-[#1B2E54] bg-slate-50/70 dark:bg-[#08132B] flex items-center justify-between gap-3"
                      >
                        {occupant ? (
                          <>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative">
                                <AvatarBadge avatar={occupant.avatar} name={occupant.username} size="sm" />
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#08132B] ${
                                    LUDO_COLOR_DOT[occupant.ludoColor]
                                  }`}
                                  aria-hidden="true"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                  {occupant.username}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums capitalize">
                                  {occupant.ludoColor} ·{' '}
                                  {occupant.isCpu
                                    ? 'CPU'
                                    : occupant.isGuest
                                    ? 'Guest'
                                    : `${occupant.rating} ELO`}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`text-xs font-semibold whitespace-nowrap ${
                                occupant.ready
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {occupant.ready ? 'Ready' : 'Waiting'}
                            </span>
                          </>
                        ) : (
                          <div className="w-full py-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>Open Seat {slotNum}</span>
                            {isHost && (
                              <button
                                type="button"
                                onClick={() => onCustomizeLobby({ soloPractice: true })}
                                className="font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                              >
                                + Add CPU
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-[#1B2E54]">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeLobby.players.length < 2
                      ? 'Invite players or click "+ Add CPU" to start immediately.'
                      : 'All seats set. Host can start the 3D Ludo match.'}
                  </p>
                  <div className="flex items-center gap-3">
                    {myPlayer && !isHost && (
                      <button
                        type="button"
                        onClick={() => onToggleReady(!myPlayer.ready)}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-[#243A68] text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#132245] transition-colors min-h-[40px] cursor-pointer"
                      >
                        {myPlayer.ready ? 'Cancel Ready' : 'Mark Ready'}
                      </button>
                    )}
                    {isHost && (
                      <button
                        type="button"
                        disabled={activeLobby.players.length < 2}
                        onClick={onStartMatch}
                        className="px-5 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 transition-all min-h-[40px] cursor-pointer"
                      >
                        Start Ludo Match
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeLobby.status === 'in_progress' && activeLobby.gameState && (
              <GameBoard
                gameState={activeLobby.gameState}
                mapTheme={activeLobby.mapTheme}
                players={activeLobby.players}
                myUid={myUid}
                onRollDice={onRollDice}
                onMoveToken={onMoveToken}
              />
            )}

            {activeLobby.status === 'finished' && activeLobby.lastOutcome && (
              <div className="py-8 space-y-6">
                <div className="text-center space-y-2">
                  <Crown className="w-10 h-10 text-amber-500 mx-auto" />
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Ausa Ludo Master · {activeLobby.lastOutcome.playerIds.length}-Player Match
                  </p>
                  <h2 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
                    {activeLobby.lastOutcome.winnerName} Wins!
                  </h2>
                  <p className="font-mono tabular-nums text-sm sm:text-base font-semibold text-amber-600 dark:text-amber-400">
                    {activeLobby.lastOutcome.playerNames
                      .map((name, idx) => `${name}: ${activeLobby.lastOutcome!.scores[idx]}`)
                      .join(' · ')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Match Duration: {activeLobby.lastOutcome.durationSec}s
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={onRematch}
                    className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all min-h-[44px] cursor-pointer"
                  >
                    Play Again
                  </button>
                  <button
                    type="button"
                    onClick={onLeaveLobby}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-[#243A68] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#132245] transition-colors min-h-[44px] cursor-pointer"
                  >
                    Back to Tables
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Real-Time Room Chat */}
          <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] flex flex-col h-[520px]">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#1B2E54] flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <MessageSquare className="w-4 h-4 text-amber-500" />
                <span>Table Chat</span>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {activeLobby.players.length}/{activeLobby.maxPlayers} seated
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeLobby.chatMessages.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">
                  No messages yet. Say hello to the table.
                </p>
              ) : (
                activeLobby.chatMessages.map((m: ChatMessage) => (
                  <div
                    key={m.id}
                    className={
                      m.channel === 'system'
                        ? 'text-xs text-slate-500 dark:text-slate-400 italic'
                        : 'text-sm space-y-0.5'
                    }
                  >
                    {m.channel === 'system' ? (
                      <p>{m.text}</p>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatInput.trim()) return;
                onSendChat(chatInput);
                setChatInput('');
              }}
              className="p-3 border-t border-slate-200 dark:border-[#1B2E54] flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={280}
                placeholder="Message table..."
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[40px]"
              />
              <button
                type="submit"
                aria-label="Send message"
                className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Invite Online Players
                </h3>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Close
                </button>
              </div>
              {inviteCandidates.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                  No other players online right now. Open another browser tab to test multiplayer or add CPU bots.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-[#1B2E54] max-h-64 overflow-y-auto">
                  {inviteCandidates.map((op) => (
                    <div key={op.uid} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <AvatarBadge avatar={op.avatar} name={op.username} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {op.username}
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            {op.isGuest ? 'Guest Player' : `${op.rating} ELO`}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onInvitePlayer(
                            { uid: op.uid, username: op.username },
                            activeLobby.id,
                            activeLobby.name
                          );
                          setShowInviteModal(false);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 whitespace-nowrap cursor-pointer"
                      >
                        Invite
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Ausa Ludo Master Lobby Hub ---
  const filteredLobbies = lobbies.filter((l) => {
    if (capacityFilter !== 'All' && l.maxPlayers !== capacityFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        l.name.toLowerCase().includes(q) ||
        l.hostName.toLowerCase().includes(q) ||
        BOARD_THEME_LABELS[l.mapTheme].name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Royal Ludo King Hub Banner */}
      <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-[#0B1B3B] via-[#102652] to-[#08132B] p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
              <Crown className="w-4 h-4" />
              <span>Ausa Ludo Master · 3D Royal Arena</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight [text-wrap:balance]">
              Play 2 to 6 Player 3D Ludo Live — No Login Required
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Roll turn-wise animated 3D dice on our raised royal Ludo box. Jump straight into online multiplayer tables as a guest, challenge CPU bots, or sign in to climb Ranked ELO.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="px-5 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-lg transition-all inline-flex items-center gap-2 min-h-[46px] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create 2–6P Table
            </button>
            <button
              type="button"
              onClick={() => launchInstantCpuTable(4)}
              className="px-4 py-3 text-sm font-semibold rounded-xl border border-amber-400/40 bg-[#0D1E42]/80 hover:bg-[#173063] text-amber-300 transition-colors inline-flex items-center gap-2 min-h-[46px] cursor-pointer"
            >
              <Bot className="w-4 h-4" />
              Quick 4P vs CPU
            </button>
            <button
              type="button"
              onClick={() => launchInstantCpuTable(6)}
              className="px-4 py-3 text-sm font-semibold rounded-xl border border-blue-400/35 bg-[#0D1E42]/80 hover:bg-[#173063] text-blue-200 transition-colors inline-flex items-center gap-2 min-h-[46px] cursor-pointer"
            >
              <Dices className="w-4 h-4" />
              Quick 6P Hex vs CPU
            </button>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 font-mono tabular-nums">
          <div className="flex flex-wrap items-center gap-4">
            <span>{lobbies.length} active tables</span>
            <span aria-hidden="true">·</span>
            <span>{onlinePlayers.length} players online</span>
            <span aria-hidden="true">·</span>
            <span>
              Playing as: <strong className="text-amber-300">{displayName}</strong>
              {!isSignedIn && ' (Guest)'}
            </span>
          </div>
          {!isSignedIn && (
            <button
              type="button"
              onClick={onRequestSignIn}
              className="font-sans font-semibold text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
            >
              Sign in with Google for Ranked ELO →
            </button>
          )}
        </div>
      </section>

      {/* Filter & Search Toolbar */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-[#0D1A35] border border-slate-200 dark:border-[#1B2E54] rounded-xl">
            {([
              { id: 'All', label: 'All' },
              { id: 2, label: '2P' },
              { id: 3, label: '3P' },
              { id: 4, label: '4P' },
              { id: 5, label: '5P' },
              { id: 6, label: '6P' },
            ] as const).map((opt) => (
              <button
                key={String(opt.id)}
                type="button"
                onClick={() => setCapacityFilter(opt.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[34px] cursor-pointer ${
                  capacityFilter === opt.id
                    ? 'bg-white dark:bg-[#193060] text-slate-900 dark:text-amber-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables by name or host..."
            className="w-full sm:w-72 px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[40px]"
          />
        </div>

        {filteredLobbies.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-10 text-center space-y-3">
            <Users className="w-8 h-8 text-amber-500 mx-auto" />
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              No open Ludo tables right now
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Create a 2-to-6 player room for friends and guests, or launch an instant CPU match.
            </p>
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all min-h-[42px] cursor-pointer"
            >
              Create Ludo Table
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredLobbies.map((lobby) => {
              const isFull = lobby.players.length >= lobby.maxPlayers;
              const themeMeta = BOARD_THEME_LABELS[lobby.mapTheme];

              return (
                <article
                  key={lobby.id}
                  className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] overflow-hidden flex flex-col justify-between shadow-sm"
                >
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {lobby.maxPlayers}-Player {lobby.maxPlayers >= 5 ? 'Hex' : 'Classic'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{lobby.isRanked ? 'Ranked' : 'Casual'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{lobby.turnTimeSec}s</span>
                        {lobby.isPrivate && (
                          <Lock className="w-3.5 h-3.5 text-amber-500" aria-label="Private room" />
                        )}
                      </div>
                    </div>

                    <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                      {lobby.name}
                    </h3>

                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span className="truncate">Host: {lobby.hostName}</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {lobby.players.length}/{lobby.maxPlayers} seated
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      {Array.from({ length: lobby.maxPlayers }).map((_, idx) => {
                        const occupant = lobby.players.find((p) => p.slot === idx + 1);
                        return (
                          <span
                            key={idx}
                            title={occupant ? occupant.username : 'Open Seat'}
                            className={`h-2 flex-1 rounded-full ${
                              occupant
                                ? LUDO_COLOR_DOT[occupant.ludoColor]
                                : 'bg-slate-200 dark:bg-[#192D58]'
                            }`}
                          />
                        );
                      })}
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Board: {themeMeta.name}
                    </p>
                  </div>

                  <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#08132B] flex items-center justify-between gap-3 border-t border-slate-100 dark:border-[#1B2E54]">
                    <span
                      className={`text-xs font-semibold ${
                        lobby.status === 'waiting'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : lobby.status === 'in_progress'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {lobby.status === 'waiting'
                        ? 'Open'
                        : lobby.status === 'in_progress'
                        ? 'In Progress'
                        : 'Finished'}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        if (lobby.isPrivate) {
                          setPrivateJoinTarget(lobby);
                        } else {
                          onJoinLobby(lobby.id);
                        }
                      }}
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 transition-colors whitespace-nowrap min-h-[38px] cursor-pointer"
                    >
                      {isFull && lobby.allowSpectators ? 'Spectate' : 'Join Table'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Private Room Code Modal */}
      {privateJoinTarget && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onJoinLobby(privateJoinTarget.id, joinCode);
              setPrivateJoinTarget(null);
              setJoinCode('');
            }}
            className="max-w-sm w-full rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Enter Private Access Code
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Table: {privateJoinTarget.name}
            </p>
            <input
              type="text"
              required
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Access code..."
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white min-h-[42px]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPrivateJoinTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer"
              >
                Join Table
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Custom 2-6 Player Ludo Table Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateSubmit}
            className="max-w-xl w-full rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-6 space-y-5 my-8"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Create Ludo Table
              </h2>
              <button
                type="button"
                onClick={onCloseCreateModal}
                className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Table Name
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                maxLength={48}
                placeholder={`${displayName}'s Royal Table`}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white min-h-[42px]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Players (Up to 6)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {([
                  { count: 2 as const, desc: '1v1' },
                  { count: 3 as const, desc: '3-Way' },
                  { count: 4 as const, desc: 'Classic' },
                  { count: 5 as const, desc: '5-Star' },
                  { count: 6 as const, desc: 'Hex' },
                ]).map((opt) => (
                  <button
                    key={opt.count}
                    type="button"
                    onClick={() => setMaxPlayers(opt.count)}
                    className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer min-h-[56px] ${
                      maxPlayers === opt.count
                        ? 'border-amber-500 bg-amber-500/15 text-slate-900 dark:text-amber-300'
                        : 'border-slate-200 dark:border-[#1B2E54] text-slate-600 dark:text-slate-400 hover:border-slate-400'
                    }`}
                  >
                    <p className="text-sm font-bold">{opt.count}P</p>
                    <p className="text-[11px] opacity-80">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                3D Box Finish
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(Object.keys(BOARD_THEME_LABELS) as MapTheme[]).map((themeId) => {
                  const meta = BOARD_THEME_LABELS[themeId];
                  return (
                    <button
                      key={themeId}
                      type="button"
                      onClick={() => setMapTheme(themeId)}
                      className={`rounded-xl border overflow-hidden text-left transition-all cursor-pointer ${
                        mapTheme === themeId
                          ? 'border-amber-500 ring-2 ring-amber-500/30'
                          : 'border-slate-200 dark:border-[#1B2E54] opacity-85 hover:opacity-100'
                      }`}
                    >
                      <div className={`h-10 bg-gradient-to-r ${meta.swatch}`} />
                      <p className="p-2.5 text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {meta.name}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Turn Timer
                </label>
                <select
                  value={turnTimeSec}
                  onChange={(e) => setTurnTimeSec(Number(e.target.value) as 10 | 15 | 30)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white min-h-[40px]"
                >
                  <option value={10}>10s Blitz</option>
                  <option value={15}>15s Standard</option>
                  <option value={30}>30s Tactical</option>
                </select>
              </div>
              <div className="flex flex-col justify-end gap-2">
                <label
                  className={`inline-flex items-center gap-2 text-sm ${
                    !isSignedIn || soloPractice
                      ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      : 'text-slate-700 dark:text-slate-300 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSignedIn && !soloPractice && isRanked}
                    disabled={!isSignedIn || soloPractice}
                    onChange={(e) => setIsRanked(e.target.checked)}
                  />
                  <span>
                    Ranked ELO {!isSignedIn ? '(Sign in required)' : ''}
                  </span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowSpectators}
                    onChange={(e) => setAllowSpectators(e.target.checked)}
                  />
                  <span>Allow Spectators</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-[#1B2E54]">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                <span>Private (Access Code)</span>
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloPractice}
                  onChange={(e) => setSoloPractice(e.target.checked)}
                />
                <span>Fill Empty Seats with CPU</span>
              </label>
            </div>

            {isPrivate && (
              <input
                type="text"
                required
                maxLength={16}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Set room access code..."
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white min-h-[40px]"
              />
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onCloseCreateModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-bold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all min-h-[42px] cursor-pointer"
              >
                Launch Ludo Table
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
