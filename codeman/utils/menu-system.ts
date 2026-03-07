import chalk from 'chalk';
import { io } from '../core/io';

export interface MenuOption {
    name: string;
    value: string;
    action?: () => Promise<void>; // Simple action (e.g. run command)
    disabled?: boolean;
    internal?: boolean; // If true, skips stdin pause/resume (for smooth menu navigation)
}

export interface MenuConfig {
    title: string;
    subtitle?: string;
    options: MenuOption[];
    backOption?: boolean; // Default true
}

// A Screen is a function that takes props and returns a MenuConfig
// It also gets the 'system' so it can push new screens.
export type ScreenFactory<T = any> = (props: T, system: MenuSystem) => Promise<MenuConfig>;

interface StackItem<T = any> {
    factory: ScreenFactory<T>;
    props: T;
}

export class MenuSystem {
    private stack: StackItem[] = [];
    private currentConfig: MenuConfig | null = null;
    private isRunning = false;
    private selectedIndex = 0;

    // Track the active key handler wrapper so we can release it
    private activeHandler: ((key: Buffer, str: string) => void) | null = null;

    constructor() { }

    // Start with a root screen
    async start<T>(initialScreen: ScreenFactory<T>, props: T): Promise<void> {
        this.isRunning = true;
        await this.push(initialScreen, props);
        await this.inputLoop();
    }

    // Push a new screen onto the stack
    async push<T>(factory: ScreenFactory<T>, props: T) {
        this.stack.push({ factory, props });
        await this.refresh();
        this.selectedIndex = 0; // Reset cursor on new screen
    }

    // Go back one level
    async pop() {
        if (this.stack.length > 1) {
            this.stack.pop();
            await this.refresh();
            // Optional: Restore previous cursor position if we tracked it
            this.selectedIndex = 0;
        } else {
            // Popping root = exit
            this.isRunning = false;
        }
    }

    // Replace current screen (good for wizards)
    async replace<T>(factory: ScreenFactory<T>, props: T) {
        this.stack.pop();
        this.push(factory, props);
    }

    // Re-render the current screen (e.g. after an action updates state)
    async refresh() {
        if (this.stack.length === 0) return;
        const current = this.stack[this.stack.length - 1];
        try {
            this.currentConfig = await current.factory(current.props, this);
        } catch (e) {
            console.error(chalk.red('Error rendering screen:'), e);
            this.pop(); // Fallback
        }
    }

    private async inputLoop() {
        // Ensure IO is started
        io.start();

        const onKeypress = async (key: Buffer, str: string) => {
            if (!this.isRunning || !this.currentConfig) return;

            // Handle Exit
            if (str === '\u0003') { // Ctrl+C
                this.cleanup();
                console.log(chalk.red('\nForce Exit'));
                process.exit(0);
            }

            // Navigation
            const options = this.getEffectiveOptions();

            if (str === '\u001B[A') { // Up
                this.selectedIndex = (this.selectedIndex - 1 + options.length) % options.length;
                this.render();
            } else if (str === '\u001B[B') { // Down
                this.selectedIndex = (this.selectedIndex + 1) % options.length;
                this.render();
            } else if (str === '\r' || str === '\n') { // Enter
                await this.handleSelection(options[this.selectedIndex]);
            } else if (str === 'q' || str === '\u001B') { // q or Escape
                await this.pop();
                if (this.isRunning) this.render();
                // If exited, loop ends naturally via isRunning check? 
                // We actually wait on a promise below. 
                // If isRunning becomes false, the interval will catch it for resolving the valid promise.
            }
        };

        // Attach listener
        this.activeHandler = onKeypress;
        io.consume(onKeypress);

        this.render(); // Initial render

        // Keep alive until isRunning is false
        return new Promise<void>(resolve => {
            const checkInterval = setInterval(() => {
                if (!this.isRunning) {
                    clearInterval(checkInterval);
                    this.cleanup();
                    resolve();
                }
            }, 100);
        });
    }

    private getEffectiveOptions(): MenuOption[] {
        if (!this.currentConfig) return [];
        const opts = [...this.currentConfig.options];

        // Auto-add Back/Exit if not disabled
        if (this.currentConfig.backOption !== false) {
            if (this.stack.length > 1) {
                opts.push({ name: '⬅️  Back', value: '__back__', action: async () => this.pop() });
            } else {
                opts.push({ name: '❌ Exit', value: '__exit__', action: async () => { this.isRunning = false; } });
            }
        }
        return opts;
    }

    private async handleSelection(option: MenuOption) {
        if (!option) return;

        // If it's a navigation action
        if (option.action) {
            // Optimization: If internal (Menu navigation), don't teardown IO
            if (option.internal) {
                try {
                    await option.action();
                } catch (e: any) {
                    console.error(chalk.red(`\n❌ Navigation failed: ${e.message}`));
                }
                this.render();
                return;
            }

            // --- External Action (Run command, Inquirer, etc) ---
            // 1. Release our listener AND Destroy IO to yield full control
            if (this.activeHandler) io.release(this.activeHandler);
            io.destroy();

            io.clear(); // Clear for action output

            try {
                await option.action();
            } catch (e: any) {
                console.error(chalk.red(`\n❌ Action failed: ${e.message}`));
                console.log(chalk.gray('Press any key to return to menu...'));

                // Manually restart IO just to catch a keypress, then destroy again?
                // Or use IOManager for this "Press any key"
                io.start();
                await new Promise<void>(resolve => {
                    const waiter = (k: Buffer, s: string) => {
                        io.release(waiter);
                        resolve();
                    };
                    io.consume(waiter);
                });
                io.destroy(); // Destroy again before returning to clean state
            }

            // Restore
            if (this.isRunning) {
                // Wait a tick to ensure external tool cleanup
                await new Promise(resolve => setTimeout(resolve, 100));

                io.start(); // Restart IO

                // keypress listener was released, re-attach new one
                // We restart consumption with the same handler
                if (this.activeHandler) {
                    io.consume(this.activeHandler);
                }

                await this.refresh();
                this.render();
            }
        }
    }

    private render() {
        if (!this.isRunning || !this.currentConfig) return;

        io.clear();
        console.log(chalk.bold.blue(`🚀 Codebase Management Console`));

        // Breadcrumbs
        if (this.stack.length > 1) {
            const crumbs = this.stack.slice(0, -1).map(() => '●').join(' > ');
            console.log(chalk.gray(`Path: ${crumbs} > ${chalk.white(this.currentConfig.title)}`));
        }

        console.log(chalk.yellow(`\n${this.currentConfig.title}`));
        if (this.currentConfig.subtitle) console.log(chalk.gray(this.currentConfig.subtitle));
        console.log('');

        const options = this.getEffectiveOptions();
        options.forEach((opt, idx) => {
            const isSelected = idx === this.selectedIndex;
            const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
            const label = isSelected ? chalk.cyan.bold(opt.name) : opt.name;
            console.log(`${prefix}${label}`);
        });

        console.log(chalk.dim('\n(Arrows to Move, Enter to Select, q/Esc to Back)'));
    }

    private cleanup() {
        if (this.activeHandler) {
            io.release(this.activeHandler);
            this.activeHandler = null;
        }
        io.destroy();
        io.clear();
    }
}
