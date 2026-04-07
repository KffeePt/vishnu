import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSync = vi.fn();
const spawn = vi.fn();

vi.mock('child_process', () => ({
    execFileSync,
    spawn
}));

describe('vishnu launcher bootstrap', () => {
    beforeEach(() => {
        vi.resetModules();
        execFileSync.mockReset();
        spawn.mockReset();
        spawn.mockReturnValue({ on: vi.fn() });
    });

    it('runs the stable updater before launching Codeman', async () => {
        const originalArgv = process.argv;
        process.argv = ['node', 'bin/vishnu.js'];

        try {
            await import('../../bin/vishnu.js');
        } finally {
            process.argv = originalArgv;
        }

        expect(execFileSync).toHaveBeenCalledWith(
            process.execPath,
            [path.join(process.cwd(), 'update.js'), '--launch'],
            expect.objectContaining({
                cwd: process.cwd(),
                stdio: 'inherit'
            })
        );

        expect(spawn).toHaveBeenCalledWith(
            'npx',
            ['tsx', path.join(process.cwd(), 'codeman', 'interactive-cli.ts')],
            expect.objectContaining({
                cwd: process.cwd(),
                shell: true,
                stdio: 'inherit'
            })
        );
    });
});
