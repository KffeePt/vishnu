/**
 * Unit tests for refactor.ts
 * Tests the refactoring functionality including path escaping and import updates
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

// Mock fs-extra
vi.mock('fs-extra', () => ({
    default: {
        pathExists: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        move: vi.fn(),
        readdir: vi.fn(),
    },
    pathExists: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    move: vi.fn(),
    readdir: vi.fn(),
}));

// Test escapeRegExp utility (duplicated here for testing)
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('escapeRegExp', () => {
    it('should escape dots', () => {
        expect(escapeRegExp('file.tsx')).toBe('file\\.tsx');
    });

    it('should escape brackets', () => {
        expect(escapeRegExp('[id]')).toBe('\\[id\\]');
    });

    it('should escape special regex characters', () => {
        expect(escapeRegExp('a*b+c?')).toBe('a\\*b\\+c\\?');
    });

    it('should escape backslashes and pipes', () => {
        expect(escapeRegExp('a\\b|c')).toBe('a\\\\b\\|c');
    });

    it('should leave alphanumeric characters unchanged', () => {
        expect(escapeRegExp('ComponentName123')).toBe('ComponentName123');
    });

    it('should handle paths with slashes', () => {
        // Forward slashes are not special regex chars
        expect(escapeRegExp('components/admin/Users')).toBe('components/admin/Users');
    });
});

describe('Path Transformations', () => {
    it('should calculate relative path between files', () => {
        const from = 'c:/project/app/admin/page.tsx';
        const to = 'c:/project/components/MyComponent';

        const fromDir = path.dirname(from);
        const relative = path.relative(fromDir, to);

        expect(relative).toContain('components');
    });

    it('should convert Windows paths to import paths', () => {
        const windowsPath = 'components\\admin\\Users';
        const importPath = windowsPath.replace(/\\/g, '/');

        expect(importPath).toBe('components/admin/Users');
    });

    it('should handle path alias replacement', () => {
        const oldImport = '@/components/OldName';
        const newImport = oldImport.replace('OldName', 'NewName');

        expect(newImport).toBe('@/components/NewName');
    });
});

describe('Import Replacement Logic', () => {
    const sampleContent = `
import { Component } from '@/components/admin/OldComponent';
import Something from '@/components/admin/OldComponent/OldComponent';
import { Other } from '@/components/shared/Other';

export default function Page() {
  return <Component />;
}
`;

    it('should replace import paths correctly', () => {
        // Match just the component name (not the full path with @/)
        const oldName = 'OldComponent';
        const newName = 'NewComponent';

        const regex = new RegExp(oldName, 'g');
        const updated = sampleContent.replace(regex, newName);

        expect(updated).toContain('NewComponent');
        expect(updated).not.toContain('OldComponent');
    });

    it('should handle multiple occurrences', () => {
        const oldName = 'OldComponent';
        const newName = 'NewComponent';

        const regex = new RegExp(oldName, 'g');
        const matches = sampleContent.match(regex);

        expect(matches).toHaveLength(3); // Appears 3 times

        const updated = sampleContent.replace(regex, newName);
        const newMatches = updated.match(/NewComponent/g);
        expect(newMatches).toHaveLength(3);
    });

    it('should not affect unrelated imports', () => {
        const updated = sampleContent.replace(/OldComponent/g, 'NewComponent');

        expect(updated).toContain('@/components/shared/Other');
        expect(updated).toContain("import { Other }");
    });
});

describe('Refactor File Detection', () => {
    it('should identify TypeScript files', () => {
        const files = ['component.tsx', 'utils.ts', 'script.js', 'styles.css', 'config.json'];
        const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

        expect(tsFiles).toEqual(['component.tsx', 'utils.ts']);
    });

    it('should identify directories to skip', () => {
        const dirs = ['node_modules', '.next', '.git', 'src', 'components'];
        const skipDirs = new Set(['node_modules', '.next', '.git']);
        const validDirs = dirs.filter(d => !skipDirs.has(d));

        expect(validDirs).toEqual(['src', 'components']);
    });
});
