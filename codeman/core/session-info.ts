import chalk from 'chalk';
import { AuthService } from './auth';
import { io } from './io';
import { state } from './state';
import { AuthTokenStore } from './auth/token-store';
import { UserConfigManager } from '../config/user-config';
import { SessionTimerManager, formatMs } from './session-timers';

function formatRelativeTime(targetMs: number, now = Date.now()): string {
    const remaining = targetMs - now;
    if (remaining <= 0) {
        return 'expired';
    }
    return `${formatMs(remaining)} remaining`;
}

function formatElapsedTime(startMs: number, now = Date.now()): string {
    const elapsed = now - startMs;
    if (elapsed <= 0) {
        return 'just now';
    }
    return `${formatMs(elapsed)} ago`;
}

function colorForRemaining(ms: number) {
    if (ms <= 0) return chalk.redBright.bold;
    if (ms <= 60 * 1000) return chalk.redBright.bold;
    if (ms <= 5 * 60 * 1000) return chalk.yellowBright.bold;
    return chalk.greenBright.bold;
}

function colorForStatus(active: boolean, ms?: number) {
    if (!active) return chalk.gray;
    if (typeof ms === 'number' && ms <= 60 * 1000) return chalk.redBright.bold;
    if (typeof ms === 'number' && ms <= 5 * 60 * 1000) return chalk.yellowBright.bold;
    return chalk.greenBright.bold;
}

function describeSessionPresence(session: ReturnType<typeof SessionTimerManager.getActiveSessions>[number], now: number) {
    const remaining = session.expiresAt - now;
    const statusColor = session.status === 'expired'
        ? chalk.redBright
        : remaining <= 60 * 1000
            ? chalk.yellowBright
            : chalk.greenBright;
    const ownerLabel = session.userEmail || session.uid || 'unknown';
    const projectLabel = session.projectId || session.projectPath || 'unknown project';
    const terminalLabel = session.terminalLabel || session.terminalId || 'terminal unknown';

    return `${statusColor(session.status.padEnd(7))} ${chalk.bold(ownerLabel)} ${chalk.gray('•')} ${projectLabel} ${chalk.gray('•')} ${chalk.cyanBright(terminalLabel)} ${chalk.gray('•')} ${formatMs(Math.max(0, remaining))} left`;
}

export function buildSessionInfo(now = Date.now()) {
    const projectRoot = state.project.rootPath || process.cwd();
    const projectType = state.project.type;
    const timers = SessionTimerManager.getGlobalTimerSummary();
    const lastActivity = io.lastActivity;
    const inactivityDeadline = lastActivity + timers.projectInactivityMs;
    const authMode = UserConfigManager.getAuthMode();
    const bypassExpiresAt = UserConfigManager.getAuthBypassExpiresAt();
    const bypassStartedAt = UserConfigManager.getAuthBypassStartedAt();
    const lastAuth = UserConfigManager.getLastAuth();
    const cachedUser = UserConfigManager.getCachedUser();
    const loginWindow = AuthService.getLoginWindowStatus();
    const storedTokens = AuthTokenStore.load();

    return {
        now,
        projectRoot,
        projectType,
        lastActivity,
        inactivityDeadline,
        inactivityRemainingMs: Math.max(0, inactivityDeadline - now),
        authMode,
        bypassExpiresAt,
        bypassStartedAt,
        bypassRemainingMs: bypassExpiresAt > 0 ? Math.max(0, bypassExpiresAt - now) : 0,
        lastAuth,
        lastAuthAgeMs: lastAuth > 0 ? Math.max(0, now - lastAuth) : 0,
        cachedUser,
        loginWindow,
        storedTokens,
        storedTokenRemainingMs: storedTokens ? Math.max(0, storedTokens.expiresAt - now) : 0,
        timers
    };
}

export function printSessionInfo(now = Date.now()) {
    console.log(buildSessionInfoText(now));
}

export function buildSessionInfoText(now = Date.now()) {
    const info = buildSessionInfo(now);
    const userLabel = info.cachedUser?.email || state.user?.email || 'not signed in';
    const bypassActive = info.authMode === 'owner-bypass' && info.bypassExpiresAt > now;
    const inactivityColor = colorForRemaining(info.inactivityRemainingMs);
    const browserColor = colorForStatus(info.loginWindow.active, info.loginWindow.expiresAt ? info.loginWindow.expiresAt - now : undefined);
    const bypassColor = colorForStatus(bypassActive, info.bypassRemainingMs);
    const tokenColor = colorForStatus(!!info.storedTokens, info.storedTokenRemainingMs);
    const authAgeColor = info.lastAuthAgeMs > 30 * 60 * 1000 ? chalk.yellowBright : chalk.cyanBright;
    const activityAgeColor = info.lastActivity > 0 && now - info.lastActivity > 10 * 60 * 1000 ? chalk.yellowBright : chalk.cyanBright;
    const timerSourceColor = info.timers.syncActive ? chalk.greenBright : chalk.yellowBright;
    const activeSessions = SessionTimerManager.getActiveSessions();
    const reauthMarker = info.timers.forcedReauthAt > 0 ? new Date(info.timers.forcedReauthAt).toLocaleString() : 'inactive';

    const lines: string[] = [];
    lines.push(chalk.bold.cyan('⏳ Session Info / Timers'));
    lines.push(chalk.gray('------------------------------------------------------------'));
    lines.push(`${chalk.bold('Project Root:')} ${info.projectRoot}`);
    lines.push(`${chalk.bold('Project Type:')} ${info.projectType}`);
    lines.push(`${chalk.bold('Current User:')} ${userLabel}`);
    lines.push(`${chalk.bold('Auth Mode:')} ${info.authMode}${bypassActive ? chalk.yellow(' (active bypass)') : ''}`);
    lines.push(`${chalk.bold('Global Timers:')} ${timerSourceColor(info.timers.sourceLabel)}${info.timers.syncActive ? chalk.green(' (live)') : chalk.gray(' (cached)')}`);
    lines.push(`${chalk.bold('Last Auth:')} ${info.lastAuth > 0 ? authAgeColor(formatElapsedTime(info.lastAuth, now)) : chalk.gray('none')}`);
    lines.push(`${chalk.bold('Last Activity:')} ${activityAgeColor(formatElapsedTime(info.lastActivity, now))}`);
    lines.push(chalk.gray('------------------------------------------------------------'));
    lines.push(chalk.bold('Session Timers'));
    lines.push(`  ${chalk.bold('Local inactivity logout:')} ${inactivityColor(formatRelativeTime(info.inactivityDeadline, now))}${info.inactivityRemainingMs === 0 ? chalk.redBright(' (will lock on next timeout check)') : ''}`);

    if (info.loginWindow.active && info.loginWindow.expiresAt) {
        lines.push(`  ${chalk.bold('Browser auth window:')} ${browserColor(formatRelativeTime(info.loginWindow.expiresAt, now))}${info.loginWindow.port ? chalk.gray(` (port ${info.loginWindow.port})`) : ''}`);
    } else {
        lines.push(`  ${chalk.bold('Browser auth window:')} ${chalk.gray('inactive')}`);
    }

    if (bypassActive) {
        lines.push(`  ${chalk.bold('Owner bypass TTL:')} ${bypassColor(formatRelativeTime(info.bypassExpiresAt, now))}`);
    } else {
        lines.push(`  ${chalk.bold('Owner bypass TTL:')} ${chalk.gray('inactive')}`);
    }

    if (info.storedTokens) {
        lines.push(`  ${chalk.bold('Stored Firebase token:')} ${tokenColor(formatRelativeTime(info.storedTokens.expiresAt, now))}`);
    } else {
        lines.push(`  ${chalk.bold('Stored Firebase token:')} ${chalk.gray('none')}`);
    }

    lines.push(`  ${chalk.bold('Global relogin marker:')} ${info.timers.forcedReauthAt > 0 ? chalk.redBright(reauthMarker) : chalk.gray(reauthMarker)}`);

    lines.push(chalk.gray('------------------------------------------------------------'));
    lines.push(chalk.bold('Active Sessions'));
    if (activeSessions.length === 0) {
        lines.push(chalk.gray('  No active sessions reported yet.'));
    } else {
        activeSessions.slice(0, 8).forEach((session) => {
            lines.push(`  ${describeSessionPresence(session, now)}`);
        });
        if (activeSessions.length > 8) {
            lines.push(chalk.gray(`  ... and ${activeSessions.length - 8} more`));
        }
    }

    lines.push(chalk.gray('------------------------------------------------------------'));
    lines.push(chalk.dim('These are live session values from the current project and auth state.'));
    return lines.join('\n');
}

export async function runSessionInfoViewer(): Promise<void> {
    return new Promise((resolve) => {
        let closed = false;
        let interval: NodeJS.Timeout | null = null;
        let previousLines = 0;

        const close = () => {
            if (closed) return;
            closed = true;
            if (interval) clearInterval(interval);
            io.release(handler);
            if (previousLines > 0) {
                process.stdout.write(`\x1b[${previousLines}A`);
                process.stdout.write('\x1b[J');
            }
            process.stdout.write('\x1b[?25h');
            process.stdout.write('\x1b[0m');
            resolve();
        };

        const render = () => {
            if (closed) return;
            const frame = `${buildSessionInfoText(Date.now())}\n\n${chalk.gray('Press Enter, q, or Esc to return to Project Settings.')}`;
            const lines = frame.split('\n').length;
            if (previousLines > 0) {
                process.stdout.write(`\x1b[${previousLines}A`);
            } else {
                process.stdout.write('\x1b[?25l');
            }
            process.stdout.write(frame);
            if (previousLines > lines) {
                process.stdout.write('\x1b[J');
            }
            previousLines = lines;
        };

        const handler = (key: Buffer, str: string) => {
            if (str === '\r' || str === '\n' || str === 'q' || str === '\u001B' || str === '\u0003') {
                close();
            }
        };

        io.consume(handler);
        render();
        interval = setInterval(render, 1000);
    });
}
