
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import chalk from 'chalk';

export interface KatanaScript {
    name: string;
    path: string;
    mode: string; // 'global' or projectType
    ext: string;
}

export class KatanaManager {
    private static getKatanaRoot(): string {
        return path.join(os.homedir(), '.vishnu', 'katana');
    }

    private static getModeDir(mode: string): string {
        return path.join(this.getKatanaRoot(), mode);
    }

    public static async init(): Promise<void> {
        const root = this.getKatanaRoot();
        if (!fs.existsSync(root)) {
            fs.mkdirSync(root, { recursive: true });
        }
    }

    public static async listScripts(projectMode: string): Promise<KatanaScript[]> {
        const scripts: KatanaScript[] = [];
        const root = this.getKatanaRoot();

        // 1. Scan Global
        const globalDir = path.join(root, 'global');
        if (fs.existsSync(globalDir)) {
            const files = fs.readdirSync(globalDir);
            files.forEach(f => {
                scripts.push({
                    name: f,
                    path: path.join(globalDir, f),
                    mode: 'global',
                    ext: path.extname(f)
                });
            });
        }

        // 2. Scan Mode Specific
        if (projectMode && projectMode !== 'global') {
            const modeDir = path.join(root, projectMode);
            if (fs.existsSync(modeDir)) {
                const files = fs.readdirSync(modeDir);
                files.forEach(f => {
                    scripts.push({
                        name: f,
                        path: path.join(modeDir, f),
                        mode: projectMode,
                        ext: path.extname(f)
                    });
                });
            }
        }

        return scripts;
    }

    public static async createScript(mode: string, name: string, content: string, ext: string = '.bat'): Promise<string> {
        const dir = this.getModeDir(mode);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const finalName = safeName.endsWith(ext) ? safeName : safeName + ext;
        const fullPath = path.join(dir, finalName);

        fs.writeFileSync(fullPath, content);
        return fullPath;
    }

    public static getSingletonsRoot(): string {
        return path.join(os.homedir(), '.vishnu', 'singletons');
    }

    public static async listSingletons(): Promise<{ name: string; path: string }[]> {
        const root = this.getSingletonsRoot();
        if (!fs.existsSync(root)) {
            fs.mkdirSync(root, { recursive: true });
        }

        const entries = fs.readdirSync(root, { withFileTypes: true });
        return entries
            .filter(dirent => dirent.isDirectory())
            .map(dirent => ({
                name: dirent.name,
                path: path.join(root, dirent.name)
            }));
    }

    public static async runSingleton(singletonPath: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            console.log(chalk.blue(`\n🔮 invoking Singleton: ${path.basename(singletonPath)}`));

            // Check for entry points
            const entryPoints = ['index.ts', 'index.js', 'main.py', 'run.bat', 'run.sh'];
            let validEntry = '';

            for (const ep of entryPoints) {
                if (fs.existsSync(path.join(singletonPath, ep))) {
                    validEntry = path.join(singletonPath, ep);
                    break;
                }
            }

            if (!validEntry) {
                console.log(chalk.red(`\n❌ No valid entry point found in ${singletonPath}. Expected one of: ${entryPoints.join(', ')}`));
                resolve();
                return;
            }

            // Reuse runScript logic for the entry point
            this.runScript(validEntry).then(resolve).catch(reject);
        });
    }

    public static async runScript(scriptPath: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            console.log(chalk.blue(`\n⚔️  Executing Katana Script: ${path.basename(scriptPath)}`));

            const ext = path.extname(scriptPath).toLowerCase();
            let cmd = scriptPath;
            let args: string[] = [];

            if (ext === '.js') {
                cmd = 'node';
                args = [scriptPath];
            } else if (ext === '.ts') {
                cmd = 'npx';
                args = ['tsx', scriptPath];
            } else if (ext === '.py') {
                cmd = 'python';
                args = [scriptPath];
            } else if (ext === '.sh') {
                cmd = 'bash';
                args = [scriptPath];
            } else {
                // Batch or Executable
                cmd = scriptPath;
            }

            const child = spawn(cmd, args, {
                stdio: 'inherit',
                shell: true,
                env: process.env
            });

            child.on('close', (code) => {
                if (code === 0) {
                    console.log(chalk.green('\n✅ Execution Successful'));
                } else {
                    console.log(chalk.red(`\n❌ Execution Failed (Exit Code: ${code})`));
                }
                resolve();
            });

            child.on('error', (err) => {
                console.error(chalk.red('\n❌ Failed to launch script:'), err);
                resolve();
            });
        });
    }
}
