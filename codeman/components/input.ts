import { GlobalState } from '../core/state';
import { io } from '../core/io';

export async function Input(message: string, state: GlobalState): Promise<string> {
    return new Promise((resolve) => {
        process.stdout.write(message + ': ');

        let buffer = '';

        const handler = (key: Buffer, str: string) => {
            const char = str;

            if (char === '\r' || char === '\n') {
                process.stdout.write('\n');
                io.release(handler);
                resolve(buffer);
                return;
            }

            if (char === '\u0003') { // CTRL+C handled globally usually, but safe to check
                // allow engine to handle or re-emit? 
                // For now engine handles it.
                return;
            }

            if (char === '\u007F' || char === '\b') { // Backspace
                if (buffer.length > 0) {
                    buffer = buffer.slice(0, -1);
                    process.stdout.write('\b \b');
                }
                return;
            }

            // Simple character filter
            if (/^[\w\s\-\.\/@]+$/.test(char)) {
                buffer += char;
                process.stdout.write(char);
            }
        };

        io.consume(handler);
    });
}
