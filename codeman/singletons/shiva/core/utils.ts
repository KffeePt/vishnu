import process from 'process';

export const Colors = {
    CYAN: '\x1b[96m',
    GREEN: '\x1b[92m',
    YELLOW: '\x1b[93m',
    RED: '\x1b[91m',
    MAGENTA: '\x1b[95m',
    BLUE: '\x1b[94m',
    WHITE: '\x1b[97m',
    ENDC: '\x1b[0m',
};

export function getRainbowColor(offset: number, i: number, intensity: number = 1.0): string {
    const freq = 0.3;
    const width = 127 * intensity;
    const center = 128 * intensity;

    const r = Math.floor(Math.sin(freq * i + offset) * width + center);
    const g = Math.floor(Math.sin(freq * i + offset + 2 * Math.PI / 3) * width + center);
    const b = Math.floor(Math.sin(freq * i + offset + 4 * Math.PI / 3) * width + center);

    return `\x1b[38;2;${r};${g};${b}m`;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function animateTextWave(text: string, baseOffset: number = 0, delay: number = 5): Promise<void> {
    // Optimization: If delay is 0, use batching to speed up without being instant.
    // If delay < 0, instant buffer.
    if (delay < 0) {
        let buffer = '';
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '\n') {
                buffer += char;
                continue;
            }
            const color = getRainbowColor(baseOffset, i);
            buffer += `${color}${char}`;
        }
        process.stdout.write(buffer + Colors.ENDC);
        return;
    }

    // "Fast but visible" mode for delay = 0
    // Batch output to reduce yielding overhead (e.g. 15 chars per tick)
    const batchSize = delay === 0 ? 15 : 1;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '\n') {
            process.stdout.write(char);
            continue;
        }
        const color = getRainbowColor(baseOffset, i);
        process.stdout.write(`${color}${char}`);

        // Yield only every batchSize chars
        if (i % batchSize === 0) {
            await sleep(delay);
        }
    }
    process.stdout.write(Colors.ENDC);
}

export function clearScreen(): void {
    // \x1b[2J clears screen, \x1b[0f moves cursor to top-left
    process.stdout.write('\x1b[2J\x1b[0f');
}
