
import { FileExplorerOptions } from '../schemas/cli-schema';
import { StandaloneExplorer } from './explorer-process';

export class FileExplorer {
    private options: FileExplorerOptions;

    constructor(options: FileExplorerOptions) {
        this.options = options;
    }

    public async selectPath(): Promise<string | null> {
        const { Logger } = await import('./logger');
        Logger.log('FileExplorer: selectPath called (In-Process)');

        try {
            // Run In-Process
            const explorer = new StandaloneExplorer({
                basePath: this.options.basePath,
                onlyDirectories: this.options.onlyDirectories,
                title: this.options.title,
                allowedExtensions: this.options.allowedExtensions,
                validationRules: this.options.validationRules,
                preserveRawMode: true // IMPORTANT: Keep input stream raw for the Engine
            });

            const selection = await explorer.run();

            Logger.log(`FileExplorer: Selection made: ${selection}`);
            return selection;

        } catch (error) {
            Logger.error('FileExplorer: Exception during run', error);
            return null;
        }
    }
}
