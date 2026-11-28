import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { X } from 'lucide-react';
import { auth, googleProvider } from './lib/firebase';
import {
  ensurePlayerProfile,
  recordCompletedMatch,
  subscribeLeaderboard,
  subscribeOwnMatches,
  updatePlayerPrivatePreferences,
  updatePlayerProfileDetails,
} from './lib/firestoreService';
import { setSoundEnabled } from './lib/sound';
import { useWebSocket } from './hooks/useWebSocket';
import type {
  LobbyDetail,
  MatchRecord,
  PlayerPrivateSettings,
  PlayerProfile,
  RealtimePushEvent,
} from './shared/types';
import { TopNav, type NavSection } from './components/TopNav';
import { LobbiesView } from './components/LobbiesView';
import { LeaderboardView } from './components/LeaderboardView';
import { DashboardView } from './components/DashboardView';

function getInitialGuestName(): string {
  try {
    const saved = window.localStorage.getItem('ausa_guest_name');
    if (saved && saved.trim().length >= 2) return saved.trim().slice(0, 24);
    const generated = `LudoGuest${Math.floor(100 + Math.random() * 900)}`;
    window.localStorage.setItem('ausa_guest_name', generated);
    return generated;
  } catch {
    return 'LudoGuest';
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [privateSettings, setPrivateSettings] = useState<PlayerPrivateSettings | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string>(getInitialGuestName);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem('ausa_dark_mode');
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [soundOn, setSoundOn] = useState<boolean>(true);

  const [activeSection, setActiveSection] = useState<NavSection>('lobbies');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [leaderboard, setLeaderboard] = useState<PlayerProfile[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [toasts, setToasts] = useState<RealtimePushEvent[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      window.localStorage.setItem('ausa_dark_mode', String(darkMode));
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  const handleUpdateGuestName = useCallback((nextName: string) => {
    const clean = nextName.trim().slice(0, 24);
    if (clean.length < 2) return;
    setGuestName(clean);
    try {
      window.localStorage.setItem('ausa_guest_name', clean);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setProfile(null);
        setPrivateSettings(null);
        setMatches([]);
        return;
      }
      try {
        const { profile: prof, settings } = await ensurePlayerProfile({
          uid: nextUser.uid,
          displayName: nextUser.displayName || 'Player',
          email: nextUser.email || '',
          photoUrl: nextUser.photoURL || '',
          darkMode,
        });
        setProfile(prof);
        setPrivateSettings(settings);
        setPushEnabled(settings.pushEnabled);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Unable to load player profile.');
      }
    });
    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubLb = subscribeLeaderboard((list) => {
      setLeaderboard(list);
      if (user) {
        const mine = list.find((p) => p.uid === user.uid);
        if (mine) setProfile(mine);
      }
    });
    return () => unsubLb();
  }, [user]);

  useEffect(() => {
    if (!authReady || !user) return;
    const unsubMatches = subscribeOwnMatches(user.uid, setMatches);
    return () => unsubMatches();
  }, [authReady, user]);

  const addToast = useCallback((evt: RealtimePushEvent) => {
    setToasts((prev) => [evt, ...prev.slice(0, 3)]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== evt.id));
    }, 6500);
  }, []);

  const ws = useWebSocket({
    user,
    profile,
    guestName,
    pushEnabled,
    onPushEvent: addToast,
  });

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in cancelled.');
    }
  };

  const handleSignOut = async () => {
    ws.actions.leaveLobby();
    await signOut(auth);
  };

  const handleToggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (user) {
      void updatePlayerPrivatePreferences(user.uid, { darkMode: next });
    }
  };

  const handleTogglePushNotifications = async () => {
    let next = !pushEnabled;
    if (next && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        next = false;
      } else {
        new Notification('Ausa Ludo Master Alerts Active', {
          body: 'You will receive alerts for room invitations.',
        });
      }
    }
    setPushEnabled(next);
    if (user) {
      await updatePlayerPrivatePreferences(user.uid, { pushEnabled: next });
    }
  };

  const handleInvitePlayer = (
    recipient: { uid: string; username: string },
    lobbyId: string,
    lobbyName: string
  ) => {
    const senderName = profile?.username || guestName;
    const senderId = ws.clientUid || 'guest';
    ws.actions.pushMatchInvite(recipient.uid, lobbyId, lobbyName);
    addToast({
      id: `sent-${Date.now()}`,
      type: 'match_invite',
      title: 'Invitation Sent',
      body: `Invited ${recipient.username} to ${lobbyName}`,
      senderId,
      senderName,
      timestamp: Date.now(),
    });
  };

  const handleMatchCompleted = useCallback(
    async (lobby: LobbyDetail) => {
      if (
        !user ||
        !profile ||
        ws.isGuestSession ||
        !lobby.lastOutcome ||
        lobby.lastOutcome.hasCpu ||
        lobby.isLocalPassPlay ||
        !lobby.lastOutcome.playerIds.includes(profile.uid)
      ) {
        return;
      }
      try {
        await recordCompletedMatch(profile, lobby.lastOutcome);
      } catch {
        // Error already structured via handleFirestoreError
      }
    },
    [user, profile, ws.isGuestSession]
  );

  const activeDisplayName = profile?.username || guestName;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#071126] text-slate-900 dark:text-slate-100 pb-16 md:pb-0">
      <TopNav
        activeSection={activeSection}
        onNavigate={(sec) => setActiveSection(sec)}
        onPrimaryAction={() => {
          setActiveSection('lobbies');
          setShowCreateModal(true);
        }}
      />

      {(authError || ws.wsError) && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="rounded-xl border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 flex items-center justify-between gap-4 text-xs text-red-700 dark:text-red-300">
            <span>{authError || ws.wsError}</span>
            <button
              type="button"
              onClick={() => {
                setAuthError(null);
                ws.actions.clearError();
              }}
              aria-label="Dismiss error"
              className="cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 py-5 sm:py-6">
        {activeSection === 'lobbies' && (
          <LobbiesView
            lobbies={ws.lobbies}
            activeLobby={ws.activeLobby}
            onlinePlayers={ws.onlinePlayers}
            profile={profile}
            myUid={ws.clientUid}
            isSignedIn={Boolean(user)}
            displayName={activeDisplayName}
            soundOn={soundOn}
            onToggleSound={() => setSoundOn((v) => !v)}
            showCreateModal={showCreateModal}
            onCloseCreateModal={() => setShowCreateModal(false)}
            onOpenCreateModal={() => setShowCreateModal(true)}
            onRequestSignIn={() => void handleSignIn()}
            onCreateLobby={ws.actions.createLobby}
            onJoinLobby={ws.actions.joinLobby}
            onLeaveLobby={ws.actions.leaveLobby}
            onCustomizeLobby={ws.actions.customizeLobby}
            onToggleReady={ws.actions.toggleReady}
            onStartMatch={ws.actions.startMatch}
            onRematch={ws.actions.rematch}
            onRollDice={ws.actions.rollDice}
            onMoveToken={ws.actions.sendMove}
            onSendChat={ws.actions.sendLobbyChat}
            onInvitePlayer={handleInvitePlayer}
            onMatchCompleted={(lobby) => void handleMatchCompleted(lobby)}
          />
        )}

        {activeSection === 'leaderboard' && (
          <LeaderboardView players={leaderboard} currentUid={user?.uid ?? null} />
        )}

        {activeSection === 'dashboard' && (
          <DashboardView
            profile={profile}
            privateSettings={privateSettings}
            matches={matches}
            isSignedIn={Boolean(user)}
            guestName={guestName}
            onUpdateGuestName={handleUpdateGuestName}
            darkMode={darkMode}
            pushEnabled={pushEnabled}
            onToggleDarkMode={handleToggleDarkMode}
            onTogglePushNotifications={() => void handleTogglePushNotifications()}
            onRequestSignIn={() => void handleSignIn()}
            onSignOut={() => void handleSignOut()}
            onSaveProfile={async (updates) => {
              if (!user) return;
              await updatePlayerProfileDetails(user.uid, updates);
            }}
          />
        )}
      </main>

      {toasts.length > 0 && (
        <div className="fixed bottom-16 md:bottom-5 right-4 z-50 space-y-2 max-w-xs w-full pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto rounded-xl border border-slate-200 dark:border-[#1B2E54] bg-white dark:bg-[#0D1A35] shadow-lg p-3.5 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white">{t.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                  {t.body}
                </p>
                {t.lobbyId && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection('lobbies');
                      ws.actions.joinLobby(t.lobbyId!);
                      setToasts((prev) => prev.filter((item) => item.id !== t.id));
                    }}
                    className="mt-2 px-2.5 py-1 text-xs font-bold rounded-md bg-amber-500 text-slate-950 cursor-pointer"
                  >
                    Join Room
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                aria-label="Close notification"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
