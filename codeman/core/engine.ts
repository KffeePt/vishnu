import { MenuId } from './types';
import chalk from 'chalk';
import { io, KeyHandler } from './io';

import readline from 'readline';
import { registry } from './registry';
import { state } from './state';


export class Engine {
    private currentId: MenuId = 'ROOT';
    private history: MenuId[] = [];
    private running: boolean = true;
    private inactivityCheck: NodeJS.Timeout | null = null;
    private lastRootBackAttempt: number = 0;
    private initialCwd: string = process.env.CODEMAN_INITIAL_CWD || process.cwd(); // Store starting path
    private transientMessage: string | null = null; // Temporary status for next frame
    private sessionExpired: boolean = false;
    private globalHandler: ((key: Buffer, str: string) => void) | null = null;

    constructor() {
        this.globalHandler = this.handleGlobalInput.bind(this);
    }

    private handleGlobalInput(key: Buffer, str: string) {
        if (str === '\u0003') { // CTRL+C
            this.shutdown();
        }
    }

    private pauseGlobalListener() {
        if (this.globalHandler) {
            io.release(this.globalHandler);
        }
    }

    private resumeGlobalListener() {
        if (this.globalHandler) {
            io.consume(this.globalHandler);
        }
    }

    async start(initialId: MenuId = 'ROOT') {
        this.currentId = initialId;

        // Start IO Manager
        io.start();
        io.enableAlternateScreen();
        io.enableMouse();

        // ---------------------------------------------------------
        // INSTANCE LOCKING
        // ---------------------------------------------------------

        // We need to ensure only one instance runs per folder to prevent
        // conflicted "Shiva" script runners or state.
        const fs = await import('fs');
        const path = await import('path');
        const lockFile = path.join(process.cwd(), '.codeman.lock');

        try {
            if (fs.existsSync(lockFile)) {
                const pid = parseInt(fs.readFileSync(lockFile, 'utf-8').trim());
                if (!isNaN(pid)) {
                    // Check if process is running
                    if (pid !== process.pid) { // Ignore if it's OUR lock (created by registry early)
                        try {
                            process.kill(pid, 0); // signal 0 just checks existence
                            // If we are here, it IS running.
                            io.clear();
                            console.log(chalk.red.bold('\n\n⛔ INSTANCE LOCKED'));
                            console.log(chalk.yellow(`\nA CodeMan instance (PID: ${pid}) is already running in this folder.`));
                            console.log(chalk.gray('Multiple instances per folder are disabled to prevent script conflicts.'));
                            console.log(chalk.white('\nPlease close the other instance or manually delete .codeman.lock if it is stale.'));
                            process.exit(1);
                        } catch (e) {
                            // Process not found, lock is stale.
                            // We can proceed and overwrite.
                        }
                    }
                }
            }
            // Create Lock
            fs.writeFileSync(lockFile, process.pid.toString());
        } catch (e) {
            // Permission error or other issue?
            // Warn but proceed?
        }

        // Cleanup Lock on Exit is handled in shutdown, 
        // but we should also handle process events?
        // The Engine.shutdown() calls process.exit, so we can do it there.
        // But for SIGINT/SIGTERM catching which usually calls shutdown(), it should work.

        // ---------------------------------------------------------

        // Initial attach
        this.resumeGlobalListener();

        // Inactivity Monitor (10 minutes)
        this.inactivityCheck = setInterval(async () => {
            // Check if user is logged in AND inactive AND not busy
            if (state.user && !this.sessionExpired && !state.isBusy && (Date.now() - io.lastActivity > 60 * 60 * 1000)) {
                this.sessionExpired = true;
                state.user = undefined; // Unauthenticate

                // 1. Force-resolve any pending inquirer prompt by emitting 'Enter'
                process.stdin.emit('data', '\r');

                // 2. Ensure Raw Mode (via IO, though it should be active)
                io.start();

                // 3. Auto-Restart Countdown
                io.clear();
                console.log('\n\n');
                console.log(chalk.red.bold('  ⚠️  SESSION TIMED OUT ⚠️  '));
                console.log(chalk.gray('  You have been inactive for 1 hour.'));
                console.log(chalk.white('\n  Returning to Launcher in...'));

                const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

                await wait(1000);
                console.log(chalk.yellow('  3...'));
                await wait(1000);
                console.log(chalk.yellow('  2...'));
                await wait(1000);
                console.log(chalk.yellow('  1...'));
                await wait(1000);

                // 4. Force Restart
                const { restartCLI } = await import('./restart');
                await restartCLI('ROOT');
                this.running = false;
            }
        }, 10 * 1000);

        try {
            while (this.running) {
                // Check if session expired mid-loop BEFORE rendering
                if (this.sessionExpired) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                try {
                    const node = registry.get(this.currentId);
                    if (!node) {
                        throw new Error(`Menu '${this.currentId}' not found in registry.`);
                    }

                    // Clear screen for a fresh render
                    io.clear();

                    // LOCK UI & PAUSE GLOBAL LISTENER
                    // Components will attach their own listeners. We don't want to fight generally,
                    // or double-consume inputs.
                    state.isTransitioning = true;
                    this.pauseGlobalListener();

                    let result;
                    try {
                        result = await node.render(undefined, state);
                    } finally {
                        // UNLOCK UI & RESUME LISTENER
                        state.isTransitioning = false;
                        this.resumeGlobalListener();
                    }

                    // If session expired WHILE rendering
                    if (this.sessionExpired) {
                        continue;
                    }

                    if (result === '__BACK__') {
                        if (this.history.length > 0) {
                            this.currentId = this.history.pop()!;
                        } else if (this.currentId === 'ROOT') {
                            // Double-press confirmation at ROOT (2 second window)
                            const now = Date.now();
                            if (now - this.lastRootBackAttempt < 2000) {
                                // User confirmed - FORCE RESTART to Launcher (Clean Slate)
                                // We use an env var to tell the next process to ignore local .env for setup
                                process.env.CODEMAN_FORCE_LAUNCHER = 'true';

                                // PHYSICALLY leave the folder if possible, to prevent auto-detection by CWD checks
                                try {
                                    if (this.initialCwd && this.initialCwd !== process.cwd()) {
                                        process.chdir(this.initialCwd);
                                    }
                                } catch (e) { /* Ignore */ }

                                state.shouldRestart = true;
                                state.restartTargetNode = 'ROOT';
                                this.running = false; // Break loop
                            } else {
                                this.lastRootBackAttempt = now;
                                // Brief feedback
                                state.tempMessage = chalk.yellow('Press q again to exit session...');
                                // DONT SLEEP here, or we block the input loop 
                            }
                        } else {
                            this.currentId = 'ROOT';
                        }
                        continue;
                    }

                    const nextId = node.next(result);
                    if (!nextId) {
                        this.running = false;
                    } else {
                        // Avoid pushing duplicates to history if looping state
                        if (this.currentId !== nextId) {
                            this.history.push(this.currentId);
                        }
                        this.currentId = nextId;
                    }
                } catch (innerError: any) {
                    // Ensure listener is back if we crashed out or failed
                    this.resumeGlobalListener();

                    // ERROR BOUNDARY
                    const { ErrorUtil } = await import('../utils/error-util');
                    await ErrorUtil.showRuntimeError(innerError, `rendering menu '${this.currentId}'`);

                    // Recover strategy
                    this.currentId = state.user ? 'ROOT' : 'AUTH';
                }
            }
        } catch (fatalError) {
            console.error("Fatal Engine Crash:", fatalError);
        } finally {
            if (this.inactivityCheck) clearInterval(this.inactivityCheck);
            this.pauseGlobalListener();
            this.shutdown();
        }

        // Handle Restart
        if (state.shouldRestart) {
            const { restartCLI } = await import('./restart');
            // If restartTargetNode is set, use it. Otherwise default to 'AUTH' if secure, or 'ROOT'
            // For safety, if cloudFeaturesEnabled is true, we usually want AUTH.
            // But if user explicitly requested a Clean Restart (ROOT), we favor that.
            const target = state.restartTargetNode || (state.cloudFeaturesEnabled ? 'AUTH' : 'ROOT');
            await restartCLI(target);
            process.exit(0);
        }
    }

    shutdown() {
        this.running = false;
        io.disableMouse();
        io.disableAlternateScreen();
        io.destroy();

        // Remove Lock
        try {
            const fs = require('fs'); // Safe sync require or use import if async allowed (but shutdown is sync-ish often)
            // ideally we used `import`. But `shutdown` is synchronous in flow usually.
            // We can use fs from import if available, but let's just use try-catch require for safety in this strict method.
            const path = require('path');
            const lockFile = path.join(process.cwd(), '.codeman.lock');
            if (fs.existsSync(lockFile)) {
                // Verify it is OUR lock
                const pid = parseInt(fs.readFileSync(lockFile, 'utf-8').trim());
                if (pid === process.pid) {
                    fs.unlinkSync(lockFile);
                }
            }
        } catch (e) { }

        if (!state.shouldRestart) {
            console.log('\nExiting CodeMan...');
            process.exit(0);
        }
    }
}
