import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type {
  LobbyDetail,
  LobbySummary,
  MapTheme,
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
}

export function useWebSocket({
  user,
  profile,
  guestName,
  pushEnabled,
  onPushEvent,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const onPushRef = useRef(onPushEvent);
  const pushEnabledRef = useRef(pushEnabled);
  const userRef = useRef(user);
  const profileRef = useRef(profile);
  const guestNameRef = useRef(guestName);

  onPushRef.current = onPushEvent;
  pushEnabledRef.current = pushEnabled;
  userRef.current = user;
  profileRef.current = profile;
  guestNameRef.current = guestName;

  const [connected, setConnected] = useState(false);
  const [clientUid, setClientUid] = useState<string | null>(null);
  const [isGuestSession, setIsGuestSession] = useState(true);
  const [lobbies, setLobbies] = useState<LobbySummary[]>([]);
  const [activeLobby, setActiveLobby] = useState<LobbyDetail | null>(null);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [wsError, setWsError] = useState<string | null>(null);

  const sendRaw = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
      return true;
    }
    return false;
  }, []);

  const syncAuthOverSocket = useCallback(async (ws: WebSocket) => {
    const currentUser = userRef.current;
    const currentProfile = profileRef.current;
    if (!currentUser) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'auth:guest',
            payload: { username: guestNameRef.current.trim() },
          })
        );
      }
      return;
    }
    try {
      const token = await currentUser.getIdToken();
      const avatar =
        currentProfile?.avatarCode === 'google' && currentProfile.photoUrl
          ? currentProfile.photoUrl
          : currentProfile?.avatarCode || 'emblem-cobalt';
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'auth',
            payload: {
              token,
              username: currentProfile?.username || currentUser.displayName || 'Player',
              avatar,
              rating: currentProfile?.rating ?? 1200,
              platform: currentProfile?.preferredPlatform ?? 'Cross-Play',
            },
          })
        );
      }
    } catch {
      // keep existing session if token fetch fails
    }
  }, []);

  // Connect WebSocket once on mount; never tear down on profile updates
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
        void syncAuthOverSocket(ws);
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
          case 'push:event': {
            const evt = msg.payload as RealtimePushEvent;
            soundFx.notify();
            if (
              pushEnabledRef.current &&
              'Notification' in window &&
              Notification.permission === 'granted'
            ) {
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
        if (disposed) return;
        const delay = Math.min(6000, 700 * Math.pow(1.4, reconnectAttemptRef.current));
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
  }, [syncAuthOverSocket]);

  // Sync auth / profile changes over already-open socket without disconnecting
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (user && isGuestSession) {
      void syncAuthOverSocket(ws);
    } else if (!user && !isGuestSession) {
      void syncAuthOverSocket(ws);
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
      });
    }
  }, [user, isGuestSession, profile, guestName, syncAuthOverSocket, sendRaw]);

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
      isLocalPassPlay?: boolean;
      autoStart?: boolean;
    }) => sendRaw('lobby:create', { ...config, gameMode: 'Ludo' }),
    joinLobby: (lobbyId: string, accessCode = '') =>
      sendRaw('lobby:join', { lobbyId, accessCode }),
    leaveLobby: () => {
      sendRaw('lobby:leave', {});
      setActiveLobby(null);
    },
    customizeLobby: (
      updates: Partial<{
        name: string;
        mapTheme: MapTheme;
        maxPlayers: 2 | 3 | 4 | 5 | 6;
        turnTimeSec: 10 | 15 | 30;
        isRanked: boolean;
        allowSpectators: boolean;
        soloPractice: boolean;
      }>
    ) => sendRaw('lobby:customize', updates),
    toggleReady: (ready: boolean) => sendRaw('lobby:ready', { ready }),
    startMatch: () => sendRaw('lobby:start', {}),
    rematch: () => sendRaw('lobby:rematch', {}),
    rollDice: () => sendRaw('game:roll', {}),
    sendMove: (tokenIndex: number) => sendRaw('game:move', { tokenIndex }),
    sendLobbyChat: (text: string) => sendRaw('chat:send', { text }),
    pushMatchInvite: (recipientId: string, lobbyId: string, lobbyName: string) =>
      sendRaw('invite:send', { recipientId, lobbyId, lobbyName }),
    clearError: () => setWsError(null),
  };

  return {
    connected,
    clientUid: user?.uid ?? clientUid,
    isGuestSession,
    lobbies,
    activeLobby,
    onlinePlayers,
    wsError,
    actions,
  };
}
