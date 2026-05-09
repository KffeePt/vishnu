import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

if (!admin.apps.length) {
  admin.initializeApp();
}

type AccessRole =
  | 'owner'
  | 'admin'
  | 'maintainer'
  | 'staff'
  | 'dev'
  | 'projectManager'
  | 'senior'
  | 'junior'
  | 'partner'
  | 'user'
  | 'none';

type GlobalTimersRecord = {
  tuiInactivityLock: number;
  authWindowTimeout: number;
  ownerBypassWindow: number;
  tokenRefreshLead: number;
  updatedAt: number;
  updatedBy: string;
  projectInactivityMs?: number;
  browserLoginTimeoutMs?: number;
  ownerBypassTimeoutMs?: number;
  tokenRefreshSkewMs?: number;
  forcedReauthAt?: number;
};

type SessionRecord = {
  sessionId: string;
  uid: string;
  userEmail?: string;
  role: AccessRole;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  revoked: boolean;
  revokedAt?: number;
  revokedBy?: string;
  revokeReason?: string;
  isOwnerBypass: boolean;
  client: 'tui' | 'dashboard' | 'browser' | 'unknown';
  clientLabel?: string;
  projectId?: string;
  machineId?: string;
  terminalId?: string;
  terminalLabel?: string;
};

type SessionValidationResult = {
  valid: boolean;
  reason: 'ok' | 'missing' | 'revoked' | 'expired' | 'inactive' | 'mismatch';
  session: SessionRecord | null;
  now: number;
  remainingMs: number;
};

const RTDB_GLOBAL_TIMERS_PATH = 'globalTimers';
const RTDB_SESSIONS_PATH = 'sessions';
const RTDB_USERS_PATH = 'users';
const FIRESTORE_POLICY_DOC = 'policy/accessControl';
const FIRESTORE_SESSION_LOGS = 'sessionLogs';

const DEFAULT_GLOBAL_TIMERS: GlobalTimersRecord = {
  tuiInactivityLock: 3600,
  authWindowTimeout: 120,
  ownerBypassWindow: 3600,
  tokenRefreshLead: 120,
  updatedAt: 0,
  updatedBy: 'system',
  projectInactivityMs: 3600 * 1000,
  browserLoginTimeoutMs: 120 * 1000,
  ownerBypassTimeoutMs: 3600 * 1000,
  tokenRefreshSkewMs: 120 * 1000,
  forcedReauthAt: 0,
};

const TIMER_LIMITS = {
  tuiInactivityLock: { min: 59, max: 86400 },
  authWindowTimeout: { min: 30, max: 600 },
  ownerBypassWindow: { min: 59, max: 86400 },
  tokenRefreshLead: { min: 30, max: 300 },
};

const DEFAULT_POLICY = {
  maxSessionDuration: 86400,
  maxBypassDuration: 86400,
  updatedAt: 0,
  updatedBy: 'system',
};

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }
  return fallback;
}

function inferRoleFromClaims(claims: Record<string, unknown>): AccessRole {
  if (claims.owner === true || claims.owner === 'master' || claims.role === 'owner') {
    return 'owner';
  }
  if (claims.admin === true || claims.role === 'admin') {
    return 'admin';
  }
  if (claims.role === 'maintainer') {
    return 'maintainer';
  }
  if (claims.staff === true || claims.role === 'staff') {
    return 'staff';
  }
  if (claims.dev === true || claims.role === 'dev') {
    return 'dev';
  }

  const role = typeof claims.role === 'string' ? claims.role.trim() : '';
  if (role === 'projectManager' || role === 'senior' || role === 'junior' || role === 'partner' || role === 'user') {
    return role;
  }

  if (claims.user === true) {
    return 'user';
  }

  return 'none';
}

function isOwnerRole(role: AccessRole): boolean {
  return role === 'owner';
}

function isAdminRole(role: AccessRole): boolean {
  return role === 'owner' || role === 'admin';
}

function normalizeTimers(raw: unknown): GlobalTimersRecord {
  const data = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const next: GlobalTimersRecord = {
    tuiInactivityLock: toFiniteNumber(
      data.tuiInactivityLock,
      Math.max(59, Math.round(toFiniteNumber(data.projectInactivityMs, DEFAULT_GLOBAL_TIMERS.projectInactivityMs || 0) / 1000))
    ),
    authWindowTimeout: toFiniteNumber(
      data.authWindowTimeout,
      Math.max(30, Math.round(toFiniteNumber(data.browserLoginTimeoutMs, DEFAULT_GLOBAL_TIMERS.browserLoginTimeoutMs || 0) / 1000))
    ),
    ownerBypassWindow: toFiniteNumber(
      data.ownerBypassWindow,
      Math.max(59, Math.round(toFiniteNumber(data.ownerBypassTimeoutMs, DEFAULT_GLOBAL_TIMERS.ownerBypassTimeoutMs || 0) / 1000))
    ),
    tokenRefreshLead: toFiniteNumber(
      data.tokenRefreshLead,
      Math.max(30, Math.round(toFiniteNumber(data.tokenRefreshSkewMs, DEFAULT_GLOBAL_TIMERS.tokenRefreshSkewMs || 0) / 1000))
    ),
    updatedAt: toFiniteNumber(data.updatedAt, Date.now()),
    updatedBy: typeof data.updatedBy === 'string' && data.updatedBy.trim() ? data.updatedBy.trim() : 'system',
    forcedReauthAt: toFiniteNumber(data.forcedReauthAt, 0),
  };

  next.tuiInactivityLock = clampWithBounds('tuiInactivityLock', next.tuiInactivityLock);
  next.authWindowTimeout = clampWithBounds('authWindowTimeout', next.authWindowTimeout);
  next.ownerBypassWindow = clampWithBounds('ownerBypassWindow', next.ownerBypassWindow);
  next.tokenRefreshLead = clampWithBounds('tokenRefreshLead', next.tokenRefreshLead);
  next.projectInactivityMs = next.tuiInactivityLock * 1000;
  next.browserLoginTimeoutMs = next.authWindowTimeout * 1000;
  next.ownerBypassTimeoutMs = next.ownerBypassWindow * 1000;
  next.tokenRefreshSkewMs = next.tokenRefreshLead * 1000;
  return next;
}

function clampWithBounds(
  key: keyof typeof TIMER_LIMITS,
  value: number
): number {
  const bounds = TIMER_LIMITS[key];
  if (!Number.isFinite(value)) {
    return bounds.min;
  }
  return Math.max(bounds.min, Math.min(bounds.max, Math.floor(value)));
}

function sanitizeSession(record: SessionRecord, now = Date.now()) {
  return {
    ...record,
    remainingMs: Math.max(0, record.expiresAt - now),
  };
}

async function getTimersRef() {
  return admin.database().ref(RTDB_GLOBAL_TIMERS_PATH);
}

async function getPolicySnapshot() {
  const doc = await admin.firestore().doc(FIRESTORE_POLICY_DOC).get();
  const data = doc.exists ? doc.data() || {} : {};
  return {
    maxSessionDuration: toFiniteNumber(data.maxSessionDuration, DEFAULT_POLICY.maxSessionDuration),
    maxBypassDuration: toFiniteNumber(data.maxBypassDuration, DEFAULT_POLICY.maxBypassDuration),
    updatedAt: toFiniteNumber(data.updatedAt, DEFAULT_POLICY.updatedAt),
    updatedBy: typeof data.updatedBy === 'string' && data.updatedBy.trim() ? data.updatedBy.trim() : DEFAULT_POLICY.updatedBy,
  };
}

async function ensureTimers(): Promise<GlobalTimersRecord> {
  const ref = await getTimersRef();
  const snap = await ref.get();
  const normalized = normalizeTimers(snap.val());
  if (!snap.exists()) {
    await ref.set(normalized);
  }
  return normalized;
}

async function ensurePolicy() {
  const ref = admin.firestore().doc(FIRESTORE_POLICY_DOC);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(DEFAULT_POLICY, { merge: true });
    return { ...DEFAULT_POLICY };
  }
  return await getPolicySnapshot();
}

async function writeSessionLog(params: {
  uid: string;
  sessionId: string;
  event: 'created' | 'touched' | 'expired' | 'revoked' | 'validated';
  actorUid?: string;
  metadata?: Record<string, unknown>;
}) {
  await admin.firestore().collection(FIRESTORE_SESSION_LOGS).add({
    uid: params.uid,
    sessionId: params.sessionId,
    event: params.event,
    actorUid: params.actorUid || params.uid,
    timestamp: Date.now(),
    metadata: params.metadata || {},
  });
}

async function getUserActiveSessionId(uid: string): Promise<string | null> {
  const snap = await admin.database().ref(`${RTDB_USERS_PATH}/${uid}/activeSessionId`).get();
  const value = snap.val();
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function setUserAccessState(uid: string, data: { role: AccessRole; activeSessionId: string; email?: string }) {
  await admin.database().ref(`${RTDB_USERS_PATH}/${uid}`).update({
    role: data.role,
    activeSessionId: data.activeSessionId,
    email: data.email || '',
    updatedAt: Date.now(),
  });
}

async function revokeSessionInternal(sessionId: string, actorUid: string, reason: string, now = Date.now()) {
  const ref = admin.database().ref(`${RTDB_SESSIONS_PATH}/${sessionId}`);
  const snap = await ref.get();
  if (!snap.exists()) {
    return null;
  }

  const current = snap.val() as SessionRecord;
  await ref.update({
    revoked: true,
    revokedAt: now,
    revokedBy: actorUid,
    revokeReason: reason,
    expiresAt: Math.min(toFiniteNumber(current.expiresAt, now), now),
  });

  const activeSessionId = await getUserActiveSessionId(current.uid);
  if (activeSessionId === sessionId) {
    await admin.database().ref(`${RTDB_USERS_PATH}/${current.uid}/activeSessionId`).set(null);
  }

  await writeSessionLog({
    uid: current.uid,
    sessionId,
    event: 'revoked',
    actorUid,
    metadata: { reason },
  });

  return current;
}

async function validateSessionInternal(uid: string, sessionId: string): Promise<SessionValidationResult> {
  const now = Date.now();
  const [timers, activeSessionId, sessionSnap] = await Promise.all([
    ensureTimers(),
    getUserActiveSessionId(uid),
    admin.database().ref(`${RTDB_SESSIONS_PATH}/${sessionId}`).get(),
  ]);

  if (!sessionSnap.exists()) {
    return { valid: false, reason: 'missing', session: null, now, remainingMs: 0 };
  }

  const session = sessionSnap.val() as SessionRecord;
  if (session.uid !== uid || activeSessionId !== sessionId) {
    return { valid: false, reason: 'mismatch', session, now, remainingMs: 0 };
  }

  if (session.revoked) {
    return { valid: false, reason: 'revoked', session, now, remainingMs: 0 };
  }

  if (now >= toFiniteNumber(session.expiresAt, 0)) {
    await revokeSessionInternal(sessionId, uid, 'expired', now);
    return { valid: false, reason: 'expired', session, now, remainingMs: 0 };
  }

  const inactivityLimitMs = timers.tuiInactivityLock * 1000;
  if ((now - toFiniteNumber(session.lastActivity, 0)) >= inactivityLimitMs) {
    await revokeSessionInternal(sessionId, uid, 'inactive-timeout', now);
    return { valid: false, reason: 'inactive', session, now, remainingMs: 0 };
  }

  return {
    valid: true,
    reason: 'ok',
    session,
    now,
    remainingMs: Math.max(0, toFiniteNumber(session.expiresAt, now) - now),
  };
}

async function requireAuthContext(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  }

  const uid = context.auth.uid;
  const email = context.auth.token.email as string | undefined;
  const claims = context.auth.token as Record<string, unknown>;
  const role = inferRoleFromClaims(claims);
  return { uid, email, claims, role };
}

async function verifySessionCookieFromIdToken(idToken: string, expiresInMs: number) {
  return admin.auth().createSessionCookie(idToken, { expiresIn: expiresInMs });
}

export const getAccessBootstrap = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const auth = await requireAuthContext(context);
  const [timers, policy] = await Promise.all([ensureTimers(), ensurePolicy()]);
  const requestedSessionId = typeof data?.sessionId === 'string' ? data.sessionId.trim() : '';
  const validation = requestedSessionId
    ? await validateSessionInternal(auth.uid, requestedSessionId)
    : { valid: false, reason: 'missing' as const, session: null, now: Date.now(), remainingMs: 0 };

  return {
    role: auth.role,
    uid: auth.uid,
    email: auth.email || '',
    timers,
    policy,
    session: validation.session ? sanitizeSession(validation.session, validation.now) : null,
    sessionValid: validation.valid,
    sessionReason: validation.reason,
  };
});

export const createAccessSession = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const auth = await requireAuthContext(context);
  const role = auth.role;
  if (role === 'none') {
    throw new functions.https.HttpsError('permission-denied', 'A supported Vishnu role is required.');
  }

  const sessionId = typeof data?.sessionId === 'string' && data.sessionId.trim()
    ? data.sessionId.trim()
    : `session-${auth.uid}-${Date.now()}`;
  const now = Date.now();
  const [timers, policy, priorSessionId] = await Promise.all([
    ensureTimers(),
    ensurePolicy(),
    getUserActiveSessionId(auth.uid),
  ]);

  const requestedBypass = data?.isOwnerBypass === true;
  if (requestedBypass && !isOwnerRole(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only owners can create bypass sessions.');
  }

  const lifetimeSeconds = requestedBypass
    ? Math.min(timers.ownerBypassWindow, policy.maxBypassDuration)
    : Math.min(timers.tuiInactivityLock, policy.maxSessionDuration);

  if (priorSessionId && priorSessionId !== sessionId) {
    await revokeSessionInternal(priorSessionId, auth.uid, 'superseded-by-new-session', now);
  }

  const ref = admin.database().ref(`${RTDB_SESSIONS_PATH}/${sessionId}`);
  const existingSnap = await ref.get();
  const existing = existingSnap.exists() ? existingSnap.val() as Partial<SessionRecord> : null;
  const payload: SessionRecord = {
    sessionId,
    uid: auth.uid,
    userEmail: auth.email || '',
    role,
    createdAt: existing?.createdAt ? toFiniteNumber(existing.createdAt, now) : now,
    lastActivity: now,
    expiresAt: now + (lifetimeSeconds * 1000),
    revoked: false,
    isOwnerBypass: requestedBypass,
    client: data?.client === 'dashboard' || data?.client === 'browser' || data?.client === 'tui'
      ? data.client
      : 'unknown',
    clientLabel: typeof data?.clientLabel === 'string' ? data.clientLabel.trim() : '',
    projectId: typeof data?.projectId === 'string' ? data.projectId.trim() : '',
    machineId: typeof data?.machineId === 'string' ? data.machineId.trim() : '',
    terminalId: typeof data?.terminalId === 'string' ? data.terminalId.trim() : '',
    terminalLabel: typeof data?.terminalLabel === 'string' ? data.terminalLabel.trim() : '',
  };

  await Promise.all([
    ref.set(payload),
    setUserAccessState(auth.uid, {
      role,
      activeSessionId: sessionId,
      email: auth.email,
    }),
    writeSessionLog({
      uid: auth.uid,
      sessionId,
      event: 'created',
      actorUid: auth.uid,
      metadata: {
        client: payload.client,
        isOwnerBypass: payload.isOwnerBypass,
      },
    }),
  ]);

  return {
    session: sanitizeSession(payload, now),
    timers,
    policy,
  };
});

export const validateAccessSession = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const auth = await requireAuthContext(context);
  const sessionId = typeof data?.sessionId === 'string' ? data.sessionId.trim() : '';
  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required.');
  }

  const result = await validateSessionInternal(auth.uid, sessionId);
  if (result.valid) {
    await writeSessionLog({
      uid: auth.uid,
      sessionId,
      event: 'validated',
      actorUid: auth.uid,
    });
  }

  return {
    valid: result.valid,
    reason: result.reason,
    session: result.session ? sanitizeSession(result.session, result.now) : null,
  };
});

export const touchAccessSession = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const auth = await requireAuthContext(context);
  const sessionId = typeof data?.sessionId === 'string' ? data.sessionId.trim() : '';
  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required.');
  }

  const validation = await validateSessionInternal(auth.uid, sessionId);
  if (!validation.valid || !validation.session) {
    throw new functions.https.HttpsError('permission-denied', `Session is not valid: ${validation.reason}`);
  }

  const timers = await ensureTimers();
  const now = Date.now();
  const expiresAt = now + (timers.tuiInactivityLock * 1000);
  await admin.database().ref(`${RTDB_SESSIONS_PATH}/${sessionId}`).update({
    lastActivity: now,
    expiresAt,
    revoked: false,
  });

  await writeSessionLog({
    uid: auth.uid,
    sessionId,
    event: 'touched',
    actorUid: auth.uid,
  });

  return {
    sessionId,
    lastActivity: now,
    expiresAt,
    remainingMs: Math.max(0, expiresAt - now),
  };
});

export const revokeAccessSession = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const auth = await requireAuthContext(context);
  const sessionId = typeof data?.sessionId === 'string' ? data.sessionId.trim() : '';
  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required.');
  }

  const snap = await admin.database().ref(`${RTDB_SESSIONS_PATH}/${sessionId}`).get();
  if (!snap.exists()) {
    return { revoked: false, missing: true };
  }

  const session = snap.val() as SessionRecord;
  const allowSelfClose = session.uid === auth.uid;
  if (!allowSelfClose && !isAdminRole(auth.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only the session owner or an owner/admin can revoke this session.');
  }

  await revokeSessionInternal(
    sessionId,
    auth.uid,
    typeof data?.reason === 'string' && data.reason.trim() ? data.reason.trim() : (allowSelfClose ? 'client-close' : 'admin-revoke'),
  );

  return { revoked: true, sessionId };
});

export const revokeAllAccessSessions = functions.https.onCall(async (_data: any, context: functions.https.CallableContext) => {
  const auth = await requireAuthContext(context);
  if (!isAdminRole(auth.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only owners/admins can revoke all sessions.');
  }

  const now = Date.now();
  const snap = await admin.database().ref(RTDB_SESSIONS_PATH).get();
  const raw = snap.val() || {};
  const entries = Object.entries(raw as Record<string, SessionRecord>);
  await Promise.all(entries.map(([sessionId]) => revokeSessionInternal(sessionId, auth.uid, 'global-revoke', now)));
  await admin.database().ref(RTDB_USERS_PATH).remove();
  return { revoked: entries.length };
});

export const listAccessSessions = functions.https.onCall(async (_data: any, context: functions.https.CallableContext) => {
  const auth = await requireAuthContext(context);
  if (!isAdminRole(auth.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only owners/admins can view all sessions.');
  }

  const [timers, snap] = await Promise.all([
    ensureTimers(),
    admin.database().ref(RTDB_SESSIONS_PATH).get(),
  ]);
  const now = Date.now();
  const sessions = Object.values((snap.val() || {}) as Record<string, SessionRecord>)
    .map((value) => value as SessionRecord)
    .map((session) => ({
      ...sanitizeSession(session, now),
      staleByInactivity: now - toFiniteNumber(session.lastActivity, now) >= timers.tuiInactivityLock * 1000,
    }))
    .sort((left, right) => right.lastActivity - left.lastActivity);

  return { sessions, timers };
});

export const updateGlobalTimers = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const auth = await requireAuthContext(context);
  if (!isOwnerRole(auth.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only owners can update global timers.');
  }

  const current = await ensureTimers();
  const next: GlobalTimersRecord = normalizeTimers({
    ...current,
    tuiInactivityLock: toFiniteNumber(data?.tuiInactivityLock, current.tuiInactivityLock),
    authWindowTimeout: toFiniteNumber(data?.authWindowTimeout, current.authWindowTimeout),
    ownerBypassWindow: toFiniteNumber(data?.ownerBypassWindow, current.ownerBypassWindow),
    tokenRefreshLead: toFiniteNumber(data?.tokenRefreshLead, current.tokenRefreshLead),
    forcedReauthAt: Date.now(),
    updatedAt: Date.now(),
    updatedBy: auth.email || auth.uid,
  });

  const policy = await ensurePolicy();
  if (next.tuiInactivityLock > policy.maxSessionDuration) {
    throw new functions.https.HttpsError('invalid-argument', `tuiInactivityLock exceeds maxSessionDuration (${policy.maxSessionDuration}s).`);
  }
  if (next.ownerBypassWindow > policy.maxBypassDuration) {
    throw new functions.https.HttpsError('invalid-argument', `ownerBypassWindow exceeds maxBypassDuration (${policy.maxBypassDuration}s).`);
  }

  await Promise.all([
    admin.database().ref(RTDB_GLOBAL_TIMERS_PATH).set(next),
    admin.firestore().doc(FIRESTORE_POLICY_DOC).set({
      ...policy,
      updatedAt: Date.now(),
      updatedBy: auth.email || auth.uid,
    }, { merge: true }),
    writeSessionLog({
      uid: auth.uid,
      sessionId: 'global-timers',
      event: 'validated',
      actorUid: auth.uid,
      metadata: {
        update: {
          tuiInactivityLock: next.tuiInactivityLock,
          authWindowTimeout: next.authWindowTimeout,
          ownerBypassWindow: next.ownerBypassWindow,
          tokenRefreshLead: next.tokenRefreshLead,
        },
      },
    }),
  ]);

  return { timers: next };
});

export const createSessionCookieBridge = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const auth = await requireAuthContext(context);
  const sessionId = typeof data?.sessionId === 'string' ? data.sessionId.trim() : '';
  const idToken = typeof data?.idToken === 'string' ? data.idToken.trim() : '';

  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required.');
  }
  if (!idToken) {
    throw new functions.https.HttpsError('invalid-argument', 'idToken is required.');
  }

  const validation = await validateSessionInternal(auth.uid, sessionId);
  if (!validation.valid) {
    throw new functions.https.HttpsError('permission-denied', `Session is not valid: ${validation.reason}`);
  }

  const timers = await ensureTimers();
  const expiresInMs = Math.min(timers.tuiInactivityLock * 1000, 24 * 60 * 60 * 1000);
  const sessionCookie = await verifySessionCookieFromIdToken(idToken, expiresInMs);
  const dashboardUrl = typeof data?.dashboardUrl === 'string' && data.dashboardUrl.trim()
    ? data.dashboardUrl.trim()
    : 'https://vishnu-ruddy-tau.vercel.app';

  return {
    sessionId,
    sessionCookie,
    expiresAt: Date.now() + expiresInMs,
    dashboardUrl: `${dashboardUrl.replace(/\/$/, '')}/api/auth/bridge?session=${encodeURIComponent(sessionCookie)}&sid=${encodeURIComponent(sessionId)}`,
  };
});
