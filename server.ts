import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ChatMessage,
  LobbyDetail,
  LobbyPlayer,
  LobbySummary,
  LudoColor,
  LudoGameState,
  LudoPlayerState,
  LudoSlot,
  MapTheme,
  MatchOutcomeSummary,
  OnlinePlayer,
  PlatformCode,
  RealtimePushEvent,
} from './src/shared/types.js';

const PORT = Number(process.env.PORT) || 3000;

interface FirebaseAppletConfig {
  projectId: string;
}

const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf-8')
);
const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

// --- Cryptographic Firebase ID Token Verification ---
let cachedCerts: Record<string, string> = {};
let certsExpireAt = 0;

async function getGoogleCerts(): Promise<Record<string, string>> {
  if (Date.now() < certsExpireAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('Unable to fetch Firebase verification certificates');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await resp.json()) as Record<string, string>;
  certsExpireAt = Date.now() + maxAgeSec * 1000;
  return cachedCerts;
}

function base64UrlToBuffer(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email?: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

  const header = JSON.parse(base64UrlToBuffer(parts[0]).toString('utf-8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(base64UrlToBuffer(parts[1]).toString('utf-8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
  };

  if (header.alg !== 'RS256' || !header.kid) throw new Error('Invalid token algorithm');
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error('Invalid token audience');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Invalid token issuer');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSec) throw new Error('Token expired');
  if (!payload.iat || payload.iat > nowSec + 300) throw new Error('Invalid issued-at time');
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Invalid token subject');
  }

  const certs = await getGoogleCerts();
  let cert = certs[header.kid];
  if (!cert) {
    certsExpireAt = 0;
    const refreshed = await getGoogleCerts();
    cert = refreshed[header.kid];
  }
  if (!cert) throw new Error('Signing certificate not found');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const valid = verifier.verify(cert, base64UrlToBuffer(parts[2]));
  if (!valid) throw new Error('Invalid token signature');

  return { uid: payload.sub, email: payload.email };
}

// --- Ludo Board Constants (Matches Blue TL, Red TR, Green BR, Yellow BL) ---
const COLOR_START_OFFSET: Record<LudoColor, number> = {
  blue: 0,
  red: 13,
  green: 26,
  yellow: 39,
  purple: 52,
  cyan: 65,
};

const SAFE_TRACK_4 = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);
const SAFE_TRACK_6 = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47, 52, 60, 65, 73]);

function getBoardArmCount(maxPlayers: number): 4 | 6 {
  return maxPlayers <= 4 ? 4 : 6;
}

function getLudoColorForSlot(slot: LudoSlot, maxPlayers: 2 | 3 | 4 | 5 | 6): LudoColor {
  if (maxPlayers === 2) {
    // Diagonal: Blue (Top-Left) vs Green (Bottom-Right)
    return slot === 1 ? 'blue' : 'green';
  }
  if (maxPlayers <= 4) {
    // Clockwise matching Ludo King reference: Blue TL -> Red TR -> Green BR -> Yellow BL
    const order4: LudoColor[] = ['blue', 'red', 'green', 'yellow'];
    return order4[slot - 1] || 'blue';
  }
  const order6: LudoColor[] = ['blue', 'red', 'green', 'yellow', 'purple', 'cyan'];
  return order6[slot - 1] || 'blue';
}

function getTrackParams(armCount: 4 | 6) {
  const trackLen = armCount * 13; // 52 or 78
  const maxOuter = trackLen - 2; // 50 or 76
  const goalPos = trackLen + 4; // 56 or 82
  const safeSet = armCount === 4 ? SAFE_TRACK_4 : SAFE_TRACK_6;
  return { trackLen, maxOuter, goalPos, safeSet };
}

function getGlobalTrackIndex(color: LudoColor, progress: number, armCount: 4 | 6): number | null {
  const { trackLen, maxOuter } = getTrackParams(armCount);
  if (progress < 0 || progress > maxOuter) return null;
  return (COLOR_START_OFFSET[color] + progress) % trackLen;
}

// --- Server-Authoritative State ---
interface ClientSession {
  ws: WebSocket;
  uid: string;
  isGuest: boolean;
  username: string;
  avatar: string;
  rating: number;
  platform: PlatformCode;
  lobbyId: string | null;
}

interface ServerLobby extends LobbyDetail {
  accessCode: string;
  startedAt: number | null;
  turnTimer?: NodeJS.Timeout;
  cpuTimer?: NodeJS.Timeout;
  autoPassTimer?: NodeJS.Timeout;
}

const sessions = new Map<WebSocket, ClientSession>();
const lobbies = new Map<string, ServerLobby>();
const pendingDisconnectTimers = new Map<string, NodeJS.Timeout>();

function clearPendingDisconnect(uid: string, lobbyId: string) {
  const key = `${uid}:${lobbyId}`;
  const existing = pendingDisconnectTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    pendingDisconnectTimers.delete(key);
  }
}

function restoreSessionLobbyIfAny(ws: WebSocket, session: ClientSession) {
  for (const lobby of lobbies.values()) {
    const inLobby =
      lobby.players.some((pl) => pl.uid === session.uid) ||
      lobby.spectators.some((sp) => sp.uid === session.uid);
    if (inLobby) {
      clearPendingDisconnect(session.uid, lobby.id);
      session.lobbyId = lobby.id;
      sendJson(ws, 'lobby:state', toLobbyDetail(lobby));
      return;
    }
  }
}

function sanitizeStr(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

function sendJson(ws: WebSocket, type: string, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastAll(type: string, payload: unknown) {
  const raw = JSON.stringify({ type, payload });
  for (const ws of sessions.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    }
  }
}

function sendToUser(uid: string, type: string, payload: unknown) {
  const raw = JSON.stringify({ type, payload });
  for (const [ws, session] of sessions.entries()) {
    if (session.uid === uid && ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    }
  }
}

function toLobbySummary(lobby: ServerLobby): LobbySummary {
  return {
    id: lobby.id,
    name: lobby.name,
    hostId: lobby.hostId,
    hostName: lobby.hostName,
    gameMode: 'Ludo',
    mapTheme: lobby.mapTheme,
    maxPlayers: lobby.maxPlayers,
    turnTimeSec: lobby.turnTimeSec,
    isRanked: lobby.isRanked,
    isPrivate: lobby.isPrivate,
    allowSpectators: lobby.allowSpectators,
    soloPractice: lobby.soloPractice,
    isLocalPassPlay: lobby.isLocalPassPlay,
    status: lobby.status,
    players: lobby.players,
    spectatorCount: lobby.spectators.length,
    createdAt: lobby.createdAt,
  };
}

function toLobbyDetail(lobby: ServerLobby): LobbyDetail {
  return {
    ...toLobbySummary(lobby),
    spectators: lobby.spectators,
    chatMessages: lobby.chatMessages,
    gameState: lobby.gameState,
    lastOutcome: lobby.lastOutcome,
  };
}

function broadcastLobbyList() {
  const list = Array.from(lobbies.values())
    .filter((l) => !l.soloPractice && !l.isLocalPassPlay)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toLobbySummary);
  broadcastAll('lobby:list', list);
}

function broadcastPresence() {
  const map = new Map<string, OnlinePlayer>();
  for (const s of sessions.values()) {
    const lobby = s.lobbyId ? lobbies.get(s.lobbyId) : undefined;
    let status: OnlinePlayer['status'] = 'idle';
    if (lobby?.status === 'in_progress') status = 'in_match';
    else if (lobby) status = 'in_lobby';

    map.set(s.uid, {
      uid: s.uid,
      username: s.username,
      avatar: s.avatar,
      rating: s.rating,
      platform: s.platform,
      status,
      lobbyId: s.lobbyId ?? undefined,
      isGuest: s.isGuest,
    });
  }
  broadcastAll('presence:list', Array.from(map.values()));
}

function broadcastLobbyDetail(lobby: ServerLobby) {
  const detail = toLobbyDetail(lobby);
  const memberIds = new Set<string>([
    ...lobby.players.filter((p) => !p.isCpu).map((p) => p.uid),
    ...lobby.spectators.map((s) => s.uid),
  ]);
  for (const [ws, session] of sessions.entries()) {
    if (memberIds.has(session.uid) || session.lobbyId === lobby.id) {
      sendJson(ws, 'lobby:state', detail);
    }
  }
}

function clearLobbyTimers(lobby: ServerLobby) {
  if (lobby.turnTimer) {
    clearTimeout(lobby.turnTimer);
    lobby.turnTimer = undefined;
  }
  if (lobby.cpuTimer) {
    clearTimeout(lobby.cpuTimer);
    lobby.cpuTimer = undefined;
  }
  if (lobby.autoPassTimer) {
    clearTimeout(lobby.autoPassTimer);
    lobby.autoPassTimer = undefined;
  }
}

function appendSystemChat(lobby: ServerLobby, text: string) {
  const msg: ChatMessage = {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderId: 'system',
    senderName: 'Arena',
    text,
    timestamp: Date.now(),
    channel: 'system',
  };
  lobby.chatMessages = [...lobby.chatMessages.slice(-79), msg];
}

function rebalanceLobbySlots(lobby: ServerLobby) {
  lobby.players = lobby.players.map((p, idx) => {
    const slot = (idx + 1) as LudoSlot;
    return {
      ...p,
      slot,
      ludoColor: getLudoColorForSlot(slot, lobby.maxPlayers),
    };
  });
}

// --- Ludo Game Engine (2 to 6 Players) ---

function createInitialLudoState(lobby: ServerLobby): LudoGameState {
  const armCount = getBoardArmCount(lobby.maxPlayers);
  const players: LudoPlayerState[] = lobby.players.map((p) => ({
    slot: p.slot,
    color: p.ludoColor,
    tokens: [-1, -1, -1, -1],
    finishedCount: 0,
    captures: 0,
  }));

  return {
    mode: 'Ludo',
    armCount,
    players,
    turnSlot: players[0]?.slot ?? 1,
    phase: 'roll',
    diceValue: null,
    rollSeq: 0,
    lastRoll: null,
    consecutiveSixes: 0,
    movableTokenIndices: [],
    scores: players.map(() => 0),
    turnDeadline: Date.now() + lobby.turnTimeSec * 1000,
    lastActionText: `${lobby.players[0]?.username || 'Player 1'}'s turn to roll.`,
  };
}

function computeLudoScores(state: LudoGameState): number[] {
  const { goalPos } = getTrackParams(state.armCount);
  return state.players.map((pl) => {
    let score = pl.captures * 15;
    for (const t of pl.tokens) {
      if (t === goalPos) score += 100;
      else if (t >= 0) score += t + 5;
    }
    return score;
  });
}

function getMovableTokens(pl: LudoPlayerState, dice: number, armCount: 4 | 6): number[] {
  const { goalPos } = getTrackParams(armCount);
  const indices: number[] = [];
  for (let i = 0; i < 4; i++) {
    const pos = pl.tokens[i];
    if (pos === -1) {
      if (dice === 6) indices.push(i);
    } else if (pos < goalPos && pos + dice <= goalPos) {
      indices.push(i);
    }
  }
  return indices;
}

function getNextTurnSlot(lobby: ServerLobby, currentSlot: LudoSlot): LudoSlot {
  const slots = lobby.players.map((p) => p.slot);
  const idx = slots.indexOf(currentSlot);
  if (idx === -1 || slots.length === 0) return 1;
  return slots[(idx + 1) % slots.length];
}

function finishLudoMatch(lobby: ServerLobby, winnerSlot: LudoSlot) {
  clearLobbyTimers(lobby);
  lobby.status = 'finished';

  const state = lobby.gameState;
  const scores = state ? computeLudoScores(state) : lobby.players.map(() => 0);
  const winnerPlayer = lobby.players.find((p) => p.slot === winnerSlot) || lobby.players[0];
  const hasCpu = lobby.players.some((p) => p.isCpu);
  const hasGuest = lobby.players.some((p) => p.isGuest);

  const avgRating =
    lobby.players.reduce((acc, p) => acc + p.rating, 0) / Math.max(1, lobby.players.length);

  const rankedEligible = lobby.isRanked && !hasCpu && !hasGuest && !lobby.isLocalPassPlay;
  const ratingDeltas = lobby.players.map((p) => {
    if (!rankedEligible) return 0;
    if (p.slot === winnerSlot) {
      const bonus = Math.round(24 + Math.max(-8, Math.min(8, (avgRating - p.rating) / 35)));
      return Math.max(12, Math.min(45, bonus));
    }
    return -Math.max(8, Math.round(20 / Math.max(1, lobby.players.length - 1)));
  });

  const durationSec = Math.max(
    5,
    Math.round((Date.now() - (lobby.startedAt ?? Date.now())) / 1000)
  );

  const outcome: MatchOutcomeSummary = {
    matchId: `ludo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    lobbyId: lobby.id,
    lobbyName: lobby.name,
    gameMode: 'Ludo',
    mapTheme: lobby.mapTheme,
    isRanked: rankedEligible,
    playerIds: lobby.players.map((p) => p.uid),
    playerNames: lobby.players.map((p) => p.username),
    scores,
    winnerId: winnerPlayer?.uid ?? 'draw',
    winnerName: winnerPlayer?.username ?? 'Winner',
    durationSec,
    ratingDeltas,
    hasCpu,
    hasGuest,
  };

  lobby.lastOutcome = outcome;
  appendSystemChat(lobby, `${outcome.winnerName} got all 4 pawns home and won!`);
  broadcastLobbyDetail(lobby);
  broadcastLobbyList();
  broadcastPresence();
}

function scheduleLudoTurn(lobby: ServerLobby) {
  clearLobbyTimers(lobby);
  const state = lobby.gameState;
  if (lobby.status !== 'in_progress' || !state || state.phase === 'passing') return;

  const activeLobbyPlayer = lobby.players.find((p) => p.slot === state.turnSlot);
  if (!activeLobbyPlayer) return;

  lobby.turnTimer = setTimeout(() => {
    if (lobby.status !== 'in_progress' || !lobby.gameState) return;
    if (lobby.gameState.phase === 'roll') {
      handleRollDice(lobby, activeLobbyPlayer.slot);
    } else if (
      lobby.gameState.phase === 'move' &&
      lobby.gameState.movableTokenIndices.length > 0
    ) {
      handleMoveToken(lobby, activeLobbyPlayer.slot, lobby.gameState.movableTokenIndices[0]);
    }
  }, Math.max(1000, state.turnDeadline - Date.now()));

  if (activeLobbyPlayer.isCpu) {
    const delayMs = state.phase === 'roll' ? 650 : 800;
    lobby.cpuTimer = setTimeout(() => {
      if (lobby.status !== 'in_progress' || !lobby.gameState) return;
      if (lobby.gameState.phase === 'roll') {
        handleRollDice(lobby, activeLobbyPlayer.slot);
      } else if (lobby.gameState.phase === 'move') {
        const bestToken = pickBestCpuToken(lobby.gameState, activeLobbyPlayer.slot);
        if (bestToken !== null) {
          handleMoveToken(lobby, activeLobbyPlayer.slot, bestToken);
        }
      }
    }, delayMs);
  }
}

function pickBestCpuToken(state: LudoGameState, slot: LudoSlot): number | null {
  const pl = state.players.find((p) => p.slot === slot);
  const dice = state.diceValue;
  if (!pl || !dice || state.movableTokenIndices.length === 0) return null;

  const { maxOuter, goalPos, safeSet } = getTrackParams(state.armCount);
  let bestIdx = state.movableTokenIndices[0];
  let bestScore = -999;

  for (const idx of state.movableTokenIndices) {
    const cur = pl.tokens[idx];
    const next = cur === -1 ? 0 : cur + dice;
    let score = next;
    if (cur === -1) score += 45;
    if (next === goalPos) score += 120;
    if (next <= maxOuter) {
      const targetGlobal = getGlobalTrackIndex(pl.color, next, state.armCount);
      if (targetGlobal !== null && !safeSet.has(targetGlobal)) {
        const hitsOpponent = state.players.some(
          (other) =>
            other.slot !== slot &&
            other.tokens.some(
              (ot) => getGlobalTrackIndex(other.color, ot, state.armCount) === targetGlobal
            )
        );
        if (hitsOpponent) score += 95;
      } else if (targetGlobal !== null && safeSet.has(targetGlobal)) {
        score += 20;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

function queueAutoPass(lobby: ServerLobby, currentSlot: LudoSlot, resetSixes: boolean) {
  lobby.autoPassTimer = setTimeout(() => {
    if (lobby.status !== 'in_progress' || !lobby.gameState) return;
    const nextSlot = getNextTurnSlot(lobby, currentSlot);
    const nextPlayer = lobby.players.find((p) => p.slot === nextSlot);
    lobby.gameState.turnSlot = nextSlot;
    lobby.gameState.phase = 'roll';
    lobby.gameState.diceValue = null;
    if (resetSixes) lobby.gameState.consecutiveSixes = 0;
    lobby.gameState.movableTokenIndices = [];
    lobby.gameState.turnDeadline = Date.now() + lobby.turnTimeSec * 1000;
    lobby.gameState.lastActionText = `${nextPlayer?.username || 'Next player'}'s turn to roll.`;
    broadcastLobbyDetail(lobby);
    scheduleLudoTurn(lobby);
  }, 850);
}

function handleRollDice(lobby: ServerLobby, slot: LudoSlot): boolean {
  const state = lobby.gameState;
  if (!state || lobby.status !== 'in_progress') return false;
  if (state.turnSlot !== slot || state.phase !== 'roll') return false;

  const playerState = state.players.find((p) => p.slot === slot);
  const lobbyPlayer = lobby.players.find((p) => p.slot === slot);
  if (!playerState || !lobbyPlayer) return false;

  clearLobbyTimers(lobby);
  const roll = crypto.randomInt(1, 7);
  state.diceValue = roll;
  state.rollSeq += 1;
  state.lastRoll = { slot, value: roll, seq: state.rollSeq };

  const nextSixes = roll === 6 ? state.consecutiveSixes + 1 : 0;
  if (nextSixes >= 3) {
    state.consecutiveSixes = 0;
    state.movableTokenIndices = [];
    state.phase = 'passing';
    state.lastActionText = `${lobbyPlayer.username} rolled three 6s — turn skipped.`;
    broadcastLobbyDetail(lobby);
    queueAutoPass(lobby, slot, true);
    return true;
  }

  state.consecutiveSixes = nextSixes;
  const movable = getMovableTokens(playerState, roll, state.armCount);
  state.movableTokenIndices = movable;

  if (movable.length === 0) {
    state.phase = 'passing';
    state.lastActionText = `${lobbyPlayer.username} rolled ${roll} — no legal moves.`;
    broadcastLobbyDetail(lobby);
    queueAutoPass(lobby, slot, true);
    return true;
  }

  state.phase = 'move';
  state.turnDeadline = Date.now() + lobby.turnTimeSec * 1000;
  state.lastActionText = `${lobbyPlayer.username} rolled ${roll}. Tap a glowing pawn.`;
  broadcastLobbyDetail(lobby);
  scheduleLudoTurn(lobby);
  return true;
}

function handleMoveToken(lobby: ServerLobby, slot: LudoSlot, tokenIndex: number): boolean {
  const state = lobby.gameState;
  if (!state || lobby.status !== 'in_progress') return false;
  if (state.turnSlot !== slot || state.phase !== 'move' || state.diceValue === null) return false;
  if (!Number.isInteger(tokenIndex) || !state.movableTokenIndices.includes(tokenIndex)) return false;

  const playerState = state.players.find((p) => p.slot === slot);
  const lobbyPlayer = lobby.players.find((p) => p.slot === slot);
  if (!playerState || !lobbyPlayer) return false;

  clearLobbyTimers(lobby);
  const { maxOuter, goalPos, safeSet } = getTrackParams(state.armCount);
  const dice = state.diceValue;
  const currentPos = playerState.tokens[tokenIndex];
  const nextPos = currentPos === -1 ? 0 : currentPos + dice;
  playerState.tokens[tokenIndex] = nextPos;

  let capturedSomeone = false;
  if (nextPos >= 0 && nextPos <= maxOuter) {
    const landingGlobal = getGlobalTrackIndex(playerState.color, nextPos, state.armCount);
    if (landingGlobal !== null && !safeSet.has(landingGlobal)) {
      for (const other of state.players) {
        if (other.slot === slot) continue;
        for (let i = 0; i < 4; i++) {
          const oppProgress = other.tokens[i];
          if (oppProgress >= 0 && oppProgress <= maxOuter) {
            if (getGlobalTrackIndex(other.color, oppProgress, state.armCount) === landingGlobal) {
              other.tokens[i] = -1;
              capturedSomeone = true;
              playerState.captures += 1;
            }
          }
        }
      }
    }
  }

  playerState.finishedCount = playerState.tokens.filter((t) => t === goalPos).length;
  state.scores = computeLudoScores(state);
  state.movableTokenIndices = [];
  state.diceValue = null;

  if (playerState.finishedCount === 4) {
    state.lastActionText = `${lobbyPlayer.username} got all 4 pawns home!`;
    finishLudoMatch(lobby, slot);
    return true;
  }

  const reachedGoal = nextPos === goalPos;
  const bonusTurn = dice === 6 || capturedSomeone || reachedGoal;

  if (bonusTurn) {
    state.phase = 'roll';
    state.turnDeadline = Date.now() + lobby.turnTimeSec * 1000;
    const reason = capturedSomeone
      ? 'captured a pawn'
      : reachedGoal
        ? 'reached Home'
        : 'rolled a 6';
    state.lastActionText = `${lobbyPlayer.username} ${reason} — bonus roll!`;
  } else {
    const nextSlot = getNextTurnSlot(lobby, slot);
    const nextPlayer = lobby.players.find((p) => p.slot === nextSlot);
    state.turnSlot = nextSlot;
    state.phase = 'roll';
    state.consecutiveSixes = 0;
    state.turnDeadline = Date.now() + lobby.turnTimeSec * 1000;
    state.lastActionText = `${nextPlayer?.username || 'Next player'}'s turn to roll.`;
  }

  broadcastLobbyDetail(lobby);
  scheduleLudoTurn(lobby);
  return true;
}

function startLobbyMatch(lobby: ServerLobby) {
  if (lobby.players.length < 2) return;
  clearLobbyTimers(lobby);
  rebalanceLobbySlots(lobby);
  lobby.status = 'in_progress';
  lobby.startedAt = Date.now();
  lobby.lastOutcome = null;
  lobby.gameState = createInitialLudoState(lobby);
  appendSystemChat(lobby, `Ludo match started (${lobby.players.length} players).`);
  broadcastLobbyDetail(lobby);
  broadcastLobbyList();
  broadcastPresence();
  scheduleLudoTurn(lobby);
}

function removeUserFromLobby(uid: string, lobbyId: string) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  const wasPlayer = lobby.players.some((p) => p.uid === uid && !p.isCpu);
  lobby.players = lobby.players.filter((p) => p.uid !== uid);
  lobby.spectators = lobby.spectators.filter((s) => s.uid !== uid);

  const humanPlayers = lobby.players.filter((p) => !p.isCpu && !p.uid.startsWith('local-seat-'));
  if (humanPlayers.length === 0) {
    clearLobbyTimers(lobby);
    lobbies.delete(lobby.id);
    broadcastLobbyList();
    return;
  }

  if (lobby.hostId === uid) {
    lobby.hostId = humanPlayers[0].uid;
    lobby.hostName = humanPlayers[0].username;
    appendSystemChat(lobby, `${lobby.hostName} is now the host.`);
  }

  if (wasPlayer && lobby.status === 'in_progress') {
    if (humanPlayers.length === 1 && !lobby.soloPractice && !lobby.isLocalPassPlay) {
      finishLudoMatch(lobby, humanPlayers[0].slot);
    } else {
      if (lobby.gameState) {
        lobby.gameState.players = lobby.gameState.players.filter((p) =>
          lobby.players.some((lp) => lp.slot === p.slot)
        );
        if (!lobby.players.some((lp) => lp.slot === lobby.gameState!.turnSlot)) {
          lobby.gameState.turnSlot = lobby.players[0].slot;
          lobby.gameState.phase = 'roll';
          lobby.gameState.diceValue = null;
        }
      }
      broadcastLobbyDetail(lobby);
      broadcastLobbyList();
    }
  } else {
    if (lobby.status === 'waiting') {
      rebalanceLobbySlots(lobby);
    }
    broadcastLobbyDetail(lobby);
    broadcastLobbyList();
  }
}

// --- Express & HTTP Setup ---
async function main() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, lobbies: lobbies.size, online: sessions.size });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    const guestSuffix = crypto.randomBytes(4).toString('hex');
    const guestUid = `guest-${guestSuffix}`;
    const initialSession: ClientSession = {
      ws,
      uid: guestUid,
      isGuest: true,
      username: `Guest${guestSuffix.slice(0, 4).toUpperCase()}`,
      avatar: 'emblem-slate',
      rating: 1200,
      platform: 'Cross-Play',
      lobbyId: null,
    };
    sessions.set(ws, initialSession);

    sendJson(ws, 'auth:ok', {
      uid: initialSession.uid,
      isGuest: true,
      username: initialSession.username,
    });
    sendJson(
      ws,
      'lobby:list',
      Array.from(lobbies.values())
        .filter((l) => !l.soloPractice && !l.isLocalPassPlay)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(toLobbySummary)
    );
    broadcastPresence();

    ws.on('message', async (rawData) => {
      let msg: { type?: string; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(rawData.toString()) as { type?: string; payload?: Record<string, unknown> };
      } catch {
        return;
      }

      const session = sessions.get(ws);
      if (!session || !msg.type) return;
      const p = msg.payload || {};

      // Guest Session (Play Without Login)
      if (msg.type === 'auth:guest') {
        const requestedGuestId =
          typeof p.guestId === 'string' && /^guest-[a-z0-9]{4,24}$/i.test(p.guestId.trim())
            ? p.guestId.trim()
            : '';
        if (!session.isGuest) {
          if (session.lobbyId) {
            removeUserFromLobby(session.uid, session.lobbyId);
            session.lobbyId = null;
          }
          session.uid = requestedGuestId || `guest-${crypto.randomBytes(4).toString('hex')}`;
        } else if (requestedGuestId && session.uid !== requestedGuestId) {
          if (session.lobbyId) {
            removeUserFromLobby(session.uid, session.lobbyId);
            session.lobbyId = null;
          }
          session.uid = requestedGuestId;
        }
        session.isGuest = true;
        const requestedName = sanitizeStr(p.username, 24);
        session.username = requestedName || session.username;
        session.avatar = 'emblem-slate';
        session.rating = 1200;
        session.platform = 'Cross-Play';
        sendJson(ws, 'auth:ok', {
          uid: session.uid,
          isGuest: true,
          username: session.username,
        });
        restoreSessionLobbyIfAny(ws, session);
        broadcastPresence();
        return;
      }

      // Firebase ID Token Auth (Registered Player)
      if (msg.type === 'auth') {
        const token = typeof p.token === 'string' ? p.token : '';
        if (!token) return;
        try {
          const verified = await verifyFirebaseIdToken(token);
          if (session.uid !== verified.uid && session.lobbyId) {
            removeUserFromLobby(session.uid, session.lobbyId);
            session.lobbyId = null;
          }
          session.uid = verified.uid;
          session.isGuest = false;
          session.username = sanitizeStr(p.username, 24) || 'Player';
          session.avatar = sanitizeStr(p.avatar, 512) || 'emblem-cobalt';
          session.rating = typeof p.rating === 'number' ? Math.round(p.rating) : 1200;
          session.platform =
            p.platform === 'Mobile' || p.platform === 'Desktop' ? p.platform : 'Cross-Play';
          sendJson(ws, 'auth:ok', {
            uid: session.uid,
            isGuest: false,
            username: session.username,
          });
          restoreSessionLobbyIfAny(ws, session);
          broadcastPresence();
        } catch (err) {
          sendJson(ws, 'error', { message: err instanceof Error ? err.message : 'Auth rejected' });
        }
        return;
      }

      if (msg.type === 'profile:sync') {
        session.username = sanitizeStr(p.username, 24) || session.username;
        if (!session.isGuest) {
          session.avatar = sanitizeStr(p.avatar, 512) || session.avatar;
          if (typeof p.rating === 'number') session.rating = Math.round(p.rating);
        }
        broadcastPresence();
        return;
      }

      if (msg.type === 'lobby:create') {
        if (session.lobbyId) {
          removeUserFromLobby(session.uid, session.lobbyId);
          session.lobbyId = null;
        }

        const mapTheme: MapTheme =
          p.mapTheme === 'Alpine Bastion' || p.mapTheme === 'Solaris Circuit'
            ? p.mapTheme
            : 'Obsidian Grid';
        const rawMax = Number(p.maxPlayers);
        const maxPlayers: 2 | 3 | 4 | 5 | 6 =
          rawMax === 3 || rawMax === 4 || rawMax === 5 || rawMax === 6 ? rawMax : 2;
        const turnTimeSec = p.turnTimeSec === 10 || p.turnTimeSec === 30 ? p.turnTimeSec : 15;
        const soloPractice = Boolean(p.soloPractice);
        const isLocalPassPlay = !soloPractice && Boolean(p.isLocalPassPlay);
        const autoStart = soloPractice || isLocalPassPlay || Boolean(p.autoStart);
        const isPrivate = !soloPractice && !isLocalPassPlay && Boolean(p.isPrivate);
        const accessCode = isPrivate ? sanitizeStr(p.accessCode, 16) : '';
        const lobbyId = `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

        const players: LobbyPlayer[] = [
          {
            uid: session.uid,
            username: session.username,
            avatar: session.avatar,
            rating: session.rating,
            ready: true,
            slot: 1,
            ludoColor: getLudoColorForSlot(1, maxPlayers),
            isGuest: session.isGuest,
          },
        ];

        if (soloPractice) {
          const cpuCount = maxPlayers - 1;
          for (let c = 1; c <= cpuCount; c++) {
            const slot = (c + 1) as LudoSlot;
            players.push({
              uid: `cpu-bot-${c}`,
              username: cpuCount === 1 ? 'CPU Master' : `CPU ${c}`,
              avatar: 'emblem-slate',
              rating: 1200,
              ready: true,
              slot,
              ludoColor: getLudoColorForSlot(slot, maxPlayers),
              isCpu: true,
            });
          }
        } else if (isLocalPassPlay) {
          for (let seat = 2; seat <= maxPlayers; seat++) {
            const slot = seat as LudoSlot;
            players.push({
              uid: `local-seat-${seat}`,
              username: `Player ${seat}`,
              avatar: 'emblem-amber',
              rating: 1200,
              ready: true,
              slot,
              ludoColor: getLudoColorForSlot(slot, maxPlayers),
              isGuest: true,
            });
          }
        }

        const isRankedAllowed =
          !soloPractice && !isLocalPassPlay && !session.isGuest && Boolean(p.isRanked);

        const lobby: ServerLobby = {
          id: lobbyId,
          name: sanitizeStr(p.name, 48) || `${session.username}'s Ludo Table`,
          hostId: session.uid,
          hostName: session.username,
          gameMode: 'Ludo',
          mapTheme,
          maxPlayers,
          turnTimeSec,
          isRanked: isRankedAllowed,
          isPrivate,
          accessCode,
          allowSpectators: p.allowSpectators !== false,
          soloPractice,
          isLocalPassPlay,
          status: 'waiting',
          players,
          spectators: [],
          spectatorCount: 0,
          chatMessages: [],
          gameState: null,
          lastOutcome: null,
          createdAt: Date.now(),
          startedAt: null,
        };

        appendSystemChat(lobby, `${session.username} opened a ${maxPlayers}-player Ludo table.`);
        lobbies.set(lobbyId, lobby);
        session.lobbyId = lobbyId;

        if (autoStart && lobby.players.length >= 2) {
          startLobbyMatch(lobby);
        } else {
          sendJson(ws, 'lobby:state', toLobbyDetail(lobby));
          broadcastLobbyList();
          broadcastPresence();
        }
        return;
      }

      if (msg.type === 'lobby:join') {
        const lobbyId = sanitizeStr(p.lobbyId, 64);
        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
          sendJson(ws, 'error', { message: 'Room no longer exists.' });
          return;
        }
        if (lobby.isPrivate && lobby.accessCode && lobby.hostId !== session.uid) {
          const code = sanitizeStr(p.accessCode, 16);
          if (code !== lobby.accessCode) {
            sendJson(ws, 'error', { message: 'Invalid room access code.' });
            return;
          }
        }
        if (session.lobbyId && session.lobbyId !== lobbyId) {
          removeUserFromLobby(session.uid, session.lobbyId);
        }

        const existingPlayer = lobby.players.find((pl) => pl.uid === session.uid);
        if (!existingPlayer) {
          if (lobby.players.length < lobby.maxPlayers && lobby.status === 'waiting') {
            const slot = (lobby.players.length + 1) as LudoSlot;
            lobby.players.push({
              uid: session.uid,
              username: session.username,
              avatar: session.avatar,
              rating: session.rating,
              ready: false,
              slot,
              ludoColor: getLudoColorForSlot(slot, lobby.maxPlayers),
              isGuest: session.isGuest,
            });
            if (session.isGuest) {
              lobby.isRanked = false;
            }
            rebalanceLobbySlots(lobby);
            appendSystemChat(lobby, `${session.username} joined the table.`);
          } else if (lobby.allowSpectators) {
            if (!lobby.spectators.some((sp) => sp.uid === session.uid)) {
              lobby.spectators.push({ uid: session.uid, username: session.username });
              appendSystemChat(lobby, `${session.username} is watching.`);
            }
          } else {
            sendJson(ws, 'error', { message: 'Table is full.' });
            return;
          }
        }

        session.lobbyId = lobbyId;
        broadcastLobbyDetail(lobby);
        broadcastLobbyList();
        broadcastPresence();
        return;
      }

      if (msg.type === 'lobby:leave') {
        if (session.lobbyId) {
          removeUserFromLobby(session.uid, session.lobbyId);
          session.lobbyId = null;
          sendJson(ws, 'lobby:left', {});
          broadcastPresence();
        }
        return;
      }

      if (msg.type === 'lobby:customize' && session.lobbyId) {
        const lobby = lobbies.get(session.lobbyId);
        if (!lobby || lobby.hostId !== session.uid || lobby.status === 'in_progress') return;

        if (typeof p.name === 'string' && sanitizeStr(p.name, 48)) {
          lobby.name = sanitizeStr(p.name, 48);
        }
        const rawMax = Number(p.maxPlayers);
        if (rawMax === 2 || rawMax === 3 || rawMax === 4 || rawMax === 5 || rawMax === 6) {
          const humanCount = lobby.players.filter((pl) => !pl.isCpu).length;
          if (rawMax >= humanCount) {
            lobby.maxPlayers = rawMax;
          }
        }
        if (p.turnTimeSec === 10 || p.turnTimeSec === 15 || p.turnTimeSec === 30) {
          lobby.turnTimeSec = p.turnTimeSec;
        }
        const anyGuest = lobby.players.some((pl) => pl.isGuest);
        if (typeof p.isRanked === 'boolean' && !lobby.soloPractice && !anyGuest) {
          lobby.isRanked = p.isRanked;
        }
        if (typeof p.soloPractice === 'boolean' && lobby.status === 'waiting') {
          lobby.soloPractice = p.soloPractice;
          lobby.players = lobby.players.filter((pl) => !pl.isCpu);
          if (p.soloPractice) {
            lobby.isRanked = false;
            const needed = Math.max(1, lobby.maxPlayers - lobby.players.length);
            for (let c = 1; c <= needed && lobby.players.length < lobby.maxPlayers; c++) {
              const slot = (lobby.players.length + 1) as LudoSlot;
              lobby.players.push({
                uid: `cpu-bot-${c}`,
                username: needed === 1 ? 'CPU Master' : `CPU ${c}`,
                avatar: 'emblem-slate',
                rating: 1200,
                ready: true,
                slot,
                ludoColor: getLudoColorForSlot(slot, lobby.maxPlayers),
                isCpu: true,
              });
            }
          }
        }
        rebalanceLobbySlots(lobby);

        appendSystemChat(lobby, `Table updated: ${lobby.maxPlayers} Players.`);
        broadcastLobbyDetail(lobby);
        broadcastLobbyList();
        return;
      }

      if (msg.type === 'lobby:ready' && session.lobbyId) {
        const lobby = lobbies.get(session.lobbyId);
        if (!lobby || lobby.status !== 'waiting') return;
        const player = lobby.players.find((pl) => pl.uid === session.uid);
        if (!player) return;
        player.ready = typeof p.ready === 'boolean' ? p.ready : !player.ready;
        broadcastLobbyDetail(lobby);
        return;
      }

      if (msg.type === 'lobby:start' && session.lobbyId) {
        const lobby = lobbies.get(session.lobbyId);
        if (!lobby || lobby.hostId !== session.uid) return;
        if (lobby.players.length < 2) {
          sendJson(ws, 'error', { message: 'Need at least 2 players (or Fill with CPU) to start.' });
          return;
        }
        startLobbyMatch(lobby);
        return;
      }

      if (msg.type === 'lobby:rematch' && session.lobbyId) {
        const lobby = lobbies.get(session.lobbyId);
        if (!lobby || lobby.status !== 'finished') return;
        if (lobby.players.length < 2) return;
        startLobbyMatch(lobby);
        return;
      }

      if (msg.type === 'game:roll' && session.lobbyId) {
        const lobby = lobbies.get(session.lobbyId);
        if (!lobby || lobby.status !== 'in_progress' || !lobby.gameState) return;
        if (lobby.isLocalPassPlay && lobby.hostId === session.uid) {
          const activeP = lobby.players.find((pl) => pl.slot === lobby.gameState!.turnSlot);
          if (activeP && !activeP.isCpu) {
            handleRollDice(lobby, activeP.slot);
          }
          return;
        }
        const player = lobby.players.find((pl) => pl.uid === session.uid);
        if (!player) return;
        handleRollDice(lobby, player.slot);
        return;
      }

      if (msg.type === 'game:move' && session.lobbyId) {
        const lobby = lobbies.get(session.lobbyId);
        if (!lobby || lobby.status !== 'in_progress' || !lobby.gameState) return;
        if (typeof p.tokenIndex !== 'number') return;
        if (lobby.isLocalPassPlay && lobby.hostId === session.uid) {
          const activeP = lobby.players.find((pl) => pl.slot === lobby.gameState!.turnSlot);
          if (activeP && !activeP.isCpu) {
            handleMoveToken(lobby, activeP.slot, p.tokenIndex);
          }
          return;
        }
        const player = lobby.players.find((pl) => pl.uid === session.uid);
        if (!player) return;
        handleMoveToken(lobby, player.slot, p.tokenIndex);
        return;
      }

      if (msg.type === 'chat:send' && session.lobbyId) {
        const lobby = lobbies.get(session.lobbyId);
        const text = sanitizeStr(p.text, 280);
        if (!lobby || !text) return;
        const chatMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          senderId: session.uid,
          senderName: session.username,
          text,
          timestamp: Date.now(),
          channel: 'lobby',
        };
        lobby.chatMessages = [...lobby.chatMessages.slice(-79), chatMsg];
        broadcastLobbyDetail(lobby);
        return;
      }

      if (msg.type === 'invite:send') {
        const recipientId = sanitizeStr(p.recipientId, 128);
        const lobbyId = sanitizeStr(p.lobbyId, 64);
        const lobbyName = sanitizeStr(p.lobbyName, 48) || 'Ludo Table';
        if (!recipientId || !lobbyId) return;
        const evt: RealtimePushEvent = {
          id: `inv-${Date.now()}`,
          type: 'match_invite',
          title: `Ludo invite from ${session.username}`,
          body: `Join "${lobbyName}" now`,
          senderId: session.uid,
          senderName: session.username,
          lobbyId,
          timestamp: Date.now(),
        };
        sendToUser(recipientId, 'push:event', evt);
        return;
      }
    });

    ws.on('close', () => {
      const session = sessions.get(ws);
      sessions.delete(ws);
      if (session) {
        const stillConnected = Array.from(sessions.values()).some((s) => s.uid === session.uid);
        if (!stillConnected && session.lobbyId) {
          const lobby = lobbies.get(session.lobbyId);
          if (lobby && lobby.status === 'in_progress') {
            const uid = session.uid;
            const lobbyId = session.lobbyId;
            clearPendingDisconnect(uid, lobbyId);
            const timer = setTimeout(() => {
              pendingDisconnectTimers.delete(`${uid}:${lobbyId}`);
              const activeAgain = Array.from(sessions.values()).some((s) => s.uid === uid);
              if (!activeAgain) {
                removeUserFromLobby(uid, lobbyId);
                broadcastPresence();
              }
            }, 15000);
            pendingDisconnectTimers.set(`${uid}:${lobbyId}`, timer);
          } else {
            removeUserFromLobby(session.uid, session.lobbyId);
          }
        }
        broadcastPresence();
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Ausa Ludo Master server running on http://0.0.0.0:${PORT}`);
  });
}

void main();
