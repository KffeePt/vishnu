import { NextResponse } from 'next/server';

interface GoogleModel {
  name: string;
  displayName?: string;
  // Add other relevant fields if needed
}

interface OpenAIModel {
  id: string;
  // Add other relevant fields if needed
}

interface AnthropicModel { // Assuming a structure, might need adjustment
  id: string;
  name?: string;
  // Add other relevant fields if needed
}

// Helper function to determine OpenAI model capabilities
function getOpenAICapabilities(modelId: string): string[] {
  const id = modelId.toLowerCase();
  const capabilities: string[] = [];

  if (id.startsWith('gpt-')) {
    capabilities.push("text", "chat");
    if (id.includes('vision')) {
      capabilities.push("image_analysis");
    }
  } else if (id.startsWith('text-davinci-') || id.startsWith('text-curie-') || id.startsWith('text-babbage-') || id.startsWith('text-ada-') || id.includes('instruct')) {
    capabilities.push("text");
  } else if (id.startsWith('whisper-')) {
    capabilities.push("stt");
  } else if (id.startsWith('dall-e-')) {
    capabilities.push("image_generation");
  } else if (id.startsWith('tts-')) {
    capabilities.push("tts");
  }
  
  // Fallback for general text models if no specific capability is identified
  if (capabilities.length === 0 && (id.includes('text') || id.includes('chat') || id.includes('instruct') || id.includes('gpt'))) {
      capabilities.push("text", "chat");
  }
  return capabilities;
}

// Helper function to determine Gemini model capabilities
function getGeminiCapabilities(modelId: string): string[] {
    const id = modelId.toLowerCase(); // modelId is already stripped of 'models/' prefix
    const capabilities: string[] = ["text", "chat"]; 
    
    // Check for vision capabilities based on keywords in the model ID
    // Newer models like "gemini-2.5-pro..." or "gemini-2.5-flash..." are often multimodal.
    if (id.includes('vision') || id.includes('pro') || (id.includes('flash') && id.includes('2.5'))) {
        if (!capabilities.includes("image_analysis")) {
            capabilities.push("image_analysis");
        }
    }
    // Example: if Gemini API starts returning specific STT/TTS models with clear identifiers
    // if (id.includes('audio') && id.includes('transcribe')) {
    //     capabilities.push("stt");
    // }
    // if (id.includes('audio') && id.includes('synthesize')) {
    //     capabilities.push("tts");
    // }
    return capabilities;
}


export async function GET() {
  const allModels: { id: string; name: string; provider: string; capabilities: string[] }[] = [];
  const geminiApiKey = process.env.GEMINI_API_KEY;
  // const openaiApiKey = process.env.OPENAI_API_KEY; // Temporarily disabled
  // const anthropicApiKey = process.env.ANTHROPIC_API_KEY; // Temporarily disabled

  if (geminiApiKey) {
    // Manually add the two specified Gemini models
    const specifiedGeminiModels = [
      {
        id: "gemini-2.5-pro-preview-05-06",
        name: "Gemini 2.5 Pro Preview 05-06", // Using a more descriptive name
        provider: 'Google Gemini',
        capabilities: getGeminiCapabilities("gemini-2.5-pro-preview-05-06"),
      },
      {
        id: "gemini-2.5-flash-preview-04-17", // ID after stripping "models/"
        name: "Gemini 2.5 Flash Preview 04-17", // Using a more descriptive name
        provider: 'Google Gemini',
        capabilities: getGeminiCapabilities("gemini-2.5-flash-preview-04-17"),
      }
    ];
    allModels.push(...specifiedGeminiModels);
    allModels.push({
      id: "v0",
      name: "v0",
      provider: 'Vercel',
      capabilities: ["text", "chat", "image_generation"],
    });
  } else {
    console.warn("GEMINI_API_KEY is not set. No Gemini models will be listed.");
    // Optionally, return an error or specific message if no Gemini key
    // return NextResponse.json({ error: "GEMINI_API_KEY is required to list specified models." }, { status: 400 });
  }

  // Fetch OpenAI Models - Temporarily disabled
  // if (openaiApiKey) {
  //   try {
  //     const response = await fetch('https://api.openai.com/v1/models', {
  //       headers: {
  //         'Authorization': `Bearer ${openaiApiKey}`,
  //       },
  //     });
  //     if (response.ok) {
  //       const data = await response.json();
  //       (data.data || []).forEach((model: OpenAIModel) => {
  //         allModels.push({
  //           id: model.id,
  //           name: model.id,
  //           provider: 'OpenAI',
  //           capabilities: getOpenAICapabilities(model.id),
  //         });
  //       });
  //     } else {
  //       console.warn(`Failed to fetch OpenAI models: ${response.status} ${response.statusText}`);
  //     }
  //   } catch (error) {
  //     console.error('Error fetching OpenAI models:', error);
  //   }
  // }

  // Fetch Anthropic Models - Temporarily disabled
  // if (anthropicApiKey) {
  //   try {
  //     const commonAnthropicModels = [
  //       { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
  //       { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
  //       { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
  //       { id: "claude-2.1", name: "Claude 2.1" },
  //       { id: "claude-2.0", name: "Claude 2.0" },
  //       { id: "claude-instant-1.2", name: "Claude Instant 1.2" }
  //     ];
  //     commonAnthropicModels.forEach(model => {
  //       allModels.push({ ...model, provider: 'Anthropic', capabilities: ["text", "chat"] });
  //     });
  //     console.log("Anthropic models (manual list) added as API key was present. Actual API call disabled.");
  //   } catch (error) {
  //     console.error('Error processing Anthropic models:', error);
  //   }
  // }
  
  // Sort models by provider then by name for a consistent order (will only sort the Gemini models if others are disabled)
  allModels.sort((a, b) => {
    if (a.provider < b.provider) return -1;
    if (a.provider > b.provider) return 1;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  if (allModels.length === 0) {
    return NextResponse.json({ error: "No API keys found or no models could be fetched. Please check your .env file and API provider status." }, { status: 500 });
  }

  return NextResponse.json(allModels);
}
