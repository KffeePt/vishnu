
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MainMenuDef as MainMenu } from '../../codeman/config/menu-map';
import { DevDojoMenuDef as DevDojoMenu } from '../../codeman/config/menu-map';
import { GlobalState } from '../../codeman/core/state';
import { List } from '../../codeman/components/list';

// Mock dependencies
vi.mock('inquirer', () => ({
    default: {
        prompt: vi.fn(),
        Separator: class { }
    }
}));

// Mock List component to capture the options passed to it
vi.mock('../../codeman/components/list', () => ({
    List: vi.fn()
}));

// Mock Child Process
vi.mock('child_process', () => {
    const spawn = vi.fn();
    const exec = vi.fn();
    return {
        spawn,
        exec,
        default: { spawn, exec }
    };
});

describe('CodeMan Menus (Unit)', () => {
    let mockState: GlobalState;

    beforeEach(() => {
        vi.clearAllMocks();
        // Basic mock state
        mockState = {
            project: { type: 'unknown' },
            setProjectType: vi.fn(),
            user: { email: 'test@example.com' },
            debugMode: false,
        } as unknown as GlobalState;
    });

    describe('MainMenu', () => {
        it('should have standard options for unknown project', async () => {
            const options = MainMenu.options;
            const resolvedOptions = typeof options === 'function' ? await options(mockState) : options;
            const values = resolvedOptions.map(o => o.value);

            // Launcher options (unknown project)
            expect(values).toContain('resume-session');
            expect(values).toContain('create-project');
            expect(values).toContain('settings');
            expect(values).toContain('restart');
            expect(values).toContain('exit');
        });

        it('should include project options for Next.js project', async () => {
            mockState.project.type = 'nextjs';
            // Default rootPath to trigger project menu
            mockState.project.rootPath = '/mock/path';

            const options = MainMenu.options;
            const resolvedOptions = typeof options === 'function' ? await options(mockState) : options;
            const values = resolvedOptions.map(o => o.value);

            expect(values).toContain('boilerplates');
            expect(values).toContain('dev-dojo');
            expect(values).toContain('nextjs-tests'); // Tests for nextjs
            expect(values).toContain('ai-tools');
        });
    });

    describe('DevDojoMenu', () => {
        it('should have standard dev tools options', async () => {
            // Mock state to valid project type if needed, or universal
            mockState.project.type = 'nextjs';
            const options = DevDojoMenu.options;
            const resolvedOptions = typeof options === 'function' ? await options(mockState) : options;
            const values = resolvedOptions.map((o: any) => o.value);

            expect(values).toContain('dev-dojo-mode');
            expect(values).toContain('dev-server'); // generic or nextjs specific
            expect(values).toContain('shiva');
            expect(values).toContain('katana');
            expect(values).toContain('back');
        });
    });
});


