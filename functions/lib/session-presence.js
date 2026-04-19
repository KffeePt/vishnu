"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneSessionPresence = exports.reconcileSessionPresence = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
if (!admin.apps.length) {
    admin.initializeApp();
}
const ACTIVE_SESSIONS_PATH = 'system/activeSessions';
const TIMER_CONFIG_PATH = 'system/sessionTimers';
const DEFAULT_INACTIVITY_MS = 60 * 60 * 1000;
const MAX_ACTIVE_TERMINALS = 5;
const STALE_GRACE_MS = 60 * 1000;
function asNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function normalizePresenceSubject(entry) {
    if (typeof entry.uid === 'string' && entry.uid.trim()) {
        return entry.uid.trim();
    }
    if (typeof entry.userEmail === 'string' && entry.userEmail.trim()) {
        return entry.userEmail.trim().toLowerCase();
    }
    return '';
}
function normalizePresenceProject(entry) {
    if (typeof entry.projectId === 'string' && entry.projectId.trim()) {
        return entry.projectId.trim().toLowerCase();
    }
    if (typeof entry.projectPath === 'string' && entry.projectPath.trim()) {
        return entry.projectPath.trim().toLowerCase();
    }
    return '';
}
function buildPresenceKey(entry) {
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
function normalizeSessionEntry(sessionId, value, inactivityMs, now) {
    const startedAt = asNumber(value === null || value === void 0 ? void 0 : value.startedAt, now);
    const lastSeenAt = asNumber(value === null || value === void 0 ? void 0 : value.lastSeenAt, startedAt);
    const expiresAt = asNumber(value === null || value === void 0 ? void 0 : value.expiresAt, lastSeenAt + inactivityMs);
    const isExpired = expiresAt <= now;
    return {
        sessionId,
        machineId: typeof (value === null || value === void 0 ? void 0 : value.machineId) === 'string' && value.machineId.trim() ? value.machineId.trim() : undefined,
        terminalId: typeof (value === null || value === void 0 ? void 0 : value.terminalId) === 'string' && value.terminalId.trim() ? value.terminalId.trim() : sessionId,
        terminalLabel: typeof (value === null || value === void 0 ? void 0 : value.terminalLabel) === 'string' && value.terminalLabel.trim() ? value.terminalLabel.trim() : undefined,
        projectPath: typeof (value === null || value === void 0 ? void 0 : value.projectPath) === 'string' ? value.projectPath : undefined,
        projectId: typeof (value === null || value === void 0 ? void 0 : value.projectId) === 'string' ? value.projectId : undefined,
        userEmail: typeof (value === null || value === void 0 ? void 0 : value.userEmail) === 'string' ? value.userEmail : undefined,
        uid: typeof (value === null || value === void 0 ? void 0 : value.uid) === 'string' ? value.uid : undefined,
        status: (value === null || value === void 0 ? void 0 : value.status) === 'idle'
            ? 'idle'
            : ((value === null || value === void 0 ? void 0 : value.status) === 'expired' || isExpired ? 'expired' : 'active'),
        startedAt,
        lastSeenAt,
        expiresAt
    };
}
function buildSessionPresencePlan(rawSessions, inactivityMs, now = Date.now()) {
    if (!rawSessions) {
        return {
            liveSessions: [],
            removals: [],
            totalCount: 0,
            expiredCount: 0
        };
    }
    const entries = Array.isArray(rawSessions)
        ? rawSessions.map((value, index) => normalizeSessionEntry(String((value === null || value === void 0 ? void 0 : value.sessionId) || index), value, inactivityMs, now))
        : Object.entries(rawSessions).map(([sessionId, value]) => normalizeSessionEntry(sessionId, value, inactivityMs, now));
    const removals = new Set();
    const survivors = new Map();
    let expiredCount = 0;
    for (const entry of entries.sort((left, right) => right.lastSeenAt - left.lastSeenAt)) {
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
        }
        else {
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
        const updates = {};
        for (const sessionId of plan.removals) {
            updates[`${ACTIVE_SESSIONS_PATH}/${sessionId}`] = null;
        }
        await db.ref().update(updates);
    }
    return Object.assign(Object.assign({}, plan), { inactivityMs });
}
exports.reconcileSessionPresence = functions.https.onCall(async (_data, context) => {
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
exports.pruneSessionPresence = (0, scheduler_1.onSchedule)({ schedule: 'every 1 minutes', timeZone: 'UTC' }, async () => {
    const result = await reconcileSessionsInternal();
    if (result.totalCount === 0) {
        console.log('[session-presence] No active sessions to reconcile.');
        return;
    }
    if (result.removals.length === 0) {
        console.log(`[session-presence] Active sessions already clean (${result.liveSessions.length} live).`);
        return;
    }
    console.log(`[session-presence] Reconciled ${result.removals.length} stale/duplicate session(s); ${result.liveSessions.length} live terminal(s) remain.`);
});
//# sourceMappingURL=session-presence.js.map