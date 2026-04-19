import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { AssistantConfigData } from '@/components/assistant/assistant-types';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Default Voice IDs and Model IDs if not specified in config
const DEFAULT_ELEVENLABS_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Example: "Rachel"
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OPENAI_TTS_MODEL_ID = "tts-1";
const DEFAULT_OPENAI_TTS_VOICE = "alloy";
const DEFAULT_OPENAI_TEXT_MODEL_ID = "gpt-3.5-turbo"; // Default for text formatting

function stripMarkdown(text: string): string {
  let cleanedText = text;
  // Remove bold (**text**)
  cleanedText = cleanedText.replace(/\*\*(.*?)\*\*/g, '$1');
  // Remove bold (__text__)
  cleanedText = cleanedText.replace(/__(.*?)__/g, '$1');
  // Remove italics (*text*)
  cleanedText = cleanedText.replace(/\*(.*?)\*/g, '$1');
  // Remove italics (_text_)
  cleanedText = cleanedText.replace(/_(.*?)_/g, '$1');
  // Remove strikethrough (~~text~~)
  cleanedText = cleanedText.replace(/~~(.*?)~~/g, '$1');
  // Remove inline code (`text`)
  cleanedText = cleanedText.replace(/`(.*?)`/g, '$1');
  // Remove code blocks (```text```) - simple version for single and multiline
  cleanedText = cleanedText.replace(/```([\s\S]*?)```/g, '$1\n'); // Add newline for block context
  // Remove links ([text](url)) - keep only text
  cleanedText = cleanedText.replace(/\[(.*?)\]\(.*?\)/g, '$1');
  // Remove images (![alt](url)) - keep only alt text or nothing
  cleanedText = cleanedText.replace(/!\[(.*?)\]\(.*?\)/g, '$1');
  // Remove headings (e.g., # text, ## text)
  cleanedText = cleanedText.replace(/^#+\s*(.*)/gm, '$1');
  // Remove horizontal rules (---, ***, ___)
  cleanedText = cleanedText.replace(/^(?:---|\*\*\*|___)\s*$/gm, '');
  // Remove blockquotes (> text)
  cleanedText = cleanedText.replace(/^>\s*(.*)/gm, '$1');
  // Replace multiple newlines with a single one
  cleanedText = cleanedText.replace(/\n\s*\n/g, '\n');
  
  // Final aggressive removal of any remaining standard asterisks and similar looking characters
  cleanedText = cleanedText.replace(/[\*＊﹡⁎∗٭]/g, ''); // Standard, full-width, small, five-point, six-point asterisks etc.

  return cleanedText.trim();
}

async function formatTextForSpeech(
  inputText: string,
  openAiApiKey: string | undefined, // Specifically for OpenAI
  assistantConfig: AssistantConfigData | null
): Promise<string> {
  console.log("[formatTextForSpeech] Initial input text:", inputText);
  let textToProcess = inputText;

  const canUseOpenAIFormatting = 
    openAiApiKey && 
    assistantConfig?.textModelInfo?.provider?.toLowerCase().includes("openai");

  if (canUseOpenAIFormatting) {
    console.log(`[formatTextForSpeech] Attempting AI-based text formatting with model: ${assistantConfig?.textModelInfo?.id || DEFAULT_OPENAI_TEXT_MODEL_ID}`);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: assistantConfig?.textModelInfo?.id || DEFAULT_OPENAI_TEXT_MODEL_ID,
          messages: [
            {
              role: "system",
              content: "You are an AI assistant that refines text for speech synthesis. Given a text that might contain formatting characters (like Markdown: *, **, _, ```, #, etc.) or other symbols not meant to be read aloud, your task is to clean this text. The output should be plain text, suitable for a text-to-speech engine to read naturally. Remove all such formatting characters. Ensure the core message remains intact. Do not add any introductory phrases or explanations in your response; only return the cleaned text. Be concise."
            },
            {
              role: "user",
              content: inputText
            }
          ],
          temperature: 0.1, // Lowered temperature for more deterministic output
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error formatting text for speech" }));
        console.error("[formatTextForSpeech] OpenAI text formatting API Error:", response.status, errorData);
        console.warn("[formatTextForSpeech] Failed to format text with AI, proceeding with original text for stripping.");
        // textToProcess remains inputText
      } else {
        const data = await response.json();
        if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
          textToProcess = data.choices[0].message.content.trim();
          console.log("[formatTextForSpeech] Text after AI formatting:", textToProcess);
        } else {
          console.warn("[formatTextForSpeech] OpenAI text formatting API returned unexpected structure, proceeding with original text for stripping.", data);
          // textToProcess remains inputText
        }
      }
    } catch (error) {
      console.error("[formatTextForSpeech] Error during AI formatTextForSpeech call:", error);
      console.warn("[formatTextForSpeech] Exception during AI text formatting, proceeding with original text for stripping.");
      // textToProcess remains inputText
    }
  } else {
    console.log("[formatTextForSpeech] Skipping AI-based text formatting. Conditions not met (Provider not OpenAI, API key missing, or no textModelInfo). Proceeding with original text for stripping.");
    // textToProcess remains inputText
  }
  
  console.log("[formatTextForSpeech] Text before programmatic Markdown stripping:", textToProcess);
  // Always apply programmatic stripping
  const strippedText = stripMarkdown(textToProcess);
  console.log("[formatTextForSpeech] Text after programmatic Markdown stripping (final output of this function):", strippedText);
  return strippedText;
}

async function loadAssistantConfigFromFirestore(): Promise<AssistantConfigData | null> {
  try {
    if (!admin.apps.length) {
      console.error("API Route (synthesize-speech): Firebase Admin SDK not initialized.");
      // Depending on setup, this might require re-initialization or indicate a startup issue.
      // For now, assume it's initialized by the import.
    }
    const adminDb = admin.firestore();
    const settingsDocRef = adminDb.collection("assistant-settings").doc("main");
    const docSnap = await settingsDocRef.get();

    if (docSnap.exists) {
      return docSnap.data() as AssistantConfigData;
    } else {
      console.warn("API Route (synthesize-speech): Assistant configuration document not found in Firestore.");
      return null;
    }
  } catch (error) {
    console.error("API Route (synthesize-speech): Error loading assistant configuration from Firestore:", error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { text: originalText, provider } = await request.json();

    if (!originalText || !provider) {
      return NextResponse.json({ error: "Missing 'text' or 'provider' in request body." }, { status: 400 });
    }

    const assistantConfig = await loadAssistantConfigFromFirestore(); // Load config first

    console.log("Original text for synthesis:", originalText);
    // Pass assistantConfig to formatTextForSpeech
    const textToSynthesize = await formatTextForSpeech(originalText, OPENAI_API_KEY, assistantConfig);
    console.log("Text to synthesize after formatting:", textToSynthesize);

    let audioStream: ReadableStream | null = null;
    let contentType = "audio/mpeg";

    if (provider === "elevenlabs") {
      if (!ELEVENLABS_API_KEY) {
        return NextResponse.json({ error: "ElevenLabs API key not configured." }, { status: 503 });
      }

      const voiceId = assistantConfig?.elevenLabsConfig?.voiceId || DEFAULT_ELEVENLABS_VOICE_ID;
      const modelId = assistantConfig?.elevenLabsConfig?.modelId || DEFAULT_ELEVENLABS_MODEL_ID;
      
      console.log(`Synthesizing with ElevenLabs. Voice ID: ${voiceId}, Model ID: ${modelId}`);

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: textToSynthesize,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown ElevenLabs API error" }));
        console.error("ElevenLabs API Error:", response.status, errorData);
        return NextResponse.json({ error: `ElevenLabs API request failed: ${response.statusText}`, details: errorData }, { status: response.status });
      }
      audioStream = response.body;

    } else if (provider === "openai") {
      if (!OPENAI_API_KEY) {
        return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 503 });
      }

      const model = assistantConfig?.openAiTtsConfig?.modelId || DEFAULT_OPENAI_TTS_MODEL_ID;
      const voice = assistantConfig?.openAiTtsConfig?.voice || DEFAULT_OPENAI_TTS_VOICE;

      console.log(`Synthesizing with OpenAI TTS. Model: ${model}, Voice: ${voice}`);

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          input: textToSynthesize,
          voice: voice,
          response_format: "mp3", // Explicitly asking for mp3
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown OpenAI API error" }));
        console.error("OpenAI TTS API Error:", response.status, errorData);
        return NextResponse.json({ error: `OpenAI TTS API request failed: ${response.statusText}`, details: errorData }, { status: response.status });
      }
      audioStream = response.body;
      // OpenAI might return different audio types, but mp3 is common and requested.
      // contentType = response.headers.get('Content-Type') || 'audio/mpeg'; 
      // Since we request mp3, we can assume audio/mpeg

    } else {
      return NextResponse.json({ error: `Unsupported TTS provider: ${provider}. Supported: 'elevenlabs', 'openai'.` }, { status: 400 });
    }

    if (!audioStream) {
        return NextResponse.json({ error: "Failed to generate audio stream." }, { status: 500 });
    }

    return new NextResponse(audioStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
      },
    });

  } catch (error) {
    console.error("Error in /api/assistant/synthesize-speech POST handler:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Error processing TTS request: ${errorMessage}` },
      { status: 500 }
    );
  }
}
