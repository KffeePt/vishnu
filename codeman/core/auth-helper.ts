export async function checkAndSetupAuth(projectPath: string): Promise<boolean> {
    const { AuthAccessManager } = await import('./auth/access-manager');
    return AuthAccessManager.ensureProjectAccess(projectPath);
}
