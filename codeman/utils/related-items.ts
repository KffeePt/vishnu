import * as path from 'path';
import * as fs from 'fs-extra';

export interface RelatedItem {
    path: string;
    type: 'Component' | 'Page Route' | 'API Route' | 'Component (Imported)' | 'Middleware Config';
}

/**
 * Universally finds related files for a given target path in the Triada Culinaria project structure.
 * It connects the "Triad": Component <-> Page Route <-> API Route.
 * 
 * @param targetPath The absolute path of the file/folder being acted upon.
 */
export async function findRelatedFiles(targetPath: string): Promise<RelatedItem[]> {
    const relatedItems: RelatedItem[] = [];
    const cwd = process.cwd();
    const relPath = path.relative(cwd, targetPath).replace(/\\/g, '/');

    // Normalize target to a directory if it's a known file (page.tsx, route.ts, index.tsx)
    let searchDir = targetPath;
    const stat = await fs.stat(targetPath);
    if (stat.isFile()) {
        searchDir = path.dirname(targetPath);
    }

    // Helper to add unique items
    const addItem = (p: string, t: RelatedItem['type']) => {
        if (p !== targetPath && !relatedItems.find(i => i.path === p)) {
            relatedItems.push({ path: p, type: t });
        }
    };

    // 1. Identify "Base Path" relative to root (app/ or components/)
    let commonBase = ''; // e.g. "admin/users"
    let type: 'page' | 'api' | 'component' | 'unknown' = 'unknown';

    if (relPath.startsWith('app/api/')) {
        type = 'api';
        // remove "app/api/" and potentially "route.ts"
        commonBase = relPath.replace(/^app\/api\//, '').replace(/\/route\.ts$/, '');
    } else if (relPath.startsWith('app/')) {
        type = 'page';
        commonBase = relPath.replace(/^app\//, '').replace(/\/page\.tsx$/, '').replace(/\/layout\.tsx$/, '');
    } else if (relPath.startsWith('components/')) {
        type = 'component';
        commonBase = relPath.replace(/^components\//, '');
        // handle component files like "components/admin/Users.tsx" -> "admin/Users"
        if (commonBase.endsWith('.tsx')) commonBase = commonBase.replace(/\.tsx$/, '');
    }

    // 2. Search Strategies based on commonBase
    if (!commonBase) return relatedItems;

    // A. Page Route Search (app/[commonBase])
    // The base might differ in casing (Users vs users), so we try variants
    if (type !== 'page') {
        const pageCandidates = [
            path.join(cwd, 'app', commonBase.toLowerCase()), // standard route assumption
            path.join(cwd, 'app', commonBase), // exact match
        ];

        for (const cand of pageCandidates) {
            if (await fs.pathExists(cand)) {
                // If it's a folder, check if it has page.tsx
                if ((await fs.stat(cand)).isDirectory() && await fs.pathExists(path.join(cand, 'page.tsx'))) {
                    addItem(cand, 'Page Route');
                    break; // Found primary match
                }
            }
        }
    }

    // B. API Route Search (app/api/[commonBase])
    if (type !== 'api') {
        const apiCandidates = [
            path.join(cwd, 'app', 'api', commonBase.toLowerCase()),
            path.join(cwd, 'app', 'api', commonBase),
        ];

        for (const cand of apiCandidates) {
            if (await fs.pathExists(cand)) {
                if ((await fs.stat(cand)).isDirectory() && await fs.pathExists(path.join(cand, 'route.ts'))) {
                    addItem(cand, 'API Route');
                    break;
                }
            }
        }
    }

    // C. Component Search (components/[commonBase])
    // This is the trickiest. "admin/users" (route) -> "admin/Users" (component folder) or "admin/Users.tsx" (component file)
    if (type !== 'component') {
        // Strategy 1: PascalCase the last segment
        const parts = commonBase.split('/');
        const last = parts.pop()!;
        const pascalLast = last.charAt(0).toUpperCase() + last.slice(1);
        const pascalBase = [...parts, pascalLast].join('/');

        const componentCandidates = [
            path.join(cwd, 'components', pascalBase), // PascalCase Folder/File
            path.join(cwd, 'components', commonBase), // Direct match
            path.join(cwd, 'components', commonBase.toLowerCase()), // Lowercase match
        ];

        // Also if the route was "admin/users-list", component might be "admin/UsersList"?
        // Let's rely on Step D (Import Parsing) for complex names, but cover Basics here.

        for (const cand of componentCandidates) {
            // Check Folder
            if (await fs.pathExists(cand) && (await fs.stat(cand)).isDirectory()) {
                addItem(cand, 'Component');
                // Don't break immediately, might have both folder and file? Unlikely.
            }
            // Check File (.tsx)
            if (await fs.pathExists(cand + '.tsx')) {
                addItem(cand + '.tsx', 'Component');
            }
        }
    }

    // D. Import Analysis (Strongest Signal)
    // If we have access to the Page, we can parse it to find the *exact* component component.

    // Find the page path (either target or one we just found)
    let pagePath = '';
    if (type === 'page') pagePath = searchDir;
    else {
        const foundPage = relatedItems.find(i => i.type === 'Page Route');
        if (foundPage) pagePath = foundPage.path;
    }

    if (pagePath) {
        const pageFile = path.join(pagePath, 'page.tsx');
        if (await fs.pathExists(pageFile)) {
            const content = await fs.readFile(pageFile, 'utf-8');
            // Look for: import { X } from "@/components/..."
            const importMatches = content.matchAll(/from\s+['"]@\/components\/([^'"]+)['"]/g);
            for (const match of importMatches) {
                const importPath = match[1]; // e.g. "admin/Users/Users" or "admin/Users"

                // Construct absolute path
                const absImportPath = path.join(cwd, 'components', importPath);

                // If it resolves to a file, the "Component" is likely the parent folder if the import is "Folder/File" logic
                // Or just the file itself.

                // Check direct existence
                if (await fs.pathExists(absImportPath)) {
                    // It exists. Is it a dir?
                    if ((await fs.stat(absImportPath)).isDirectory()) {
                        addItem(absImportPath, 'Component (Imported)');
                    }
                }
                // Check .tsx
                else if (await fs.pathExists(absImportPath + '.tsx')) {
                    // If import is .../Users, and Users.tsx exists.
                    // If the project structure is "Folder containing Component", often we want to delete the FOLDER.
                    const parentOfFile = path.dirname(absImportPath + '.tsx');
                    // Heuristic: If import is "admin/Users", and we have "components/admin/Users.tsx", target is file.
                    // If we have "components/admin/Users/index.tsx" (rare in nextjs) or "components/admin/Users/Users.tsx"

                    addItem(absImportPath + '.tsx', 'Component (Imported)');

                    // Also suggest parent folder if the basename matches parent?
                    // e.g. components/admin/Users/Users.tsx -> delete components/admin/Users ??
                    const baseName = path.basename(absImportPath);
                    const parentName = path.basename(parentOfFile);
                    if (baseName === parentName) {
                        addItem(parentOfFile, 'Component (Imported)');
                    }
                }
            }
        }
    }

    return relatedItems;
}
