import { Project, SyntaxKind } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs-extra';

export async function removeRouteFromMiddleware(routePath: string): Promise<boolean> {
    const middlewarePath = path.join(process.cwd(), 'app', 'middleware.ts'); // Check app/middleware.ts first
    let targetFile = middlewarePath;

    if (!await fs.pathExists(targetFile)) {
        const rootMiddleware = path.join(process.cwd(), 'middleware.ts');
        if (await fs.pathExists(rootMiddleware)) {
            targetFile = rootMiddleware;
        } else {
            return false; // No middleware found
        }
    }

    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(targetFile);

    // Find config export
    const configVar = sourceFile.getVariableDeclaration('config');
    if (!configVar) return false;

    const initializer = configVar.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (!initializer) return false;

    const matcherProp = initializer.getProperty('matcher')?.asKind(SyntaxKind.PropertyAssignment);
    if (!matcherProp) return false;

    const matcherValue = matcherProp.getFirstChildByKind(SyntaxKind.StringLiteral) ||
        matcherProp.getFirstChildByKind(SyntaxKind.ArrayLiteralExpression);

    if (!matcherValue) return false;

    let updated = false;

    if (matcherValue.getKind() === SyntaxKind.ArrayLiteralExpression) {
        // Handle Array: matcher: ['/path', '/other']
        const arrayLit = matcherValue.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
        const elements = arrayLit.getElements();

        for (const el of elements) {
            if (el.getKind() === SyntaxKind.StringLiteral) {
                const text = el.getText().replace(/['"]/g, ''); // strip quotes
                if (text === routePath) {
                    arrayLit.removeElement(el);
                    updated = true;
                    console.log(`[Middleware] Removed route '${routePath}' from matcher array.`);
                }
            }
        }
    } else if (matcherValue.getKind() === SyntaxKind.StringLiteral) {
        // Handle String: matcher: '/path'
        const text = matcherValue.getText().replace(/['"]/g, '');
        if (text === routePath) {
            // If it's the ONLY matcher, do we remove it? Or remove the property?
            // Removing the property seems safe, or empty array?
            // Let's remove the property to be safe, or just warn.
            // If we remove the only matcher, middleware runs on ALL routes (default behavior without matcher), 
            // which handles non-matching logic inside helper. 
            // BUT usually we want to restrict it.
            // Let's just log for now if it's a single string and matches.
            // Actually, if user deletes the protected route, maybe they WANT middleware to stop running for it.
            // But replacing string with empty array is syntax valid.
            console.log(`[Middleware] Matcher is a single string '${text}' matching deleted route. Converting to empty array.`);
            matcherProp.setInitializer('[]');
            updated = true;
        }
    }

    if (updated) {
        await sourceFile.save();
    }

    return updated;
}

export async function renameRouteInMiddleware(oldRoutePath: string, newRoutePath: string): Promise<boolean> {
    const middlewarePath = path.join(process.cwd(), 'app', 'middleware.ts');
    let targetFile = middlewarePath;

    if (!await fs.pathExists(targetFile)) {
        const rootMiddleware = path.join(process.cwd(), 'middleware.ts');
        if (await fs.pathExists(rootMiddleware)) {
            targetFile = rootMiddleware;
        } else {
            return false;
        }
    }

    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(targetFile);

    const configVar = sourceFile.getVariableDeclaration('config');
    if (!configVar) return false;

    const initializer = configVar.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (!initializer) return false;

    const matcherProp = initializer.getProperty('matcher')?.asKind(SyntaxKind.PropertyAssignment);
    if (!matcherProp) return false;

    const matcherValue = matcherProp.getFirstChildByKind(SyntaxKind.StringLiteral) ||
        matcherProp.getFirstChildByKind(SyntaxKind.ArrayLiteralExpression);

    if (!matcherValue) return false;

    let updated = false;

    if (matcherValue.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const arrayLit = matcherValue.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
        const elements = arrayLit.getElements();

        for (const el of elements) {
            if (el.getKind() === SyntaxKind.StringLiteral) {
                const text = el.getText().replace(/['"]/g, '');
                if (text === oldRoutePath) {
                    el.replaceWithText(`'${newRoutePath}'`);
                    updated = true;
                    console.log(`[Middleware] Renamed route '${oldRoutePath}' to '${newRoutePath}' in matcher.`);
                }
            }
        }
    } else if (matcherValue.getKind() === SyntaxKind.StringLiteral) {
        const text = matcherValue.getText().replace(/['"]/g, '');
        if (text === oldRoutePath) {
            matcherProp.setInitializer(`'${newRoutePath}'`);
            updated = true;
            console.log(`[Middleware] Renamed single matcher '${oldRoutePath}' to '${newRoutePath}'.`);
        }
    }

    if (updated) {
        await sourceFile.save();
    }

    return updated;
}
