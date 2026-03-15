import { MenuNode } from './types';

class Registry {
    private menus: Map<string, MenuNode> = new Map();
    private scripts: Map<string, (args?: any) => Promise<string | void>> = new Map();

    public register(node: MenuNode) {
        if (this.menus.has(node.id)) {
            console.warn(`[Registry] Overwriting menu node: ${node.id}`);
        }
        this.menus.set(node.id, node);
    }

    public get(id: string): MenuNode | undefined {
        return this.menus.get(id);
    }

    public registerScript(name: string, handler: (args?: any) => Promise<string | void>) {
        if (this.scripts.has(name)) {
            console.warn(`[Registry] Overwriting script handler: ${name}`);
        }
        this.scripts.set(name, handler);
    }

    public getScript(name: string): ((args?: any) => Promise<string | void>) | undefined {
        return this.scripts.get(name);
    }

    public list(): string[] {
        return Array.from(this.menus.keys());
    }
}

export const registry = new Registry();
