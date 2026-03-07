
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

export class Logger {
    private static logDir = path.join(process.cwd(), 'logs', 'codeman');
    private static logFile = path.join(Logger.logDir, 'debug-crash.log');

    private static ensureInit() {
        try {
            if (!fs.existsSync(Logger.logDir)) {
                fs.mkdirSync(Logger.logDir, { recursive: true });
            }
        } catch (e) {
            // silent fail
        }
    }

    public static log(message: string) {
        this.ensureInit();
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] [INFO] ${message}\n`;
        try {
            fs.appendFileSync(this.logFile, line);
        } catch (e) {
            // ignore
        }
    }

    public static error(message: string, error?: any) {
        this.ensureInit();
        const timestamp = new Date().toISOString();
        let errorDetails = '';
        if (error) {
            errorDetails = `\nStack: ${error.stack || error}\n`;
        }
        const line = `[${timestamp}] [ERROR] ${message} ${errorDetails}\n`;
        try {
            fs.appendFileSync(this.logFile, line);
        } catch (e) {
            // ignore
        }
    }
}
