import admin from 'firebase-admin';
import chalk from 'chalk';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { UserConfigManager } from '../config/user-config';
import { AuthTokenStore } from './auth/token-store';
import { state } from './state';

export interface SessionTimerConfig {
    projectInactivityMs: number;
    browserLoginTimeoutMs: number;
    ownerBypassTimeoutMs: number;
    tokenRefreshSkewMs: number;
    forcedReauthAt: number;
    source: 'defaults' | 'local-cache' | 'rtdb' | 'firestore' | 'owner-edit';
    updatedAt: number;
    updatedBy?: string;
}

export interface SessionTimerContext {
    projectId?: string;
    databaseURL?: string;
}

export interface SessionTimerValidationIssue {
    key: keyof Pick<
        SessionTimerConfig,
        'projectInactivityMs' | 'browserLoginTimeoutMs' | 'ownerBypassTimeoutMs' | 'tokenRefreshSkewMs' | 'forcedReauthAt'
    >;
    rawValue: unknown;
    message: string;
}

export interface SessionPresenceRecord {
    sessionId: string;
    terminalId?: string;
    terminalLabel?: string;
    projectPath?: string;
    projectId?: string;
    userEmail?: string;
    uid?: string;
    status: 'active' | 'idle' | 'expired';
    startedAt: number;
    lastSeenAt: number;
    expiresAt: number;
    source: 'local' | 'remote';
}

const APP_NAME = 'vishnu-session-timers';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VISHNU_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BACKEND_PROJECT_ID = 'vishnu-b65bd';
const DEFAULT_BACKEND_DATABASE_URL = 'https://vishnu-b65bd-default-rtdb.firebaseio.com/';
const CACHE_FILE = path.join(os.homedir(), '.vishnu', 'session-timers.json');
const DEFAULT_RTDP_PATH = 'system/sessionTimers';
const DEFAULT_FIRESTORE_DOC = 'system/sessionTimers';
const DEFAULT_ACTIVE_SESSIONS_PATH = 'system/activeSessions';
const MAX_ACTIVE_TERMINALS = 5;
const MIN_DURATION_MS = 59 * 1000;

const DEFAULT_SESSION_TIMERS: SessionTimerConfig = {
    projectInactivityMs: 60 * 60 * 1000,
    browserLoginTimeoutMs: 2 * 60 * 1000,
    ownerBypassTimeoutMs: 30 * 60 * 1000,
    tokenRefreshSkewMs: 2 * 60 * 1000,
    forcedReauthAt: 0,
    source: 'defaults',
    updatedAt: Date.now()
};

let currentConfig: SessionTimerConfig = loadCachedConfig();
let currentContextKey = '';
let timerApp: admin.app.App | null = null;
let attachedRef: admin.database.Reference | null = null;
let attachedListener: ((snap: admin.database.DataSnapshot) => void) | null = null;
let activeSessionsRef: admin.database.Reference | null = null;
let activeSessionsListener: ((snap: admin.database.DataSnapshot) => void) | null = null;
let activeSessionsCache: SessionPresenceRecord[] = [];
let currentTimerValidationIssues: SessionTimerValidationIssue[] = [];
let presenceSessionId: string | null = null;
let presenceTerminalId: string | null = null;
let presenceTerminalLabel: string | null = null;
let presenceHeartbeat: NodeJS.Timeout | null = null;
let presenceContext: { projectPath?: string; projectId?: string; userEmail?: string; uid?: string } | null = null;
let syncActive = false;
const emitter = new EventEmitter();

function ensureCacheDir() {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function loadCachedConfig(): SessionTimerConfig {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            return { ...DEFAULT_SESSION_TIMERS };
        }
        const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return normalizeConfig(parsed, 'local-cache');
    } catch {
        return { ...DEFAULT_SESSION_TIMERS };
    }
}

function persistCachedConfig(config: SessionTimerConfig) {
    ensureCacheDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(config, null, 2));
}

function coerceNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
    }
    return fallback;
}

function isWholeNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

function describeRawValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'missing';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function validateDurationField(
    key: SessionTimerValidationIssue['key'],
    rawValue: unknown,
    label: string
): SessionTimerValidationIssue[] {
    const issues: SessionTimerValidationIssue[] = [];

    if (!isWholeNumber(rawValue)) {
        issues.push({
            key,
            rawValue,
            message: `${label} must be a whole-number millisecond value.`
        });
        return issues;
    }

    if (rawValue < MIN_DURATION_MS) {
        issues.push({
            key,
            rawValue,
            message: `${label} must be at least ${MIN_DURATION_MS}ms (${Math.round(MIN_DURATION_MS / 1000)}s).`
        });
    }

    return issues;
}

export function inspectTimerValidationIssues(input: Partial<SessionTimerConfig> | null | undefined): SessionTimerValidationIssue[] {
    if (!input) {
        return [];
    }

    const issues: SessionTimerValidationIssue[] = [];
    issues.push(...validateDurationField('projectInactivityMs', input.projectInactivityMs, 'Project inactivity lock'));
    issues.push(...validateDurationField('browserLoginTimeoutMs', input.browserLoginTimeoutMs, 'Browser login timeout'));
    issues.push(...validateDurationField('ownerBypassTimeoutMs', input.ownerBypassTimeoutMs, 'Owner bypass timeout'));
    issues.push(...validateDurationField('tokenRefreshSkewMs', input.tokenRefreshSkewMs, 'Token refresh skew'));

    if (input.forcedReauthAt !== undefined && input.forcedReauthAt !== null && (!isWholeNumber(input.forcedReauthAt) || input.forcedReauthAt < 0)) {
        issues.push({
            key: 'forcedReauthAt',
            rawValue: input.forcedReauthAt,
            message: 'Global relogin marker must be 0 or a non-negative whole-number timestamp.'
        });
    }

    return issues;
}

function setTimerValidationIssues(issues: SessionTimerValidationIssue[]) {
    currentTimerValidationIssues = issues.map((issue) => ({ ...issue }));
}

export function minutesToMs(minutes: number): number {
    return Math.max(1, Math.floor(minutes)) * 60 * 1000;
}

export function msToMinutes(ms: number): number {
    return Math.max(1, Math.round(ms / 60000));
}

export function formatMs(ms: number): string {
    const safe = Math.max(0, Math.floor(ms));
    const totalSeconds = Math.floor(safe / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function normalizeConfig(input: Partial<SessionTimerConfig> = {}, source: SessionTimerConfig['source'] = 'defaults'): SessionTimerConfig {
    const base = { ...DEFAULT_SESSION_TIMERS };
    const next: SessionTimerConfig = {
        projectInactivityMs: coerceNumber(input.projectInactivityMs, base.projectInactivityMs),
        browserLoginTimeoutMs: coerceNumber(input.browserLoginTimeoutMs, base.browserLoginTimeoutMs),
        ownerBypassTimeoutMs: coerceNumber(input.ownerBypassTimeoutMs, base.ownerBypassTimeoutMs),
        tokenRefreshSkewMs: coerceNumber(input.tokenRefreshSkewMs, base.tokenRefreshSkewMs),
        forcedReauthAt: coerceNumber(input.forcedReauthAt, 0),
        source,
        updatedAt: typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now(),
        updatedBy: typeof input.updatedBy === 'string' && input.updatedBy.trim() ? input.updatedBy.trim() : undefined
    };
    return next;
}

function getRemotePaths() {
    return {
        rtdbPath: (process.env.VISHNU_SESSION_TIMERS_RTDB_PATH || DEFAULT_RTDP_PATH).trim(),
        firestoreDoc: (process.env.VISHNU_SESSION_TIMERS_FIRESTORE_DOC || DEFAULT_FIRESTORE_DOC).trim(),
        activeSessionsPath: (process.env.VISHNU_SESSION_ACTIVE_SESSIONS_PATH || DEFAULT_ACTIVE_SESSIONS_PATH).trim()
    };
}

function resolveBackendServiceAccountPath(rawPath?: string): string {
    const fallback = path.join(VISHNU_ROOT, '.secrets', 'admin-sdk.json');
    const trimmed = typeof rawPath === 'string' ? rawPath.trim() : '';
    if (!trimmed) {
        return fallback;
    }

    return path.isAbsolute(trimmed) ? trimmed : path.resolve(VISHNU_ROOT, trimmed);
}

function getBackendConnection() {
    const rawProjectId = (process.env.VISHNU_SESSION_BACKEND_PROJECT_ID || DEFAULT_BACKEND_PROJECT_ID).trim();
    const rawDatabaseUrl = (process.env.VISHNU_SESSION_BACKEND_DATABASE_URL || DEFAULT_BACKEND_DATABASE_URL).trim();
    const rawServiceAccountPath = process.env.VISHNU_SESSION_BACKEND_ADMIN_SDK;

    return {
        projectId: rawProjectId || DEFAULT_BACKEND_PROJECT_ID,
        databaseURL: rawDatabaseUrl || DEFAULT_BACKEND_DATABASE_URL,
        serviceAccountPath: resolveBackendServiceAccountPath(rawServiceAccountPath)
    };
}

function normalizeSessionPresence(raw: unknown): SessionPresenceRecord[] {
    if (!raw) return [];
    const values = Array.isArray(raw) ? raw : Object.entries(raw as Record<string, unknown>).map(([sessionId, value]) => ({ sessionId, ...(value as Record<string, unknown>) }));
    const now = Date.now();

    const normalized = values.map((item: any) => {
        const sessionId = String(item.sessionId || item.id || item.key || cryptoSafeRandomId());
        const startedAt = typeof item.startedAt === 'number' ? item.startedAt : now;
        const lastSeenAt = typeof item.lastSeenAt === 'number' ? item.lastSeenAt : startedAt;
        const expiresAt = typeof item.expiresAt === 'number' ? item.expiresAt : now;
        const status = item.status === 'idle' || item.status === 'expired' ? item.status : (expiresAt > now ? 'active' : 'expired');
        const terminalId = typeof item.terminalId === 'string' && item.terminalId.trim() ? item.terminalId.trim() : sessionId;
        const terminalLabel = typeof item.terminalLabel === 'string' && item.terminalLabel.trim() ? item.terminalLabel.trim() : undefined;

        return {
            sessionId,
            terminalId,
            terminalLabel,
            projectPath: typeof item.projectPath === 'string' ? item.projectPath : undefined,
            projectId: typeof item.projectId === 'string' ? item.projectId : undefined,
            userEmail: typeof item.userEmail === 'string' ? item.userEmail : undefined,
            uid: typeof item.uid === 'string' ? item.uid : undefined,
            status,
            startedAt,
            lastSeenAt,
            expiresAt,
            source: 'remote'
        } as SessionPresenceRecord;
    }).sort((a, b) => b.lastSeenAt - a.lastSeenAt);

    const deduped = new Map<string, SessionPresenceRecord>();
    for (const item of normalized) {
        const key = item.terminalId || item.sessionId;
        const current = deduped.get(key);
        if (!current || item.lastSeenAt >= current.lastSeenAt) {
            deduped.set(key, item);
        }
    }

    return Array.from(deduped.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

function cryptoSafeRandomId(): string {
    try {
        return randomUUID();
    } catch {
        return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}

function normalizePresencePayload(input: Partial<SessionPresenceRecord>): SessionPresenceRecord {
    const now = Date.now();
    const sessionId = input.sessionId || presenceSessionId || cryptoSafeRandomId();
    return {
        sessionId,
        terminalId: input.terminalId || presenceTerminalId || sessionId,
        terminalLabel: input.terminalLabel || presenceTerminalLabel || undefined,
        projectPath: input.projectPath,
        projectId: input.projectId,
        userEmail: input.userEmail,
        uid: input.uid,
        status: input.status || 'active',
        startedAt: typeof input.startedAt === 'number' ? input.startedAt : now,
        lastSeenAt: typeof input.lastSeenAt === 'number' ? input.lastSeenAt : now,
        expiresAt: typeof input.expiresAt === 'number' ? input.expiresAt : now,
        source: input.source || 'local'
    };
}

function getTerminalIdentity() {
    const signatureParts = [
        process.env.WT_SESSION,
        process.env.WT_WINDOWID,
        process.env.TERM_SESSION_ID,
        process.env.SESSIONNAME,
        process.env.CONEMUANSI,
        process.env.ConEmuPID,
        process.env.TERM_PROGRAM,
        process.env.TERM_PROGRAM_VERSION,
        process.env.TERM,
        process.ppid ? String(process.ppid) : ''
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    const signature = signatureParts.join('|') || `${process.pid}|${process.ppid}`;
    const terminalId = `terminal-${createHash('sha256').update(signature).digest('hex').slice(0, 16)}`;
    const labelParts = [
        process.env.WT_SESSION ? `WT:${process.env.WT_SESSION.slice(0, 8)}` : undefined,
        process.env.TERM_SESSION_ID ? `TERM:${process.env.TERM_SESSION_ID.slice(0, 8)}` : undefined,
        process.env.SESSIONNAME ? `Session:${process.env.SESSIONNAME}` : undefined,
        process.env.TERM_PROGRAM ? process.env.TERM_PROGRAM : undefined,
        `ppid:${process.ppid}`
    ].filter((value): value is string => !!value);

    return {
        terminalId,
        terminalLabel: labelParts.join(' • ') || `ppid:${process.ppid}`
    };
}

async function ensureTimerApp(context?: SessionTimerContext): Promise<admin.app.App | null> {
    const backend = getBackendConnection();
    const contextKey = [backend.projectId, backend.databaseURL, backend.serviceAccountPath].join('|');

    if (timerApp && currentContextKey === contextKey) {
        return timerApp;
    }

    if (timerApp) {
        try {
            await timerApp.delete();
        } catch { }
        timerApp = null;
    }

    if (!backend.projectId || !backend.databaseURL) {
        return null;
    }

    let credential: admin.credential.Credential;

    if (backend.serviceAccountPath && fs.existsSync(backend.serviceAccountPath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(backend.serviceAccountPath, 'utf-8'));
            credential = admin.credential.cert(parsed);
        } catch {
            credential = admin.credential.cert(backend.serviceAccountPath as any);
        }
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        credential = admin.credential.cert({
            projectId: backend.projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        });
    } else {
        try {
            credential = admin.credential.applicationDefault();
        } catch {
            return null;
        }
    }

    try {
        timerApp = admin.initializeApp({
            credential,
            projectId: backend.projectId,
            databaseURL: backend.databaseURL
        }, APP_NAME);
        currentContextKey = contextKey;
        return timerApp;
    } catch (error: any) {
        if (String(error?.message || error).includes('app/duplicate-app')) {
            try {
                timerApp = admin.app(APP_NAME);
                currentContextKey = contextKey;
                return timerApp;
            } catch {
                return null;
            }
        } else {
            console.log(chalk.yellow(`⚠️  Session timer backend unavailable: ${error?.message || error}`));
            return null;
        }
    }
}

function applyIncomingConfig(next: Partial<SessionTimerConfig>, source: SessionTimerConfig['source']) {
    const normalized = normalizeConfig({ ...currentConfig, ...next }, source);
    const changed = JSON.stringify(normalized) !== JSON.stringify(currentConfig);
    currentConfig = normalized;
    persistCachedConfig(currentConfig);
    if (changed) {
        emitter.emit('change', { ...currentConfig });
    }
}

export const SessionTimerManager = {
    getConfig(): SessionTimerConfig {
        return { ...currentConfig };
    },

    isOwner(): boolean {
        const now = Date.now();
        const cachedUser = UserConfigManager.getCachedUser();
        const authMode = UserConfigManager.getAuthMode();
        const bypassExpiresAt = UserConfigManager.getAuthBypassExpiresAt();
        const bypassFresh =
            authMode === 'owner-bypass' &&
            bypassExpiresAt > now &&
            !!cachedUser &&
            (cachedUser.role === 'owner' || cachedUser.isAdmin === true);

        const runtimeOwner =
            state.authBypass === true &&
            authMode === 'owner-bypass' &&
            bypassExpiresAt > now &&
            (
                state.user?.role === 'owner' ||
                state.user?.isAdmin === true ||
                cachedUser?.role === 'owner' ||
                cachedUser?.isAdmin === true
            );

        return bypassFresh || runtimeOwner || state.user?.role === 'owner' || state.user?.isAdmin === true;
    },

    hasActiveOwnerSession(): boolean {
        const now = Date.now();
        const config = this.getConfig();
        const cachedUser = UserConfigManager.getCachedUser();
        const authMode = UserConfigManager.getAuthMode();
        const bypassExpiresAt = UserConfigManager.getAuthBypassExpiresAt();
        const storedTokens = AuthTokenStore.load();
        const authWatermark = Math.max(
            UserConfigManager.getLastAuth(),
            UserConfigManager.getAuthBypassStartedAt(),
            storedTokens?.updatedAt || 0
        );
        const forcedReauthAt = config.forcedReauthAt || 0;

        if (forcedReauthAt > 0 && authWatermark > 0 && authWatermark < forcedReauthAt) {
            return false;
        }

        const runtimeOwner = state.user?.role === 'owner';
        const cachedOwner = cachedUser?.role === 'owner';

        if (!runtimeOwner && !cachedOwner) {
            return false;
        }

        if (authMode === 'owner-bypass') {
            return bypassExpiresAt > now && (runtimeOwner || cachedOwner);
        }

        const lastAuth = UserConfigManager.getLastAuth();
        if (!lastAuth) {
            return false;
        }

        return (now - lastAuth) <= config.projectInactivityMs && runtimeOwner;
    },

    subscribe(listener: (config: SessionTimerConfig) => void): () => void {
        emitter.on('change', listener);
        return () => emitter.off('change', listener);
    },

    getActiveSessions(): SessionPresenceRecord[] {
        return activeSessionsCache.map(item => ({ ...item }));
    },

    getTimerValidationIssues(): SessionTimerValidationIssue[] {
        return currentTimerValidationIssues.map(issue => ({ ...issue }));
    },

    async startRealtimeSync(context?: SessionTimerContext): Promise<SessionTimerConfig> {
        const app = await ensureTimerApp(context);
        syncActive = !!app;

        if (!app) {
            return this.getConfig();
        }

        const { rtdbPath, activeSessionsPath } = getRemotePaths();
        const ref = app.database().ref(rtdbPath);
        const sessionsRef = app.database().ref(activeSessionsPath);

        if (attachedRef && attachedListener) {
            try {
                attachedRef.off('value', attachedListener);
            } catch { }
        }

        attachedRef = ref;
        attachedListener = (snap: admin.database.DataSnapshot) => {
            const value = snap.val();
            if (!value) {
                setTimerValidationIssues([]);
                return;
            }
            const issues = inspectTimerValidationIssues(value);
            setTimerValidationIssues(issues);
            if (issues.length > 0) {
                console.log(chalk.yellow(`⚠️  Timer config issues detected (${issues.length}).`));
            }
            applyIncomingConfig(value, 'rtdb');
        };

        ref.on('value', attachedListener, (error) => {
            console.log(chalk.yellow(`⚠️  Session timer sync error: ${error.message}`));
        });

        if (activeSessionsRef && activeSessionsListener) {
            try {
                activeSessionsRef.off('value', activeSessionsListener);
            } catch { }
        }

        activeSessionsRef = sessionsRef;
        activeSessionsListener = (snap: admin.database.DataSnapshot) => {
            activeSessionsCache = normalizeSessionPresence(snap.val());
            emitter.emit('change', { ...currentConfig });
        };
        sessionsRef.on('value', activeSessionsListener, (error) => {
            console.log(chalk.yellow(`⚠️  Active session sync error: ${error.message}`));
        });

        return this.getConfig();
    },

    stopRealtimeSync() {
        if (attachedRef && attachedListener) {
            try {
                attachedRef.off('value', attachedListener);
            } catch { }
        }
        if (activeSessionsRef && activeSessionsListener) {
            try {
                activeSessionsRef.off('value', activeSessionsListener);
            } catch { }
        }
        attachedRef = null;
        attachedListener = null;
        activeSessionsRef = null;
        activeSessionsListener = null;
        activeSessionsCache = [];
        syncActive = false;
    },

    isSyncActive(): boolean {
        return syncActive;
    },

    async refreshFromRemote(context?: SessionTimerContext): Promise<SessionTimerConfig> {
        const app = await ensureTimerApp(context);
        if (!app) return this.getConfig();
        const { rtdbPath, activeSessionsPath } = getRemotePaths();
        try {
            const [configSnap, sessionsSnap] = await Promise.all([
                app.database().ref(rtdbPath).once('value'),
                app.database().ref(activeSessionsPath).once('value')
            ]);
            const value = configSnap.val();
            if (value) {
                const issues = inspectTimerValidationIssues(value);
                setTimerValidationIssues(issues);
                if (issues.length > 0) {
                    console.log(chalk.yellow(`⚠️  Timer config issues detected (${issues.length}).`));
                }
                applyIncomingConfig(value, 'rtdb');
            } else {
                setTimerValidationIssues([]);
            }
            activeSessionsCache = normalizeSessionPresence(sessionsSnap.val());
        } catch (error: any) {
            console.log(chalk.yellow(`⚠️  Failed to refresh timers from RTDB: ${error?.message || error}`));
        }
        return this.getConfig();
    },

    async setGlobalTimers(update: Partial<SessionTimerConfig>, context?: SessionTimerContext): Promise<SessionTimerConfig> {
        return this.applyGlobalTimerChange(update, context, { forceReauth: true, clearActiveSessions: true });
    },

    updateLocalTimers(update: Partial<SessionTimerConfig>): SessionTimerConfig {
        const next = normalizeConfig({ ...currentConfig, ...update, updatedBy: state.user?.email || state.user?.role || 'owner' }, 'owner-edit');
        next.updatedAt = Date.now();
        next.updatedBy = state.user?.email || state.user?.role || 'owner';
        currentConfig = next;
        setTimerValidationIssues([]);
        persistCachedConfig(currentConfig);
        emitter.emit('change', { ...currentConfig });
        return this.getConfig();
    },

    async forceLogoutAll(context?: SessionTimerContext): Promise<SessionTimerConfig> {
        return this.applyGlobalTimerChange({}, context, { forceReauth: true, clearActiveSessions: true });
    },

    async applyGlobalTimerChange(
        update: Partial<SessionTimerConfig>,
        context?: SessionTimerContext,
        options?: { forceReauth?: boolean; clearActiveSessions?: boolean }
    ): Promise<SessionTimerConfig> {
        if (!this.isOwner()) {
            throw new Error('Only owners can change global session timers.');
        }

        const next = normalizeConfig({ ...currentConfig, ...update, updatedBy: state.user?.email || state.user?.role || 'owner' }, 'owner-edit');
        next.updatedAt = Date.now();
        next.updatedBy = state.user?.email || state.user?.role || 'owner';
        if (options?.forceReauth !== false) {
            next.forcedReauthAt = Date.now();
        }
        currentConfig = next;
        setTimerValidationIssues([]);
        persistCachedConfig(currentConfig);
        emitter.emit('change', { ...currentConfig });

        if (options?.forceReauth !== false || options?.clearActiveSessions !== false) {
            await this.stopPresence();
        }

        const app = await ensureTimerApp(context);
        if (!app) {
            throw new Error('Session timer backend is not available.');
        }

        const { rtdbPath, firestoreDoc } = getRemotePaths();
        const { activeSessionsPath } = getRemotePaths();
        const payload = {
            projectInactivityMs: next.projectInactivityMs,
            browserLoginTimeoutMs: next.browserLoginTimeoutMs,
            ownerBypassTimeoutMs: next.ownerBypassTimeoutMs,
            tokenRefreshSkewMs: next.tokenRefreshSkewMs,
            forcedReauthAt: next.forcedReauthAt,
            source: 'rtdb',
            updatedAt: next.updatedAt,
            updatedBy: next.updatedBy
        };

        const clearSessionsPromise = options?.clearActiveSessions === false
            ? Promise.resolve()
            : app.database().ref(activeSessionsPath).remove();

        const [clearResult, rtdbResult, firestoreResult] = await Promise.allSettled([
            clearSessionsPromise,
            app.database().ref(rtdbPath).set(payload),
            app.firestore().doc(firestoreDoc).set(payload, { merge: true })
        ]);

        if (options?.clearActiveSessions !== false) {
            activeSessionsCache = [];
            emitter.emit('change', { ...currentConfig });
        }

        if (clearResult.status === 'rejected') {
            console.log(chalk.yellow(`⚠️  Failed to clear active sessions: ${clearResult.reason}`));
        }
        if (rtdbResult.status === 'rejected') {
            throw new Error(`Failed to write RTDB timer settings: ${rtdbResult.reason}`);
        }
        if (firestoreResult.status === 'rejected') {
            console.log(chalk.yellow(`⚠️  Firestore mirror write failed: ${firestoreResult.reason}`));
        }

        return this.getConfig();
    },

    async startPresence(context?: { projectPath?: string; projectId?: string; userEmail?: string; uid?: string }): Promise<SessionPresenceRecord | null> {
        const app = await ensureTimerApp();
        if (!app) return null;

        const { activeSessionsPath } = getRemotePaths();
        const terminal = getTerminalIdentity();
        presenceSessionId = terminal.terminalId;
        presenceTerminalId = terminal.terminalId;
        presenceTerminalLabel = terminal.terminalLabel;

        const liveSessions = activeSessionsCache.filter((session) => session.expiresAt > Date.now() && session.status !== 'expired');
        const uniqueTerminals = new Set(liveSessions.map((session) => session.terminalId || session.sessionId));
        const matchingTerminalSessions = liveSessions.filter((session) => (session.terminalId || session.sessionId) === terminal.terminalId);
        if (!uniqueTerminals.has(terminal.terminalId) && uniqueTerminals.size >= MAX_ACTIVE_TERMINALS) {
            console.log(chalk.yellow(`⚠️  Session limit reached (${MAX_ACTIVE_TERMINALS}). Skipping presence registration for this terminal.`));
            return null;
        }

        if (matchingTerminalSessions.length > 0) {
            await Promise.allSettled(
                matchingTerminalSessions
                    .filter((session) => session.sessionId !== terminal.terminalId)
                    .map((session) => app.database().ref(`${activeSessionsPath}/${session.sessionId}`).remove())
            );
        }

        presenceContext = {
            projectPath: context?.projectPath || state.project.rootPath || process.cwd(),
            projectId: context?.projectId || state.project.id || getBackendConnection().projectId,
            userEmail: context?.userEmail || state.user?.email,
            uid: context?.uid || state.user?.uid
        };

        const payload = normalizePresencePayload({
            sessionId: presenceSessionId,
            terminalId: presenceTerminalId,
            terminalLabel: presenceTerminalLabel,
            projectPath: presenceContext.projectPath,
            projectId: presenceContext.projectId,
            userEmail: presenceContext.userEmail,
            uid: presenceContext.uid,
            status: 'active',
            startedAt: Date.now(),
            lastSeenAt: Date.now(),
            expiresAt: Date.now() + this.getConfig().projectInactivityMs,
            source: 'local'
        });

        const ref = app.database().ref(`${activeSessionsPath}/${presenceSessionId}`);
        const writeHeartbeat = async () => {
            const nextPayload = {
                ...payload,
                lastSeenAt: Date.now(),
                expiresAt: Date.now() + this.getConfig().projectInactivityMs
            };
            await ref.set(nextPayload);
        };

        await writeHeartbeat();
        if (presenceHeartbeat) clearInterval(presenceHeartbeat);
        presenceHeartbeat = setInterval(() => {
            void writeHeartbeat().catch(() => { });
        }, 15000);

        return payload;
    },

    async stopPresence(): Promise<void> {
        if (presenceHeartbeat) {
            clearInterval(presenceHeartbeat);
        }
        presenceHeartbeat = null;

        if (presenceSessionId) {
            try {
                const app = await ensureTimerApp();
                if (app) {
                    const { activeSessionsPath } = getRemotePaths();
                    await app.database().ref(`${activeSessionsPath}/${presenceSessionId}`).remove();
                }
            } catch { }
        }
        presenceSessionId = null;
        presenceTerminalId = null;
        presenceTerminalLabel = null;
        presenceContext = null;
    },

    getGlobalTimerSummary() {
        const config = this.getConfig();
        return {
            ...config,
            validationIssues: this.getTimerValidationIssues(),
            syncActive,
            sourceLabel: config.source === 'rtdb'
                ? 'RTDB live'
                : config.source === 'firestore'
                    ? 'Firestore mirror'
                    : config.source === 'owner-edit'
                        ? 'Owner edit (local + remote)'
                        : config.source === 'local-cache'
                            ? 'Local cache'
                            : 'Defaults'
        };
    }
};

export function printTimerConfigDetails(title: string, config = SessionTimerManager.getConfig()) {
    console.log(chalk.bold.cyan(`\n${title}`));
    console.log(chalk.gray('------------------------------------------------------------'));
    console.log(`${chalk.bold('Project inactivity lock:')} ${formatMs(config.projectInactivityMs)}`);
    console.log(`${chalk.bold('Browser login timeout:')} ${formatMs(config.browserLoginTimeoutMs)}`);
    console.log(`${chalk.bold('Owner bypass timeout:')} ${formatMs(config.ownerBypassTimeoutMs)}`);
    console.log(`${chalk.bold('Token refresh skew:')} ${formatMs(config.tokenRefreshSkewMs)}`);
    console.log(`${chalk.bold('Global relogin marker:')} ${config.forcedReauthAt > 0 ? new Date(config.forcedReauthAt).toLocaleString() : 'inactive'}`);
    console.log(`${chalk.bold('Source:')} ${config.source}`);
    if (config.updatedBy) console.log(`${chalk.bold('Updated by:')} ${config.updatedBy}`);
    console.log(`${chalk.bold('Updated at:')} ${new Date(config.updatedAt).toLocaleString()}`);
    const validationIssues = SessionTimerManager.getTimerValidationIssues();
    if (validationIssues.length > 0) {
        console.log(chalk.gray('------------------------------------------------------------'));
        console.log(chalk.redBright('Timer validation issues detected:'));
        for (const issue of validationIssues) {
            console.log(chalk.redBright(`  - ${issue.key}: ${issue.message} [current=${String(issue.rawValue)}]`));
        }
    }
    console.log(chalk.gray('------------------------------------------------------------'));
}
