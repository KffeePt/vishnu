import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { AppConfig } from '../config/app-config';
import { getRainbowColor, Colors } from '../singletons/shiva/core/utils';

async function getCodeManVersion(): Promise<string> {
    try {
        const configPath = path.join(os.homedir(), '.vishnu', 'codeman.json');
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            const data = JSON.parse(content);
            if (data.version) return data.version;
        }
    } catch (e) { /* ignore */ }
    return AppConfig.version; // Fallback
}

export type ProjectMode = 'nextjs' | 'flutter' | 'cpp' | 'python' | 'custom' | 'unknown' | 'auth' | 'welcome' | 'shiva';

export async function getCodemanHeaderString(mode: ProjectMode = 'custom'): Promise<string> {
    const version = await getCodeManVersion();

    let modeText = '[CUSTOM MODE]';

    switch (mode) {
        case 'nextjs': modeText = '[NEXT.JS MODE]'; break;
        case 'flutter': modeText = '[FLUTTER MODE]'; break;
        case 'cpp': modeText = '[C++ MODE]'; break;
        case 'python': modeText = '[PYTHON MODE]'; break;
        case 'auth': modeText = '[AUTH]'; break;
        case 'welcome': modeText = '[WELCOME]'; break;
        case 'shiva': modeText = '[SHIVA]'; break;
        case 'custom': modeText = '[CUSTOM MODE]'; break;
        default: modeText = '[CUSTOM MODE]'; break;
    }

    const art = `
  e88'Y88                888               e   e                     
 d888  'Y  e88 88e   e88 888  ,e e,       d8b d8b     ,"Y88b 888 8e  
C8888     d888 888b d888 888 d88 88b     e Y8b Y8b   "8" 888 888 88b 
 Y888  ,d Y888 888P Y888 888 888   ,    d8b Y8b Y8b  ,ee 888 888 888 
  "88,d88  "88 88"   "88 888  "YeeP"   d888b Y8b Y8b "88 888 888 888                                                                                               
            CodeMan v${version} ${modeText}
    `;

    let coloredArt = chalk.cyan(art);
    if (mode === 'nextjs') coloredArt = chalk.green(art);
    else if (mode === 'flutter') coloredArt = chalk.blue(art);
    else if (mode === 'auth') coloredArt = chalk.magenta(art);
    else if (mode === 'welcome') coloredArt = chalk.cyan(art);
    else if (mode === 'shiva') {
        // Rainbow coloring for Shiva mode
        coloredArt = '';
        let charIndex = 0;
        for (const char of art) {
            if (char === '\n' || char === '\r' || char === ' ') {
                coloredArt += char;
            } else {
                coloredArt += getRainbowColor(0, charIndex * 2) + char;
                charIndex++;
            }
        }
        coloredArt += Colors.ENDC;
    }

    // --- CONTEXT INFO ---
    // Hide context info on Authentication and Welcome screens
    if (mode !== 'auth' && mode !== 'welcome') {
        const { state } = await import('../core/state');
        let contextLine = '';

        // Project Context
        if (state.project.rootPath) {
            const projName = path.basename(state.project.rootPath);
            contextLine += `${chalk.dim('Project:')} ${chalk.bold.white(projName)}   `;
        }

        // User Context
        const userEmail = state.user?.email || (state.cloudFeaturesEnabled ? 'Unknown' : 'Guest (Local)');
        const userColor = state.user?.email ? chalk.green : chalk.dim;
        contextLine += `${chalk.dim('User:')} ${userColor(userEmail)}`;

        if (contextLine) {
            return coloredArt + '\n    ' + contextLine.trim() + '\n';
        }
    }

    return coloredArt;
}

export async function printCodemanHeader(mode: ProjectMode = 'standard') {
    // Clear screen
    console.clear();
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    console.log(await getCodemanHeaderString(mode));
}
