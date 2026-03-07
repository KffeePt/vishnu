import fs from 'fs';
import path from 'path';

export class ContextManager {
    static async buildSystemPrompt(): Promise<string> {
        const cwd = process.cwd();

        // 1. Read file structure (simplified)
        const files = await this.listFiles(cwd, 2);

        // 2. Read Docs
        const docs = await this.readDocs(path.join(cwd, 'docs'));

        return `
You are CodeMan 2.0, an AI embedded in this CLI.
Current Directory Structure:
${files}

Documentation Context:
${docs}

Answer questions specifically about this project.
    `.trim();
    }

    private static async listFiles(dir: string, depth: number): Promise<string> {
        if (depth < 0) return '';
        if (!fs.existsSync(dir)) return '';

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        let output = '';

        for (const ent of entries) {
            if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
            if (ent.isDirectory()) {
                output += `/${ent.name}\n`;
                // Recurse slightly? Maybe too heavy.
                // output += await this.listFiles(path.join(dir, ent.name), depth - 1);
            } else {
                output += `- ${ent.name}\n`;
            }
        }
        return output;
    }

    private static async readDocs(dir: string): Promise<string> {
        if (!fs.existsSync(dir)) return '';
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        let content = '';
        for (const f of files.slice(0, 3)) { // Limit to 3 files to save tokens
            content += `--- ${f} ---\n`;
            content += fs.readFileSync(path.join(dir, f), 'utf-8').slice(0, 500) + '\n...\n';
        }
        return content;
    }
}
