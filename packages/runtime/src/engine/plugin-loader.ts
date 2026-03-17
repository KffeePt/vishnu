import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { validatePluginManifest, PluginManifest } from '@vishnu/sdk';
import { slotRegistry } from '@vishnu/platform';

export interface LoadedPlugin {
    manifest: PluginManifest;
    path: string;
    loaded: boolean;
    error?: string;
}

export interface PluginLoaderOptions {
    extensionsDir?: string;
    debug?: boolean;
}

export class PluginLoader {
    private plugins: Map<string, LoadedPlugin> = new Map();
    private extensionsDir: string;
    private debug: boolean;

    constructor(options: PluginLoaderOptions = {}) {
        this.extensionsDir = options.extensionsDir || path.join(process.cwd(), 'modules');
        this.debug = options.debug || false;
    }

    public async discoverPlugins(): Promise<string[]> {
        const pluginDirs: string[] = [];

        try {
            const entries = await fs.promises.readdir(this.extensionsDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const manifestPath = path.join(this.extensionsDir, entry.name, 'plugin.json');
                    if (fs.existsSync(manifestPath)) {
                        pluginDirs.push(entry.name);
                    }
                }
            }
        } catch (err) {
            this.log(`Failed to read extensions directory: ${err}`);
        }

        this.log(`Discovered ${pluginDirs.length} plugins: ${pluginDirs.join(', ')}`);
        return pluginDirs;
    }

    public async loadPlugin(pluginDirName: string): Promise<LoadedPlugin | null> {
        const pluginPath = path.join(this.extensionsDir, pluginDirName);
        const manifestPath = path.join(pluginPath, 'plugin.json');

        try {
            const manifestContent = await fs.promises.readFile(manifestPath, 'utf-8');
            const manifestRaw = JSON.parse(manifestContent);

            const validation = validatePluginManifest(manifestRaw);
            if (!validation.success) {
                const errorMsg = validation.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
                this.log(`Invalid manifest for ${pluginDirName}: ${errorMsg}`);
                const result: LoadedPlugin = {
                    manifest: manifestRaw as PluginManifest,
                    path: pluginPath,
                    loaded: false,
                    error: `Invalid manifest: ${errorMsg}`,
                };
                this.plugins.set(manifestRaw.id || pluginDirName, result);
                return result;
            }

            const manifest = validation.data;

            if (manifest.contributes?.menus) {
                for (const menuContrib of manifest.contributes.menus) {
                    if (!slotRegistry.isValidSlot(menuContrib.slot)) {
                        this.log(`Unknown slot ${menuContrib.slot} in plugin ${manifest.id}`);
                        continue;
                    }
                    slotRegistry.registerContribution(menuContrib.slot as any, manifest.id, menuContrib);
                }
            }
            
            if (manifest.contributes?.devdojo) {
                for (const devdojoContrib of manifest.contributes.devdojo) {
                    const targetSlot = `devdojo.${devdojoContrib.category}`;
                    if (!slotRegistry.isValidSlot(targetSlot)) {
                        this.log(`Unknown devdojo category slot ${targetSlot} in plugin ${manifest.id}`);
                        continue;
                    }
                    slotRegistry.registerContribution(targetSlot as any, manifest.id, devdojoContrib);
                }
            }

            // Execute the module's main entry point if present
            if (manifest.main) {
                const mainPath = path.join(pluginPath, manifest.main);
                if (fs.existsSync(mainPath)) {
                    this.log(`Executing main entry point: ${manifest.main}`);
                    // Use pathToFileURL to support Windows paths natively in dynamic import
                    await import(pathToFileURL(mainPath).href);
                } else {
                    this.log(`Warning: Main entry point ${manifest.main} not found`);
                }
            }

            const loadedPlugin: LoadedPlugin = {
                manifest,
                path: pluginPath,
                loaded: true,
            };

            this.plugins.set(manifest.id, loadedPlugin);
            this.log(`Loaded plugin: ${manifest.id} (${manifest.name})`);

            return loadedPlugin;

        } catch (err: any) {
            this.log(`Failed to load plugin ${pluginDirName}: ${err.message}`);
            const result: LoadedPlugin = {
                manifest: { id: pluginDirName, name: pluginDirName } as PluginManifest,
                path: pluginPath,
                loaded: false,
                error: err.message,
            };
            this.plugins.set(pluginDirName, result);
            return result;
        }
    }

    public async loadAllPlugins(): Promise<LoadedPlugin[]> {
        const pluginDirs = await this.discoverPlugins();
        const results: LoadedPlugin[] = [];

        for (const dir of pluginDirs) {
            const result = await this.loadPlugin(dir);
            if (result) {
                results.push(result);
            }
        }

        return results;
    }

    public unloadPlugin(pluginId: string): boolean {
        if (!this.plugins.has(pluginId)) {
            return false;
        }

        slotRegistry.clearPluginContributions(pluginId);
        this.plugins.delete(pluginId);
        this.log(`Unloaded plugin: ${pluginId}`);
        return true;
    }

    public async reloadPlugin(pluginId: string): Promise<LoadedPlugin | null> {
        const existingPlugin = this.plugins.get(pluginId);
        if (!existingPlugin) {
            return null;
        }

        this.unloadPlugin(pluginId);
        return this.loadPlugin(path.basename(existingPlugin.path));
    }

    public getPlugin(pluginId: string): LoadedPlugin | undefined {
        return this.plugins.get(pluginId);
    }

    public getAllPlugins(): LoadedPlugin[] {
        return Array.from(this.plugins.values());
    }

    public getFailedPlugins(): LoadedPlugin[] {
        return Array.from(this.plugins.values()).filter(p => !p.loaded);
    }

    private log(message: string): void {
        if (this.debug) {
            console.log(`[PluginLoader] ${message}`);
        }
    }
}

let pluginLoaderInstance: PluginLoader | null = null;

export function getPluginLoader(options?: PluginLoaderOptions): PluginLoader {
    if (!pluginLoaderInstance) {
        pluginLoaderInstance = new PluginLoader(options);
    }
    return pluginLoaderInstance;
}

export function resetPluginLoader(): void {
    pluginLoaderInstance = null;
}
