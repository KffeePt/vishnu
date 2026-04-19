import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin'; // Import the default admin namespace
import { getFirestore } from 'firebase-admin/firestore';   // Import getFirestore
// Updated import path for AssistantConfigData and added DisplayToolConfig
import { AssistantConfigData, TextToSpeechProvider, DisplayToolConfig } from '@/components/assistant/assistant-types';

// Define the structure of the configuration data to be sent to the client
interface ClientAssistantConfig {
  textToSpeechProvider?: TextToSpeechProvider;
  displayToolConfig?: DisplayToolConfig; // Added displayToolConfig
  environmentVariables?: { key: string; value: string }[];
  isPublic?: boolean;
  unavailableMessage?: string;
  // Optionally include specific, non-sensitive parts of provider configs if needed by client
  // For example, if you want the client to be aware of a default voice ID for ElevenLabs
  // that it might display or use, but not the API key.
  // elevenLabsDefaultVoiceId?: string;
  // openAIDefaultVoice?: string;
}

async function loadAssistantConfigFromFirestore(): Promise<AssistantConfigData> {
  try {
    const adminDb = admin.firestore();
    const settingsCollectionRef = adminDb.collection("assistant-settings");
    const snapshot = await settingsCollectionRef.limit(1).get();

    if (!snapshot.empty) {
      return snapshot.docs[0].data() as AssistantConfigData;
    } else {
      console.warn("API Route (client-config): No assistant configuration document found in 'assistant-settings' collection. Returning default empty config.");
      return { environmentVariables: [] } as unknown as AssistantConfigData;
    }
  } catch (error) {
    console.error("API Route (client-config): Error loading assistant configuration from Firestore:", error);
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const fullConfig = await loadAssistantConfigFromFirestore();

    // This check is now redundant if loadAssistantConfigFromFirestore always throws on failure,
    // but it's kept as a safeguard.
    if (!fullConfig) {
      return NextResponse.json({ error: "Assistant configuration could not be loaded for an unknown reason." }, { status: 503 });
    }

    const clientConfig: ClientAssistantConfig = {
      textToSpeechProvider: fullConfig.textToSpeechProvider,
      environmentVariables: fullConfig.environmentVariables?.map(v => ({ key: v.name, value: '' })),
      isPublic: fullConfig.isPublic,
      unavailableMessage: fullConfig.unavailableMessage,
    };

    return NextResponse.json(clientConfig);

  } catch (error) {
    console.error("Error in /api/assistant/client-config GET handler:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Distinguish between a missing document and other server errors
    if (errorMessage.includes("Configuration document not found")) {
      return NextResponse.json({ error: `Configuration missing: ${errorMessage}` }, { status: 404 });
    }

    // For other errors (like connection issues), use a 503 Service Unavailable
    return NextResponse.json(
      { error: `Failed to fetch client configuration due to a server-side issue: ${errorMessage}` },
      { status: 503 }
    );
  }
}
