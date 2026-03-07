import { Command } from 'commander';
import inquirer from 'inquirer';
import { z, ZodError } from 'zod';
import { MigrationOptionsSchema } from '../schemas/cli-schema';
import { updateImports } from '../utils/ast-transformers';
import { Project } from 'ts-morph';
import fs from 'fs-extra';
import path from 'path';

export const migrateComponentCommand = new Command('migrate-component')
    .description('Migrate a component to a directory-based structure')
    .action(async () => {
        // Interactive prompt
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'targetPath',
                message: 'Enter the path to the component file or directory:',
            },
            {
                type: 'list',
                name: 'strategy',
                message: 'Select migration strategy:',
                choices: ['flat-to-folder', 'rename-index'],
            },
            {
                type: 'confirm',
                name: 'dryRun',
                message: 'Run in dry-run mode?',
                default: true,
            },
        ]);

        try {
            const options = MigrationOptionsSchema.parse(answers);
            await executeMigration(options);
        } catch (error) {
            if (error instanceof ZodError) {
                console.error('Validation failed:', (error as any).errors);
            } else {
                console.error('An error occurred:', error);
            }
        }
    });

export async function executeMigration(options: z.infer<typeof MigrationOptionsSchema>) {
    console.log(`Starting migration with options:`, options);

    const { targetPath, strategy, dryRun } = options;
    const absolutePath = path.resolve(targetPath);

    if (!fs.existsSync(absolutePath)) {
        console.error(`Path not found: ${absolutePath}`);
        return;
    }

    // Initialize ts-morph project
    const project = new Project({
        tsConfigFilePath: path.resolve(__dirname, '../../tsconfig.json'),
    });

    if (strategy === 'flat-to-folder') {
        let sourceFile = absolutePath;
        let componentName = '';
        let newDir = '';
        let newFilePath = '';

        const stats = fs.statSync(absolutePath);

        if (stats.isFile()) {
            // Case: Single file (e.g., admin-table.tsx)
            const fileName = path.basename(absolutePath);
            const ext = path.extname(absolutePath);
            const nameWithoutExt = path.basename(absolutePath, ext);

            // Convert to PascalCase for directory and component name
            componentName = toPascalCase(nameWithoutExt);
            newDir = path.join(path.dirname(absolutePath), componentName);
            newFilePath = path.join(newDir, `${componentName}${ext}`);
        } else if (stats.isDirectory()) {
            // Case: Directory with index.ts (e.g., components/admin-table/index.ts)
            // We assume the user points to the directory
            const indexFile = path.join(absolutePath, 'index.ts');
            if (!fs.existsSync(indexFile)) {
                console.error(`No index.ts found in ${absolutePath}`);
                return;
            }
            sourceFile = indexFile;
            const dirName = path.basename(absolutePath);
            componentName = toPascalCase(dirName);
            newDir = path.join(path.dirname(absolutePath), componentName); // Rename dir if needed
            newFilePath = path.join(newDir, `${componentName}.tsx`); // Rename index.ts to Component.tsx
        }

        console.log(`[Plan] Migration:`);
        console.log(`  Source: ${sourceFile}`);
        console.log(`  Target Dir: ${newDir}`);
        console.log(`  Target File: ${newFilePath}`);

        if (!dryRun) {
            await fs.ensureDir(newDir);

            if (sourceFile !== newFilePath) {
                await fs.move(sourceFile, newFilePath);
            }

            // Create index.ts barrel file
            const indexContent = `export * from './${componentName}';\n`;
            await fs.writeFile(path.join(newDir, 'index.ts'), indexContent);

            // Update imports
            await updateImports(project, sourceFile, newFilePath, dryRun);
        }
    }

    console.log('Migration completed.');
}

function toPascalCase(str: string): string {
    return str.replace(/(\w)(\w*)/g,
        function (g0, g1, g2) { return g1.toUpperCase() + g2.toLowerCase(); }).replace(/-|_/g, '');
}
