import path from 'path';

import { state } from '../state';
import { resolveFirebaseBackendConfig } from '../project/firebase-credentials';

type CallableEnvelope<T> = {
    result?: T;
    error?: {
        status?: string;
        message?: string;
    };
};

function resolveVishnuRoot(): string {
    return process.env.VISHNU_ROOT ? path.resolve(process.env.VISHNU_ROOT) : process.cwd();
}

function resolveTargetProjectId(projectId?: string): string {
    if (projectId?.trim()) {
        return projectId.trim();
    }

    const backend = resolveFirebaseBackendConfig(resolveVishnuRoot());
    const backendProjectId = backend?.projectId?.trim();
    if (backendProjectId) {
        return backendProjectId;
    }

    const activeProjectId = state.project.id?.trim();
    if (activeProjectId) {
        return activeProjectId;
    }
    return process.env.FIREBASE_PROJECT_ID?.trim() || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || '';
}

export async function callAccessControlFunction<T>(options: {
    functionName: string;
    data?: Record<string, unknown>;
    idToken?: string;
    projectId?: string;
}): Promise<T> {
    const idToken = options.idToken || state.rawIdToken;
    if (!idToken) {
        throw new Error(`Missing Firebase ID token for ${options.functionName}.`);
    }

    const projectId = resolveTargetProjectId(options.projectId);
    if (!projectId) {
        throw new Error(`Missing Firebase project ID for ${options.functionName}.`);
    }

    const response = await fetch(`https://us-central1-${projectId}.cloudfunctions.net/${options.functionName}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: options.data || {} })
    });

    let payload: CallableEnvelope<T> | null = null;
    try {
        payload = await response.json() as CallableEnvelope<T>;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(
                `Access control function ${options.functionName} was not found in Firebase project ${projectId}. ` +
                `Deploy the latest Vishnu Cloud Functions before continuing.`
            );
        }
        const message = payload?.error?.message || payload?.result || `Callable ${options.functionName} failed with HTTP ${response.status}.`;
        throw new Error(String(message));
    }

    if (payload?.error?.message) {
        throw new Error(payload.error.message);
    }

    return (payload?.result ?? payload) as T;
}
