import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { onSchedule } from 'firebase-functions/v2/scheduler';

if (!admin.apps.length) {
  admin.initializeApp();
}

const ACTIVE_SESSIONS_PATH = 'system/activeSessions';
const TIMER_CONFIG_PATH = 'system/sessionTimers';
const DEFAULT_INACTIVITY_MS = 60 * 60 * 1000;
const MAX_ACTIVE_TERMINALS = 5;
const STALE_GRACE_MS = 60 * 1000;

type SessionPresenceRecord = {
  sessionId: string;
  machineId?: string;
  terminalId?: string;
  terminalLabel?: string;
  projectPath?: string;
  projectId?: string;
  userEmail?: string;
  uid?: string;
  status?: 'active' | 'idle' | 'expired' | string;
  startedAt?: number;
  lastSeenAt?: number;
  expiresAt?: number;
};

type SessionPresencePlan = {
  liveSessions: SessionPresenceRecord[];
  removals: string[];
  totalCount: number;
  expiredCount: number;
};

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePresenceSubject(entry: SessionPresenceRecord): string {
  if (typeof entry.uid === 'string' && entry.uid.trim()) {
    return entry.uid.trim();
  }

  if (typeof entry.userEmail === 'string' && entry.userEmail.trim()) {
    return entry.userEmail.trim().toLowerCase();
  }

  return '';
}

function normalizePresenceProject(entry: SessionPresenceRecord): string {
  if (typeof entry.projectId === 'string' && entry.projectId.trim()) {
    return entry.projectId.trim().toLowerCase();
  }

  if (typeof entry.projectPath === 'string' && entry.projectPath.trim()) {
    return entry.projectPath.trim().toLowerCase();
  }

  return '';
}

function buildPresenceKey(entry: SessionPresenceRecord): string {
  const subject = normalizePresenceSubject(entry);
  const project = normalizePresenceProject(entry);
  const machine = typeof entry.machineId === 'string' && entry.machineId.trim()
    ? entry.machineId.trim()
    : 'legacy';

  if (subject && project) {
    return `${machine}|${subject}|${project}`;
  }

  if (typeof entry.terminalId === 'string' && entry.terminalId.trim()) {
    return `terminal:${entry.terminalId.trim()}`;
  }

  return `session:${entry.sessionId}`;
}

function normalizeSessionEntry(sessionId: string, value: any, inactivityMs: number, now: number): SessionPresenceRecord {
  const startedAt = asNumber(value?.startedAt, now);
  const lastSeenAt = asNumber(value?.lastSeenAt, startedAt);
  const expiresAt = asNumber(value?.expiresAt, lastSeenAt + inactivityMs);
  const isExpired = expiresAt <= now;

  return {
    sessionId,
    machineId: typeof value?.machineId === 'string' && value.machineId.trim() ? value.machineId.trim() : undefined,
    terminalId: typeof value?.terminalId === 'string' && value.terminalId.trim() ? value.terminalId.trim() : sessionId,
    terminalLabel: typeof value?.terminalLabel === 'string' && value.terminalLabel.trim() ? value.terminalLabel.trim() : undefined,
    projectPath: typeof value?.projectPath === 'string' ? value.projectPath : undefined,
    projectId: typeof value?.projectId === 'string' ? value.projectId : undefined,
    userEmail: typeof value?.userEmail === 'string' ? value.userEmail : undefined,
    uid: typeof value?.uid === 'string' ? value.uid : undefined,
    status: value?.status === 'idle'
      ? 'idle'
      : (value?.status === 'expired' || isExpired ? 'expired' : 'active'),
    startedAt,
    lastSeenAt,
    expiresAt
  };
}

function buildSessionPresencePlan(rawSessions: any, inactivityMs: number, now = Date.now()): SessionPresencePlan {
  if (!rawSessions) {
    return {
      liveSessions: [],
      removals: [],
      totalCount: 0,
      expiredCount: 0
    };
  }

  const entries: SessionPresenceRecord[] = Array.isArray(rawSessions)
    ? rawSessions.map((value, index) => normalizeSessionEntry(String(value?.sessionId || index), value, inactivityMs, now))
    : Object.entries(rawSessions).map(([sessionId, value]) => normalizeSessionEntry(sessionId, value, inactivityMs, now));

  const removals = new Set<string>();
  const survivors = new Map<string, SessionPresenceRecord>();
  let expiredCount = 0;

  for (const entry of entries.sort((left, right) => right.lastSeenAt! - left.lastSeenAt!)) {
    const staleByLastSeen = now - (entry.lastSeenAt || now) > inactivityMs + STALE_GRACE_MS;
    const staleByExpiry = now > (entry.expiresAt || now) + STALE_GRACE_MS;
    if (entry.status === 'expired' || staleByLastSeen || staleByExpiry) {
      removals.add(entry.sessionId);
      expiredCount++;
      continue;
    }

    const key = buildPresenceKey(entry);
    const current = survivors.get(key);
    if (!current) {
      survivors.set(key, entry);
      continue;
    }

    if ((entry.lastSeenAt || 0) >= (current.lastSeenAt || 0)) {
      removals.add(current.sessionId);
      survivors.set(key, entry);
    } else {
      removals.add(entry.sessionId);
    }
  }

  const liveSessions = Array.from(survivors.values()).sort((left, right) => (right.lastSeenAt || 0) - (left.lastSeenAt || 0));
  if (liveSessions.length > MAX_ACTIVE_TERMINALS) {
    for (const extra of liveSessions.slice(MAX_ACTIVE_TERMINALS)) {
      removals.add(extra.sessionId);
    }
  }

  return {
    liveSessions: liveSessions.slice(0, MAX_ACTIVE_TERMINALS),
    removals: Array.from(removals),
    totalCount: entries.length,
    expiredCount
  };
}

async function reconcileSessionsInternal() {
  const db = admin.database();
  const [configSnap, sessionsSnap] = await Promise.all([
    db.ref(TIMER_CONFIG_PATH).once('value'),
    db.ref(ACTIVE_SESSIONS_PATH).once('value')
  ]);

  const configValue = configSnap.val() || {};
  const inactivityMs = asNumber(configValue.projectInactivityMs, DEFAULT_INACTIVITY_MS);
  const rawSessions = sessionsSnap.val();
  const plan = buildSessionPresencePlan(rawSessions, inactivityMs);

  if (plan.removals.length > 0) {
    const updates: Record<string, null> = {};
    for (const sessionId of plan.removals) {
      updates[`${ACTIVE_SESSIONS_PATH}/${sessionId}`] = null;
    }
    await db.ref().update(updates);
  }

  return {
    ...plan,
    inactivityMs
  };
}

export const reconcileSessionPresence = functions.https.onCall(async (_data: any, context: functions.https.CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  }

  const result = await reconcileSessionsInternal();
  return {
    success: true,
    removedCount: result.removals.length,
    activeCount: result.liveSessions.length,
    totalCount: result.totalCount,
    expiredCount: result.expiredCount,
    inactivityMs: result.inactivityMs
  };
});

export const pruneSessionPresence = onSchedule({ schedule: 'every 1 minutes', timeZone: 'UTC' }, async () => {
  const result = await reconcileSessionsInternal();

  if (result.totalCount === 0) {
    console.log('[session-presence] No active sessions to reconcile.');
    return;
  }

  if (result.removals.length === 0) {
    console.log(`[session-presence] Active sessions already clean (${result.liveSessions.length} live).`);
    return;
  }

  console.log(
    `[session-presence] Reconciled ${result.removals.length} stale/duplicate session(s); ${result.liveSessions.length} live terminal(s) remain.`
  );
});
