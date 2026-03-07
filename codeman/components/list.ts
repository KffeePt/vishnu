import chalk from 'chalk';
import { io } from '../core/io';

function stripAnsi(str: string): string {
    return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

export async function List<T>(
    message: string,
    choices: ({ name: string; value: T } | { type: 'separator'; line: string })[],
    options: { pageSize?: number; overlay?: string; overlayTTL?: number } = {}
): Promise<T> {
    return new Promise((resolve, reject) => {
        // IO Manager should be active. 
        // We register our consumer.

        let index = 0;
        let windowStart = 0;
        let activeOverlay = options.overlay;
        let overlayTimeout: NodeJS.Timeout | null = null;

        if (activeOverlay && options.overlayTTL) {
            overlayTimeout = setTimeout(() => {
                activeOverlay = undefined;
                render();
            }, options.overlayTTL);
        }

        // Skip separators initially
        while (index < choices.length && 'type' in choices[index] && (choices[index] as any).type === 'separator') {
            index++;
        }

        const render = (fullClear: boolean = false) => {
            try {
                // Buffer Strategy: Home -> Content -> Clear Down
                // On resize (fullClear), we must wipe the entire screen to prevent artifacting from wrapped text.
                // We also use Clear Line (K) for each line to prevent ghosting of previous longer lines.
                let output = fullClear ? '\x1b[2J\x1b[H' : '\x1b[H';

                output += message.split('\n').join('\x1b[K\n') + '\x1b[K\n';

                // Calculate Safe Page Size
                const rows = process.stdout.rows || 25;
                const cols = process.stdout.columns || 80;

                const messageLines = message.split('\n').length;
                const headerHeight = messageLines + 1; // +1 for extra newline
                const footerHeight = 4; // arrows + help text + buffer
                const availableRows = Math.max(1, rows - headerHeight - footerHeight);
                const actualPageSize = Math.min(options.pageSize || choices.length, availableRows);

                // Smart Scroll Adjustment
                // 1. Ensure Index is visible
                if (index < windowStart) {
                    windowStart = index;
                } else if (index >= windowStart + actualPageSize) {
                    windowStart = index - actualPageSize + 1;
                }

                // 2. Optimization: If window grew, try to expand view upwards or fill bottom
                // If the entire list fits, reset start to 0
                if (choices.length <= actualPageSize) {
                    windowStart = 0;
                }
                // If we have empty space at the bottom (windowStart + size > length), shift up
                else if (windowStart + actualPageSize > choices.length) {
                    windowStart = Math.max(0, choices.length - actualPageSize);
                }

                const visibleChoices = choices.slice(windowStart, windowStart + actualPageSize);

                if (windowStart > 0) output += chalk.gray('  ↑ ...') + '\x1b[K\n';

                visibleChoices.forEach((c, i) => {
                    const actualIndex = windowStart + i;
                    if ('type' in c && c.type === 'separator') {
                        output += chalk.dim(`  ${c.line || '──────────────'}`) + '\x1b[K\n';
                    } else {
                        const choice = c as { name: string; value: T };
                        if (actualIndex === index) {
                            output += chalk.cyan(`> ${choice.name}`) + '\x1b[K\n';
                        } else {
                            output += `  ${choice.name}` + '\x1b[K\n';
                        }
                    }
                });

                if (windowStart + actualPageSize < choices.length) output += chalk.gray('  ↓ ...') + '\x1b[K\n';

                output += chalk.dim('\n(Use arrows to move, Enter to select, \'q\' to go back)')
                    .split('\n').map(l => l + '\x1b[K').join('\n') + '\n';

                // Clear remaining screen logic
                output += '\x1b[J';

                // OVERLAY RENDERING
                if (activeOverlay) {
                    // Position at Top Right, just below the header text lines (which might be 1 or more)
                    // Actually, let's put it on line 2 (1-indexed) if possible, or align with first line if space?
                    // User asked: "Top Right below header"
                    // headerHeight includes the extra newline.
                    // Let's target the line *after* the header text, which is effectively the blank line separator.
                    // Or maybe just the first line of the header?
                    // messageLines is user provided text.
                    // Let's put it on line 2 explicitly for consistency, or line (messageLines + 1).
                    // If messageLines is 1 (Title), then Line 2 is the blank space before list. Perfect.
                    const overlayRow = Math.max(1, messageLines + 1);
                    const cleanOverlay = stripAnsi(activeOverlay);
                    const overlayCol = Math.max(1, cols - cleanOverlay.length - 2); // -2 padding

                    // Sequence: Save Cursor -> Move -> Print -> Restore Cursor
                    // \x1b7 (Save), \x1b8 (Restore)
                    output += `\x1b7\x1b[${overlayRow};${overlayCol}H${activeOverlay}\x1b8`;
                }

                process.stdout.write(output);
            } catch (e) {
                // If render fails, we must cleanup and reject
                cleanup();
                reject(e);
            }
        };

        const onResize = () => {
            render(true);
        };

        const cleanup = () => {
            if (overlayTimeout) clearTimeout(overlayTimeout);
            io.release(handler);
            process.stdout.off('resize', onResize);
        };

        const handler = (key: Buffer, str: string) => {
            const char = str; // Use the provided string from IO

            // Clear overlay on any interaction?
            // User requirement: "disappear after 2 seconds"
            // But usually feedback disappears on action too.
            // Let's KEEP it for the 2 seconds unless explicit logic says otherwise, 
            // OR we can clear it on keypress. 
            // The prompt says "After the 2 seconds it lingers... make it disappear after 2 seconds".
            // It doesn't explicitly say "clear on keypress".
            // I'll leave the timer as the primary clear method, but usually interaction should clear "Press q again" messages.
            // However, if I press 'Up', I still want to know I need to press 'q' to exit? 
            // Actually, if I press 'Up', I am interacting with menu, so I am NOT exiting.
            // The state in Engine resets `lastRootBackAttempt`? No, ONLY if I press 'q' again.
            // If I press 'Up', `lastRootBackAttempt` remains.
            // Logic in Engine: `if (now - this.lastRootBackAttempt < 2000)`
            // So if I press 'Up', then 'q', it might still work if within 2s?
            // Engine logic is strictly checked inside `result === '__BACK__'`.
            // So only if List returns `__BACK__`.
            // So if I press Up, List doesn't return.
            // So it's fine.

            if (char === '\u001B[A') { // Up
                let nextIndex = index;
                do {
                    nextIndex = (nextIndex - 1 + choices.length) % choices.length;
                } while ('type' in choices[nextIndex] && (choices[nextIndex] as any).type === 'separator');
                index = nextIndex;
                render();
            } else if (char === '\u001B[B') { // Down
                let nextIndex = index;
                do {
                    nextIndex = (nextIndex + 1) % choices.length;
                } while ('type' in choices[nextIndex] && (choices[nextIndex] as any).type === 'separator');
                index = nextIndex;
                render();
            } else if (char === 'q') { // Back
                cleanup();
                resolve('__BACK__' as T);
            } else if (char === '\r' || char === '\n') {
                cleanup();
                const selected = choices[index];
                if ('value' in selected) {
                    resolve(selected.value);
                } else {
                    // Should not happen if logic is correct
                    resolve(null as any);
                }
            } else if (char === '\u0003') { // Ctrl+C
                cleanup();
                process.exit(0);
            }
        };

        process.stdout.on('resize', onResize);
        io.consume(handler);
        render();
    });
}
