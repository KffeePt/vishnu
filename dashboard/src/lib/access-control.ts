import { randomUUID } from 'crypto';

import { auth, rtdb } from '@/config/firebase-admin';

export type DashboardAccessRole =
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

export type DashboardGlobalTimers = {
  tuiInactivityLock: number;
  authWindowTimeout: number;
  ownerBypassWindow: number;
  tokenRefreshLead: number;
  updatedAt: number;
  updatedBy: string;
};

export type DashboardSessionRecord = {
  sessionId: string;
  uid: string;
  userEmail?: string;
  role: DashboardAccessRole;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  revoked: boolean;
  revokedAt?: number;
  revokedBy?: string;
  revokeReason?: string;
  isOwnerBypass: boolean;
  client: 'dashboard' | 'browser' | 'tui' | 'unknown';
  clientLabel?: string;
};

const RTDB_GLOBAL_TIMERS_PATH = 'globalTimers';
const RTDB_SESSIONS_PATH = 'sessions';
const RTDB_USERS_PATH = 'users';

const DEFAULT_TIMERS: DashboardGlobalTimers = {
  tuiInactivityLock: 3600,
  authWindowTimeout: 120,
  ownerBypassWindow: 3600,
  tokenRefreshLead: 120,
  updatedAt: 0,
  updatedBy: 'system',
};

function requireRealtimeDatabase() {
  if (!rtdb) {
    throw new Error('Realtime Database is not configured. Set FIREBASE_DATABASE_URL on the dashboard server.');
  }
  return rtdb;
}

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

export function inferDashboardRole(claims: Record<string, unknown>): DashboardAccessRole {
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

export async function getAccessTimers(): Promise<DashboardGlobalTimers> {
  const database = requireRealtimeDatabase();
  const snap = await database.ref(RTDB_GLOBAL_TIMERS_PATH).get();
  if (!snap.exists()) {
    await database.ref(RTDB_GLOBAL_TIMERS_PATH).set(DEFAULT_TIMERS);
    return { ...DEFAULT_TIMERS };
  }

  const value = snap.val() || {};
  return {
    tuiInactivityLock: toFiniteNumber(value.tuiInactivityLock, Math.max(59, Math.round(toFiniteNumber(value.projectInactivityMs, DEFAULT_TIMERS.tuiInactivityLock * 1000) / 1000))),
    authWindowTimeout: toFiniteNumber(value.authWindowTimeout, Math.max(30, Math.round(toFiniteNumber(value.browserLoginTimeoutMs, DEFAULT_TIMERS.authWindowTimeout * 1000) / 1000))),
    ownerBypassWindow: toFiniteNumber(value.ownerBypassWindow, Math.max(59, Math.round(toFiniteNumber(value.ownerBypassTimeoutMs, DEFAULT_TIMERS.ownerBypassWindow * 1000) / 1000))),
    tokenRefreshLead: toFiniteNumber(value.tokenRefreshLead, Math.max(30, Math.round(toFiniteNumber(value.tokenRefreshSkewMs, DEFAULT_TIMERS.tokenRefreshLead * 1000) / 1000))),
    updatedAt: toFiniteNumber(value.updatedAt, Date.now()),
    updatedBy: typeof value.updatedBy === 'string' && value.updatedBy.trim() ? value.updatedBy.trim() : 'system',
  };
}

export async function validateAccessSessionForUid(uid: string, sessionId: string) {
  const database = requireRealtimeDatabase();
  const now = Date.now();
  const [timers, sessionSnap, activeSessionSnap] = await Promise.all([
    getAccessTimers(),
    database.ref(`${RTDB_SESSIONS_PATH}/${sessionId}`).get(),
    database.ref(`${RTDB_USERS_PATH}/${uid}/activeSessionId`).get(),
  ]);

  if (!sessionSnap.exists()) {
    return { valid: false, reason: 'missing' as const, session: null, timers, now };
  }

  const session = sessionSnap.val() as DashboardSessionRecord;
  const activeSessionId = activeSessionSnap.val();
  if (session.uid !== uid || activeSessionId !== sessionId) {
    return { valid: false, reason: 'mismatch' as const, session, timers, now };
  }
  if (session.revoked) {
    return { valid: false, reason: 'revoked' as const, session, timers, now };
  }
  if (now >= toFiniteNumber(session.expiresAt, 0)) {
    await database.ref(`${RTDB_SESSIONS_PATH}/${sessionId}`).update({
      revoked: true,
      revokedAt: now,
      revokeReason: 'expired'
    });
    return { valid: false, reason: 'expired' as const, session, timers, now };
  }
  if ((now - toFiniteNumber(session.lastActivity, now)) >= timers.tuiInactivityLock * 1000) {
    await database.ref(`${RTDB_SESSIONS_PATH}/${sessionId}`).update({
      revoked: true,
      revokedAt: now,
      revokeReason: 'inactive-timeout'
    });
    return { valid: false, reason: 'inactive' as const, session, timers, now };
  }

  return { valid: true, reason: 'ok' as const, session, timers, now };
}

export async function createOrRefreshDashboardSession(options: {
  idToken: string;
  sessionId?: string;
  clientLabel?: string;
}) {
  const database = requireRealtimeDatabase();
  const decoded = await auth.verifyIdToken(options.idToken);
  const role = inferDashboardRole(decoded as unknown as Record<string, unknown>);
  const sessionId = options.sessionId?.trim() || `dashboard-${decoded.uid}-${randomUUID()}`;
  const now = Date.now();
  const timers = await getAccessTimers();
  const activeSessionSnap = await database.ref(`${RTDB_USERS_PATH}/${decoded.uid}/activeSessionId`).get();
  const priorSessionId = typeof activeSessionSnap.val() === 'string' ? activeSessionSnap.val() as string : '';

  if (priorSessionId && priorSessionId !== sessionId) {
    await database.ref(`${RTDB_SESSIONS_PATH}/${priorSessionId}`).update({
      revoked: true,
      revokedAt: now,
      revokedBy: decoded.uid,
      revokeReason: 'superseded-by-dashboard-session',
    });
  }

  const existingSnap = await database.ref(`${RTDB_SESSIONS_PATH}/${sessionId}`).get();
  const existing = existingSnap.exists() ? existingSnap.val() as Partial<DashboardSessionRecord> : null;
  const session: DashboardSessionRecord = {
    sessionId,
    uid: decoded.uid,
    userEmail: decoded.email || '',
    role,
    createdAt: existing?.createdAt ? toFiniteNumber(existing.createdAt, now) : now,
    lastActivity: now,
    expiresAt: now + (timers.tuiInactivityLock * 1000),
    revoked: false,
    isOwnerBypass: false,
    client: 'dashboard',
    clientLabel: options.clientLabel?.trim() || 'vercel-dashboard',
  };

  await Promise.all([
    database.ref(`${RTDB_SESSIONS_PATH}/${sessionId}`).set(session),
    database.ref(`${RTDB_USERS_PATH}/${decoded.uid}`).update({
      role,
      activeSessionId: sessionId,
      email: decoded.email || '',
      updatedAt: now,
    }),
  ]);

  return { session, timers, decoded };
}

export async function touchDashboardSession(uid: string, sessionId: string) {
  const database = requireRealtimeDatabase();
  const validation = await validateAccessSessionForUid(uid, sessionId);
  if (!validation.valid || !validation.session) {
    return validation;
  }

  const now = Date.now();
  const expiresAt = now + (validation.timers.tuiInactivityLock * 1000);
  await database.ref(`${RTDB_SESSIONS_PATH}/${sessionId}`).update({
    lastActivity: now,
    expiresAt,
    revoked: false,
  });

  return {
    valid: true,
    reason: 'ok' as const,
    session: {
      ...validation.session,
      lastActivity: now,
      expiresAt,
    },
    timers: validation.timers,
    now,
  };
}

export async function revokeDashboardSession(uid: string, sessionId: string, reason: string) {
  const database = requireRealtimeDatabase();
  const sessionRef = database.ref(`${RTDB_SESSIONS_PATH}/${sessionId}`);
  const snap = await sessionRef.get();
  if (!snap.exists()) {
    return { revoked: false, missing: true };
  }

  const now = Date.now();
  const session = snap.val() as DashboardSessionRecord;
  await sessionRef.update({
    revoked: true,
    revokedAt: now,
    revokedBy: uid,
    revokeReason: reason,
    expiresAt: Math.min(toFiniteNumber(session.expiresAt, now), now),
  });

  const activeSessionSnap = await database.ref(`${RTDB_USERS_PATH}/${session.uid}/activeSessionId`).get();
  if (activeSessionSnap.val() === sessionId) {
    await database.ref(`${RTDB_USERS_PATH}/${session.uid}/activeSessionId`).set(null);
  }

  return { revoked: true, sessionId };
}

export async function resolveDashboardSessionFromCookie(sessionCookie: string) {
  const decoded = await auth.verifySessionCookie(sessionCookie, true);
  const database = requireRealtimeDatabase();
  const activeSessionSnap = await database.ref(`${RTDB_USERS_PATH}/${decoded.uid}/activeSessionId`).get();
  const sessionId = typeof activeSessionSnap.val() === 'string' ? activeSessionSnap.val() as string : '';

  if (!sessionId) {
    return {
      decoded,
      sessionId: '',
      validation: { valid: false, reason: 'missing' as const, session: null, timers: await getAccessTimers(), now: Date.now() }
    };
  }

  const validation = await validateAccessSessionForUid(decoded.uid, sessionId);
  return { decoded, sessionId, validation };
}
