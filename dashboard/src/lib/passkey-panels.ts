export type PasskeyPanel = 'admin' | 'candyman';

export function isAdminPanelPasskey(data: Record<string, any>): boolean {
    return data?.isAdmin === true;
}

export function isCandymanPanelPasskey(data: Record<string, any>): boolean {
    return data?.isCandyman === true;
}

export function matchesPasskeyPanel(data: Record<string, any>, panel: PasskeyPanel): boolean {
    return panel === 'admin' ? isAdminPanelPasskey(data) : isCandymanPanelPasskey(data);
}

export function getPasskeyPanelLabel(data: Record<string, any>): string {
    if (isCandymanPanelPasskey(data)) return 'Workforce';
    if (isAdminPanelPasskey(data)) return 'Control Center';
    return 'Legacy';
}

export function getMissingPasskeyMessage(panel: PasskeyPanel): string {
    return panel === 'admin'
        ? 'No Control Center passkey registered for this user.'
        : 'No Workforce Portal passkey registered for this user.';
}

export function getWrongPanelPasskeyMessage(panel: PasskeyPanel): string {
    return panel === 'admin'
        ? 'This passkey is not registered for the Control Center.'
        : 'This passkey is not registered for the Workforce Portal.';
}
