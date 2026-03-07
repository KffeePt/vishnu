import { ProjectStrategy } from './interface';
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
