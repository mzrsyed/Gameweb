import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type {
  ChatMessage,
  GameMode,
  LobbyDetail,
  LobbySummary,
  MapTheme,
  MatchmakingStatus,
  OnlinePlayer,
  PlayerProfile,
  RealtimePushEvent,
} from '../shared/types';
import { soundFx } from '../lib/sound';

interface UseWebSocketOptions {
  user: User | null;
  profile: PlayerProfile | null;
  guestName: string;
  pushEnabled: boolean;
  onPushEvent?: (evt: RealtimePushEvent) => void;
  onMatchFound?: (lobbyId: string) => void;
}

export function useWebSocket({
  user,
  profile,
  guestName,
  pushEnabled,
  onPushEvent,
  onMatchFound,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const onPushRef = useRef(onPushEvent);
  const onMatchFoundRef = useRef(onMatchFound);
  const pushEnabledRef = useRef(pushEnabled);
  const guestNameRef = useRef(guestName);

  onPushRef.current = onPushEvent;
  onMatchFoundRef.current = onMatchFound;
  pushEnabledRef.current = pushEnabled;
  guestNameRef.current = guestName;

  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [clientUid, setClientUid] = useState<string | null>(null);
  const [isGuestSession, setIsGuestSession] = useState(true);
  const [lobbies, setLobbies] = useState<LobbySummary[]>([]);
  const [activeLobby, setActiveLobby] = useState<LobbyDetail | null>(null);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [loungeMessages, setLoungeMessages] = useState<ChatMessage[]>([]);
  const [matchmaking, setMatchmaking] = useState<MatchmakingStatus>({
    inQueue: false,
    gameMode: 'Ludo',
    mapTheme: 'Obsidian Grid',
    maxPlayers: 2,
    isRanked: false,
    joinedAt: null,
    queueSize: 0,
  });
  const [wsError, setWsError] = useState<string | null>(null);

  const sendRaw = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
      return true;
    }
    return false;
  }, []);

  const authenticateSocket = useCallback(
    async (ws: WebSocket) => {
      if (!user) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'auth:guest',
              payload: {
                username: guestNameRef.current.trim(),
                platform: 'Cross-Play',
              },
            })
          );
        }
        return;
      }
      try {
        const token = await user.getIdToken();
        const avatar =
          profile?.avatarCode === 'google' && profile.photoUrl
            ? profile.photoUrl
            : profile?.avatarCode || 'emblem-cobalt';
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'auth',
              payload: {
                token,
                username: profile?.username || user.displayName || 'Player',
                avatar,
                rating: profile?.rating ?? 1200,
                platform: profile?.preferredPlatform ?? 'Desktop',
              },
            })
          );
        }
      } catch {
        setAuthenticated(false);
      }
    },
    [user, profile?.username, profile?.avatarCode, profile?.photoUrl, profile?.rating, profile?.preferredPlatform]
  );

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        reconnectAttemptRef.current = 0;
        setConnected(true);
        setWsError(null);
        void authenticateSocket(ws);
      };

      ws.onmessage = (event) => {
        let msg: { type?: string; payload?: unknown };
        try {
          msg = JSON.parse(event.data as string) as { type?: string; payload?: unknown };
        } catch {
          return;
        }
        if (!msg.type) return;

        switch (msg.type) {
          case 'auth:ok': {
            const authInfo = msg.payload as { uid: string; isGuest?: boolean };
            setClientUid(authInfo.uid);
            setIsGuestSession(Boolean(authInfo.isGuest));
            setAuthenticated(true);
            break;
          }
          case 'lobby:list':
            setLobbies(Array.isArray(msg.payload) ? (msg.payload as LobbySummary[]) : []);
            break;
          case 'lobby:state':
            setActiveLobby(msg.payload as LobbyDetail);
            break;
          case 'lobby:left':
            setActiveLobby(null);
            break;
          case 'presence:list':
            setOnlinePlayers(Array.isArray(msg.payload) ? (msg.payload as OnlinePlayer[]) : []);
            break;
          case 'lounge:history':
            if (Array.isArray(msg.payload)) {
              setLoungeMessages(msg.payload as ChatMessage[]);
            }
            break;
          case 'lounge:message': {
            const incoming = msg.payload as ChatMessage;
            setLoungeMessages((prev) => {
              if (prev.some((m) => m.id === incoming.id)) return prev;
              return [...prev.slice(-59), incoming];
            });
            break;
          }
          case 'matchmaking:status':
            setMatchmaking(msg.payload as MatchmakingStatus);
            break;
          case 'matchmaking:found': {
            const found = msg.payload as { lobbyId: string; gameMode: GameMode };
            soundFx.matchFound();
            if (pushEnabledRef.current && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('Match Found — Ausa Ludo Master', {
                body: `Joining ${found.gameMode} board now.`,
              });
            }
            onMatchFoundRef.current?.(found.lobbyId);
            break;
          }
          case 'push:event': {
            const evt = msg.payload as RealtimePushEvent;
            soundFx.notify();
            if (pushEnabledRef.current && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(evt.title, { body: evt.body });
            }
            onPushRef.current?.(evt);
            break;
          }
          case 'error': {
            const errPayload = msg.payload as { message?: string };
            setWsError(errPayload?.message || 'Action rejected by server.');
            break;
          }
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setAuthenticated(false);
        if (disposed) return;
        const delay = Math.min(8000, 800 * Math.pow(1.5, reconnectAttemptRef.current));
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [authenticateSocket]);

  // Sync auth / profile changes over open socket
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (user && isGuestSession) {
      void authenticateSocket(ws);
    } else if (!user && !isGuestSession) {
      void authenticateSocket(ws);
    } else if (user && profile) {
      const avatar =
        profile.avatarCode === 'google' && profile.photoUrl
          ? profile.photoUrl
          : profile.avatarCode;
      sendRaw('profile:sync', {
        username: profile.username,
        avatar,
        rating: profile.rating,
        platform: profile.preferredPlatform,
      });
    } else if (!user && guestName.trim()) {
      sendRaw('profile:sync', {
        username: guestName.trim().slice(0, 24),
        platform: 'Cross-Play',
      });
    }
  }, [user, isGuestSession, profile, guestName, authenticateSocket, sendRaw]);

  const actions = {
    createLobby: (config: {
      name: string;
      mapTheme: MapTheme;
      maxPlayers: 2 | 3 | 4 | 5 | 6;
      turnTimeSec: 10 | 15 | 30;
      isRanked: boolean;
      isPrivate: boolean;
      accessCode: string;
      allowSpectators: boolean;
      soloPractice: boolean;
    }) => sendRaw('lobby:create', { ...config, gameMode: 'Ludo' }),
    joinLobby: (lobbyId: string, accessCode = '') => sendRaw('lobby:join', { lobbyId, accessCode }),
    leaveLobby: () => {
      sendRaw('lobby:leave', {});
      setActiveLobby(null);
    },
    customizeLobby: (updates: Partial<{
      name: string;
      mapTheme: MapTheme;
      maxPlayers: 2 | 3 | 4 | 5 | 6;
      turnTimeSec: 10 | 15 | 30;
      isRanked: boolean;
      allowSpectators: boolean;
      soloPractice: boolean;
    }>) => sendRaw('lobby:customize', updates),
    toggleReady: (ready: boolean) => sendRaw('lobby:ready', { ready }),
    startMatch: () => sendRaw('lobby:start', {}),
    rematch: () => sendRaw('lobby:rematch', {}),
    rollDice: () => sendRaw('game:roll', {}),
    sendMove: (tokenIndex: number) => sendRaw('game:move', { tokenIndex }),
    sendLobbyChat: (text: string) => sendRaw('chat:send', { text }),
    sendLoungeChat: (text: string) => sendRaw('lounge:send', { text }),
    joinMatchmaking: (opts: { mapTheme: MapTheme; maxPlayers: 2 | 4 | 6; isRanked: boolean }) =>
      sendRaw('matchmaking:join', opts),
    leaveMatchmaking: () => sendRaw('matchmaking:leave', {}),
    pushMatchInvite: (recipientId: string, lobbyId: string, lobbyName: string) =>
      sendRaw('invite:send', { recipientId, lobbyId, lobbyName }),
    clearError: () => setWsError(null),
  };

  return {
    connected,
    authenticated,
    clientUid: user?.uid ?? clientUid,
    isGuestSession,
    lobbies,
    activeLobby,
    onlinePlayers,
    loungeMessages,
    matchmaking,
    wsError,
    actions,
  };
}
