import { Project, SyntaxKind } from 'ts-morph';
import path from 'path';

export async function updateImports(
    project: Project,
    oldPath: string,
    newPath: string,
    dryRun: boolean
): Promise<string[]> {
    const updates: string[] = [];
    const sourceFiles = project.getSourceFiles();

    // Normalize paths
    const normalizedOldPath = path.resolve(oldPath).replace(/\\/g, '/');
    const normalizedNewPath = path.resolve(newPath).replace(/\\/g, '/');

    const oldDir = path.dirname(normalizedOldPath);
    const oldName = path.basename(normalizedOldPath, path.extname(normalizedOldPath));

    console.log(`[AST] Scanning ${sourceFiles.length} files for imports of ${oldName}`);

    for (const sourceFile of sourceFiles) {
        // Skip the file we just moved (if it's already in the project)
        if (path.resolve(sourceFile.getFilePath()) === normalizedNewPath) continue;

        const imports = sourceFile.getImportDeclarations();

        for (const importDecl of imports) {
            const moduleSpecifier = importDecl.getModuleSpecifierValue();

            // Resolve the module specifier to an absolute path
            if (moduleSpecifier.startsWith('.')) {
                const sourceDir = path.dirname(sourceFile.getFilePath());
                const absoluteImportPath = path.resolve(sourceDir, moduleSpecifier);

                // Check if the absolute path matches the old path (ignoring extension)
                // We compare the paths without extensions to handle .tsx vs .ts vs no extension
                const absImportNoExt = absoluteImportPath.replace(path.extname(absoluteImportPath), '');
                const oldPathNoExt = normalizedOldPath.replace(path.extname(normalizedOldPath), '');

                if (absImportNoExt === oldPathNoExt) {
                    // Calculate new relative path
                    const newImportDir = path.dirname(normalizedNewPath);
                    let newRelativePath = path.relative(sourceDir, newImportDir);

                    if (!newRelativePath.startsWith('.')) {
                        newRelativePath = './' + newRelativePath;
                    }

                    // Normalize separators
                    newRelativePath = newRelativePath.replace(/\\/g, '/');

                    updates.push(`[${sourceFile.getFilePath()}] Updating import "${moduleSpecifier}" to "${newRelativePath}"`);

                    if (!dryRun) {
                        importDecl.setModuleSpecifier(newRelativePath);
                    }
                }
            }
        }

        if (!dryRun && updates.length > 0) {
            await sourceFile.save();
        }
    }

    return updates;
}
