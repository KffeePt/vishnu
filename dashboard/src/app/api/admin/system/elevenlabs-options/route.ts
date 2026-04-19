

import { NextResponse } from 'next/server';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  // Add other relevant fields if needed, e.g., labels, category
}

interface ElevenLabsModel {
  model_id: string;
  name: string;
  can_be_finetuned: boolean;
  can_do_text_to_speech: boolean;
  can_do_voice_conversion: boolean;
  // Add other relevant fields
}

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.error("ElevenLabs API key is not configured.");
    return NextResponse.json({ error: "ElevenLabs API key is not configured on the server." }, { status: 500 });
  }

  try {
    // Fetch voices
    const voicesResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
    });
    if (!voicesResponse.ok) {
      const errorData = await voicesResponse.json().catch(() => ({}));
      console.error("Error fetching ElevenLabs voices:", voicesResponse.status, errorData);
      throw new Error(`Failed to fetch ElevenLabs voices: ${voicesResponse.statusText} - ${JSON.stringify(errorData)}`);
    }
    const voicesData = await voicesResponse.json();
    const voices: ElevenLabsVoice[] = voicesData.voices || [];

    // Fetch models
    const modelsResponse = await fetch('https://api.elevenlabs.io/v1/models', {
      headers: { 'xi-api-key': apiKey },
    });
    if (!modelsResponse.ok) {
      const errorData = await modelsResponse.json().catch(() => ({}));
      console.error("Error fetching ElevenLabs models:", modelsResponse.status, errorData);
      throw new Error(`Failed to fetch ElevenLabs models: ${modelsResponse.statusText} - ${JSON.stringify(errorData)}`);
    }
    const modelsData = await modelsResponse.json();
    const allModels: ElevenLabsModel[] = modelsData || [];

    // User-specified preferred TTS models
    const preferredTtsModelIds = ["eleven_multilingual_v2", "eleven_flash_v2_5"];
    const preferredTtsModels = allModels.filter(model => preferredTtsModelIds.includes(model.model_id) && model.can_do_text_to_speech);
    
    // Fallback: include other TTS models if the preferred ones aren't exhaustive or found
    const otherTtsModels = allModels.filter(model => !preferredTtsModelIds.includes(model.model_id) && model.can_do_text_to_speech);
    const ttsModels = [...preferredTtsModels, ...otherTtsModels]; // Preferred first

    // User-specified STT models
    // Assuming STT models might not have a 'can_do_speech_to_text' flag, or we rely on IDs.
    // For now, we'll filter by the exact IDs provided by the user.
    const preferredSttModelIds = ["scribe_v1", "scribe_v1_experimental"]; // User's requested STT models
    const sttModels = allModels.filter(model => preferredSttModelIds.includes(model.model_id));
    
    // If scribe_v1 or scribe_v1_experimental are not explicitly marked for STT but are known STT models,
    // this direct ID filter will catch them. If the API provides a capability flag for STT, that would be more robust.
    // Example: const sttModels = allModels.filter(model => model.can_do_speech_to_text === true);

    return NextResponse.json({ voices, ttsModels, sttModels });

  } catch (error) {
    console.error("Error in /api/admin/elevenlabs-options:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: `Failed to retrieve ElevenLabs options: ${message}` }, { status: 500 });
  }
}
