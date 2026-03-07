
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
// @ts-ignore
import * as boilerplate from '../../../codeman/commands/boilerplate';
import { MockFileExplorer } from '../helpers/mock-file-explorer';

// Mocks
// Define mock functions for fs-extra using vi.hoisted
const fsMocks = vi.hoisted(() => ({
    ensureDir: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
    pathExists: vi.fn(),
    readFile: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
    readdir: vi.fn()
}));

vi.mock('fs-extra', () => {
    return {
        default: fsMocks,
        ...fsMocks
    };
});
vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));
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

// Mock the FileExplorer import
vi.mock('../../../codeman/utils/file-explorer', () => {
    return {
        FileExplorer: MockFileExplorer
    };
});

describe('Boilerplate Generators', () => {
    let mockSystem: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSystem = {
            push: vi.fn(),
            pop: vi.fn()
        };
        // Setup fs mocks
        vi.mocked(fs.ensureDir).mockResolvedValue(undefined); // Default export mock
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    describe('createUnitTest', () => {
        it('should generate a unit test for a standard component', async () => {
            // Mock file selection
            vi.spyOn(MockFileExplorer.prototype, 'selectPath').mockResolvedValueOnce('components/ui/Button.tsx');
            (fs.stat as any).mockResolvedValue({ isDirectory: () => false });
            (fs.pathExists as any).mockResolvedValue(false); // test doesn't exist

            await boilerplate.createUnitTest(mockSystem);

            // Verify content
            expect(fsMocks.writeFile).toHaveBeenCalled();
            const call = fsMocks.writeFile.mock.calls[0];
            const filePath = (call[0] as string).replace(/\\/g, '/');
            const fileContent = (call[1] as string).replace(/\\/g, '/');
            expect(filePath).toContain('tests/components/ui/Button.test.tsx');
            // Boilerplate uses @/ alias
            expect(fileContent).toContain("import { Button } from '@/components/ui/Button'");
        });

        it('should generate a unit test for a Page with Next.js mocks', async () => {
            vi.spyOn(MockFileExplorer.prototype, 'selectPath').mockResolvedValueOnce('app/dashboard/page.tsx');
            (fs.stat as any).mockResolvedValue({ isDirectory: () => false });
            (fs.pathExists as any).mockResolvedValue(false);

            await boilerplate.createUnitTest(mockSystem);

            expect(fsMocks.writeFile).toHaveBeenCalled();
            const content = (fsMocks.writeFile.mock.calls[0][1] as string).replace(/\\/g, '/');
            expect(content).toContain("vi.mock('next/navigation'");
            // Page import uses @/ alias
            expect(content).toContain("import Page from '@/app/dashboard/page'");
        });
    });

    describe('createE2ETest', () => {
        it('should derive route and generate E2E test', async () => {
            vi.spyOn(MockFileExplorer.prototype, 'selectPath').mockResolvedValueOnce('app/login/page.tsx');
            const inquirer = await import('inquirer');
            (inquirer.default.prompt as any).mockResolvedValue({ specTitle: 'login-page' });

            (fs.pathExists as any).mockResolvedValue(false);

            await boilerplate.createE2ETest(mockSystem);

            expect(fsMocks.writeFile).toHaveBeenCalled();
            const content = (fsMocks.writeFile.mock.calls[0][1] as string).replace(/\\/g, '/');
            // Route should be /login
            expect(content).toContain("await page.goto('/login');");
            expect(content).toContain("test.describe('login-page Page'");
        });

        it('should handle root page.tsx', async () => {
            vi.spyOn(MockFileExplorer.prototype, 'selectPath').mockResolvedValueOnce('app/page.tsx');
            const inquirer = await import('inquirer');
            (inquirer.default.prompt as any).mockResolvedValue({ specTitle: 'home' });
            (fs.pathExists as any).mockResolvedValue(false);

            await boilerplate.createE2ETest(mockSystem);

            const content = (vi.mocked(fs.writeFile).mock.calls[0][1] as string).replace(/\\/g, '/');
            expect(content).toContain("await page.goto('/');");
        });
    });
});
