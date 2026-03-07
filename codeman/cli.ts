#!/usr/bin/env node

import { Command } from 'commander';
import { createComponent } from './commands/create-component';
import { addPart } from './commands/add-part';
import { removePart, removeComponent } from './commands/remove-part';
import { refactorComponent } from './commands/refactor-component';

import { migrateComponentCommand } from './commands/migrate-component';

const program = new Command();

program
  .name('generate-component')
  .description('CLI tool for generating React component boilerplate with intelligent refactoring')
  .version('1.0.0');

program.addCommand(migrateComponentCommand);

program
  .command('create-component <componentName>')
  .description('Generate a new component folder and boilerplate file')
  .action(async (componentName: string) => {
    try {
      await createComponent(componentName);
      console.log(`✅ Component ${componentName} created successfully!`);
    } catch (error) {
      console.error(`❌ Error creating component:`, error);
      process.exit(1);
    }
  });

program
  .command('add-part <parentComponent> <partName>')
  .description('Add a sub-component part to an existing component')
  .action(async (parentComponent: string, partName: string) => {
    try {
      await addPart(parentComponent, partName);
      console.log(`✅ Part ${partName} added to ${parentComponent} successfully!`);
    } catch (error) {
      console.error(`❌ Error adding part:`, error);
      process.exit(1);
    }
  });

program
  .command('remove-part <parentComponent> <partName>')
  .description('Remove a sub-component part from an existing component')
  .action(async (parentComponent: string, partName: string) => {
    try {
      await removePart(parentComponent, partName);
      console.log(`✅ Part ${partName} removed from ${parentComponent} successfully!`);
    } catch (error) {
      console.error(`❌ Error removing part:`, error);
      process.exit(1);
    }
  });

program
  .command('remove-component <componentName>')
  .description('Remove a component and its directory')
  .action(async (componentName: string) => {
    try {
      await removeComponent(componentName);
      console.log(`✅ Component ${componentName} removed successfully!`);
    } catch (error) {
      console.error(`❌ Error removing component:`, error);
      process.exit(1);
    }
  });

program
  .command('refactor-component <oldName> <newName>')
  .description('Rename a component and update all references across the project')
  .action(async (oldName: string, newName: string) => {
    try {
      await refactorComponent(oldName, newName);
      console.log(`✅ Component refactored from ${oldName} to ${newName} successfully!`);
    } catch (error) {
      console.error(`❌ Error refactoring component:`, error);
      process.exit(1);
    }
  });

program.parse();