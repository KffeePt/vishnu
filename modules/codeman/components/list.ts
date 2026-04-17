import chalk from 'chalk';
import { io } from '@vishnu/platform';

function stripAnsi(str: string): string {
    return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

export async function List<T>(
    message: string,
    choices: ({ name: string; value: T } | { type: 'separator'; line: string })[],
    options: { pageSize?: number; overlay?: string; overlayTTL?: number } = {}
): Promise<T> {
    return new Promise((resolve, reject) => {
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

        while (index < choices.length && 'type' in choices[index] && (choices[index] as any).type === 'separator') {
            index++;
        }

        const render = (fullClear: boolean = false) => {
            try {
                let output = fullClear ? '\x1b[2J\x1b[H' : '\x1b[H';

                output += message.split('\n').join('\x1b[K\n') + '\x1b[K\n';

                const rows = process.stdout.rows || 25;
                const cols = process.stdout.columns || 80;
                const messageLines = message.split('\n').length;
                const headerHeight = messageLines + 1;
                const footerHeight = 4;
                const availableRows = Math.max(1, rows - headerHeight - footerHeight);
                const actualPageSize = Math.min(options.pageSize || choices.length, availableRows);

                if (index < windowStart) {
                    windowStart = index;
                } else if (index >= windowStart + actualPageSize) {
                    windowStart = index - actualPageSize + 1;
                }

                if (choices.length <= actualPageSize) {
                    windowStart = 0;
                } else if (windowStart + actualPageSize > choices.length) {
                    windowStart = Math.max(0, choices.length - actualPageSize);
                }

                const visibleChoices = choices.slice(windowStart, windowStart + actualPageSize);

                if (windowStart > 0) output += chalk.gray('  ↑ ...') + '\x1b[K\n';

                visibleChoices.forEach((choiceOrSeparator, visibleIndex) => {
                    const actualIndex = windowStart + visibleIndex;
                    if ('type' in choiceOrSeparator && choiceOrSeparator.type === 'separator') {
                        output += chalk.dim(`  ${choiceOrSeparator.line || '──────────────'}`) + '\x1b[K\n';
                    } else {
                        const choice = choiceOrSeparator as { name: string; value: T };
                        if (actualIndex === index) {
                            output += chalk.cyan(`> ${choice.name}`) + '\x1b[K\n';
                        } else {
                            output += `  ${choice.name}` + '\x1b[K\n';
                        }
                    }
                });

                if (windowStart + actualPageSize < choices.length) output += chalk.gray('  ↓ ...') + '\x1b[K\n';

                output += chalk.dim('\n(Use arrows to move, Enter to select, \'q\' to go back)')
                    .split('\n')
                    .map(line => line + '\x1b[K')
                    .join('\n') + '\n';
                output += '\x1b[J';

                if (activeOverlay) {
                    const overlayRow = Math.max(1, messageLines + 1);
                    const cleanOverlay = stripAnsi(activeOverlay);
                    const overlayCol = Math.max(1, cols - cleanOverlay.length - 2);
                    output += `\x1b7\x1b[${overlayRow};${overlayCol}H${activeOverlay}\x1b8`;
                }

                process.stdout.write(output);
            } catch (error) {
                cleanup();
                reject(error);
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

        const handler = (_key: Buffer, str: string) => {
            const char = str;

            if (char === '\u001B[A') {
                let nextIndex = index;
                do {
                    nextIndex = (nextIndex - 1 + choices.length) % choices.length;
                } while ('type' in choices[nextIndex] && (choices[nextIndex] as any).type === 'separator');
                index = nextIndex;
                render();
            } else if (char === '\u001B[B') {
                let nextIndex = index;
                do {
                    nextIndex = (nextIndex + 1) % choices.length;
                } while ('type' in choices[nextIndex] && (choices[nextIndex] as any).type === 'separator');
                index = nextIndex;
                render();
            } else if (char === 'q') {
                cleanup();
                resolve('__BACK__' as T);
            } else if (char === '\r' || char === '\n') {
                cleanup();
                const selected = choices[index];
                if ('value' in selected) {
                    resolve(selected.value);
                } else {
                    resolve(null as any);
                }
            } else if (char === '\u0003') {
                cleanup();
                process.exit(0);
            }
        };

        process.stdout.on('resize', onResize);
        io.consume(handler);
        render();
    });
}
