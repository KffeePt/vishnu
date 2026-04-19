import { NextResponse } from 'next/server';
import admin, { db as adminDb } from '@/config/firebase-admin'; // Import admin for storage, and db for Firestore
import { AssistantConfigData, ModelInfo, AssistantRuleItem } from '@/components/assistant/assistant-types'; // Import shared interfaces
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid'; // For unique IDs

// Helper function to load the main assistant configuration
async function loadAssistantConfig(): Promise<AssistantConfigData | null> {
  try {
    // The adminDb is now directly imported from '@/config/firebase-admin'.
    // Initialization is handled in that file, and adminDb is the initialized Firestore instance.
    const settingsDocRef = adminDb.collection("assistant-settings").doc("main");
    const docSnap = await settingsDocRef.get();

    if (docSnap.exists) {
      return docSnap.data() as AssistantConfigData;
    } else {
      console.warn("Analyze Image API: Assistant configuration document not found.");
      return null;
    }
  } catch (error) {
    console.error("Analyze Image API: Error loading assistant configuration:", error);
    return null;
  }
}

// Function to convert image buffer to base64 (if needed by model)
// Or handle multipart/form-data directly if supported by SDKs
// For Gemini, it can often take base64.

export async function POST(request: Request) {
  const assistantConfig = await loadAssistantConfig();

  if (!assistantConfig) {
    console.error("Analyze Image API: Full assistant configuration could not be loaded.");
    return NextResponse.json({ error: "Assistant configuration not available." }, { status: 503 });
  }
  if (!assistantConfig.imageAnalysisModelInfo) {
    return NextResponse.json({ error: "Image analysis model not configured." }, { status: 503 });
  }

  const { imageAnalysisModelInfo } = assistantConfig; // behavioralRules not needed here anymore
  const { provider, id: modelId } = imageAnalysisModelInfo;

  try {
    const formData = await request.formData();
    const imageRecordId = formData.get('imageRecordId') as string | null; // Expecting ID of existing record
    const userPrompt = formData.get('prompt') as string | null || "Describe this image."; // Default prompt
    // userId and conversationId might still be useful for context or logging, but not for creating new records here.

    if (!imageRecordId) {
      return NextResponse.json({ error: "Missing imageRecordId in form data." }, { status: 400 });
    }

    // Fetch the imageAnalysisRecord to get storage path and other details
    const imageRecordRef = adminDb.collection('imageAnalysisRecords').doc(imageRecordId);
    const imageRecordSnap = await imageRecordRef.get();

    if (!imageRecordSnap.exists) {
      return NextResponse.json({ error: `Image record ${imageRecordId} not found.` }, { status: 404 });
    }
    const imageRecordData = imageRecordSnap.data();
    if (!imageRecordData || !imageRecordData.imageStoragePath || !imageRecordData.mimeType) {
      return NextResponse.json({ error: `Image record ${imageRecordId} is incomplete (missing storage path or mimeType).` }, { status: 500 });
    }

    const storageFilePath = imageRecordData.imageStoragePath;
    const mimeType = imageRecordData.mimeType;

    // Download image from Firebase Storage to get its buffer for AI analysis
    const storage = admin.storage();
    const bucket = storage.bucket(); // Default bucket
    const file = bucket.file(storageFilePath);
    
    const [imageBufferResponse] = await file.download();
    const imageBase64 = imageBufferResponse.toString('base64');
    
    let analysisText = "";
    let analysisError = null;

    // --- AI Image Analysis ---
    if (provider === 'Google Gemini') {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return NextResponse.json({ error: "Google Gemini API key not configured." }, { status: 503 });
      }
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: modelId }); // e.g., "gemini-pro-vision" or "gemini-1.5-flash-latest" if it supports vision

      const imagePart = {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType,
        },
      };
      
      const result = await model.generateContent([userPrompt, imagePart]);
      analysisText = result.response.text();
      console.log("Analyze Image API: Google Gemini response:", analysisText);

    } else if (provider === 'OpenAI') {
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 503 });
      }
      // OpenAI vision models (like gpt-4-vision-preview or gpt-4o) expect a specific format
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId, // e.g., "gpt-4o" or "gpt-4-vision-preview"
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 300, // Adjust as needed
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error("OpenAI Image Analysis API Error:", errorData);
        throw new Error(`OpenAI API request failed: ${response.statusText} - ${errorData.error?.message || ''}`);
      }
      const data = await response.json();
      analysisText = data.choices[0]?.message?.content || "";
      console.log("Analyze Image API: OpenAI response:", analysisText);

    } else if (provider === 'Anthropic') {
        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicApiKey) {
            return NextResponse.json({ error: "Anthropic API key not configured." }, { status: 503 });
        }
        // Anthropic Claude 3 models support image input
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': anthropicApiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId, // e.g., "claude-3-opus-20240229"
                max_tokens: 300,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: mimeType,
                                    data: imageBase64,
                                },
                            },
                            { type: "text", text: userPrompt },
                        ],
                    },
                ],
            }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Anthropic Image Analysis API Error:", errorData);
            throw new Error(`Anthropic API request failed: ${response.statusText} - ${errorData.error?.message || errorData.error?.type || ''}`);
        }
        const data = await response.json();
        analysisText = data.content[0]?.text || "";
        console.log("Analyze Image API: Anthropic response:", analysisText);
    } else {
      return NextResponse.json({ error: `Unsupported image analysis provider: ${provider}` }, { status: 501 });
    }

    // --- Update Firestore Metadata ---
    const updateData: { description: string; status: string; aiProvider?: string; aiModelId?: string; prompt?: string; updatedAt: FirebaseFirestore.FieldValue, analysisError?: string | null } = {
      description: analysisText,
      status: analysisError ? "analysis_failed" : "analysis_complete",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!analysisError) {
      updateData.aiProvider = provider;
      updateData.aiModelId = modelId;
      updateData.prompt = userPrompt;
    } else {
      updateData.analysisError = analysisError;
      if (!analysisText.trim()) { // If analysis failed and text is empty
        analysisText = analysisError || "[AI analysis failed and no specific error message was captured.]";
        updateData.description = analysisText; // Ensure description reflects the error if text is empty
      }
    }
    
    if (!analysisText.trim() && !analysisError) { // Fallback if AI gives empty response without error
        analysisText = "[AI did not provide an analysis for the image.]";
        updateData.description = analysisText;
    }

    await imageRecordRef.update(updateData);
    console.log(`Analyze Image API: Updated image record ${imageRecordId} with analysis.`);
    
    if (analysisError) {
        // If analysis failed, return an error response but still include the (potentially error) analysisText
        return NextResponse.json({
            error: `Image analysis by ${provider} failed. ${analysisError}`,
            analysisText: analysisText, // Send back whatever text was captured, even if it's an error message
            imageRecordId: imageRecordId,
        }, { status: 500 });
    }

    return NextResponse.json({
      message: "Image analysis complete.", // Simplified message
      analysisText: analysisText,
      imageRecordId: imageRecordId,
    });

  } catch (error) {
    console.error("Error in /api/assistant/analyze-image POST handler:", error);
    const imageRecordId = (request as any).formData?.get('imageRecordId') || 'unknown'; // Attempt to get ID for logging
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Attempt to update the record with an error status if possible
    if (imageRecordId && imageRecordId !== 'unknown') {
        try {
            const imageRecordRef = adminDb.collection('imageAnalysisRecords').doc(imageRecordId);
            await imageRecordRef.update({
                status: "analysis_pipeline_error",
                analysisError: `Pipeline error: ${errorMessage}`,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (updateErr) {
            console.error(`Analyze Image API: Failed to update image record ${imageRecordId} with pipeline error status:`, updateErr);
        }
    }
    return NextResponse.json({ error: `Error processing image analysis request: ${errorMessage}`, imageRecordId }, { status: 500 });
  }
}
