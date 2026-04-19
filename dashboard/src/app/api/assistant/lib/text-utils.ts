import { consoleDebug } from "@/utils/console-debug";
import { AssistantConfigData } from "@/components/assistant/assistant-types";

const DEFAULT_OPENAI_TEXT_MODEL_ID = "gpt-3.5-turbo";

export function stripMarkdown(text: string, stripEmojis?: boolean): string {
  let cleanedText = text;
  cleanedText = cleanedText.replace(/\*\*(.*?)\*\*/g, '$1');
  cleanedText = cleanedText.replace(/__(.*?)__/g, '$1');
  cleanedText = cleanedText.replace(/\*(.*?)\*/g, '$1');
  cleanedText = cleanedText.replace(/_(.*?)_/g, '$1');
  cleanedText = cleanedText.replace(/~~(.*?)~~/g, '$1');
  cleanedText = cleanedText.replace(/`(.*?)`/g, '$1');
  cleanedText = cleanedText.replace(/```([\s\S]*?)```/g, '$1\n');
  cleanedText = cleanedText.replace(/\[(.*?)\]\(.*?\)/g, '$1');
  cleanedText = cleanedText.replace(/!\[(.*?)\]\(.*?\)/g, '$1');
  cleanedText = cleanedText.replace(/^#+\s*(.*)/gm, '$1');
  cleanedText = cleanedText.replace(/^(?:---|\*\*\*|___)\s*$/gm, '');
  cleanedText = cleanedText.replace(/^>\s*(.*)/gm, '$1');
  cleanedText = cleanedText.replace(/\n\s*\n/g, '\n');
  
  if (stripEmojis) {
    cleanedText = cleanedText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}\u{200D}\u{FE0F}]/gu, '');
  }
  
  cleanedText = cleanedText.replace(/[\*＊﹡⁎∗٭]/g, '');
  return cleanedText.trim();
}

export async function formatTextForSpeech(
  inputText: string,
  openAiApiKey: string | undefined,
  assistantConfig: AssistantConfigData | null
): Promise<string> {
  consoleDebug.info("[formatTextForSpeech] Initial input text:", { function: "formatTextForSpeech", details: inputText.substring(0, 100) + "..." });
  let textToProcess = inputText;
  const shouldStripEmojis = assistantConfig?.behavioralRules?.forbidEmojiInResponses === true;
  consoleDebug.info(`[formatTextForSpeech] Based on config, shouldStripEmojis: ${shouldStripEmojis}`, { function: "formatTextForSpeech" });

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
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error formatting text for speech" }));
        console.error("[formatTextForSpeech] OpenAI text formatting API Error:", response.status, errorData);
        console.warn("[formatTextForSpeech] Failed to format text with AI, proceeding with original text for stripping.");
      } else {
        const data = await response.json();
        if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
          textToProcess = data.choices[0].message.content.trim();
          console.log("[formatTextForSpeech] Text after AI formatting:", textToProcess);
        } else {
          console.warn("[formatTextForSpeech] OpenAI text formatting API returned unexpected structure, proceeding with original text for stripping.", data);
        }
      }
    } catch (error) {
      console.error("[formatTextForSpeech] Error during AI formatTextForSpeech call:", error);
      console.warn("[formatTextForSpeech] Exception during AI text formatting, proceeding with original text for stripping.");
    }
  } else {
    console.log("[formatTextForSpeech] Skipping AI-based text formatting. Conditions not met. Proceeding with original text for stripping.");
  }

  consoleDebug.info("[formatTextForSpeech] Text before programmatic Markdown stripping:", { function: "formatTextForSpeech", details: textToProcess.substring(0, 100) + "..." });
  const strippedText = stripMarkdown(textToProcess, shouldStripEmojis);
  consoleDebug.info("[formatTextForSpeech] Text after programmatic Markdown stripping (final output of this function):", { function: "formatTextForSpeech", details: strippedText.substring(0, 100) + "..." });
  return strippedText;
}