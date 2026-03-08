import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import * as net from 'net';

const execAsync = promisify(exec);

export class ProcessManager {
    /**
     * Spawns a command in a new detached terminal window.
     * Uses the `cmd /c start "Title" cmd /c ...` pattern to ensure the window closes when the process ends.
     */
    static async spawnDetachedWindow(title: string, command: string, cwd: string = process.cwd()) {
        const child = spawn('cmd.exe', ['/c', 'start', `"${title}"`, 'cmd', '/c', command], {
            cwd,
            shell: true,
            stdio: 'ignore',
            detached: true
        });
        child.unref();
    }

    /**
     * Spawns a command in an ELEVATED (Administrator) detached terminal window.
     * Triggers a Windows UAC prompt. Useful for commands requiring symlinks or deep system changes.
     */
    static async spawnElevatedDetachedWindow(title: string, command: string, cwd: string = process.cwd()) {
        // We use PowerShell's Start-Process with -Verb RunAs to request elevation.
        // The argument list for cmd.exe needs to set the title, change directory, and run the command.
        // We add an echo/pause to let the user see the result before the window closes.
        const cmdArgs = `'/c', 'TITLE "${title}" ^& cd /d "${cwd}" ^& echo Executing elevated command... ^& ${command} ^& echo. ^& echo Process complete. ^& pause'`;
        
        const psCommand = `Start-Process cmd -ArgumentList ${cmdArgs} -Verb RunAs`;
        
        const child = spawn('powershell.exe', ['-Command', psCommand], {
            cwd,
            shell: true,
            stdio: 'ignore',
            detached: true
        });
        child.unref();
    }

    /**
     * Kills processes by window title using taskkill.
     * Handles exact matches and prefix matches.
     */
    static async killByTitle(title: string): Promise<void> {
        try {
            // "Title" (Exact)
            await execAsync(`taskkill /FI "WINDOWTITLE eq ${title}" /T /F`).catch(() => { });
            // "Title*" (Prefix)
            await execAsync(`taskkill /FI "WINDOWTITLE eq ${title}*" /T /F`).catch(() => { });
            // "Administrator: Title*" (Admin prefix)
            await execAsync(`taskkill /FI "WINDOWTITLE eq Administrator: ${title}*" /T /F`).catch(() => { });
        } catch (e) {
            // Ignore errors if process not found
        }
    }

    /**
     * Kills a process by PID.
     */
    static async killByPid(pid: string): Promise<void> {
        try {
            await execAsync(`taskkill /PID ${pid} /F`);
        } catch (e) {
            // Ignore errors
        }
    }

    /**
     * Checks if a port is occupied.
     */
    static async isPortOccupied(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') resolve(true);
                else resolve(false);
            });
            server.once('listening', () => {
                server.close();
                resolve(false);
            });
            server.listen(port);
        });
    }

    /**
     * Gets the PID of the process listening on a port.
     */
    static async getPidOnPort(port: number): Promise<string | null> {
        try {
            const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
            if (!stdout) return null;

            const lines = stdout.trim().split('\n');
            // Look for LISTENING line
            const listeningLine = lines.find(l => l.includes(`:${port}`) && l.includes('LISTENING'));

            if (!listeningLine) return null;

            const parts = listeningLine.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (!pid || isNaN(Number(pid))) return null;

            return pid;
        } catch {
            return null;
        }
    }

    /**
     * Finds the next available port starting from startPort.
     */
    static async findNextAvailablePort(startPort: number): Promise<number> {
        let port = startPort;
        while (await this.isPortOccupied(port)) {
            port++;
            if (port > startPort + 100) throw new Error('No available ports found in range.');
        }
        return port;
    }

    /**
     * Singleton Helper: Kills existing instance by title, then spawns new one.
     */
    static async killAndSpawnSingleton(title: string, command: string, cwd: string = process.cwd()) {
        console.log(chalk.gray(`  - Stopping previous '${title}' instances...`));
        await this.killByTitle(title);

        // Wait for cleanup
        await new Promise(r => setTimeout(r, 800));

        console.log(chalk.blue(`  - Spawning '${title}'...`));
        await this.spawnDetachedWindow(title, command, cwd);

        // Cooldown
        await new Promise(r => setTimeout(r, 1000));
    }
}
