import { ModuleEntry, ModuleRegistry as RegistryType } from './engine-schema';

class ModuleRegistry {
    private modules: Map<string, ModuleEntry> = new Map();
    private dependentsMap: Map<string, Set<string>> = new Map();
    private lastUpdate: number = Date.now();

    register(path: string, dependencies: string[], exports: string[], hash?: string): void {
        const existing = this.modules.get(path);

        if (existing) {
            for (const dep of existing.dependencies) {
                this.dependentsMap.get(dep)?.delete(path);
            }
        }

        const entry: ModuleEntry = {
            path,
            dependencies,
            exports,
            loadedAt: Date.now(),
            hash,
            reloading: false,
        };

        this.modules.set(path, entry);

        for (const dep of dependencies) {
            if (!this.dependentsMap.has(dep)) {
                this.dependentsMap.set(dep, new Set());
            }
            this.dependentsMap.get(dep)!.add(path);
        }

        this.lastUpdate = Date.now();
    }

    unregister(path: string): void {
        const entry = this.modules.get(path);
        if (!entry) return;

        for (const dep of entry.dependencies) {
            this.dependentsMap.get(dep)?.delete(path);
        }

        this.modules.delete(path);
        this.lastUpdate = Date.now();
    }

    get(path: string): ModuleEntry | undefined {
        return this.modules.get(path);
    }

    has(path: string): boolean {
        return this.modules.has(path);
    }

    getDependents(path: string): string[] {
        return Array.from(this.dependentsMap.get(path) || []);
    }

    getAffectedModules(path: string): string[] {
        const affected = new Set<string>();
        const queue = [path];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (affected.has(current)) continue;

            affected.add(current);

            const dependents = this.getDependents(current);
            for (const dep of dependents) {
                if (!affected.has(dep)) {
                    queue.push(dep);
                }
            }
        }

        affected.delete(path);
        return Array.from(affected);
    }

    setReloading(path: string, reloading: boolean): void {
        const entry = this.modules.get(path);
        if (entry) {
            entry.reloading = reloading;
        }
    }

    isReloading(path: string): boolean {
        return this.modules.get(path)?.reloading ?? false;
    }

    hasReloadingModules(): boolean {
        for (const entry of this.modules.values()) {
            if (entry.reloading) return true;
        }
        return false;
    }

    getAllPaths(): string[] {
        return Array.from(this.modules.keys());
    }

    getState(): RegistryType {
        const modules: Record<string, ModuleEntry> = {};
        for (const [path, entry] of this.modules) {
            modules[path] = entry;
        }
        return {
            modules,
            lastUpdate: this.lastUpdate,
        };
    }

    setState(state: RegistryType): void {
        this.modules.clear();
        this.dependentsMap.clear();

        for (const [path, entry] of Object.entries(state.modules)) {
            this.register(path, entry.dependencies, entry.exports, entry.hash);
        }

        this.lastUpdate = state.lastUpdate;
    }

    clear(): void {
        this.modules.clear();
        this.dependentsMap.clear();
        this.lastUpdate = Date.now();
    }

    get size(): number {
        return this.modules.size;
    }
}

export const moduleRegistry = new ModuleRegistry();
export { ModuleRegistry };
