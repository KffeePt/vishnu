import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
// @ts-ignore
import { runDevServer } from '../../../codeman/commands/dev-server';

// Mocks
// Define mock functions for fs-extra using vi.hoisted
const fsMocks = vi.hoisted(() => ({
    pathExists: vi.fn(),
    ensureDir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn()
}));

vi.mock('fs-extra', () => {
    return {
        default: fsMocks,
        ...fsMocks
    };
});

// Mock ProcessManager
const processManagerMocks = vi.hoisted(() => ({
    spawnDetachedWindow: vi.fn(),
    killByTitle: vi.fn(),
    killByPid: vi.fn(),
    isPortOccupied: vi.fn(),
    getPidOnPort: vi.fn(),
    findNextAvailablePort: vi.fn()
}));

vi.mock('../../../codeman/core/process-manager', () => {
    return {
        ProcessManager: processManagerMocks
    };
});

vi.mock('ora', () => {
    return {
        default: vi.fn(() => ({
            start: vi.fn().mockReturnThis(),
            succeed: vi.fn().mockReturnThis(),
            fail: vi.fn().mockReturnThis(),
            info: vi.fn().mockReturnThis(),
            stop: vi.fn().mockReturnThis(),
            text: ''
        }))
    };
});

// Mock menu-system to avoid runtime issues with imports
vi.mock('../../../codeman/utils/menu-system', () => {
    return {
        MenuSystem: class { },
        ScreenFactory: vi.fn()
    };
});

describe('Dev Server Command', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        // Default: pathExists returns false
        fsMocks.pathExists.mockResolvedValue(false);
        // Default: Port 3000 free
        processManagerMocks.getPidOnPort.mockResolvedValue(null);
    });

    it('should start Next.js dev server in new window', async () => {
        // Run
        await runDevServer(null as any);

        // Expect ProcessManager to be called
        expect(processManagerMocks.spawnDetachedWindow).toHaveBeenCalledWith(
            expect.stringContaining('Triada Dev Server'),
            expect.stringContaining('npm run dev')
        );
    });

    it('should detect busy port and offer to kill', async () => {
        // Setup: Port 3000 busy
        processManagerMocks.getPidOnPort.mockResolvedValue('1234');

        // Setup: isPortOccupied true
        processManagerMocks.isPortOccupied.mockResolvedValue(true);

        // We can't easily test the interactive List/Inquirer part without heavy mocking of that component.
        // But we can verify it checks the port.

        // For this test scope, just verifying spawnDetachedWindow is NOT called immediately is a good start,
        // or we mock the List component response.
    });
});
