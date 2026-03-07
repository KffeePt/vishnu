
import { spawn, execSync, exec } from 'child_process';
import chalk from 'chalk';
import * as os from 'os';

export class ProcessUtils {

    /**
     * Kill a process by name using taskkill (Windows) or pkill (Unix).
     */
    static async killProcess(name: string, silent: boolean = false): Promise<void> {
        if (!silent) console.log(chalk.yellow(`[CLEANUP] Killing ${name}...`));

        return new Promise((resolve) => {
            const cmd = process.platform === 'win32'
                ? `taskkill /F /IM ${name} /T`
                : `pkill -f ${name}`;

            exec(cmd, (err) => {
                // Ignore errors (process might not be running)
                resolve();
            });
        });
    }

    /**
     * Check if a command exists in PATH.
     */
    static async checkCommand(command: string): Promise<boolean> {
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
            exec(cmd, (err) => {
                resolve(!err);
            });
        });
    }

    /**
     * List available Flutter emulators.
     */
    static async getEmulators(): Promise<{ id: string, name: string }[]> {
        return new Promise((resolve, reject) => {
            exec('flutter emulators', (err, stdout) => {
                if (err) {
                    resolve([]); // Return empty on failure for safety
                    return;
                }

                const lines = stdout.split('\n');
                const results: { id: string, name: string }[] = [];

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('Id')) continue;

                    // Parse generic output: "Id  Name     Type ..."
                    // We split by multiple spaces
                    const parts = trimmed.split(/\s{2,}/);
                    if (parts.length >= 2) {
                        results.push({ id: parts[0], name: parts[1] });
                    }
                }
                resolve(results);
            });
        });
    }

    /**
     * List connected Flutter devices.
     */
    static async getDevices(): Promise<{ id: string, name: string, properties: string }[]> {
        return new Promise((resolve) => {
            exec('flutter devices', (err, stdout) => {
                if (err) {
                    resolve([]);
                    return;
                }

                const lines = stdout.split('\n');
                const results: { id: string, name: string, properties: string }[] = [];

                // Output format:
                // Name (ID) • ID • Platform • Version
                // sdk gphone64 x86 64 (mobile) • emulator-5554 • android-x64 • Android 13 (API 33) (emulator)

                for (const line of lines) {
                    const trimmed = line.trim();
                    // Skip headers and empty lines
                    if (!trimmed || trimmed.startsWith('No issues found') || trimmed.match(/^\d+ connected device/)) continue;

                    // Simple split by " • "
                    const parts = trimmed.split(' • ');
                    if (parts.length >= 3) {
                        const name = parts[0].trim();
                        const id = parts[1].trim();
                        const properties = parts.slice(2).join(', ').trim();
                        results.push({ id, name, properties });
                    }
                }
                resolve(results);
            });
        });
    }

    /**
     * Launch a Flutter emulator detached.
     */
    static async launchEmulator(emulatorId: string): Promise<void> {
        console.log(chalk.cyan(`Launching emulator: ${emulatorId}...`));

        const child = spawn('flutter', ['emulators', '--launch', emulatorId], {
            detached: true,
            stdio: 'ignore',
            shell: true
        });

        child.unref(); // Allow parent to exit without waiting

        // Give it a second to "fail" immediately if it's going to
        await new Promise(r => setTimeout(r, 2000));
    }
    /**
     * Get a list of currently running emulators/simulators.
     */
    static async getRunningEmulators(): Promise<{ id: string, name: string, properties: string }[]> {
        const devices = await this.getDevices();
        return devices.filter(d =>
            d.properties.toLowerCase().includes('emulator') ||
            d.properties.toLowerCase().includes('simulator') ||
            d.id.startsWith('emulator-') ||
            d.id.toLowerCase().includes('simulator')
        );
    }

    /**
     * Kill all running emulators and simulators.
     */
    static async killAllEmulators(): Promise<void> {
        console.log(chalk.red('\n[CLEANUP] Killing all emulators...'));

        if (process.platform === 'win32') {
            await this.killProcess('qemu-system-x86_64.exe', true);
            await this.killProcess('emulator.exe', true); // Android
        } else {
            // macOS/Linux
            await this.killProcess('qemu-system-x86_64', true);
            await this.killProcess('emulator', true); // Android
            await this.killProcess('Simulator', true); // iOS Simulator
        }

        console.log(chalk.green('✅ Emulator cleanup command sent.'));
    }
}
