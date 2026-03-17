export type SlotId =
    | 'devdojo.scripts'
    | 'devdojo.skills'
    | 'devdojo.tools'
    | 'devdojo.agents';

export interface SlotDefinition {
    id: SlotId;
    label: string;
    description: string;
    category: string;
    maxItems?: number;
}

export const SLOTS: Record<SlotId, SlotDefinition> = {
    'devdojo.scripts': {
        id: 'devdojo.scripts',
        label: 'Scripts',
        description: 'Automation scripts and workflows',
        category: 'scripts',
    },
    'devdojo.skills': {
        id: 'devdojo.skills',
        label: 'Skills',
        description: 'Agent skills and capabilities',
        category: 'skills',
    },
    'devdojo.tools': {
        id: 'devdojo.tools',
        label: 'Tools',
        description: 'Developer tools and utilities',
        category: 'tools',
    },
    'devdojo.agents': {
        id: 'devdojo.agents',
        label: 'Agents',
        description: 'AI agents and assistants',
        category: 'agents',
    },
};

export class SlotRegistry {
    private static instance: SlotRegistry;
    private contributions: Map<SlotId, Array<{ pluginId: string; contribution: any }>> = new Map();

    private constructor() {
        for (const slotId of Object.keys(SLOTS) as SlotId[]) {
            this.contributions.set(slotId, []);
        }
    }

    public static getInstance(): SlotRegistry {
        if (!SlotRegistry.instance) {
            SlotRegistry.instance = new SlotRegistry();
        }
        return SlotRegistry.instance;
    }

    public isValidSlot(slotId: string): slotId is SlotId {
        return slotId in SLOTS;
    }

    public isPluginAccessible(slotId: string): boolean {
        return slotId.startsWith('devdojo.');
    }

    public registerContribution(slotId: SlotId, pluginId: string, contribution: any): boolean {
        if (!this.isValidSlot(slotId)) {
            console.warn(`[SlotRegistry] Invalid slot: ${slotId}`);
            return false;
        }

        if (!this.isPluginAccessible(slotId)) {
            console.warn(`[SlotRegistry] Slot ${slotId} is not plugin-accessible`);
            return false;
        }

        const slot = SLOTS[slotId];
        const slotContributions = this.contributions.get(slotId)!;

        if (slot.maxItems && slotContributions.length >= slot.maxItems) {
            console.warn(`[SlotRegistry] Slot ${slotId} has reached max items (${slot.maxItems})`);
            return false;
        }

        slotContributions.push({ pluginId, contribution });
        return true;
    }

    public getContributions(slotId: SlotId): Array<{ pluginId: string; contribution: any }> {
        return this.contributions.get(slotId) || [];
    }

    public clear(): void {
        for (const slotId of Object.keys(SLOTS) as SlotId[]) {
            this.contributions.set(slotId, []);
        }
    }

    public clearPluginContributions(pluginId: string): void {
        for (const [slotId, slotContributions] of this.contributions.entries()) {
            this.contributions.set(
                slotId,
                slotContributions.filter(c => c.pluginId !== pluginId)
            );
        }
    }
}

export const slotRegistry = SlotRegistry.getInstance();
