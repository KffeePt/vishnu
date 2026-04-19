import admin from '@/config/firebase-admin';
import { consoleDebug } from '@/utils/console-debug';
import { AssistantConfigData } from '@/components/assistant/assistant-types';

export async function loadAssistantConfigFromFirestore(userId: string): Promise<AssistantConfigData | null> {
    try {
        const adminDb = admin.firestore();

        const mainSettingsDocRef = adminDb.collection("configs").doc("generalConfig");
        const mainSettingsSnap = await mainSettingsDocRef.get();

        if (!mainSettingsSnap.exists) {
            consoleDebug.error("Config Service: Main settings document not found at 'configs/generalConfig'.", { function: "loadAssistantConfigFromFirestore" });
            return null;
        }
        const mainSettings = mainSettingsSnap.data() as any;

        const userSettingsDocRef = adminDb.collection("userAssistantSettings").doc(userId);
        const userSettingsSnap = await userSettingsDocRef.get();

        if (userSettingsSnap.exists) {
            const userSpecificSettings = userSettingsSnap.data() as any;
            
            const mergedSettings = {
              ...mainSettings,
              ...userSpecificSettings,
              profiles: {
                ...mainSettings.profiles,
                ...userSpecificSettings.profiles,
              },
            };

            const activeProfileName = mergedSettings.activeProfile || 'default';
            const activeProfile = mergedSettings.profiles?.[activeProfileName];

            if (activeProfile) {
                const finalConfig = { ...mergedSettings, ...activeProfile };

                // Safeguard against partial user configs by falling back to main settings for essential properties
                finalConfig.tools = finalConfig.tools ?? mainSettings.tools;
                finalConfig.behavioralRules = finalConfig.behavioralRules ?? mainSettings.behavioralRules;
                finalConfig.textModelInfo = finalConfig.textModelInfo ?? mainSettings.textModelInfo;

                delete finalConfig.profiles;
                delete finalConfig.activeProfile;
                consoleDebug.info(`Loaded and merged settings. Active profile is '${activeProfileName}' for user ${userId}.`, { function: "loadAssistantConfigFromFirestore" });
                return finalConfig as AssistantConfigData;
            } else {
                consoleDebug.warn(`Active profile '${activeProfileName}' not found for user ${userId}. Falling back to main default.`, { function: "loadAssistantConfigFromFirestore" });
            }
        }
        
        consoleDebug.info(`No valid user-specific settings for ${userId}. Using main config and creating user document.`, { function: "loadAssistantConfigFromFirestore" });
        
        await userSettingsDocRef.set(mainSettings);
        consoleDebug.info(`Created user settings for ${userId} from 'configs/generalConfig'.`, { function: "loadAssistantConfigFromFirestore" });
        
        const activeProfileName = mainSettings.activeProfile || 'default';
        const activeProfile = mainSettings.profiles?.[activeProfileName];

        if (activeProfile) {
            const finalConfig = { ...mainSettings, ...activeProfile };
            delete finalConfig.profiles;
            delete finalConfig.activeProfile;
            return finalConfig as AssistantConfigData;
        } else {
            consoleDebug.error(`Default active profile '${activeProfileName}' not found in main settings.`, { function: "loadAssistantConfigFromFirestore" });
            return null;
        }

    } catch (error) {
        consoleDebug.error("Config Service: Error loading assistant configuration for user " + userId, { error, function: "loadAssistantConfigFromFirestore" });
        return null;
    }
}