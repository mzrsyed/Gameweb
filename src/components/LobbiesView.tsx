import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Crown,
  Globe,
  Lock,
  MessageSquare,
  Plus,
  Send,
  Smartphone,
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

const LUDO_COLOR_DOT: Record<LudoColor, string> = {
  blue: 'bg-[#1777EC]',
  red: 'bg-[#E31E24]',
  green: 'bg-[#009E49]',
  yellow: 'bg-[#F7D117]',
  purple: 'bg-violet-500',
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
  soundOn: boolean;
  onToggleSound: () => void;
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
    isLocalPassPlay?: boolean;
    autoStart?: boolean;
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
  soundOn,
  onToggleSound,
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
  const [quickSeats, setQuickSeats] = useState<2 | 3 | 4 | 5 | 6>(4);
  const [search, setSearch] = useState('');
  const [capacityFilter, setCapacityFilter] = useState<'All' | 2 | 3 | 4 | 5 | 6>('All');
  const [privateJoinTarget, setPrivateJoinTarget] = useState<LobbySummary | null>(null);
  const [joinCode, setJoinCode] = useState('');

  // Streamlined Create Room Modal State
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4 | 5 | 6>(4);
  const [turnTimeSec, setTurnTimeSec] = useState<10 | 15 | 30>(15);
  const [isPrivate, setIsPrivate] = useState(false);
  const [accessCode, setAccessCode] = useState('');

  // Active Room State
  const [chatInput, setChatInput] = useState('');
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
        if (profile && !activeLobby.lastOutcome.hasCpu && !activeLobby.isLocalPassPlay) {
          onMatchCompleted(activeLobby);
        }
      }
    }
  }, [activeLobby, myUid, profile, onMatchCompleted]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateLobby({
      name: roomName.trim() || `${displayName}'s Ludo Room`,
      mapTheme: 'Obsidian Grid',
      maxPlayers,
      turnTimeSec,
      isRanked: isSignedIn,
      isPrivate,
      accessCode: isPrivate ? accessCode.trim() : '',
      allowSpectators: true,
      soloPractice: false,
      isLocalPassPlay: false,
      autoStart: false,
    });
    setRoomName('');
    setAccessCode('');
    setIsPrivate(false);
    onCloseCreateModal();
  };

  const launchCpuMatch = (seats: 2 | 3 | 4 | 5 | 6) => {
    onCreateLobby({
      name: `${seats}P Computer Ludo`,
      mapTheme: 'Obsidian Grid',
      maxPlayers: seats,
      turnTimeSec: 15,
      isRanked: false,
      isPrivate: false,
      accessCode: '',
      allowSpectators: false,
      soloPractice: true,
      isLocalPassPlay: false,
      autoStart: true,
    });
  };

  const launchPassAndPlayMatch = (seats: 2 | 3 | 4 | 5 | 6) => {
    onCreateLobby({
      name: `${seats}P Pass & Play`,
      mapTheme: 'Obsidian Grid',
      maxPlayers: seats,
      turnTimeSec: 30,
      isRanked: false,
      isPrivate: false,
      accessCode: '',
      allowSpectators: false,
      soloPractice: false,
      isLocalPassPlay: true,
      autoStart: true,
    });
  };

  // --- Active Ludo Table / Live Ludo King Board ---
  if (activeLobby) {
    const myPlayer = activeLobby.players.find((p) => p.uid === myUid);
    const isHost = activeLobby.hostId === myUid;
    const showSideChat = !activeLobby.soloPractice && !activeLobby.isLocalPassPlay;
    const inviteCandidates = onlinePlayers.filter(
      (op) => op.uid !== myUid && !activeLobby.players.some((pl) => pl.uid === op.uid)
    );

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-[#1B2E54]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                Ausa Ludo Master
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeLobby.maxPlayers} Players</span>
              <span aria-hidden="true">·</span>
              <span>
                {activeLobby.soloPractice
                  ? 'vs Computer'
                  : activeLobby.isLocalPassPlay
                    ? 'Pass & Play'
                    : 'Online Room'}
              </span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              {activeLobby.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showSideChat && (
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-[#243A68] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#132245] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap min-h-[40px] cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Invite
              </button>
            )}
            <button
              type="button"
              onClick={onLeaveLobby}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap min-h-[40px] cursor-pointer"
            >
              Exit Match
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className={showSideChat ? 'lg:col-span-8' : 'lg:col-span-12 max-w-5xl w-full mx-auto'}>
            {activeLobby.status === 'waiting' && (
              <div className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-5 sm:p-6 space-y-5">
                <div className="rounded-xl bg-gradient-to-r from-[#0E48AC] to-[#0A3075] border border-amber-400/50 p-4 flex flex-wrap items-center justify-between gap-3 text-white">
                  <div>
                    <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                      Waiting Room · {activeLobby.maxPlayers}-Player Ludo
                    </p>
                    <h2 className="font-display text-lg font-bold mt-0.5">
                      {activeLobby.players.length} of {activeLobby.maxPlayers} Seats Filled
                    </h2>
                  </div>
                  <span className="font-mono tabular-nums text-xs text-blue-100">
                    {activeLobby.turnTimeSec}s per turn
                  </span>
                </div>

                {/* Seat Roster */}
                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 ${
                    activeLobby.maxPlayers >= 5 ? 'xl:grid-cols-3' : ''
                  } gap-3`}
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
                                <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                                  {occupant.ludoColor} ·{' '}
                                  {occupant.isCpu ? 'CPU' : occupant.isGuest ? 'Guest' : `${occupant.rating} ELO`}
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
                                + Fill with CPU
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
                      ? 'Invite another player or click "+ Fill with CPU" to begin.'
                      : 'Ready to roll! Host can start the match.'}
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
                        className="px-5 py-2 text-sm font-bold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 transition-all min-h-[40px] cursor-pointer"
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
                isHost={isHost}
                isLocalPassPlay={Boolean(activeLobby.isLocalPassPlay)}
                turnTimeSec={activeLobby.turnTimeSec}
                soundOn={soundOn}
                onToggleSound={onToggleSound}
                onRollDice={onRollDice}
                onMoveToken={onMoveToken}
              />
            )}

            {activeLobby.status === 'finished' && activeLobby.lastOutcome && (
              <div className="rounded-2xl border-2 border-amber-400/70 bg-gradient-to-b from-[#0E48AC] to-[#082B70] p-8 text-center text-white space-y-5 shadow-2xl">
                <Crown className="w-12 h-12 text-amber-300 mx-auto" />
                <div>
                  <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                    Ausa Ludo Master Champion
                  </p>
                  <h2 className="font-display text-3xl font-bold mt-1">
                    {activeLobby.lastOutcome.winnerName} Wins!
                  </h2>
                </div>
                <p className="font-mono tabular-nums text-sm text-blue-100">
                  {activeLobby.lastOutcome.playerNames
                    .map((name, idx) => `${name}: ${activeLobby.lastOutcome!.scores[idx]}`)
                    .join(' · ')}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onRematch}
                    className="px-6 py-2.5 text-sm font-bold rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 transition-all min-h-[44px] cursor-pointer"
                  >
                    Play Again
                  </button>
                  <button
                    type="button"
                    onClick={onLeaveLobby}
                    className="px-5 py-2.5 text-sm font-semibold rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-white transition-colors min-h-[44px] cursor-pointer"
                  >
                    Back to Home
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Live Room Chat (Online Tables Only) */}
          {showSideChat && (
            <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] flex flex-col h-[340px] lg:h-[540px]">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-[#1B2E54] flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <MessageSquare className="w-4 h-4 text-amber-500" />
                  <span>Room Chat</span>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {activeLobby.players.length}/{activeLobby.maxPlayers} seated
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeLobby.chatMessages.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">
                    No messages yet. Say hello!
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
                  placeholder="Message room..."
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
          )}
        </div>

        {/* Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto">
            <div className="max-w-md w-full max-h-[90dvh] overflow-y-auto my-auto rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-5 space-y-4">
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
                  No other online players right now. Share your room or open a second tab to play together.
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

  // --- Ausa Ludo Master Home Hub (Clean Ludo King Modes) ---
  const filteredLobbies = lobbies.filter((l) => {
    if (capacityFilter !== 'All' && l.maxPlayers !== capacityFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return l.name.toLowerCase().includes(q) || l.hostName.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Ludo King Royal Blue Arena Launch Hub */}
      <section className="rounded-2xl border-2 border-amber-400/70 bg-gradient-to-br from-[#0E48AC] via-[#0B3A8C] to-[#072459] p-4 sm:p-8 text-white shadow-xl space-y-5 sm:space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
              <Crown className="w-4 h-4" />
              <span>Ausa Ludo Master</span>
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight [text-wrap:balance]">
              Classic Ludo for 2 to 6 Players — Play Instantly
            </h1>
            <p className="text-sm sm:text-base text-blue-100/90">
              Separate turn-by-turn dice for every player, computer opponents, local Pass &amp; Play, or live online rooms without signing in.
            </p>
          </div>

          {/* Player Count Selector (2P to 6P) */}
          <div className="rounded-xl border border-amber-400/50 bg-[#082B70]/85 p-3.5 space-y-2.5 shrink-0">
            <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">
              Select Players (2–6)
            </p>
            <div className="grid grid-cols-5 gap-1.5 sm:flex sm:items-center">
              {([2, 3, 4, 5, 6] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setQuickSeats(count)}
                  className={`min-h-[44px] sm:w-11 rounded-lg font-bold text-sm touch-manipulation transition-all cursor-pointer ${
                    quickSeats === count
                      ? 'bg-amber-400 text-slate-950 shadow-md scale-105'
                      : 'bg-white/10 text-blue-100 hover:bg-white/20'
                  }`}
                >
                  {count}P
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3 Clear Launch Mode Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => launchCpuMatch(quickSeats)}
            className="text-left rounded-xl border-2 border-amber-400/75 bg-gradient-to-b from-[#1356C9] to-[#0B398C] hover:from-[#1A64E0] hover:to-[#0F46AB] p-4 transition-all shadow-lg cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold text-amber-300">{quickSeats} Players</span>
            </div>
            <h2 className="font-display text-lg font-bold mt-3 group-hover:text-amber-300 transition-colors">
              Play vs Computer
            </h2>
            <p className="text-xs text-blue-100/85 mt-1">
              Start immediately against {quickSeats - 1} smart CPU {quickSeats === 2 ? 'opponent' : 'opponents'}.
            </p>
          </button>

          <button
            type="button"
            onClick={() => launchPassAndPlayMatch(quickSeats)}
            className="text-left rounded-xl border-2 border-amber-400/75 bg-gradient-to-b from-[#1356C9] to-[#0B398C] hover:from-[#1A64E0] hover:to-[#0F46AB] p-4 transition-all shadow-lg cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-lg bg-emerald-400 text-slate-950 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold text-emerald-300">{quickSeats} Players</span>
            </div>
            <h2 className="font-display text-lg font-bold mt-3 group-hover:text-amber-300 transition-colors">
              Pass &amp; Play
            </h2>
            <p className="text-xs text-blue-100/85 mt-1">
              Play together on one screen with friends and family.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setMaxPlayers(quickSeats);
              onOpenCreateModal();
            }}
            className="text-left rounded-xl border-2 border-amber-400/75 bg-gradient-to-b from-[#1356C9] to-[#0B398C] hover:from-[#1A64E0] hover:to-[#0F46AB] p-4 transition-all shadow-lg cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-lg bg-white text-[#0E48AC] flex items-center justify-center">
                <Globe className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold text-amber-300">2–6 Online</span>
            </div>
            <h2 className="font-display text-lg font-bold mt-3 group-hover:text-amber-300 transition-colors">
              Create Online Room
            </h2>
            <p className="text-xs text-blue-100/85 mt-1">
              Host a live public or private room with WebSocket chat.
            </p>
          </button>
        </div>

        <div className="pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-100/90 font-mono tabular-nums">
          <div className="flex flex-wrap items-center gap-4">
            <span>{lobbies.length} open rooms</span>
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
              className="font-sans font-semibold text-amber-300 hover:underline cursor-pointer"
            >
              Sign in with Google for Leaderboard ELO →
            </button>
          )}
        </div>
      </section>

      {/* Open Online Rooms */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mr-2">
              Open Online Rooms
            </h2>
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
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[32px] cursor-pointer ${
                    capacityFilter === opt.id
                      ? 'bg-white dark:bg-[#193060] text-slate-900 dark:text-amber-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rooms..."
            className="w-full sm:w-64 px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[40px]"
          />
        </div>

        {filteredLobbies.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-8 text-center space-y-3">
            <Users className="w-7 h-7 text-amber-500 mx-auto" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              No online rooms open right now. Create a room above or start an instant Computer / Pass &amp; Play match!
            </p>
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 inline-flex items-center gap-1.5 min-h-[40px] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create Online Room
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLobbies.map((lobby) => {
              const isFull = lobby.players.length >= lobby.maxPlayers;

              return (
                <article
                  key={lobby.id}
                  className="rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] overflow-hidden flex flex-col justify-between shadow-sm"
                >
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {lobby.maxPlayers}-Player {lobby.maxPlayers >= 5 ? 'Hex Ludo' : 'Classic Ludo'}
                      </span>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <span>{lobby.turnTimeSec}s</span>
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
                  </div>

                  <div className="px-5 py-3 bg-slate-50 dark:bg-[#08132B] flex items-center justify-between gap-3 border-t border-slate-100 dark:border-[#1B2E54]">
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
                      {isFull ? 'Watch' : 'Join Room'}
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
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onJoinLobby(privateJoinTarget.id, joinCode);
              setPrivateJoinTarget(null);
              setJoinCode('');
            }}
            className="max-w-sm w-full max-h-[90dvh] overflow-y-auto my-auto rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Enter Room Access Code
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Room: {privateJoinTarget.name}
            </p>
            <input
              type="text"
              required
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Access code..."
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white min-h-[44px]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPrivateJoinTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 min-h-[44px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 min-h-[44px] cursor-pointer"
              >
                Join Room
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Streamlined Create Online Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateSubmit}
            className="max-w-md w-full max-h-[90dvh] overflow-y-auto my-auto rounded-2xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] p-5 sm:p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Create Online Room
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
                Room Name
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                maxLength={48}
                placeholder={`${displayName}'s Ludo Room`}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white min-h-[42px]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Players (2–6)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {([2, 3, 4, 5, 6] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setMaxPlayers(count)}
                    className={`py-2.5 rounded-xl border text-center font-bold text-sm transition-colors cursor-pointer ${
                      maxPlayers === count
                        ? 'border-amber-500 bg-amber-500/15 text-slate-900 dark:text-amber-300'
                        : 'border-slate-200 dark:border-[#1B2E54] text-slate-600 dark:text-slate-400 hover:border-slate-400'
                    }`}
                  >
                    {count}P
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Turn Timer
              </label>
              <select
                value={turnTimeSec}
                onChange={(e) => setTurnTimeSec(Number(e.target.value) as 10 | 15 | 30)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white min-h-[40px]"
              >
                <option value={10}>10s Fast</option>
                <option value={15}>15s Standard</option>
                <option value={30}>30s Relaxed</option>
              </select>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#1B2E54]">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                <span>Private Room (Access Code)</span>
              </label>

              {isPrivate && (
                <input
                  type="text"
                  required
                  maxLength={16}
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Enter access code..."
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#243A68] bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-white min-h-[40px]"
                />
              )}
            </div>

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
                Open Room
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
