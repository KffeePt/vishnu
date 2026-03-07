import * as fs from 'fs-extra';
import * as path from 'path';
import { renderTemplate, toKebabCase } from '../utils/template-utils';

export const createComponent = async (componentName: string): Promise<void> => {
  // Find the project root (where the main components folder should be)
  let projectRoot = process.cwd();

  // If we're in a subdirectory like 'codebase-management', go up to find the main project
  if (projectRoot.includes('codebase-management')) {
    projectRoot = path.resolve(projectRoot, '..');
  }

  const componentsDir = path.join(projectRoot, 'components');
  const componentDir = path.join(componentsDir, toKebabCase(componentName));
  const componentFile = path.join(componentDir, `${toKebabCase(componentName)}.tsx`);

  // Check if component already exists
  if (await fs.pathExists(componentDir)) {
    throw new Error(`Component ${componentName} already exists`);
  }

  // Ensure components directory exists
  await fs.ensureDir(componentsDir);

  // Create component directory
  await fs.ensureDir(componentDir);

  // Generate component file from template
  const template = await fs.readFile(
    path.join(__dirname, '../templates/component.tsx.template'),
    'utf-8'
  );

  // Convert component name to PascalCase for the exported component name and props interface
  const pascalCaseComponentName = componentName.split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  const rendered = renderTemplate(template, {
    ComponentName: pascalCaseComponentName
  });

  await fs.writeFile(componentFile, rendered);
};