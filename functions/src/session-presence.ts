import * as admin from 'firebase-admin';
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

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeSessionEntry(sessionId: string, value: any): SessionPresenceRecord {
  const now = Date.now();
  const lastSeenAt = asNumber(value?.lastSeenAt, asNumber(value?.startedAt, now));
  const expiresAt = asNumber(value?.expiresAt, lastSeenAt);
  return {
    sessionId,
    terminalId: typeof value?.terminalId === 'string' && value.terminalId.trim() ? value.terminalId.trim() : sessionId,
    terminalLabel: typeof value?.terminalLabel === 'string' && value.terminalLabel.trim() ? value.terminalLabel.trim() : undefined,
    projectPath: typeof value?.projectPath === 'string' ? value.projectPath : undefined,
    projectId: typeof value?.projectId === 'string' ? value.projectId : undefined,
    userEmail: typeof value?.userEmail === 'string' ? value.userEmail : undefined,
    uid: typeof value?.uid === 'string' ? value.uid : undefined,
    status: typeof value?.status === 'string' ? value.status : 'active',
    startedAt: asNumber(value?.startedAt, now),
    lastSeenAt,
    expiresAt
  };
}

export const pruneSessionPresence = onSchedule({ schedule: 'every 1 minutes', timeZone: 'UTC' }, async () => {
  const db = admin.database();
  const [configSnap, sessionsSnap] = await Promise.all([
    db.ref(TIMER_CONFIG_PATH).once('value'),
    db.ref(ACTIVE_SESSIONS_PATH).once('value')
  ]);

  const configValue = configSnap.val() || {};
  const inactivityMs = asNumber(configValue.projectInactivityMs, DEFAULT_INACTIVITY_MS);
  const rawSessions = sessionsSnap.val();
  if (!rawSessions) {
    console.log('[session-presence] No active sessions to prune.');
    return;
  }

  const entries: SessionPresenceRecord[] = Array.isArray(rawSessions)
    ? rawSessions.map((value, index) => normalizeSessionEntry(String(value?.sessionId || index), value))
    : Object.entries(rawSessions).map(([sessionId, value]) => normalizeSessionEntry(sessionId, value));

  const now = Date.now();
  const removals = new Set<string>();
  const survivors = new Map<string, { key: string; record: SessionPresenceRecord; lastSeenAt: number }>();

  for (const entry of entries) {
    const key = entry.sessionId || entry.terminalId || `session-${Math.random().toString(16).slice(2)}`;
    const terminalKey = entry.terminalId || key;
    const lastSeenAt = asNumber(entry.lastSeenAt, asNumber(entry.expiresAt, now) - inactivityMs);
    const expiresAt = asNumber(entry.expiresAt, lastSeenAt + inactivityMs);
    const staleByLastSeen = now - lastSeenAt > inactivityMs + STALE_GRACE_MS;
    const staleByExpiry = now > expiresAt + STALE_GRACE_MS;

    if (staleByLastSeen || staleByExpiry || entry.status === 'expired') {
      removals.add(key);
      continue;
    }

    const current = survivors.get(terminalKey);
    if (!current) {
      survivors.set(terminalKey, { key, record: entry, lastSeenAt });
      continue;
    }

    if (lastSeenAt > current.lastSeenAt) {
      removals.add(current.key);
      survivors.set(terminalKey, { key, record: entry, lastSeenAt });
    } else if (current.key !== key) {
      removals.add(key);
    }
  }

  const liveSurvivors = Array.from(survivors.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  if (liveSurvivors.length > MAX_ACTIVE_TERMINALS) {
    for (const extra of liveSurvivors.slice(MAX_ACTIVE_TERMINALS)) {
      removals.add(extra.key);
    }
  }

  if (removals.size === 0) {
    console.log(`[session-presence] Active sessions already clean (${liveSurvivors.length} live).`);
    return;
  }

  const updates: Record<string, null> = {};
  for (const sessionId of removals) {
    updates[`${ACTIVE_SESSIONS_PATH}/${sessionId}`] = null;
  }

  await db.ref().update(updates);
  console.log(`[session-presence] Pruned ${removals.size} stale/duplicate session(s); ${Math.min(liveSurvivors.length, MAX_ACTIVE_TERMINALS)} live terminal(s) remain.`);
});
