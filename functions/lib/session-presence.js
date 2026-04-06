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
exports.pruneSessionPresence = void 0;
const admin = __importStar(require("firebase-admin"));
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
function normalizeSessionEntry(sessionId, value) {
    const now = Date.now();
    const lastSeenAt = asNumber(value === null || value === void 0 ? void 0 : value.lastSeenAt, asNumber(value === null || value === void 0 ? void 0 : value.startedAt, now));
    const expiresAt = asNumber(value === null || value === void 0 ? void 0 : value.expiresAt, lastSeenAt);
    return {
        sessionId,
        terminalId: typeof (value === null || value === void 0 ? void 0 : value.terminalId) === 'string' && value.terminalId.trim() ? value.terminalId.trim() : sessionId,
        terminalLabel: typeof (value === null || value === void 0 ? void 0 : value.terminalLabel) === 'string' && value.terminalLabel.trim() ? value.terminalLabel.trim() : undefined,
        projectPath: typeof (value === null || value === void 0 ? void 0 : value.projectPath) === 'string' ? value.projectPath : undefined,
        projectId: typeof (value === null || value === void 0 ? void 0 : value.projectId) === 'string' ? value.projectId : undefined,
        userEmail: typeof (value === null || value === void 0 ? void 0 : value.userEmail) === 'string' ? value.userEmail : undefined,
        uid: typeof (value === null || value === void 0 ? void 0 : value.uid) === 'string' ? value.uid : undefined,
        status: typeof (value === null || value === void 0 ? void 0 : value.status) === 'string' ? value.status : 'active',
        startedAt: asNumber(value === null || value === void 0 ? void 0 : value.startedAt, now),
        lastSeenAt,
        expiresAt
    };
}
exports.pruneSessionPresence = (0, scheduler_1.onSchedule)({ schedule: 'every 1 minutes', timeZone: 'UTC' }, async () => {
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
    const entries = Array.isArray(rawSessions)
        ? rawSessions.map((value, index) => normalizeSessionEntry(String((value === null || value === void 0 ? void 0 : value.sessionId) || index), value))
        : Object.entries(rawSessions).map(([sessionId, value]) => normalizeSessionEntry(sessionId, value));
    const now = Date.now();
    const removals = new Set();
    const survivors = new Map();
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
        }
        else if (current.key !== key) {
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
    const updates = {};
    for (const sessionId of removals) {
        updates[`${ACTIVE_SESSIONS_PATH}/${sessionId}`] = null;
    }
    await db.ref().update(updates);
    console.log(`[session-presence] Pruned ${removals.size} stale/duplicate session(s); ${Math.min(liveSurvivors.length, MAX_ACTIVE_TERMINALS)} live terminal(s) remain.`);
});
//# sourceMappingURL=session-presence.js.map