import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';

export const DoctorMenuDef: MenuDefinition = {
    id: 'doctor-menu',
    title: '🩺 Flutter Doctor & Diagnostics',
    type: 'static',
    options: [
        {
            label: '🩺 Run Flutter Doctor (Basic)',
            value: 'doctor-basic',
            action: { type: 'script', handler: 'runDoctorBasic' }
        },
        {
            label: '🔬 Run Flutter Doctor (Verbose -v)',
            value: 'doctor-verbose',
            action: { type: 'script', handler: 'runDoctorVerbose' }
        },
        {
            label: '📜 Accept Android Licenses',
            value: 'doctor-licenses',
            action: { type: 'script', handler: 'runDoctorLicenses' }
        },
        {
            label: '🧹 Flutter Clean',
            value: 'flutter-clean',
            action: { type: 'script', handler: 'runFlutterClean' }
        },
        {
            label: '📥 Flutter Pub Get',
            value: 'flutter-pub-get',
            action: { type: 'script', handler: 'runFlutterPubGet' }
        },
        { label: '---', value: 'sep1', type: 'separator' },
        { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
    ]
};
