import * as fs from 'fs-extra';
import * as path from 'path';
import { toKebabCase, toPascalCase } from '../utils/template-utils';

export const removePart = async (parentComponent: string, partName: string): Promise<void> => {
  let projectRoot = process.cwd();
  if (projectRoot.includes('codebase-management')) {
    projectRoot = path.resolve(projectRoot, '..');
  }

  const componentsDir = path.join(projectRoot, 'components');
  const parentDir = path.join(componentsDir, toKebabCase(parentComponent));
  const partDir = path.join(parentDir, toKebabCase(partName));
  const parentFile = path.join(parentDir, `${toKebabCase(parentComponent)}.tsx`);

  // Check if parent component exists
  if (!(await fs.pathExists(parentFile))) {
    throw new Error(`Parent component ${parentComponent} does not exist`);
  }

  // Check if part exists
  if (!(await fs.pathExists(partDir))) {
    throw new Error(`Part ${partName} does not exist in ${parentComponent}`);
  }

  // Read parent component content
  const parentContent = await fs.readFile(parentFile, 'utf-8');
  const pascalPartName = toPascalCase(partName);

  // Remove import statement (handle single/double quotes, spaces, optional semicolon)
  // Matches: import { PartName } from './part-name/part-name';
  const importPattern = new RegExp(`import\\s+\\{\\s*${pascalPartName}\\s*\\}\\s+from\\s+['"]\\./${toKebabCase(partName)}/${toKebabCase(partName)}['"];?\\n?`, 'g');
  let updatedContent = parentContent.replace(importPattern, '');

  // Remove JSX component usage
  // Matches: <PartName />
  const jsxPattern = new RegExp(`\\s*<${pascalPartName}\\s*/>\\n?`, 'g');
  updatedContent = updatedContent.replace(jsxPattern, '');

  // Write updated parent component
  await fs.writeFile(parentFile, updatedContent);

  // Remove part directory
  await fs.remove(partDir);
};

export const removeComponent = async (componentName: string): Promise<void> => {
  let projectRoot = process.cwd();
  if (projectRoot.includes('codebase-management')) {
    projectRoot = path.resolve(projectRoot, '..');
  }

  const componentsDir = path.join(projectRoot, 'components');

  // Try both the original name and kebab-case version
  let componentDir = path.join(componentsDir, componentName);

  // If the original name doesn't exist, try kebab-case
  if (!(await fs.pathExists(componentDir))) {
    componentDir = path.join(componentsDir, toKebabCase(componentName));
  }

  // Check if component exists
  if (!(await fs.pathExists(componentDir))) {
    throw new Error(`Component ${componentName} does not exist`);
  }

  // Remove entire component directory
  await fs.remove(componentDir);
};