import fs from 'fs';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
import chalk from 'chalk';

const VISHNU_DIR = path.join(os.homedir(), '.vishnu');
const VERCEL_TOKEN_FILE = path.join(VISHNU_DIR, 'vercel_token');

function ensureDir() {
    if (!fs.existsSync(VISHNU_DIR)) {
        fs.mkdirSync(VISHNU_DIR, { recursive: true });
    }
}

export const VercelTokenStore = {
    load(): string | null {
        const envToken = process.env.VISHNU_DEV_TOKEN;
        if (envToken && envToken.trim()) return envToken.trim();
        if (!fs.existsSync(VERCEL_TOKEN_FILE)) return null;
        const token = fs.readFileSync(VERCEL_TOKEN_FILE, 'utf-8').trim();
        return token || null;
    },

    save(token: string) {
        ensureDir();
        fs.writeFileSync(VERCEL_TOKEN_FILE, token.trim());
    },

    clear() {
        try {
            if (fs.existsSync(VERCEL_TOKEN_FILE)) fs.unlinkSync(VERCEL_TOKEN_FILE);
        } catch {
            // Ignore
        }
    },

    async ensureToken(): Promise<string | null> {
        const existing = this.load();
        if (existing) return existing;

        console.log(chalk.yellow('\n🔐 Vercel CLI token required.'));
        console.log(chalk.gray('Paste a signed Vishnu developer token issued by your backend.'));

        const answer = await inquirer.prompt([{
            type: 'password',
            name: 'token',
            message: 'Enter Vercel/Vishnu dev token:',
            mask: '*',
            validate: (input: string) => input.trim().length > 10 ? true : 'Token too short'
        }]);

        if (!answer.token) return null;
        this.save(answer.token);
        return answer.token;
    }
};
