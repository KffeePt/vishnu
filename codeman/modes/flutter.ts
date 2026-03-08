import { ProjectStrategy, PackageModule } from './interface';
import chalk from 'chalk';
import { MenuNode } from '../core/types';
import { z } from 'zod';
import { List } from '../components/list';

export class FlutterStrategy implements ProjectStrategy {
    type = 'flutter' as const;

    async detect(rootPath: string): Promise<boolean> {
        const { default: fs } = await import('fs-extra');
        const { default: path } = await import('path');
        return await fs.pathExists(path.join(rootPath, 'pubspec.yaml'));
    }

    async getGeneratorOptions(): Promise<MenuNode[]> {
        return [];
    }

    async getPackageOptions(): Promise<PackageModule[]> {
        return [
            {
                id: 'shop',
                name: 'Shop & Inventory',
                description: 'E-commerce with product listing, inventory, and employees.',
                scaffoldNextJs: async (target) => { },
                scaffoldFlutter: async (target) => { console.log(chalk.gray(`Mock scaffolding Shop to Flutter at ${target}`)); }
            },
            {
                id: 'community',
                name: 'Blog & Community',
                description: 'Public blog, forums, and encrypted private messaging.',
                scaffoldNextJs: async (target) => { },
                scaffoldFlutter: async (target) => { console.log(chalk.gray(`Mock scaffolding Community to Flutter at ${target}`)); }
            }
            // Other packages omitted for brevity in Flutter mode for now
        ];
    }

    async getTestRunnerMenu(): Promise<MenuNode> {
        return {
            id: 'flutter-tests',
            propsSchema: z.void(),
            render: async () => {
                await List('Flutter tests not implemented yet.', [{ name: 'Back', value: 'back' }]);
                return 'back';
            },
            next: () => 'ROOT'
        };
    }

    async runDevServer(): Promise<void> {
        console.log("Flutter run...");
    }
}
