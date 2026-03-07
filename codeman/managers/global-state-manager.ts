import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ProjectState {
    alias: string;
    path: string;
    envPath: string;
    lastUsed: string;
    projectId?: string;
    userEmail?: string;
}

export interface GlobalConfig {
    projects: ProjectState[];
    lastActiveProject?: string;
}

export class GlobalStateManager {
    private configPath: string;
    private config: GlobalConfig;

    constructor() {
        const homeDir = os.homedir();
        const vishnuDir = path.join(homeDir, '.vishnu');
        if (!fs.existsSync(vishnuDir)) {
            fs.mkdirSync(vishnuDir, { recursive: true });
        }
        this.configPath = path.join(vishnuDir, 'projects.json');
        this.config = this.loadConfig();
    }

    private loadConfig(): GlobalConfig {
        if (fs.existsSync(this.configPath)) {
            try {
                return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
            } catch (error) {
                return { projects: [] };
            }
        }
        return { projects: [] };
    }

    private saveConfig() {
        fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    }

    public getProject(aliasOrPath: string): ProjectState | undefined {
        return this.config.projects.find(p => p.alias === aliasOrPath || p.path === aliasOrPath);
    }

    public registerProject(project: ProjectState) {
        const existingIndex = this.config.projects.findIndex(p => p.path === project.path);
        if (existingIndex >= 0) {
            this.config.projects[existingIndex] = { ...this.config.projects[existingIndex], ...project, lastUsed: new Date().toISOString() };
        } else {
            this.config.projects.push({ ...project, lastUsed: new Date().toISOString() });
        }
        this.config.lastActiveProject = project.path;
        this.saveConfig();
    }

    public getAllProjects(): ProjectState[] {
        return this.config.projects.sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
    }

    public setLastActive(projectPath: string) {
        this.config.lastActiveProject = projectPath;
        this.saveConfig();
    }

    public getLastActive(): ProjectState | undefined {
        if (this.config.lastActiveProject) {
            return this.getProject(this.config.lastActiveProject);
        }
        return undefined;
    }

    public updateLastActive(projectPath: string, alias?: string) {
        // Find existing or create new
        const existing = this.getProject(projectPath);
        if (existing) {
            this.registerProject({ ...existing, lastUsed: new Date().toISOString() });
        } else {
            this.registerProject({
                path: projectPath,
                alias: alias || path.basename(projectPath),
                envPath: path.join(projectPath, '.env'),
                lastUsed: new Date().toISOString()
            });
        }
    }
}
