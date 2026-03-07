import { MenuNode } from './types';

class Registry {
    private menus: Map<string, MenuNode> = new Map();

    public register(node: MenuNode) {
        if (this.menus.has(node.id)) {
            console.warn(`[Registry] Overwriting menu node: ${node.id}`);
        }
        this.menus.set(node.id, node);
    }

    public get(id: string): MenuNode | undefined {
        return this.menus.get(id);
    }

    public list(): string[] {
        return Array.from(this.menus.keys());
    }
}

export const registry = new Registry();
