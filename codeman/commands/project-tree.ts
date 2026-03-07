import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface TreeNode {
    [key: string]: TreeNode;
}

/**
 * Generates a tree.txt file in the project root containing the full project
 * directory structure, excluding gitignored files.
 */
export async function generateProjectTree(rootPath: string): Promise<void> {
    console.log(chalk.cyan('\n🌳 Generating project tree...'));
    console.log(chalk.gray(`Root: ${rootPath}`));

    let files: string[];

    try {
        // Get all tracked + untracked (but not ignored) files
        const output = execSync(
            'git ls-files --cached --others --exclude-standard',
            { cwd: rootPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        );
        files = output.trim().split('\n').filter(f => f.length > 0);
    } catch (err: any) {
        console.log(chalk.red('❌ Failed to list files. Is this a git repository?'));
        console.log(chalk.gray(err.message));
        return;
    }

    if (files.length === 0) {
        console.log(chalk.yellow('⚠️  No files found.'));
        return;
    }

    // Build tree structure
    const tree: TreeNode = {};
    for (const file of files) {
        const parts = file.replace(/\\/g, '/').split('/');
        let current = tree;
        for (const part of parts) {
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        }
    }

    // Render tree to string
    const projectName = path.basename(rootPath);
    const lines: string[] = [projectName + '/'];
    renderTree(tree, '', lines);

    const content = lines.join('\n') + '\n';
    const outputPath = path.join(rootPath, 'tree.txt');

    fs.writeFileSync(outputPath, content, 'utf-8');

    console.log(chalk.green(`\n✅ Project tree saved to ${chalk.bold('tree.txt')}`));
    console.log(chalk.gray(`   ${files.length} files mapped.`));
}

function renderTree(node: TreeNode, prefix: string, lines: string[]): void {
    const entries = Object.keys(node).sort((a, b) => {
        // Directories first (nodes with children), then files
        const aIsDir = Object.keys(node[a]).length > 0;
        const bIsDir = Object.keys(node[b]).length > 0;
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
    });

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';
        const isDir = Object.keys(node[entry]).length > 0;

        lines.push(prefix + connector + entry + (isDir ? '/' : ''));

        if (isDir) {
            renderTree(node[entry], prefix + childPrefix, lines);
        }
    }
}
