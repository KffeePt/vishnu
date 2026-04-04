import chalk from 'chalk';
import path from 'path';
import { AuthService } from './auth';
import { io } from './io';
import { state } from './state';
import { AuthTokenStore } from './auth/token-store';
import { UserConfigManager } from '../config/user-config';

const PROJECT_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

function formatDuration(ms: number): string {
    const safe = Math.max(0, Math.floor(ms));
    const totalSeconds = Math.floor(safe / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

function formatRelativeTime(targetMs: number, now = Date.now()): string {
    const remaining = targetMs - now;
    if (remaining <= 0) {
        return 'expired';
    }
    return `${formatDuration(remaining)} remaining`;
}

function formatElapsedTime(startMs: number, now = Date.now()): string {
    const elapsed = now - startMs;
    if (elapsed <= 0) {
        return 'just now';
    }
    return `${formatDuration(elapsed)} ago`;
}

export function buildSessionInfo(now = Date.now()) {
    const projectRoot = state.project.rootPath || process.cwd();
    const projectType = state.project.type;
    const lastActivity = io.lastActivity;
    const inactivityDeadline = lastActivity + PROJECT_INACTIVITY_TIMEOUT_MS;
    const authMode = UserConfigManager.getAuthMode();
    const bypassExpiresAt = UserConfigManager.getAuthBypassExpiresAt();
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
        bypassRemainingMs: bypassExpiresAt > 0 ? Math.max(0, bypassExpiresAt - now) : 0,
        lastAuth,
        lastAuthAgeMs: lastAuth > 0 ? Math.max(0, now - lastAuth) : 0,
        cachedUser,
        loginWindow,
        storedTokens,
        storedTokenRemainingMs: storedTokens ? Math.max(0, storedTokens.expiresAt - now) : 0
    };
}

export function printSessionInfo(now = Date.now()) {
    const info = buildSessionInfo(now);
    const userLabel = info.cachedUser?.email || state.user?.email || 'not signed in';
    const bypassActive = info.authMode === 'owner-bypass' && info.bypassExpiresAt > now;

    console.log(chalk.bold.cyan('\n⏳ Session Info / Timers'));
    console.log(chalk.gray('------------------------------------------------------------'));
    console.log(`${chalk.bold('Project Root:')} ${info.projectRoot}`);
    console.log(`${chalk.bold('Project Type:')} ${info.projectType}`);
    console.log(`${chalk.bold('Current User:')} ${userLabel}`);
    console.log(`${chalk.bold('Auth Mode:')} ${info.authMode}${bypassActive ? chalk.yellow(' (active bypass)') : ''}`);
    console.log(`${chalk.bold('Last Auth:')} ${info.lastAuth > 0 ? formatElapsedTime(info.lastAuth, now) : 'none'}`);
    console.log(`${chalk.bold('Last Activity:')} ${formatElapsedTime(info.lastActivity, now)}`);
    console.log(chalk.gray('------------------------------------------------------------'));
    console.log(chalk.bold('Session Timers'));
    console.log(`  ${chalk.bold('Local inactivity logout:')} ${formatRelativeTime(info.inactivityDeadline, now)}${info.inactivityRemainingMs === 0 ? chalk.red(' (will lock on next timeout check)') : ''}`);

    if (info.loginWindow.active && info.loginWindow.expiresAt) {
        console.log(`  ${chalk.bold('Browser auth window:')} ${formatRelativeTime(info.loginWindow.expiresAt, now)}${info.loginWindow.port ? chalk.gray(` (port ${info.loginWindow.port})`) : ''}`);
    } else {
        console.log(`  ${chalk.bold('Browser auth window:')} inactive`);
    }

    if (bypassActive) {
        console.log(`  ${chalk.bold('Owner bypass TTL:')} ${formatRelativeTime(info.bypassExpiresAt, now)}`);
    } else {
        console.log(`  ${chalk.bold('Owner bypass TTL:')} inactive`);
    }

    if (info.storedTokens) {
        console.log(`  ${chalk.bold('Stored Firebase token:')} ${formatRelativeTime(info.storedTokens.expiresAt, now)}`);
    } else {
        console.log(`  ${chalk.bold('Stored Firebase token:')} none`);
    }

    console.log(chalk.gray('------------------------------------------------------------'));
    console.log(chalk.dim('These are live session values from the current project and auth state.'));
}
