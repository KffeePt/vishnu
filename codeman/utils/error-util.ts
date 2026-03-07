import chalk from 'chalk';

export class ErrorUtil {
    /**
     * Standardized error handler.
     * Logs the error, waits for a specified delay, and optionally exits.
     * @param error The error object or message
     * @param context Optional context description (e.g. "Loading Session")
     * @param fatal Whether to exit the process after logging (default: false)
     */
    public static async handleError(error: any, context?: string, fatal: boolean = false): Promise<void> {
        const { Logger } = await import('./logger');
        Logger.error(`ErrorUtil caught error: ${context || 'No Context'}`, error);

        console.log('\n');
        console.log(chalk.bgRed.white.bold(' ❌ ERROR '));

        if (context) {
            console.log(chalk.yellow(`Context: ${context}`));
        }

        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.red(message));

        // Optional: Debug mode check if we had a config for it
        if (error.stack && process.env.DEBUG) {
            console.log(chalk.gray(error.stack));
        }

        // console.log(chalk.gray('\nWaiting 3 seconds...'));
        // await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('\n');
        console.log('\n');
        console.log('\n');
        console.log('\n');
        console.log(chalk.gray('Options:'));
        console.log(chalk.cyan(' [c] Copy Error to Clipboard'));
        console.log(chalk.white(' [Any Key] Continue / Exit'));

        // Use centralized IO Manager to prevent conflicts
        try {
            const { io } = await import('../core/io');

            await new Promise<void>(resolve => {
                const handler = async (key: Buffer, str: string) => {
                    const char = str ? str.toLowerCase() : '';

                    if (char === 'c') {
                        // Copy logic
                        try {
                            const { spawn } = await import('child_process');
                            const fullError = `Context: ${context || 'None'}\nError: ${message}\nStack: ${error.stack || ''}`;
                            const child = spawn('clip', [], { stdio: ['pipe', 'ignore', 'ignore'] });
                            child.stdin.write(fullError);
                            child.stdin.end();

                            console.log(chalk.green('\n✅ Error copied to clipboard!'));
                            // Small delay to let them see the message before exiting
                            await new Promise(r => setTimeout(r, 800));
                        } catch (copyErr) {
                            console.log(chalk.red('\n❌ Failed to copy to clipboard.'));
                        }
                    }

                    // Cleanup and continue
                    io.release(handler);
                    resolve();
                };

                io.consume(handler);
            });
        } catch (e) {
            // Fallback if IO fails
            Logger.error('ErrorUtil: Failed to attach IO consumer', e);
            console.log(chalk.gray('(Interactive pause failed, continuing in 5s...)'));
            await new Promise(r => setTimeout(r, 5000));
        }

        if (fatal) {
            Logger.log('ErrorUtil: Fatal error, exiting process.');
            process.exit(1);
        }
    }

    /**
     * Displays a critical runtime error with a standardized "💥 RUNTIME ERROR" banner.
     * Used for major failures in the Engine or Shiva instances.
     */
    public static async showRuntimeError(error: any, context: string): Promise<void> {
        const { Logger } = await import('./logger');
        const { io } = await import('../core/io');

        Logger.error(`Runtime Error in ${context}`, error);

        console.clear();
        console.log(chalk.bold.bgRed(' 💥 RUNTIME ERROR '));
        console.log(chalk.red(`\nAn error occurred while ${context}:`));

        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow(message));

        if (error instanceof Error && error.stack) {
            console.log(chalk.dim('\nStack Trace:'));
            console.log(chalk.dim(error.stack.split('\n').map((l: string) => '  ' + l).join('\n')));
        }

        console.log(chalk.white('\nAttempting to recover...'));
        console.log(chalk.cyan('Copy error to clipboard? (Y/N)'));

        // Wait for user input to acknowledge
        try {
            await new Promise<void>(resolve => {
                const handler = async (key: Buffer, str: string) => {
                    const char = str ? str.toLowerCase() : '';

                    if (char === 'y') {
                        // Copy logic
                        try {
                            const { spawn } = await import('child_process');
                            const fullError = `Context: ${context || 'None'}\nError: ${message}\nStack: ${error.stack || ''}`;
                            const child = spawn('clip', [], { stdio: ['pipe', 'ignore', 'ignore'] });
                            child.stdin.write(fullError);
                            child.stdin.end();

                            console.log(chalk.green('\n✅ Error copied to clipboard!'));
                            await new Promise(r => setTimeout(r, 800)); // Short delay to see success
                        } catch (copyErr) {
                            console.log(chalk.red('\n❌ Failed to copy to clipboard.'));
                        }
                    }

                    // Release and resolve on any key (Y processes copy then resolves, N/others resolve immediately)
                    io.release(handler);
                    resolve();
                };
                io.consume(handler);
            });
        } catch (e) {
            // Fallback if IO system is down
            console.log(chalk.gray('(Input system unavailable, waiting 5s...)'));
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}
