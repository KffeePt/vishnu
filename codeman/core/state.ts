export interface ProjectConfig {
    type: 'nextjs' | 'flutter' | 'python' | 'cpp' | 'custom' | 'unknown';
    rootPath: string;
}

export interface AgentMemory {
    conversationHistory: Array<{ role: 'user' | 'model'; parts: string }>;
    contextSummary?: string;
}

export class GlobalState {
    // Singleton instance
    private static instance: GlobalState;

    public project: ProjectConfig = {
        type: 'unknown',
        rootPath: '',
    };

    public agent: AgentMemory = {
        conversationHistory: [],
    };

    public debugMode: boolean = false;
    public isBusy: boolean = false; // Prevents timeout during long operations
    public tempMessage?: string; // Ephemeral message to display on next render
    public isTransitioning: boolean = false; // GLobal UI Lock to prevent race conditions
    public lastReportPath?: string; // Store path to latest test report
    public cloudFeaturesEnabled: boolean = false; // Controls whether Auth/Firebase features are active
    public restartTargetNode?: string; // Where to land after a restart (e.g. 'ROOT' or 'AUTH')
    public shouldRestart: boolean = false;

    public user?: {
        email: string;
        uid: string;
        isAdmin: boolean;
    };

    public deleteContext?: {
        target: string;
        related: any[];
    };

    public userContext?: {
        uid: string;
        email?: string;
        claims: any;
        isMainOwner: boolean;
    };

    private constructor() { }

    public static getInstance(): GlobalState {
        if (!GlobalState.instance) {
            GlobalState.instance = new GlobalState();
        }
        return GlobalState.instance;
    }

    public setProjectType(type: 'nextjs' | 'flutter' | 'python' | 'cpp' | 'custom' | 'unknown') {
        this.project.type = type;
    }

    public setUser(user: { email: string; uid: string; isAdmin: boolean }) {
        this.user = user;
    }
}

export const state = GlobalState.getInstance();
