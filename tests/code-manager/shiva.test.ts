
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

    describe('Tasks Sorting', () => {
        it('should sort tasks into correct date folder', () => {
            const tasksRoot = path.join(mockDocsRoot, 'tasks');

            // Mock readdirSync to return a success build file
            vi.mocked(fs.readdirSync).mockImplementation((pathArg) => {
                const p = path.normalize(pathArg.toString());
                const t = path.normalize(tasksRoot);
                if (p === t) {
                    return [{
                        name: 'task_some_feature_20260118T120000.md',
                        isFile: () => true,
                        isDirectory: () => false
                    } as any];
                }
                return [];
            });

            runOrganizerCycle(mockDocsRoot);

            const expectedFolder = path.join(tasksRoot, '2026-01-18');
            const expectedFile = path.join(expectedFolder, 'task_some_feature_12-00-00.md');
            const sourceFile = path.join(tasksRoot, 'task_some_feature_20260118T120000.md');

            // Verify mkdirSync called for the destination folder
            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedFolder, { recursive: true });

            // Verify renameSync called with correct paths
            expect(fs.renameSync).toHaveBeenCalledWith(sourceFile, expectedFile);
        });
    });

    describe('Git Sorting', () => {
        it('should sort git nodes into correct date folder', () => {
            const gitRoot = path.join(mockDocsRoot, 'git');

            vi.mocked(fs.readdirSync).mockImplementation((pathArg) => {
                const p = path.normalize(pathArg.toString());
                const t = path.normalize(gitRoot);
                if (p === t) {
                    return [{
                        name: 'git_workflow_20260118T130000.md',
                        isFile: () => true,
                        isDirectory: () => false
                    } as any];
                }
                return [];
            });

            runOrganizerCycle(mockDocsRoot);

            const expectedFolder = path.join(gitRoot, '2026-01-18');
            const expectedFile = path.join(expectedFolder, 'git_workflow_13-00-00.md');
            const sourceFile = path.join(gitRoot, 'git_workflow_20260118T130000.md');

            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedFolder, { recursive: true });
            expect(fs.renameSync).toHaveBeenCalledWith(sourceFile, expectedFile);
        });
    });

    describe('Audits Sorting', () => {
        it('should sort audits into correct date folder', () => {
            const auditsRoot = path.join(mockDocsRoot, 'audits');

            vi.mocked(fs.readdirSync).mockImplementation((pathArg) => {
                const p = path.normalize(pathArg.toString());
                const t = path.normalize(auditsRoot);
                if (p === t) {
                    return [{
                        name: 'audit_security_20260118T140000.md',
                        isFile: () => true,
                        isDirectory: () => false
                    } as any];
                }
                return [];
            });

            runOrganizerCycle(mockDocsRoot);

            const expectedFolder = path.join(auditsRoot, '2026-01-18');
            const expectedFile = path.join(expectedFolder, 'audit_security_14-00-00.md');
            const sourceFile = path.join(auditsRoot, 'audit_security_20260118T140000.md');

            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedFolder, { recursive: true });
            expect(fs.renameSync).toHaveBeenCalledWith(sourceFile, expectedFile);
        });
    });
});
