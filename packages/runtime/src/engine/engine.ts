import chalk from 'chalk';
import { io, registry, state, type KeyHandler, type MenuId } from '@vishnu/platform';

export class Engine {
    private currentId: MenuId = 'ROOT';
    private history: MenuId[] = [];
    private running: boolean = true;
    private inactivityCheck: NodeJS.Timeout | null = null;
    private lastRootBackAttempt: number = 0;
    private initialCwd: string = process.env.CODEMAN_INITIAL_CWD || process.cwd();
    private sessionExpired: boolean = false;
    private globalHandler: ((key: Buffer, str: string) => void) | null = null;

    constructor() {
        this.globalHandler = this.handleGlobalInput.bind(this);
    }

    private handleGlobalInput(_key: Buffer, str: string) {
        if (str === '\u0003') {
            this.shutdown();
        }
    }

    private pauseGlobalListener() {
        if (this.globalHandler) {
            io.release(this.globalHandler as KeyHandler);
        }
    }

    private resumeGlobalListener() {
        if (this.globalHandler) {
            io.consume(this.globalHandler as KeyHandler);
        }
    }

    async start(initialId: MenuId = 'ROOT') {
        this.currentId = initialId;

        io.start();
        io.enableAlternateScreen();
        io.enableMouse();

        const fs = await import('fs');
        const path = await import('path');
        const lockFile = path.join(process.cwd(), '.codeman.lock');

        try {
            if (fs.existsSync(lockFile)) {
                const pid = parseInt(fs.readFileSync(lockFile, 'utf-8').trim());
                if (!isNaN(pid) && pid !== process.pid) {
                    try {
                        process.kill(pid, 0);
                        io.clear();
                        console.log(chalk.red.bold('\n\n⛔ INSTANCE LOCKED'));
                        console.log(chalk.yellow(`\nA CodeMan instance (PID: ${pid}) is already running in this folder.`));
                        console.log(chalk.gray('Multiple instances per folder are disabled to prevent script conflicts.'));
                        console.log(chalk.white('\nPlease close the other instance or manually delete .codeman.lock if it is stale.'));
                        process.exit(1);
                    } catch {
                    }
                }
            }
            fs.writeFileSync(lockFile, process.pid.toString());
        } catch {
        }

        this.resumeGlobalListener();

        this.inactivityCheck = setInterval(async () => {
            if (state.user && !this.sessionExpired && !state.isBusy && (Date.now() - io.lastActivity > 60 * 60 * 1000)) {
                this.sessionExpired = true;
                state.user = undefined;

                process.stdin.emit('data', '\r');
                io.start();

                io.clear();
                console.log('\n\n');
                console.log(chalk.red.bold('  ⚠️  SESSION TIMED OUT ⚠️  '));
                console.log(chalk.gray('  You have been inactive for 1 hour.'));
                console.log(chalk.white('\n  Returning to Launcher in...'));

                const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

                await wait(1000);
                console.log(chalk.yellow('  3...'));
                await wait(1000);
                console.log(chalk.yellow('  2...'));
                await wait(1000);
                console.log(chalk.yellow('  1...'));
                await wait(1000);

                const { restartCLI } = await import('../../../../codeman/core/restart');
                await restartCLI('ROOT');
                this.running = false;
            }
        }, 10 * 1000);

        try {
            while (this.running) {
                if (this.sessionExpired) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }

                try {
                    const node = registry.get(this.currentId);
                    if (!node) {
                        throw new Error(`Menu '${this.currentId}' not found in registry.`);
                    }

                    io.clear();
                    state.isTransitioning = true;
                    this.pauseGlobalListener();

                    let result;
                    try {
                        result = await node.render(undefined, state);
                    } finally {
                        state.isTransitioning = false;
                        this.resumeGlobalListener();
                    }

                    if (this.sessionExpired) {
                        continue;
                    }

                    if (result === '__BACK__') {
                        if (this.history.length > 0) {
                            this.currentId = this.history.pop()!;
                        } else if (this.currentId === 'ROOT') {
                            const now = Date.now();
                            if (now - this.lastRootBackAttempt < 2000) {
                                process.env.CODEMAN_FORCE_LAUNCHER = 'true';

                                try {
                                    if (this.initialCwd && this.initialCwd !== process.cwd()) {
                                        process.chdir(this.initialCwd);
                                    }
                                } catch {
                                }

                                state.shouldRestart = true;
                                state.restartTargetNode = 'ROOT';
                                this.running = false;
                            } else {
                                this.lastRootBackAttempt = now;
                                state.tempMessage = chalk.yellow('Press q again to exit session...');
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
                        if (this.currentId !== nextId) {
                            this.history.push(this.currentId);
                        }
                        this.currentId = nextId;
                    }
                } catch (innerError: any) {
                    this.resumeGlobalListener();

                    const { ErrorUtil } = await import('../../../../codeman/utils/error-util');
                    await ErrorUtil.showRuntimeError(innerError, `rendering menu '${this.currentId}'`);

                    this.currentId = state.user ? 'ROOT' : 'AUTH';
                }
            }
        } catch (fatalError) {
            console.error('Fatal Engine Crash:', fatalError);
        } finally {
            if (this.inactivityCheck) clearInterval(this.inactivityCheck);
            this.pauseGlobalListener();
            this.shutdown();
        }

        if (state.shouldRestart) {
            const { restartCLI } = await import('../../../../codeman/core/restart');
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

        try {
            const fs = require('fs');
            const path = require('path');
            const lockFile = path.join(process.cwd(), '.codeman.lock');
            if (fs.existsSync(lockFile)) {
                const pid = parseInt(fs.readFileSync(lockFile, 'utf-8').trim());
                if (pid === process.pid) {
                    fs.unlinkSync(lockFile);
                }
            }
        } catch {
        }

        if (!state.shouldRestart) {
            console.log('\nExiting CodeMan...');
            process.exit(0);
        }
    }
}
