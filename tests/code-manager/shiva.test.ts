
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import * as fs from 'fs';
import { runOrganizerCycle } from '../../codeman/singletons/shiva/core/organizer';
import { Colors } from '../../codeman/singletons/shiva/core/utils';

// Mock fs module
// Mock fs module
vi.mock('fs', async () => {
    const existsSync = vi.fn();
    const readdirSync = vi.fn();
    const mkdirSync = vi.fn();
    const renameSync = vi.fn();
    const statSync = vi.fn();

    return {
        default: {
            existsSync,
            readdirSync,
            mkdirSync,
            renameSync,
            statSync,
        },
        existsSync,
        readdirSync,
        mkdirSync,
        renameSync,
        statSync,
    };
});

describe('Shiva Organizer (Unit)', () => {
    // Use path.resolve to ensure OS-specific separators (e.g. C:\mock\docs on Windows)
    // or just normalize a simple path.
    const mockDocsRoot = path.normalize('/mock/docs');

    beforeEach(() => {
        vi.clearAllMocks();
        // Default existsSync to true for root folders, can override in tests
        vi.mocked(fs.existsSync).mockImplementation((pathArg) => {
            const p = pathArg.toString();
            if (p.includes('2026-01-18')) {
                // console.log(`[DEBUG] existsSync('${p}') -> false`);
                return false;
            }
            // console.log(`[DEBUG] existsSync('${p}') -> true`);
            return true;
        });
    });

    describe('Builds Sorting', () => {
        it('should sort success builds into correct date folder', () => {
            const buildsRoot = path.join(mockDocsRoot, 'builds');

            // Mock readdirSync to return a success build file
            vi.mocked(fs.readdirSync).mockImplementation((pathArg) => {
                const p = path.normalize(pathArg.toString());
                const t = path.normalize(buildsRoot);
                if (p === t) {
                    return [{
                        name: 'build_success_20260118T120000.md',
                        isFile: () => true,
                        isDirectory: () => false
                    } as any];
                }
                return [];
            });

            runOrganizerCycle(mockDocsRoot);

            // Expected destination: builds/success/2026-01-18/build_success_12-00-00.md
            const expectedFolder = path.join(buildsRoot, 'success', '2026-01-18');
            const expectedFile = path.join(expectedFolder, 'build_success_12-00-00.md');
            const sourceFile = path.join(buildsRoot, 'build_success_20260118T120000.md');

            // Verify mkdirSync called for the destination folder
            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedFolder, { recursive: true });

            // Verify renameSync called with correct paths
            expect(fs.renameSync).toHaveBeenCalledWith(sourceFile, expectedFile);
        });

        it('should sort failure builds into correct date folder', () => {
            const buildsRoot = path.join(mockDocsRoot, 'builds');

            vi.mocked(fs.readdirSync).mockImplementation((pathArg) => {
                const p = path.normalize(pathArg.toString());
                const t = path.normalize(buildsRoot);
                if (p === t) {
                    return [{
                        name: 'build_failure_20260118T130000.md',
                        isFile: () => true,
                        isDirectory: () => false
                    } as any];
                }
                return [];
            });

            runOrganizerCycle(mockDocsRoot);

            const expectedFolder = path.join(buildsRoot, 'failure', '2026-01-18');
            const expectedFile = path.join(expectedFolder, 'build_failure_13-00-00.md');
            const sourceFile = path.join(buildsRoot, 'build_failure_20260118T130000.md');

            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedFolder, { recursive: true });
            expect(fs.renameSync).toHaveBeenCalledWith(sourceFile, expectedFile);
        });
    });

    describe('Fixes Sorting', () => {
        it('should sort fixes into correct date folder', () => {
            const fixesRoot = path.join(mockDocsRoot, 'fixes');

            vi.mocked(fs.readdirSync).mockImplementation((pathArg) => {
                const p = path.normalize(pathArg.toString());
                const t = path.normalize(fixesRoot);
                if (p === t) {
                    return [{
                        name: 'fix_some_bug_20260118T140000.md',
                        isFile: () => true,
                        isDirectory: () => false
                    } as any];
                }
                return [];
            });

            runOrganizerCycle(mockDocsRoot);

            const expectedFolder = path.join(fixesRoot, '2026-01-18');
            const expectedFile = path.join(expectedFolder, 'fix_some_bug_14-00-00.md');
            const sourceFile = path.join(fixesRoot, 'fix_some_bug_20260118T140000.md');

            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedFolder, { recursive: true });
            expect(fs.renameSync).toHaveBeenCalledWith(sourceFile, expectedFile);
        });
    });

    describe('Archived Tasks Sorting', () => {
        it('should sort archived tasks into correct date folder', () => {
            const archiveRoot = path.join(mockDocsRoot, 'archived_tasks');

            vi.mocked(fs.readdirSync).mockImplementation((pathArg) => {
                const p = path.normalize(pathArg.toString());
                const t = path.normalize(archiveRoot);
                if (p === t) {
                    return [{
                        name: 'my-task_20260118T150000.md',
                        isFile: () => true,
                        isDirectory: () => false
                    } as any];
                }
                return [];
            });

            runOrganizerCycle(mockDocsRoot);

            const expectedFolder = path.join(archiveRoot, '2026-01-18');
            const expectedFile = path.join(expectedFolder, 'my-task_15-00-00.md');
            const sourceFile = path.join(archiveRoot, 'my-task_20260118T150000.md');

            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedFolder, { recursive: true });
            expect(fs.renameSync).toHaveBeenCalledWith(sourceFile, expectedFile);
        });
    });
});
