import * as fs from 'fs-extra';
import * as path from 'path';
import * as glob from 'glob';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { toKebabCase } from '../utils/template-utils';
import crypto from 'crypto';
import ignore from 'ignore';

// Function to parse .gitignore and get ignore rules
async function getIgnoreRules(projectRoot: string): Promise<ReturnType<typeof ignore>> {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const ig = ignore();

  if (await fs.pathExists(gitignorePath)) {
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    ig.add(gitignoreContent.split('\n').filter(line => line.trim() && !line.startsWith('#')));
  }

  // Add default ignores
  ig.add(['node_modules/**', '.git/**', 'dist/**', 'build/**', '.next/**', 'coverage/**']);

  return ig;
}

// Function to get all project files, respecting .gitignore
async function getProjectFiles(projectRoot: string): Promise<string[]> {
  const ig = await getIgnoreRules(projectRoot);
  const allFiles = await glob.glob('**/*', {
    cwd: projectRoot,
    absolute: false,
    nodir: true,
    dot: false
  });

  return allFiles.filter((file: string) => !ig.ignores(file));
}

// Function to search for component references using Gemini
async function searchComponentReferences(projectRoot: string, componentName: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const files = await getProjectFiles(projectRoot);
  const fileContents: { [key: string]: string } = {};

  // Read file contents (limit to reasonable size files)
  for (const file of files) {
    if (file.match(/\.(tsx|ts|js|jsx|json|md)$/)) {
      try {
        const filePath = path.join(projectRoot, file);
        const stat = await fs.stat(filePath);
        if (stat.size < 100000) { // Limit to 100KB files
          fileContents[file] = await fs.readFile(filePath, 'utf-8');
        }
      } catch (error) {
        console.warn(`Could not read file ${file}: ${error}`);
      }
    }
  }

  const searchPrompt = `
Search for all references to the component "${componentName}" (including kebab-case variants like "${toKebabCase(componentName)}") in the following codebase files.

For each reference found, provide:
- File path
- Line number
- Context (2-3 lines around the reference)
- Type of reference (import, JSX usage, variable, etc.)

Files and their contents:
${Object.entries(fileContents).map(([file, content]) => `=== ${file} ===\n${content}\n`).join('\n')}

Format the output as a markdown list with clear sections for each file.
`;

  const result = await model.generateContent(searchPrompt);
  return result.response.text();
}

// Function to analyze refactoring diff with Ollama
async function analyzeDiffWithOllama(searchResults: string, oldName: string, newName: string): Promise<string> {
  const ollamaEndpoint = process.env.OLLAMA_API_ENDPOINT || 'https://api.ollama.ai/v1/chat/completions'; // Assuming a cloud endpoint
  const ollamaModel = 'minimax/m2'; // As specified

  const analysisPrompt = `
Analyze the following search results for component "${oldName}" being refactored to "${newName}".
Identify all locations where the component is referenced and assess the impact of renaming it.

Search Results:
${searchResults}

Provide:
1. Summary of all references found
2. Files that will need updates
3. Potential breaking changes
4. Recommendations for the refactoring

Format as structured markdown.
`;

  try {
    const response = await fetch(ollamaEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}` // Assuming API key
      },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [{ role: 'user', content: analysisPrompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API request failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content;
  } catch (error) {
    console.warn(`Ollama analysis failed: ${error}`);
    return 'Analysis failed - proceeding without detailed diff analysis.';
  }
}

interface FileReference {
  filePath: string;
  lineNumber: number;
  content: string;
  type: 'import' | 'jsx' | 'type' | 'other';
}

export const refactorComponent = async (oldName: string, newName: string): Promise<string[]> => {
  // Generate unique UID
  const uid = crypto.randomBytes(8).toString('hex');

  let projectRoot = process.cwd();
  if (projectRoot.includes('codebase-management')) {
    projectRoot = path.resolve(projectRoot, '..');
  }

  const diffsDir = path.join(projectRoot, 'codebase-management', 'diffs');
  await fs.ensureDir(diffsDir);

  const componentsDir = path.join(projectRoot, 'components');
  const oldComponentDir = path.join(componentsDir, toKebabCase(oldName));
  const newComponentDir = path.join(componentsDir, toKebabCase(newName));

  // Check if old component exists
  if (!(await fs.pathExists(oldComponentDir))) {
    throw new Error(`Component ${oldName} does not exist`);
  }

  // Check if new component name already exists
  if (await fs.pathExists(newComponentDir)) {
    throw new Error(`Component ${newName} already exists`);
  }

  // Step 1: Search for references using Gemini
  console.log('🔍 Searching for component references...');
  const searchResults = await searchComponentReferences(projectRoot, oldName);

  // Step 2: Save search results to [UID].md
  const searchResultsFile = path.join(diffsDir, `${uid}.md`);
  const searchContent = `# Component Refactoring Search Results - ${oldName} → ${newName}\n\nUID: ${uid}\n\n## Search Results\n\n${searchResults}`;
  await fs.writeFile(searchResultsFile, searchContent);

  console.log(`📄 Search results saved to ${searchResultsFile}`);

  // Step 3: Ask user if they want analysis
  const inquirer = (await import('inquirer')).default;
  const { analyze } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'analyze',
      message: 'Would you like to analyze the refactoring impact with Ollama AI?',
      default: false
    }
  ]);

  let analysisContent = '';
  if (analyze) {
    console.log('🤖 Analyzing with Ollama...');
    analysisContent = await analyzeDiffWithOllama(searchResults, oldName, newName);

    // Save analysis to [UID]-[DIFF-ANALYSIS].md
    const analysisFile = path.join(diffsDir, `${uid}-DIFF-ANALYSIS.md`);
    const analysisMarkdown = `# Refactoring Analysis - ${oldName} → ${newName}\n\nUID: ${uid}\n\n## Impact Analysis\n\n${analysisContent}`;
    await fs.writeFile(analysisFile, analysisMarkdown);
    console.log(`📊 Analysis saved to ${analysisFile}`);
  }

  // Step 4: Proceed with actual refactoring
  // Step 4a: Rename component folder and files
  await renameComponentFiles(oldComponentDir, newComponentDir, oldName, newName);

  // Step 4b: Find all references using Gemini File Search API
  const references = await findComponentReferences(oldName, newName);

  // Step 4c: Update all references
  const modifiedFiles = await updateReferences(references, oldName, newName);

  return modifiedFiles;
};

const renameComponentFiles = async (oldDir: string, newDir: string, oldName: string, newName: string): Promise<void> => {
  // Rename directory
  await fs.move(oldDir, newDir);

  // Rename main component file
  const oldFilePath = path.join(newDir, `${toKebabCase(oldName)}.tsx`);
  const newFilePath = path.join(newDir, `${toKebabCase(newName)}.tsx`);

  if (await fs.pathExists(oldFilePath)) {
    await fs.move(oldFilePath, newFilePath);

    // Update component name inside the file
    let content = await fs.readFile(newFilePath, 'utf-8');
    content = content.replace(new RegExp(`export const ${oldName}`, 'g'), `export const ${newName}`);
    content = content.replace(new RegExp(`interface ${toKebabCase(oldName)}Props`, 'g'), `interface ${toKebabCase(newName)}Props`);
    await fs.writeFile(newFilePath, content);
  }
};

const findComponentReferences = async (oldName: string, newName: string): Promise<FileReference[]> => {
  let projectRoot = process.cwd();
  if (projectRoot.includes('codebase-management')) {
    projectRoot = path.resolve(projectRoot, '..');
  }

  // Get all TypeScript/React files, respecting .gitignore
  const files = await getProjectFiles(projectRoot);
  const tsFiles = files.filter(file => file.match(/\.(ts|tsx)$/));

  const references: FileReference[] = [];

  // Analyze files for references
  for (const file of tsFiles) {
    try {
      const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for imports
        if (line.includes(`import`) && line.includes(oldName)) {
          references.push({
            filePath: file,
            lineNumber: i + 1,
            content: line,
            type: 'import'
          });
        }

        // Check for JSX usage
        if (line.includes(`<${oldName}`) || line.includes(`${oldName}/>`)) {
          references.push({
            filePath: file,
            lineNumber: i + 1,
            content: line,
            type: 'jsx'
          });
        }

        // Check for type references
        if (line.includes(`:${oldName}`) || line.includes(`${oldName}Props`)) {
          references.push({
            filePath: file,
            lineNumber: i + 1,
            content: line,
            type: 'type'
          });
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read file ${file}:`, error);
    }
  }

  return references;
};

const updateReferences = async (references: FileReference[], oldName: string, newName: string): Promise<string[]> => {
  const fileUpdates = new Map<string, string[]>();
  const modifiedFiles: string[] = [];

  // Group references by file
  references.forEach(ref => {
    if (!fileUpdates.has(ref.filePath)) {
      fileUpdates.set(ref.filePath, []);
    }
    fileUpdates.get(ref.filePath)!.push(ref.content);
  });

  // Update each file
  for (const [filePath, lines] of fileUpdates) {
    try {
      let content = await fs.readFile(filePath, 'utf-8');

      // Replace all occurrences of oldName with newName
      content = content.replace(new RegExp(oldName, 'g'), newName);

      await fs.writeFile(filePath, content);
      modifiedFiles.push(filePath);
    } catch (error) {
      console.error(`  ❌ Error updating ${filePath}:`, error);
    }
  }

  return modifiedFiles;
};

// --- Interactive Handler ---

export async function handleInteractiveRefactor() {
  const inquirer = (await import('inquirer')).default;
  const chalk = (await import('chalk')).default;
  const { FileExplorer } = await import('../utils/file-explorer');
  const path = await import('path');

  console.clear();
  console.log(chalk.blue.bold('\n🔧 Refactor Component (Renaming & Updates)\n'));

  // 1. Select Component
  const explorer = new FileExplorer({
    basePath: path.join(process.cwd(), 'components'),
    onlyDirectories: true,
    title: 'Select Component Folder to Refactor'
  });

  const targetPath = await explorer.selectPath();
  if (!targetPath) return;

  const oldName = path.basename(targetPath); // Folder name is usually component name in Kebab or Pascal?
  // CLI usually uses Kebab for folders. Component logic converts to Pascal.

  // 2. Prompt for New Name
  const { newName } = await inquirer.prompt([{
    type: 'input',
    name: 'newName',
    message: `Rename '${oldName}' to (kebab-case):`,
    default: oldName,
    validate: (input) => /^[a-z0-9-]+$/.test(input) ? true : 'Use kebab-case (lowercase, hyphens).'
  }]);

  if (newName === oldName) {
    console.log(chalk.yellow('Name unchanged. Cancelling.'));
    await new Promise(r => setTimeout(r, 1000));
    return;
  }

  // 3. Confirm
  console.log(chalk.yellow(`\n⚠️  Refactoring will:`));
  console.log(`  1. Rename folder: ${oldName} -> ${newName}`);
  console.log(`  2. Rename files inside (Component.tsx -> New.tsx)`);
  console.log(`  3. Update content (PascalCase and exports)`);
  console.log(`  4. Search & Update imports across the project`);
  console.log(chalk.gray(`  (Backup is recommended before proceeding)`));

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Proceed with Refactor?',
    default: false
  }]);

  if (!confirm) return;

  try {
    const { createSpinner } = await import('../components/spinner');
    const spinner = createSpinner('Refactoring...').start();

    // We pass "names" to refactorComponent. 
    // Is refactorComponent expecting Pascal or Kebab?
    // Looking at implementation:
    // it does toKebabCase(oldName) for paths.
    // So if we pass 'my-component', it works.
    await refactorComponent(oldName, newName);

    spinner.succeed('Refactor Complete.');
    console.log(chalk.green('\n✅ Check "codebase-management/diffs" if AI analysis was requested.'));

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);

  } catch (error: any) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
  }
}