import * as fs from 'fs-extra';
import * as path from 'path';
import { renderTemplate, toKebabCase } from '../utils/template-utils';

export const addPart = async (parentComponent: string, partName: string): Promise<void> => {
  let projectRoot = process.cwd();
  if (projectRoot.includes('codebase-management')) {
    projectRoot = path.resolve(projectRoot, '..');
  }

  const componentsDir = path.join(projectRoot, 'components');

  // Try both the original name and kebab-case version for parent component
  let parentDir = path.join(componentsDir, parentComponent);
  let parentFile = path.join(parentDir, `${parentComponent}.tsx`);

  // If the original name doesn't exist, try kebab-case
  if (!(await fs.pathExists(parentFile))) {
    parentDir = path.join(componentsDir, toKebabCase(parentComponent));
    parentFile = path.join(parentDir, `${toKebabCase(parentComponent)}.tsx`);
  }

  // Check if parent component exists
  if (!(await fs.pathExists(parentFile))) {
    throw new Error(`Parent component ${parentComponent} does not exist`);
  }

  const partDir = path.join(parentDir, toKebabCase(partName));
  const partFile = path.join(partDir, `${toKebabCase(partName)}.tsx`);

  // Check if part already exists
  if (await fs.pathExists(partDir)) {
    throw new Error(`Part ${partName} already exists in ${parentComponent}`);
  }

  // Create part directory
  await fs.ensureDir(partDir);

  // Convert part name to PascalCase for the exported component name
  const pascalCasePartName = partName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');

  // Generate part file from template
  const template = await fs.readFile(
    path.join(__dirname, '../../templates/part.tsx.template'),
    'utf-8'
  );

  const rendered = renderTemplate(template, { PartName: pascalCasePartName });
  await fs.writeFile(partFile, rendered);

  // Update parent component
  const parentContent = await fs.readFile(parentFile, 'utf-8');

  // Add import
  const importStatement = `import { ${pascalCasePartName} } from './${toKebabCase(partName)}/${toKebabCase(partName)}';`;
  let updatedContent = parentContent;

  // Find the last import statement and add after it
  const importLines = parentContent.split('\n').filter(line => line.trim().startsWith('import'));
  if (importLines.length > 0) {
    const lastImport = importLines[importLines.length - 1];
    updatedContent = updatedContent.replace(lastImport, `${lastImport}\n${importStatement}`);
  } else {
    // Add at the beginning if no imports
    updatedContent = `${importStatement}\n\n${updatedContent}`;
  }

  // Add JSX component before APPEND_PARTS_HERE marker
  const jsxAddition = `      <${pascalCasePartName} />`;
  updatedContent = updatedContent.replace(
    '      {/* APPEND_PARTS_HERE */}',
    `${jsxAddition}\n      {/* APPEND_PARTS_HERE */}`
  );

  await fs.writeFile(parentFile, updatedContent);
};