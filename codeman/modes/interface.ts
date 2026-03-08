import { MenuNode } from '../core/types';

export interface PackageModule {
  id: string;
  name: string;
  description: string;
  scaffoldNextJs: (targetPath: string) => Promise<void>;
  scaffoldFlutter: (targetPath: string) => Promise<void>;
}

export interface ProjectStrategy {
    type: 'nextjs' | 'flutter' | 'python' | 'cpp' | 'custom' | 'unknown';

    /**
     * Returns true if this strategy applies to the current directory.
     */
    detect: (rootPath: string) => Promise<boolean>;

    /**
     * Returns a list of menu options/nodes for Generators specific to this project.
     * e.g. "Create Page", "Create Component"
     */
    getGeneratorOptions: () => Promise<MenuNode[]>;

    /**
     * Returns the Test Runner Menu Node (or options).
     */
    getTestRunnerMenu: () => Promise<MenuNode>;

    /**
     * Execute a specific dev command (like 'npm run dev' or 'flutter run').
     */
    runDevServer: () => Promise<void>;

    /**
     * Returns optional SaaS packages available for this framework.
     */
    getPackageOptions?: () => Promise<PackageModule[]>;
}
