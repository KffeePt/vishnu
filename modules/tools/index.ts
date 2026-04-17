import * as intents from './backend/intents/index';

export async function registerRoutes() {
    const { registry } = await import('../codeman/backend/infra/render/index');
    const handlers: Record<string, () => Promise<void>> = {
        'tools:runTests': intents.runTests,
        'tools:runBuild': intents.runBuild,
        'tools:runEmulator': intents.runEmulator,
        'tools:setClaims': intents.setClaims,
        'tools:startDashboardDev': intents.startDashboardDev,
        'tools:setupFirebase': intents.setupFirebase,
        'tools:deployPrep': intents.deployPrep,
        'tools:deployAll': intents.deployAll,
        'tools:deployRelease': intents.deployRelease,
        'tools:deployRules': intents.deployRules,
        'tools:deployFunctions': intents.deployFunctions
    };

    for (const [name, handler] of Object.entries(handlers)) {
        registry.registerScript(name, async () => {
            await handler();
        });
    }
}

// Auto-activate on import
registerRoutes().catch(err => console.error('Failed to register tools routes:', err));
