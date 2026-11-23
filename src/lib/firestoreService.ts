import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  ACHIEVEMENTS_CATALOG,
  type AvatarCode,
  type DirectMessage,
  type FeedPost,
  type Friendship,
  type MatchOutcomeSummary,
  type MatchRecord,
  type PlatformCode,
  type PlayerNotification,
  type PlayerPrivateSettings,
  type PlayerProfile,
  type RegionCode,
} from '../shared/types';

function makeSafeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getPairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

export async function ensurePlayerProfile(params: {
  uid: string;
  displayName: string;
  email: string;
  photoUrl: string;
  darkMode: boolean;
}): Promise<{ profile: PlayerProfile; settings: PlayerPrivateSettings }> {
  const playerPath = `players/${params.uid}`;
  const privatePath = `playerPrivate/${params.uid}`;

  let profile: PlayerProfile;
  try {
    const snap = await getDoc(doc(db, 'players', params.uid));
    if (snap.exists()) {
      profile = snap.data() as PlayerProfile;
    } else {
      const cleanName = (params.displayName || 'Player').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 24);
      const username = cleanName.length >= 2 ? cleanName : 'ArenaPlayer';
      const safePhoto = params.photoUrl.startsWith('https://') ? params.photoUrl.slice(0, 512) : '';
      const newProfile: PlayerProfile = {
        uid: params.uid,
        username,
        bio: 'Cross-platform competitor on Gridline.',
        region: 'Global',
        preferredPlatform: 'Cross-Play',
        avatarCode: safePhoto ? 'google' : 'emblem-cobalt',
        photoUrl: safePhoto,
        rating: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        matchesPlayed: 0,
        winStreak: 0,
        bestStreak: 0,
        xp: 0,
        achievements: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'players', params.uid), newProfile);
      profile = newProfile;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, playerPath);
  }

  let settings: PlayerPrivateSettings;
  try {
    const privSnap = await getDoc(doc(db, 'playerPrivate', params.uid));
    if (privSnap.exists()) {
      settings = privSnap.data() as PlayerPrivateSettings;
    } else {
      const newPriv: PlayerPrivateSettings = {
        uid: params.uid,
        email: (params.email || '').slice(0, 160),
        pushEnabled: false,
        darkMode: params.darkMode,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'playerPrivate', params.uid), newPriv);
      settings = newPriv;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, privatePath);
  }

  return { profile, settings };
}

export async function updatePlayerProfileDetails(
  uid: string,
  updates: {
    username: string;
    bio: string;
    region: RegionCode;
    preferredPlatform: PlatformCode;
    avatarCode: AvatarCode;
    photoUrl: string;
  }
) {
  const path = `players/${uid}`;
  try {
    const cleanName = updates.username.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 24);
    await updateDoc(doc(db, 'players', uid), {
      username: cleanName.length >= 2 ? cleanName : 'Player',
      bio: updates.bio.trim().slice(0, 160),
      region: updates.region,
      preferredPlatform: updates.preferredPlatform,
      avatarCode: updates.avatarCode,
      photoUrl: updates.photoUrl.startsWith('https://') ? updates.photoUrl.slice(0, 512) : '',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updatePlayerPrivatePreferences(
  uid: string,
  updates: { pushEnabled?: boolean; darkMode?: boolean }
) {
  const path = `playerPrivate/${uid}`;
  try {
    await updateDoc(doc(db, 'playerPrivate', uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function recordCompletedMatch(
  profile: PlayerProfile,
  outcome: MatchOutcomeSummary
): Promise<{ updatedAchievements: string[]; ratingDelta: number }> {
  const foundIdx = outcome.playerIds.indexOf(profile.uid);
  const slotIndex = foundIdx >= 0 ? foundIdx : 0;
  const ratingDelta = outcome.ratingDeltas[slotIndex] ?? 0;
  const isWin = outcome.winnerId === profile.uid;
  const isDraw = outcome.winnerId === 'draw';

  const matchPath = `matches/${outcome.matchId}`;
  const cleanMatchId = outcome.matchId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  try {
    const matchDoc: MatchRecord = {
      matchId: cleanMatchId,
      lobbyName: outcome.lobbyName.slice(0, 64) || 'Arena Match',
      gameMode: outcome.gameMode,
      mapTheme: outcome.mapTheme,
      isRanked: outcome.isRanked,
      playerIds: outcome.playerIds,
      playerNames: outcome.playerNames.map((n) => n.slice(0, 32)),
      scores: outcome.scores,
      winnerId: outcome.winnerId,
      recordedBy: profile.uid,
      durationSec: Math.max(1, Math.min(7200, outcome.durationSec)),
      playedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'matches', cleanMatchId), matchDoc);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, matchPath);
  }

  const newWins = profile.wins + (isWin ? 1 : 0);
  const newLosses = profile.losses + (!isWin && !isDraw ? 1 : 0);
  const newDraws = profile.draws + (isDraw ? 1 : 0);
  const newMatches = newWins + newLosses + newDraws;
  const newStreak = isWin ? profile.winStreak + 1 : 0;
  const newBestStreak = Math.max(profile.bestStreak, newStreak);
  const newRating = Math.max(100, Math.min(5000, profile.rating + ratingDelta));
  const xpGain = isWin ? 120 : isDraw ? 70 : 40;

  const unlocked = new Set(profile.achievements);
  if (newMatches >= 1) unlocked.add('first_match');
  if (newWins >= 1) unlocked.add('first_victory');
  if (newStreak >= 3) unlocked.add('streak_3');
  if (newMatches >= 10) unlocked.add('veteran_10');
  if (newRating >= 1300) unlocked.add('rating_1300');

  const validAchievements = Array.from(unlocked)
    .filter((id) => ACHIEVEMENTS_CATALOG.some((a) => a.id === id))
    .slice(0, 20);

  const playerPath = `players/${profile.uid}`;
  try {
    await updateDoc(doc(db, 'players', profile.uid), {
      rating: newRating,
      wins: newWins,
      losses: newLosses,
      draws: newDraws,
      matchesPlayed: newMatches,
      winStreak: newStreak,
      bestStreak: newBestStreak,
      xp: Math.min(10000000, profile.xp + xpGain),
      achievements: validAchievements,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, playerPath);
  }

  return { updatedAchievements: validAchievements, ratingDelta };
}

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function subscribeLeaderboard(
  onData: (players: PlayerProfile[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'players'),
    where('rating', '>=', 100),
    orderBy('rating', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as PlayerProfile)
        .sort((a, b) => b.rating - a.rating || b.wins - a.wins);
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'players')
  );
}

export function subscribeOwnMatches(
  uid: string,
  onData: (matches: MatchRecord[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'matches'),
    where('playerIds', 'array-contains', uid),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as MatchRecord)
        .sort((a, b) => toMillis(b.playedAt) - toMillis(a.playedAt));
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'matches')
  );
}

export function subscribeFeedPosts(onData: (posts: FeedPost[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'feedPosts'),
    where('visibility', '==', 'public'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as FeedPost)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'feedPosts')
  );
}

export async function createFeedPost(
  profile: PlayerProfile,
  input: {
    caption: string;
    matchMode: string;
    mapTheme: string;
    outcome: FeedPost['outcome'];
    scoreSummary: string;
    ratingDelta: number;
  }
) {
  const postId = makeSafeId('post');
  const avatar =
    profile.avatarCode === 'google' && profile.photoUrl.startsWith('https://')
      ? profile.photoUrl
      : profile.avatarCode;
  const post: FeedPost = {
    postId,
    authorId: profile.uid,
    authorName: profile.username.slice(0, 32),
    authorAvatar: avatar.slice(0, 512),
    caption: input.caption.trim().slice(0, 280),
    matchMode: input.matchMode.slice(0, 40) || 'Arena',
    mapTheme: input.mapTheme.slice(0, 40) || 'Obsidian Grid',
    outcome: input.outcome,
    scoreSummary: input.scoreSummary.slice(0, 48) || '0 - 0',
    ratingDelta: Math.max(-100, Math.min(100, Math.round(input.ratingDelta))),
    visibility: 'public',
    likeCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'feedPosts', postId), post);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `feedPosts/${postId}`);
  }
}

export async function toggleFeedLike(post: FeedPost, uid: string): Promise<boolean> {
  const likeRef = doc(db, 'feedPosts', post.postId, 'likes', uid);
  const postRef = doc(db, 'feedPosts', post.postId);

  try {
    const existing = await getDoc(likeRef);
    const batch = writeBatch(db);
    if (existing.exists()) {
      batch.delete(likeRef);
      batch.update(postRef, {
        likeCount: Math.max(0, post.likeCount - 1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(likeRef, { uid, createdAt: serverTimestamp() });
      batch.update(postRef, {
        likeCount: post.likeCount + 1,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return true;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `feedPosts/${post.postId}/likes/${uid}`);
  }
}

export function subscribeUserLikes(
  uid: string,
  onData: (likedPostIds: Set<string>) => void
): Unsubscribe {
  void uid;
  onData(new Set());
  return () => {};
}

export async function checkUserLikedPosts(postIds: string[], uid: string): Promise<Set<string>> {
  const liked = new Set<string>();
  await Promise.all(
    postIds.map(async (pid) => {
      try {
        const snap = await getDoc(doc(db, 'feedPosts', pid, 'likes', uid));
        if (snap.exists()) liked.add(pid);
      } catch {
        // Ignore single read misses
      }
    })
  );
  return liked;
}

export function subscribeFriendships(
  uid: string,
  onData: (friends: Friendship[]) => void
): Unsubscribe {
  const q = query(collection(db, 'friendships'), where('users', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Friendship));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'friendships')
  );
}

export async function sendFriendRequest(
  me: PlayerProfile,
  target: { uid: string; username: string }
) {
  const pairId = getPairId(me.uid, target.uid);
  const users = me.uid < target.uid ? [me.uid, target.uid] : [target.uid, me.uid];
  const userNames =
    me.uid < target.uid
      ? [me.username.slice(0, 32), target.username.slice(0, 32)]
      : [target.username.slice(0, 32), me.username.slice(0, 32)];

  try {
    await setDoc(doc(db, 'friendships', pairId), {
      pairId,
      users,
      userNames,
      requesterId: me.uid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await createNotification({
      recipientId: target.uid,
      senderId: me.uid,
      senderName: me.username,
      type: 'friend_request',
      title: `Friend request from ${me.username}`,
      body: `${me.username} wants to connect on Gridline.`,
      lobbyId: '',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `friendships/${pairId}`);
  }
}

export async function acceptFriendRequest(pairId: string) {
  try {
    await updateDoc(doc(db, 'friendships', pairId), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `friendships/${pairId}`);
  }
}

export async function removeFriendship(pairId: string) {
  try {
    await deleteDoc(doc(db, 'friendships', pairId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `friendships/${pairId}`);
  }
}

export function subscribeDirectMessages(
  uid: string,
  onData: (msgs: DirectMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'directMessages'),
    where('participants', 'array-contains', uid),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as DirectMessage)
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'directMessages')
  );
}

export async function sendDirectMessage(
  sender: PlayerProfile,
  recipient: { uid: string; username: string },
  text: string
) {
  const dmId = makeSafeId('dm');
  const cleanText = text.trim().slice(0, 500);
  if (!cleanText) return;
  const participants = sender.uid < recipient.uid ? [sender.uid, recipient.uid] : [recipient.uid, sender.uid];

  try {
    await setDoc(doc(db, 'directMessages', dmId), {
      dmId,
      participants,
      senderId: sender.uid,
      senderName: sender.username.slice(0, 32),
      recipientId: recipient.uid,
      recipientName: recipient.username.slice(0, 32),
      text: cleanText,
      read: false,
      createdAt: serverTimestamp(),
    });

    await createNotification({
      recipientId: recipient.uid,
      senderId: sender.uid,
      senderName: sender.username,
      type: 'direct_message',
      title: `Message from ${sender.username}`,
      body: cleanText.slice(0, 180),
      lobbyId: '',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `directMessages/${dmId}`);
  }
}

export function subscribeNotifications(
  uid: string,
  onData: (notifs: PlayerNotification[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'notifications'),
    where('recipientId', '==', uid),
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as PlayerNotification)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
  );
}

export async function createNotification(input: {
  recipientId: string;
  senderId: string;
  senderName: string;
  type: PlayerNotification['type'];
  title: string;
  body: string;
  lobbyId: string;
}) {
  const notifId = makeSafeId('ntf');
  try {
    await setDoc(doc(db, 'notifications', notifId), {
      notifId,
      recipientId: input.recipientId,
      senderId: input.senderId,
      senderName: input.senderName.slice(0, 32),
      type: input.type,
      title: input.title.slice(0, 80),
      body: input.body.slice(0, 200),
      lobbyId: input.lobbyId.slice(0, 64),
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `notifications/${notifId}`);
  }
}

export async function markNotificationRead(notifId: string) {
  try {
    await updateDoc(doc(db, 'notifications', notifId), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notifId}`);
  }
}
