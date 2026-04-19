import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { AssistantConfigData } from '@/components/assistant/assistant-types'; // Import shared interfaces
import { GoogleGenerativeAI } from '@google/generative-ai'; // For potential Google STT
// OpenAI and Anthropic might require their own SDKs or different fetch patterns for STT

async function loadAssistantConfig(): Promise<AssistantConfigData | null> {
  try {
    if (!admin.apps.length) {
      console.error("Transcribe Audio API: Firebase Admin SDK not initialized.");
      return null;
    }
    const adminDb = admin.firestore();
    const settingsDocRef = adminDb.collection("assistant-settings").doc("main");
    const docSnap = await settingsDocRef.get();
    return docSnap.exists ? (docSnap.data() as AssistantConfigData) : null; // Corrected: docSnap.exists is a property
  } catch (error) {
    console.error("Transcribe Audio API: Error loading assistant configuration:", error);
    return null;
  }
}

export async function POST(request: Request) {
  const assistantConfig = await loadAssistantConfig();

  if (!assistantConfig || !assistantConfig.sttModelInfo) {
    return NextResponse.json({ error: "Speech-to-text model not configured." }, { status: 503 });
  }

  const { sttModelInfo } = assistantConfig;
  const { provider, id: modelId } = sttModelInfo;

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided." }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    let transcribedText = "";

    if (provider === 'Google Gemini' || provider === 'Google Cloud') { // Google might use Speech-to-Text API or a Gemini model
      const geminiApiKey = process.env.GEMINI_API_KEY; // Or a specific Google Cloud STT key
      if (!geminiApiKey) { // This check might need to be more specific if using a different Google STT service
        return NextResponse.json({ error: "Google API key for STT not configured." }, { status: 503 });
      }
      // Note: Google Cloud Speech-to-Text is a separate service.
      // Gemini models themselves might not directly do STT from raw audio bytes via the same API.
      // This is a placeholder assuming a future Gemini capability or a simplified STT API.
      // For a production Google STT, you'd typically use the @google-cloud/speech package.
      // For this example, we'll simulate a direct API call if one existed or was simple.
      // THIS IS A SIMPLIFIED/CONCEPTUAL IMPLEMENTATION FOR GOOGLE STT via a generic model endpoint.
      // A real implementation would use the Google Cloud Speech-to-Text client library.
      console.warn("Transcribe Audio API: Google STT implementation is conceptual. For production, use @google-cloud/speech.");
      // Example: If Gemini had a direct audio transcription endpoint (hypothetical for this simplicity)
      // const genAI = new GoogleGenerativeAI(geminiApiKey);
      // const model = genAI.getGenerativeModel({ model: modelId }); // modelId would be a specific STT model
      // const result = await model.generateContent([{ inlineData: { data: audioBuffer.toString('base64'), mimeType: audioFile.type } }]);
      // transcribedText = result.response.text();
      transcribedText = "[Google STT not fully implemented in this example - conceptual]";
      return NextResponse.json({ error: "Google STT via Gemini generic endpoint is conceptual and not fully implemented here. Use Google Cloud Speech SDK." }, { status: 501 });


    } else if (provider === 'OpenAI') {
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 503 });
      }
      // OpenAI Whisper API uses multipart/form-data
      const whisperFormData = new FormData();
      whisperFormData.append('file', new Blob([audioBuffer], { type: audioFile.type }), audioFile.name || 'audio.webm');
      whisperFormData.append('model', modelId); // e.g., "whisper-1"

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          // Content-Type is set automatically by fetch for FormData
        },
        body: whisperFormData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("OpenAI STT API Error:", errorData);
        throw new Error(`OpenAI STT API request failed: ${response.statusText} - ${errorData.error?.message || ''}`);
      }
      const data = await response.json();
      transcribedText = data.text || "";
      console.log("Transcribe Audio API: OpenAI Whisper response:", transcribedText);

    } else if (provider === 'Anthropic') {
        // Anthropic models (like Claude) are primarily text-based and do not directly offer STT.
        // You would typically use a third-party STT service or another provider's STT.
        console.warn(`Transcribe Audio API: Anthropic provider selected for STT, but Anthropic models do not directly support STT. Model ID: ${modelId}`);
        return NextResponse.json({ error: "Anthropic models do not support Speech-to-Text directly. Please configure a different STT provider." }, { status: 501 });

    } else {
      return NextResponse.json({ error: `Unsupported STT provider: ${provider}` }, { status: 501 });
    }

    return NextResponse.json({ transcription: transcribedText });

  } catch (error) {
    console.error("Error in /api/assistant/transcribe-audio POST handler:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Error processing audio transcription request: ${errorMessage}` }, { status: 500 });
  }
}
