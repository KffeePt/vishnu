import chalk from 'chalk';

import { AuthService } from './auth';
import { io } from './io';
import { state } from './state';
import { AuthTokenStore } from './auth/token-store';
import { UserConfigManager } from '../config/user-config';
import { SessionTimerManager, formatMs } from './session-timers';
import { MAX_BROWSER_SESSION_AGE_MS } from './auth/access-policy';

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

function stripAnsi(input: string): string {
    return input.replace(/\u001b\[[0-9;]*m/g, '');
}

function truncateText(value: string, maxWidth: number): string {
    if (maxWidth <= 0) return '';
    if (value.length <= maxWidth) return value;
    if (maxWidth <= 1) return value.slice(0, maxWidth);
    return `${value.slice(0, Math.max(0, maxWidth - 1))}…`;
}

function fitLine(line: string, width: number): string {
    const plain = stripAnsi(line);
    return plain.length <= width ? line : truncateText(plain, width);
}

function buildRule(width: number): string {
    return chalk.gray('─'.repeat(Math.max(24, width)));
}

function buildFieldLine(label: string, value: string, width: number): string {
    const prefix = `${chalk.bold(label)} `;
    const available = Math.max(8, width - stripAnsi(prefix).length);
    return fitLine(`${prefix}${truncateText(value, available)}`, width);
}

function buildBulletLine(label: string, value: string, width: number): string {
    const prefix = `  ${chalk.bold(label)} `;
    const available = Math.max(8, width - stripAnsi(prefix).length);
    return fitLine(`${prefix}${truncateText(value, available)}`, width);
}

function describeSessionPresence(session: ReturnType<typeof SessionTimerManager.getActiveSessions>[number], now: number) {
    const remaining = session.expiresAt - now;
    const ownerLabel = session.userEmail || session.uid || 'unknown';
    const projectLabel = session.projectId || session.projectPath || 'unknown project';
    const terminalLabel = session.terminalLabel || session.terminalId || 'terminal unknown';
    return `${session.status.padEnd(7)} ${ownerLabel} • ${projectLabel} • ${terminalLabel} • ${formatMs(Math.max(0, remaining))} left`;
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
        sharedServerSessionMaxAgeMs: MAX_BROWSER_SESSION_AGE_MS,
        timers
    };
}

export function printSessionInfo(now = Date.now()) {
    console.log(buildSessionInfoText(now));
}

export function buildSessionInfoText(now = Date.now()) {
    const info = buildSessionInfo(now);
    const width = Math.max(72, Math.min(process.stdout.columns || 100, 110));
    const height = Math.max(18, (process.stdout.rows || 30) - 1);
    const userLabel = info.cachedUser?.email || state.user?.email || 'not signed in';
    const bypassActive = info.authMode === 'owner-bypass' && info.bypassExpiresAt > now;
    const inactivityColor = colorForRemaining(info.inactivityRemainingMs);
    const browserColor = colorForStatus(info.loginWindow.active, info.loginWindow.expiresAt ? info.loginWindow.expiresAt - now : undefined);
    const bypassColor = colorForStatus(bypassActive, info.bypassRemainingMs);
    const tokenColor = colorForStatus(!!info.storedTokens, info.storedTokenRemainingMs);
    const authAgeColor = info.lastAuthAgeMs > 30 * 60 * 1000 ? chalk.yellowBright : chalk.cyanBright;
    const activityAgeColor = info.lastActivity > 0 && now - info.lastActivity > 10 * 60 * 1000 ? chalk.yellowBright : chalk.cyanBright;
    const activeSessions = SessionTimerManager.getActiveSessions();
    const reauthMarker = info.timers.forcedReauthAt > 0 ? new Date(info.timers.forcedReauthAt).toLocaleString() : 'inactive';
    const projectName = info.projectRoot.split(/[\\/]/).filter(Boolean).pop() || info.projectRoot;
    const authStateLabel = bypassActive
        ? 'Owner bypass active'
        : (state.user?.email || info.cachedUser?.email ? 'Authenticated' : 'Not authenticated');
    const sourceLabel = `${stripAnsi(info.timers.sourceLabel)}${info.timers.syncActive ? ' (live)' : ' (cached)'}`;

    const lines: string[] = [];
    lines.push(fitLine(chalk.bold.cyan('⏳ Session Control Center'), width));
    lines.push(buildRule(width));
    lines.push(buildFieldLine('Project:', `${projectName} (${info.projectType})`, width));
    lines.push(buildFieldLine('Path:', info.projectRoot, width));
    lines.push(buildFieldLine('User:', userLabel, width));
    lines.push(buildFieldLine('Auth State:', `${authStateLabel} • mode=${info.authMode}`, width));
    lines.push(buildFieldLine('Timer Source:', sourceLabel, width));
    lines.push(buildRule(width));
    lines.push(fitLine(chalk.bold('Countdowns'), width));
    lines.push(buildBulletLine('Interactive inactivity:', stripAnsi(inactivityColor(formatRelativeTime(info.inactivityDeadline, now))), width));

    if (info.loginWindow.active && info.loginWindow.expiresAt) {
        lines.push(buildBulletLine(
            'Browser auth window:',
            `${stripAnsi(browserColor(formatRelativeTime(info.loginWindow.expiresAt, now)))}${info.loginWindow.port ? ` (port ${info.loginWindow.port})` : ''}`,
            width
        ));
    } else {
        lines.push(buildBulletLine('Browser auth window:', 'inactive', width));
    }

    lines.push(buildBulletLine(
        'Owner bypass reuse:',
        bypassActive ? stripAnsi(bypassColor(formatRelativeTime(info.bypassExpiresAt, now))) : 'inactive',
        width
    ));
    lines.push(buildBulletLine(
        'Stored Firebase token:',
        info.storedTokens ? stripAnsi(tokenColor(formatRelativeTime(info.storedTokens.expiresAt, now))) : 'none',
        width
    ));
    lines.push(buildBulletLine('Shared server max age:', formatMs(info.sharedServerSessionMaxAgeMs), width));
    lines.push(buildRule(width));
    lines.push(fitLine(chalk.bold('Status'), width));
    lines.push(buildBulletLine('Last auth:', info.lastAuth > 0 ? stripAnsi(authAgeColor(formatElapsedTime(info.lastAuth, now))) : 'none', width));
    lines.push(buildBulletLine('Last activity:', stripAnsi(activityAgeColor(formatElapsedTime(info.lastActivity, now))), width));
    lines.push(buildBulletLine('Global relogin marker:', reauthMarker, width));
    lines.push(buildRule(width));
    lines.push(fitLine(chalk.bold(`Active Sessions (${activeSessions.length})`), width));

    if (activeSessions.length === 0) {
        lines.push(fitLine(chalk.gray('  No active sessions reported yet.'), width));
    } else {
        activeSessions.slice(0, 6).forEach((session) => {
            lines.push(fitLine(`  ${describeSessionPresence(session, now)}`, width));
        });
        if (activeSessions.length > 6) {
            lines.push(fitLine(chalk.gray(`  ... and ${activeSessions.length - 6} more`), width));
        }
    }

    lines.push(buildRule(width));
    if (SessionTimerManager.isOwner()) {
        lines.push(fitLine(chalk.dim('q/Esc back  r refresh  e edit local timer defaults'), width));
        lines.push(fitLine(chalk.dim('Local edits update your cached defaults. Push to Firebase from Maintenance when ready.'), width));
    } else {
        lines.push(fitLine(chalk.dim('q/Esc back  r refresh'), width));
    }

    const padded = lines.slice(0, height);
    while (padded.length < height) {
        padded.push('');
    }
    return padded.join('\n');
}

async function promptLocalTimerEdit() {
    const inquirer = (await import('inquirer')).default;
    const current = SessionTimerManager.getConfig();
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'projectInactivityMinutes',
            message: 'Interactive inactivity lock (minutes):',
            default: String(Math.max(1, Math.round(current.projectInactivityMs / 60000))),
            validate: (input: string) => /^\d+$/.test(input.trim()) && Number(input.trim()) > 0 ? true : 'Enter a whole number of minutes.'
        },
        {
            type: 'input',
            name: 'browserLoginMinutes',
            message: 'Browser auth window (minutes):',
            default: String(Math.max(1, Math.round(current.browserLoginTimeoutMs / 60000))),
            validate: (input: string) => /^\d+$/.test(input.trim()) && Number(input.trim()) > 0 ? true : 'Enter a whole number of minutes.'
        },
        {
            type: 'input',
            name: 'ownerBypassMinutes',
            message: 'Owner bypass reuse window (minutes):',
            default: String(Math.max(1, Math.round(current.ownerBypassTimeoutMs / 60000))),
            validate: (input: string) => /^\d+$/.test(input.trim()) && Number(input.trim()) > 0 ? true : 'Enter a whole number of minutes.'
        },
        {
            type: 'input',
            name: 'refreshLeadMinutes',
            message: 'Stored token refresh lead (minutes):',
            default: String(Math.max(1, Math.round(current.tokenRefreshSkewMs / 60000))),
            validate: (input: string) => /^\d+$/.test(input.trim()) && Number(input.trim()) > 0 ? true : 'Enter a whole number of minutes.'
        }
    ]);

    SessionTimerManager.updateLocalTimers({
        projectInactivityMs: Number(answers.projectInactivityMinutes) * 60 * 1000,
        browserLoginTimeoutMs: Number(answers.browserLoginMinutes) * 60 * 1000,
        ownerBypassTimeoutMs: Number(answers.ownerBypassMinutes) * 60 * 1000,
        tokenRefreshSkewMs: Number(answers.refreshLeadMinutes) * 60 * 1000
    });
}

export async function runSessionInfoViewer(): Promise<void> {
    try {
        await SessionTimerManager.refreshFromRemote();
        await SessionTimerManager.startRealtimeSync();
    } catch {
        // Best-effort: the viewer can still render cached timers.
    }

    return new Promise((resolve) => {
        let closed = false;
        let interval: NodeJS.Timeout | null = null;
        let interactionBusy = false;
        const openedAltScreen = !io.isAlternateScreenEnabled();

        if (openedAltScreen) {
            io.enableAlternateScreen();
        }

        const close = () => {
            if (closed) return;
            closed = true;
            if (interval) clearInterval(interval);
            io.release(handler);
            io.disableMouse();
            process.stdout.write('\x1b[?25h');
            process.stdout.write('\x1b[0m');
            if (openedAltScreen) {
                io.disableAlternateScreen();
            }
            resolve();
        };

        const render = () => {
            if (closed) return;
            process.stdout.write('\x1b[?25l');
            process.stdout.write('\x1b[H\x1b[J');
            process.stdout.write(buildSessionInfoText(Date.now()));
        };

        const runWithPausedRender = async (task: () => Promise<void>) => {
            if (interactionBusy || closed) return;
            interactionBusy = true;
            if (interval) {
                clearInterval(interval);
                interval = null;
            }
            io.release(handler);
            io.disableMouse();
            process.stdout.write('\x1b[?25h');
            try {
                await task();
            } finally {
                if (!closed) {
                    io.enableMouse();
                    io.consume(handler);
                    render();
                    interval = setInterval(render, 1000);
                }
                interactionBusy = false;
            }
        };

        const handler = (_key: Buffer, str: string) => {
            if (interactionBusy) return;
            if (str === '\r' || str === '\n' || str === 'q' || str === 'Q' || str === '\u001B' || str === '\u0003') {
                close();
                return;
            }
            if (str === 'r' || str === 'R') {
                void runWithPausedRender(async () => {
                    await SessionTimerManager.refreshFromRemote({
                        projectId: state.project.id
                    });
                });
                return;
            }
            if ((str === 'e' || str === 'E') && SessionTimerManager.isOwner()) {
                void runWithPausedRender(promptLocalTimerEdit);
            }
        };

        io.enableMouse();
        io.consume(handler);
        render();
        interval = setInterval(render, 1000);
    });
}
