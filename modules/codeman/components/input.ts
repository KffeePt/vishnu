import { io, type GlobalState } from '@vishnu/platform';

export async function Input(message: string, _state: GlobalState): Promise<string> {
    return new Promise(resolve => {
        process.stdout.write(message + ': ');

        let buffer = '';

        const handler = (_key: Buffer, str: string) => {
            const char = str;

            if (char === '\r' || char === '\n') {
                process.stdout.write('\n');
                io.release(handler);
                resolve(buffer);
                return;
            }

            if (char === '\u0003') {
                return;
            }

            if (char === '\u007F' || char === '\b') {
                if (buffer.length > 0) {
                    buffer = buffer.slice(0, -1);
                    process.stdout.write('\b \b');
                }
                return;
            }

            if (/^[\w\s\-\.\/@]+$/.test(char)) {
                buffer += char;
                process.stdout.write(char);
            }
        };

        io.consume(handler);
    });
}
