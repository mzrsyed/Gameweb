export type GameMode = 'Ludo';
export type MapTheme = 'Obsidian Grid' | 'Alpine Bastion' | 'Solaris Circuit';
export type LudoColor = 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'cyan';
export type LudoSlot = 1 | 2 | 3 | 4 | 5 | 6;
export type RegionCode = 'NA-East' | 'NA-West' | 'EU-West' | 'APAC' | 'Global';
export type PlatformCode = 'Desktop' | 'Mobile' | 'Cross-Play';
export type AvatarCode = 'google' | 'emblem-cobalt' | 'emblem-amber' | 'emblem-emerald' | 'emblem-slate';
export type LobbyStatus = 'waiting' | 'in_progress' | 'finished';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  xpReward: number;
}

export const ACHIEVEMENTS_CATALOG: AchievementDef[] = [
  { id: 'first_match', title: 'First Entry', description: 'Complete your first multiplayer Ludo match', xpReward: 100 },
  { id: 'first_victory', title: 'First Victory', description: 'Win your first competitive Ludo match', xpReward: 150 },
  { id: 'streak_3', title: 'Triple Threat', description: 'Reach a 3-match Ludo win streak', xpReward: 250 },
  { id: 'veteran_10', title: 'Ludo Regular', description: 'Play 10 total Ludo matches', xpReward: 300 },
  { id: 'rating_1300', title: 'Contender Tier', description: 'Reach 1,300 ELO rating on the leaderboard', xpReward: 400 },
  { id: 'social_sharer', title: 'Community Voice', description: 'Share a Ludo match result to the social feed', xpReward: 100 },
];

export interface PlayerProfile {
  uid: string;
  username: string;
  bio: string;
  region: RegionCode;
  preferredPlatform: PlatformCode;
  avatarCode: AvatarCode;
  photoUrl: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  winStreak: number;
  bestStreak: number;
  xp: number;
  achievements: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PlayerPrivateSettings {
  uid: string;
  email: string;
  pushEnabled: boolean;
  darkMode: boolean;
  updatedAt?: unknown;
}

export interface MatchRecord {
  matchId: string;
  lobbyName: string;
  gameMode: GameMode;
  mapTheme: MapTheme;
  isRanked: boolean;
  playerIds: string[];
  playerNames: string[];
  scores: number[];
  winnerId: string;
  recordedBy: string;
  durationSec: number;
  playedAt?: unknown;
}

export interface FeedPost {
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  caption: string;
  matchMode: string;
  mapTheme: string;
  outcome: 'Victory' | 'Defeat' | 'Draw' | 'Highlight';
  scoreSummary: string;
  ratingDelta: number;
  visibility: 'public';
  likeCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Friendship {
  pairId: string;
  users: string[];
  userNames: string[];
  requesterId: string;
  status: 'pending' | 'accepted';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DirectMessage {
  dmId: string;
  participants: string[];
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  text: string;
  read: boolean;
  createdAt?: unknown;
}

export interface PlayerNotification {
  notifId: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  type: 'match_invite' | 'direct_message' | 'friend_request' | 'match_result';
  title: string;
  body: string;
  lobbyId: string;
  read: boolean;
  createdAt?: unknown;
}

// --- WebSocket Real-Time State Types ---

export interface OnlinePlayer {
  uid: string;
  username: string;
  avatar: string;
  rating: number;
  platform: PlatformCode;
  status: 'idle' | 'in_lobby' | 'in_match' | 'queuing';
  lobbyId?: string;
  isGuest?: boolean;
}

export interface LobbyPlayer {
  uid: string;
  username: string;
  avatar: string;
  rating: number;
  ready: boolean;
  slot: LudoSlot;
  ludoColor: LudoColor;
  isCpu?: boolean;
  isGuest?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  channel: 'lobby' | 'lounge' | 'system';
}

export interface LudoPlayerState {
  slot: LudoSlot;
  color: LudoColor;
  tokens: [number, number, number, number];
  finishedCount: number;
  captures: number;
}

export interface LudoRollEvent {
  slot: LudoSlot;
  value: number;
  seq: number;
}

export interface LudoGameState {
  mode: 'Ludo';
  armCount: 4 | 6;
  players: LudoPlayerState[];
  turnSlot: LudoSlot;
  phase: 'roll' | 'move' | 'passing';
  diceValue: number | null;
  rollSeq: number;
  lastRoll: LudoRollEvent | null;
  consecutiveSixes: number;
  movableTokenIndices: number[];
  scores: number[];
  turnDeadline: number;
  lastActionText: string;
}

export type ActiveGameState = LudoGameState;

export interface MatchOutcomeSummary {
  matchId: string;
  lobbyId: string;
  lobbyName: string;
  gameMode: GameMode;
  mapTheme: MapTheme;
  isRanked: boolean;
  playerIds: string[];
  playerNames: string[];
  scores: number[];
  winnerId: string;
  winnerName: string;
  durationSec: number;
  ratingDeltas: number[];
  hasCpu: boolean;
  hasGuest?: boolean;
}

export interface LobbySummary {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  gameMode: GameMode;
  mapTheme: MapTheme;
  maxPlayers: 2 | 3 | 4 | 5 | 6;
  turnTimeSec: 10 | 15 | 30;
  isRanked: boolean;
  isPrivate: boolean;
  allowSpectators: boolean;
  soloPractice: boolean;
  isLocalPassPlay?: boolean;
  status: LobbyStatus;
  players: LobbyPlayer[];
  spectatorCount: number;
  createdAt: number;
}

export interface LobbyDetail extends LobbySummary {
  spectators: { uid: string; username: string }[];
  chatMessages: ChatMessage[];
  gameState: ActiveGameState | null;
  lastOutcome: MatchOutcomeSummary | null;
}

export interface MatchmakingStatus {
  inQueue: boolean;
  gameMode: GameMode;
  mapTheme: MapTheme;
  maxPlayers: 2 | 4 | 6;
  isRanked: boolean;
  joinedAt: number | null;
  queueSize: number;
}

export interface RealtimePushEvent {
  id: string;
  type: 'match_invite' | 'direct_message' | 'match_found' | 'friend_request';
  title: string;
  body: string;
  senderId: string;
  senderName: string;
  lobbyId?: string;
  timestamp: number;
}
