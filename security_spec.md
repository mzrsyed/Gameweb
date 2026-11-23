# Security Specification & Threat Model

## 1. Data Invariants
1. **PII Isolation**: Email addresses and private settings live strictly in `/playerPrivate/{uid}` and are readable/writable only by `request.auth.uid == uid`. `/players/{uid}` contains zero PII.
2. **Identity Integrity**: Every write operation enforces `email_verified == true` and verifies that `uid`, `authorId`, `senderId`, or `recordedBy` strictly matches `request.auth.uid`.
3. **Stat Progression Bounds**: New player profiles must initialize at `rating == 1200`, `wins == 0`, `losses == 0`, `draws == 0`, `matchesPlayed == 0`. Updates can only increment `matchesPlayed` by 1 and enforce `matchesPlayed == wins + losses + draws`.
4. **Immutable Match History**: Once a `/matches/{matchId}` record is created by a participant, it cannot be updated or deleted.
5. **Atomic Social Likes**: Creating or deleting `/feedPosts/{postId}/likes/{uid}` requires an atomic batch updating `likeCount` on `/feedPosts/{postId}` by `+1` or `-1` verified via `getAfter` and `existsAfter`.
6. **Query Scoping**: All `list` operations on `/matches`, `/friendships`, `/directMessages`, and `/notifications` evaluate `resource.data` directly against `request.auth.uid` so unauthorized scraping is blocked at the rule level.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Shadow Field Injection on Player Create**: `{ ..., "isAdmin": true }` -> Blocked by `keys().hasOnly(...)`.
2. **Initial Rating Spoofing**: Creating `/players/{uid}` with `rating: 4999, wins: 500` -> Blocked by initial zero-stats & 1200 ELO check.
3. **Cross-User Profile Hijack**: Updating `/players/{otherUid}` while signed in as `attackerUid` -> Blocked by `isOwner(uid)`.
4. **PII Cross-Read**: `get(/playerPrivate/{otherUid})` by non-owner -> Blocked by `isOwner(uid)`.
5. **Unverified Email Write**: Creating a feed post with `email_verified: false` -> Blocked by `isVerifiedUser()`.
6. **Timestamp Spoofing**: Creating a match with `playedAt` set to a backdated client timestamp instead of `request.time` -> Blocked by `incoming().playedAt == request.time`.
7. **ID Poisoning**: Creating `/feedPosts/${'a'.repeat(500)}` or non-alphanumeric ID `../admin` -> Blocked by `isValidId()`.
8. **Orphaned Like Counter Inflation**: Updating `/feedPosts/{postId}` `likeCount` +1 without creating `/likes/{uid}` in the same batch -> Blocked by `existsAfter(...)`.
9. **DM Eavesdropping List Query**: Listing `/directMessages` without filtering `participants array-contains auth.uid` -> Blocked by `request.auth.uid in resource.data.participants`.
10. **Sender Impersonation in DM**: Creating `/directMessages/{dmId}` with `senderId: otherUid` -> Blocked by `incoming().senderId == request.auth.uid`.
11. **Notification Tampering by Sender**: Updating or deleting another user's `/notifications/{notifId}` -> Blocked by `resource.data.recipientId == request.auth.uid`.
12. **Friendship Status Downgrade**: Updating an `accepted` friendship back to `pending` -> Blocked by state transition lock.
