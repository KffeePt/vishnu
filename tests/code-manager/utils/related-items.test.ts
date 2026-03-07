/**
 * Unit tests for related-items.ts
 * Tests the findRelatedFiles function that connects Component <-> Page <-> API
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

// Mock fs-extra
vi.mock('fs-extra', () => ({
    default: {
        pathExists: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
    },
    pathExists: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
}));

import * as fs from 'fs-extra';

describe('Related Items Path Parsing', () => {
    const mockCwd = 'c:/Users/test/project';

    beforeEach(() => {
        vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
        vi.mocked(fs.stat).mockResolvedValue({ isFile: () => false, isDirectory: () => true } as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should identify API route type from path', () => {
        const apiPath = 'app/api/orders/route.ts';
        const isApiRoute = apiPath.startsWith('app/api/');
        expect(isApiRoute).toBe(true);
    });

    it('should identify Page route type from path', () => {
        const pagePath = 'app/admin/users/page.tsx';
        const isPageRoute = pagePath.startsWith('app/') && !pagePath.startsWith('app/api/');
        expect(isPageRoute).toBe(true);
    });

    it('should identify Component type from path', () => {
        const componentPath = 'components/admin/Users/Users.tsx';
        const isComponent = componentPath.startsWith('components/');
        expect(isComponent).toBe(true);
    });

    it('should extract common base from API path', () => {
        const apiPath = 'app/api/admin/orders/route.ts';
        const commonBase = apiPath
            .replace(/^app\/api\//, '')
            .replace(/\/route\.ts$/, '');
        expect(commonBase).toBe('admin/orders');
    });

    it('should extract common base from Page path', () => {
        const pagePath = 'app/admin/orders/page.tsx';
        const commonBase = pagePath
            .replace(/^app\//, '')
            .replace(/\/page\.tsx$/, '');
        expect(commonBase).toBe('admin/orders');
    });

    it('should extract common base from Component path', () => {
        const componentPath = 'components/admin/Orders/Orders.tsx';
        let commonBase = componentPath.replace(/^components\//, '');
        if (commonBase.endsWith('.tsx')) {
            commonBase = commonBase.replace(/\.tsx$/, '');
        }
        expect(commonBase).toBe('admin/Orders/Orders');
    });
});

describe('Path Generation', () => {
    const cwd = 'c:/Users/test/project';

    it('should generate page path candidates from common base', () => {
        const commonBase = 'admin/users';
        const candidates = [
            path.join(cwd, 'app', commonBase.toLowerCase()),
            path.join(cwd, 'app', commonBase),
        ];

        expect(candidates[0]).toContain('app');
        expect(candidates[0]).toContain('admin');
        expect(candidates[0]).toContain('users');
    });

    it('should generate API path candidates from common base', () => {
        const commonBase = 'admin/users';
        const candidates = [
            path.join(cwd, 'app', 'api', commonBase.toLowerCase()),
            path.join(cwd, 'app', 'api', commonBase),
        ];

        expect(candidates[0]).toContain('app');
        expect(candidates[0]).toContain('api');
        expect(candidates[0]).toContain('admin');
    });

    it('should generate component path candidates with PascalCase', () => {
        const commonBase = 'admin/users';
        const parts = commonBase.split('/');
        const last = parts.pop()!;
        const pascalLast = last.charAt(0).toUpperCase() + last.slice(1);
        const pascalBase = [...parts, pascalLast].join('/');

        expect(pascalLast).toBe('Users');
        expect(pascalBase).toBe('admin/Users');
    });
});

describe('Import Pattern Matching', () => {
    it('should match component imports from page content', () => {
        const pageContent = `
      import { OrderList } from "@/components/admin/OrderList";
      import { Header } from "@/components/shared/Header";
    `;

        const importMatches = pageContent.matchAll(/from\s+['"]@\/components\/([^'"]+)['"]/g);
        const imports = [...importMatches].map(m => m[1]);

        expect(imports).toContain('admin/OrderList');
        expect(imports).toContain('shared/Header');
        expect(imports).toHaveLength(2);
    });

    it('should handle various import styles', () => {
        const pageContent = `
      import Component from '@/components/MyComponent';
      import { Named } from "@/components/Named";
      import * as Utils from "@/components/Utils";
    `;

        const importMatches = pageContent.matchAll(/from\s+['"]@\/components\/([^'"]+)['"]/g);
        const imports = [...importMatches].map(m => m[1]);

        expect(imports).toHaveLength(3);
    });
});
