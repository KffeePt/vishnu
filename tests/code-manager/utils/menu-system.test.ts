import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Engine } from '../../../codeman/core/engine';
import { registry } from '../../../codeman/core/registry';
import { GlobalState } from '../../../codeman/core/state';
import { MenuNode } from '../../../codeman/core/types';
import { z } from 'zod';

// Mock dependencies
vi.mock('readline', () => ({
    default: {
        emitKeypressEvents: vi.fn(),
    }
}));

vi.mock('../../../codeman/core/state', () => ({
    GlobalState: {
        getInstance: () => ({
            user: { email: 'test@example.com' },
            setUser: vi.fn(),
        }),
    },
    state: {
        user: { email: 'test@example.com' },
    }
}));

// Mock process.stdin
const mockStdin = {
    isTTY: true,
    setRawMode: vi.fn(),
    resume: vi.fn(),
    setEncoding: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    pause: vi.fn(),
};
Object.defineProperty(process, 'stdin', { value: mockStdin });
Object.defineProperty(process, 'exit', { value: vi.fn() as any });

// Mock List component
vi.mock('../../../codeman/components/list', () => ({
    List: vi.fn().mockResolvedValue('next-step')
}));

vi.mock('../../../codeman/core/registry', () => {
    const nodes = new Map();
    return {
        registry: {
            register: vi.fn((node) => nodes.set(node.id, node)),
            get: vi.fn((id) => nodes.get(id)),
            // Add helper to clear for tests
            _clear: () => nodes.clear()
        }
    };
});

describe('Engine', () => {
    let engine: Engine;

    beforeEach(() => {
        engine = new Engine();
        vi.clearAllMocks();
        (registry as any)._clear();
    });

    it('should initialize and register default menus', () => {
        expect(engine).toBeDefined();
    });

    it('should start at default initialId', async () => {
        const mockMenu: MenuNode = {
            id: 'ROOT',
            propsSchema: z.void(),
            render: vi.fn().mockResolvedValue('exit'),
            next: vi.fn().mockReturnValue(null) // End loop
        };
        registry.register(mockMenu);

        await engine.start('ROOT');

        expect(mockMenu.render).toHaveBeenCalled();
    });

    it('should navigate between menus', async () => {
        const menu1: MenuNode = {
            id: 'step1',
            propsSchema: z.void(),
            render: vi.fn().mockResolvedValue('go-next'),
            next: vi.fn().mockReturnValue('step2')
        };

        const menu2: MenuNode = {
            id: 'step2',
            propsSchema: z.void(),
            render: vi.fn().mockResolvedValue('exit'),
            next: vi.fn().mockReturnValue(null)
        };

        registry.register(menu1);
        registry.register(menu2);

        await engine.start('step1');

        expect(menu1.render).toHaveBeenCalled();
        expect(menu1.next).toHaveBeenCalledWith('go-next');
        expect(menu2.render).toHaveBeenCalled();
    });

    it('should handle navigation history (BACK)', async () => {
        // Setup a flow: A -> B -> Back to A
        const menuA: MenuNode = {
            id: 'menu-a',
            propsSchema: z.void(),
            render: vi.fn()
                .mockResolvedValueOnce('go-b') // First time
                .mockResolvedValueOnce('exit'), // Second time
            next: vi.fn((res) => res === 'go-b' ? 'menu-b' : null)
        };

        const menuB: MenuNode = {
            id: 'menu-b',
            propsSchema: z.void(),
            render: vi.fn().mockResolvedValue('__BACK__'),
            next: vi.fn() // Should not be called for back
        };

        registry.register(menuA);
        registry.register(menuB);

        await engine.start('menu-a');

        expect(menuA.render).toHaveBeenCalledTimes(2);
        expect(menuB.render).toHaveBeenCalledTimes(1);
    });
});
