import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part, StartChatParams } from "@google/generative-ai";
import { consoleDebug } from "@/utils/console-debug";
import { AssistantConfigData, AssistantTool, AssistantBehavioralRules } from "@/components/assistant/assistant-types";
import { Conversation, ClassificationResult, FLOW_STEP, ModelHistoryPart } from '@/app/api/assistant/types';
import { promptService } from './prompt-service';
import { z, ZodError } from 'zod';
import {
  AssistantConfigDataSchema,
  AssistantToolSchema,
  AssistantBehavioralRulesSchema,
  ConversationSchema,
  ClassificationResultSchema,
  ModelHistoryPartSchema,
} from '@/zod_schemas';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

let googleGenAI: GoogleGenerativeAI | null = null;
if (GEMINI_API_KEY) {
  try {
    googleGenAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  } catch (error) {
    consoleDebug.error("AI Service: Failed to initialize GoogleGenerativeAI:", { error });
  }
}

async function makeAICall(
  systemPrompt: string,
  userQuery: string,
  history: ModelHistoryPart[],
  textModelInfo: AssistantConfigData['textModelInfo'],
  maxOutputTokens: number = 150,
  isJsonOutputExpected: boolean = false,
  callPurpose: string = "UnknownAICall",
  temperature?: number
): Promise<string> {
    if (!textModelInfo) throw new Error("Text model info missing.");

  const effectiveTemperature = temperature ?? 0.7;
  const maxRetries = 3;
  let attempt = 0;
  let lastError: any = null;
  let responseText = "";

  consoleDebug.info(`\n[AI_CALL_START: ${callPurpose}] User Query: ${userQuery.substring(0,100)}...`, { function: 'makeAICall' });
  consoleDebug.debug(`[AI_CALL_PROMPT: ${callPurpose}]\n${systemPrompt}\n[/AI_CALL_PROMPT: ${callPurpose}]`, { function: 'makeAICall' });

  const cleanHistory = history
    .filter(h => h.parts && h.parts.every(p => 'text' in p && p.text && typeof p.text === 'string' && p.text.trim() !== ''))
    .map(h => ({
      role: h.role,
      parts: h.parts.map(p => ({ text: 'text' in p ? (p.text as string) : '' }))
    }));

  while (attempt < maxRetries) {
    attempt++;
    consoleDebug.info(`[AI_CALL_ATTEMPT: ${callPurpose}] Attempt ${attempt}/${maxRetries}`, { function: 'makeAICall' });
    try {
      if (textModelInfo.provider === 'Google Gemini' || textModelInfo.provider === 'Google') {
        if (!googleGenAI) throw new Error("Google Gemini client not initialized.");
        const model = googleGenAI.getGenerativeModel({ model: textModelInfo.id });
        
        const generationConfig: any = { maxOutputTokens, temperature: effectiveTemperature };
        if (isJsonOutputExpected) { 
          generationConfig.responseMimeType = "application/json";
        }

        const startChatParams: StartChatParams = {
          history: cleanHistory,
          generationConfig,
          safetySettings: [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }],
          systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] }
        };
        
        const chat = model.startChat(startChatParams);
        const result = await chat.sendMessage(userQuery);
        responseText = result.response.text();

      } else if (textModelInfo.provider === 'OpenAI') {
        if (!OPENAI_API_KEY) throw new Error("OpenAI API key missing.");
        const messagesForAPI: {role: "system" | "user" | "assistant", content: string}[] = [{ role: "system", content: systemPrompt }];
        cleanHistory.forEach(h => {
          const content = h.parts.map(p => 'text' in p ? p.text : '').join(' ');
          messagesForAPI.push({ role: h.role === "model" ? "assistant" : "user", content });
        });
        messagesForAPI.push({ role: "user", content: userQuery });
        
        const body: any = { model: textModelInfo.id, messages: messagesForAPI, max_tokens: maxOutputTokens, temperature: effectiveTemperature };
        if (isJsonOutputExpected) {
          body.response_format = { type: "json_object" };
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(25000)
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`OpenAI API Error: ${response.statusText} - ${errorData.error?.message || JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        responseText = data.choices?.message?.content || "";

      } else if (textModelInfo.provider === 'Anthropic') {
        if (!ANTHROPIC_API_KEY) throw new Error("Anthropic API key missing.");
        const messagesForAPI: {role: "user" | "assistant", content: string}[] = [];
        cleanHistory.forEach(h => {
          const content = h.parts.map(p => 'text' in p ? p.text : '').join(' ');
          messagesForAPI.push({ role: h.role === "model" ? "assistant" : "user", content });
        });
        messagesForAPI.push({ role: "user", content: userQuery });

        const anthropicSystemPrompt = isJsonOutputExpected 
          ? `${systemPrompt}\n\nIMPORTANTE: Tu respuesta COMPLETA DEBE SER un único objeto JSON válido en formato string. No incluyas ningún otro texto, explicaciones o formato markdown antes o después del objeto JSON.`
          : systemPrompt;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: textModelInfo.id, system: anthropicSystemPrompt, messages: messagesForAPI, max_tokens: maxOutputTokens, temperature: effectiveTemperature }),
          signal: AbortSignal.timeout(25000)
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Anthropic API Error: ${response.statusText} - ${errorData.error?.message || JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        responseText = data.content?.text || "";
      } else {
        throw new Error(`Unsupported provider: ${textModelInfo.provider}`);
      }
      
      consoleDebug.debug(`[AI_CALL_RAW_RESPONSE: ${callPurpose}]\n${responseText}\n[/AI_CALL_RAW_RESPONSE: ${callPurpose}]`, { function: 'makeAICall' });
      consoleDebug.info(`[AI_CALL_END: ${callPurpose}] ${textModelInfo.provider} response snippet: "${responseText.substring(0,100)}..."`, { function: 'makeAICall' });
      return responseText.trim();

    } catch (error) {
      lastError = error;
      consoleDebug.error(`[AI_CALL_ERROR: ${callPurpose}] Attempt ${attempt}/${maxRetries} failed for ${textModelInfo.provider}:`, { error, function: 'makeAICall' });
      if (attempt >= maxRetries) {
        throw new Error(`AI call failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}. Please contact customer support.`);
      }
    }
  }
  throw new Error(`AI call to ${textModelInfo.provider} failed unexpectedly after ${attempt} attempts. Last error: ${lastError?.message || 'Unknown error'}.`);
}

export async function getAIJsonForToolUse(
  userInput: string,
  history: ModelHistoryPart[],
  tool: AssistantTool,
  textModelInfo: AssistantConfigData['textModelInfo'],
  behavioralRules: AssistantBehavioralRules,
  assistantConfig: AssistantConfigData,
  piiConsentGiven: boolean,
  effectiveUserId: string, 
  latestOrderId?: string,
  conversationId?: string
): Promise<string | null> {
  try {
    z.string().parse(userInput);
    z.array(ModelHistoryPartSchema).parse(history);
    AssistantToolSchema.parse(tool);
    AssistantBehavioralRulesSchema.parse(behavioralRules);
    AssistantConfigDataSchema.parse(assistantConfig);
    z.boolean().parse(piiConsentGiven);
    z.string().parse(effectiveUserId);
    z.string().optional().parse(latestOrderId);
    z.string().optional().parse(conversationId);

    const callPurpose = `ToolParamExtraction:ExtractFor:${tool.name}`;
    consoleDebug.info(`[TOOL_LOG:PARAM_EXTRACTION_START] Tool: ${tool.name}. User Input: "${userInput.substring(0,100)}..."`, { function: 'getAIJsonForToolUse' });
    if (!tool.parameters || tool.parameters.length === 0) {
      return "{}";
    }

    const baseSystemPrompt = behavioralRules.initialSystemPrompt || "You are Graviton a helpful AI assistant.";
    const systemPrompt = promptService.getToolParamExtractionPrompt(tool, baseSystemPrompt, piiConsentGiven, latestOrderId, userInput);

    const responseJsonString = await makeAICall(systemPrompt, userInput, [], textModelInfo, 5000, true, callPurpose, 0.2);
    const trimmedResponse = responseJsonString.trim();
    if (trimmedResponse.startsWith("{") && trimmedResponse.endsWith("}")) {
      return trimmedResponse;
    } else {
      const jsonMatch = trimmedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch && jsonMatch) {
        return jsonMatch[0];
      }
      return JSON.stringify({ error: "Failed to extract parameters in valid JSON format.", details: trimmedResponse.substring(0, 200) });
    }
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("Zod validation error in getAIJsonForToolUse:", error.errors);
    }
    return JSON.stringify({ error: "Exception during parameter extraction.", details: error instanceof Error ? error.message : String(error) });
  }
}

export async function getAIIntentAndFlowStep(
  userInput: string,
  history: ModelHistoryPart[],
  conversationData: Conversation, 
  behavioralRules: AssistantBehavioralRules,
  allTools: AssistantTool[],
  textModelInfo: AssistantConfigData['textModelInfo']
): Promise<ClassificationResult> {
  try {
    z.string().parse(userInput);
    z.array(ModelHistoryPartSchema).parse(history);
    ConversationSchema.parse(conversationData);
    AssistantBehavioralRulesSchema.parse(behavioralRules);
    z.array(AssistantToolSchema).parse(allTools);

    const callPurpose = "IntentClassification:DetermineIntentAndFlow";
    const allIntentNames = (behavioralRules.problemClassification || []).map(pc => pc.classification);
    const allFlowSteps = Object.values(FLOW_STEP);

    const detailedHistory = history.map(h => `${h.role === 'user' ? 'Usuario' : 'Asistente'}: "${h.parts[0].text?.substring(0, 150)}..."`).join('\n');
    
    const systemPrompt = promptService.getIntentAndFlowPrompt(conversationData, detailedHistory, userInput, allIntentNames, allFlowSteps as string[]);
    
    const responseJsonString = await makeAICall(systemPrompt, userInput, [], textModelInfo, 30000, true, callPurpose, 0.2); 
    const parsedResponse = JSON.parse(responseJsonString);

    return ClassificationResultSchema.parse(parsedResponse);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("Zod validation error in getAIIntentAndFlowStep:", error.errors);
    }
    return { intentClassification: "clarification_needed", nextFlowStep: conversationData.currentFlowStep };
  }
}

export async function getAIResponse(
  userInput: string,
  history: ModelHistoryPart[],
  intentClassification: string,
  currentFlowStep: string,
  behavioralRules: AssistantBehavioralRules,
  tools: AssistantTool[],
  textModelInfo: AssistantConfigData['textModelInfo'],
  piiConsentGiven: boolean,
  userId: string,
  latestOrderId?: string,
  fullAssistantConfig?: AssistantConfigData,
  currentConversationId?: string,
  restaurantId?: string | null
): Promise<{
  responseContent: string;
  toolCall?: { tool: AssistantTool; parametersJson: string };
  startParameterCollection?: {
    tool: AssistantTool;
    missingParameters: string[];
  };
}> {
  try {
    z.string().parse(userInput);
    z.array(ModelHistoryPartSchema).parse(history);
    z.string().parse(intentClassification);
    z.string().parse(currentFlowStep);
    AssistantBehavioralRulesSchema.parse(behavioralRules);
    z.array(AssistantToolSchema).parse(tools);
    z.boolean().parse(piiConsentGiven);
    z.string().parse(userId);
    z.string().optional().parse(latestOrderId);
    AssistantConfigDataSchema.optional().parse(fullAssistantConfig);
    z.string().optional().parse(currentConversationId);
    z.string().nullable().optional().parse(restaurantId);

    let baseSystemPrompt = behavioralRules.initialSystemPrompt || "You are Graviton a helpful AI assistant.";

    if (fullAssistantConfig?.environmentVariables) {
      fullAssistantConfig.environmentVariables.forEach(customVar => {
        if (customVar.name && customVar.value) {
          const placeholder = `{{${customVar.name}}}`;
          baseSystemPrompt = baseSystemPrompt.replace(new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), customVar.value);
        }
      });
    }

    const relevantRule = behavioralRules.problemClassification?.find(r => r.classification === intentClassification);
    const clarifyingQuestions = relevantRule?.clarifyingQuestionSteps?.map(s => s.value).join(" / ") || "";
    const suggestedResponses = relevantRule?.suggestedResponseSteps?.map(s => s.value).join(" También podrías considerar: ") || "";
    const toolInfo = `Herramientas Disponibles: ${tools.map(t => t.name).join(', ')}`;
    const responseGuides = relevantRule?.suggestedResponseSteps?.map(s => s.value).join(" / ") || "";

    const systemPrompt = promptService.getAIResponsePrompt(
        baseSystemPrompt, piiConsentGiven, behavioralRules, currentFlowStep,
        intentClassification, clarifyingQuestions, suggestedResponses,
        toolInfo, userInput, responseGuides
    );

    const designatedTool = relevantRule?.associatedToolAction?.value
      ? tools.find(t => t.id === relevantRule?.associatedToolAction?.value)
      : undefined;

    const isCriticalOrderStatusScenario =
      currentFlowStep === 'RESOLVE_PRESENT' &&
      designatedTool &&
      latestOrderId &&
      (intentClassification === "Estado de la Orden" || intentClassification === "Problema de Entrega");

    let systemPromptForAICall = systemPrompt;
    if (isCriticalOrderStatusScenario && designatedTool) {
        systemPromptForAICall = promptService.getCriticalOrderStatusPrompt(intentClassification, designatedTool.name, latestOrderId);
    }

    const firstCallPurpose = `ResponseGeneration:${currentFlowStep}:${intentClassification}`;
    const temperatureForFirstCall = isCriticalOrderStatusScenario ? 0.0 : 0.3;

    const response = await makeAICall(
      systemPromptForAICall,
      userInput,
      history,
      textModelInfo,
      5000,
      currentFlowStep === 'RESOLVE_PRESENT',
      firstCallPurpose,
      temperatureForFirstCall
    );

    if (currentFlowStep === 'RESOLVE_PRESENT') {
      try {
        const parsedToolDecision = JSON.parse(response);
        if (parsedToolDecision.use_tool) {
          const toolToUse = tools.find(t => t.name === parsedToolDecision.use_tool);
          if (toolToUse) {
            if (!fullAssistantConfig) {
              throw new Error("fullAssistantConfig is not defined");
            }
            const parametersJson = await getAIJsonForToolUse(userInput, history, toolToUse, textModelInfo, behavioralRules, fullAssistantConfig, piiConsentGiven, userId, latestOrderId, currentConversationId);
            if (parametersJson) {
              const parsedParams = JSON.parse(parametersJson);
              if (parsedParams.missing_required_parameters) {
                return {
                  responseContent: "",
                  startParameterCollection: {
                    tool: toolToUse,
                    missingParameters: parsedParams.missing_required_parameters,
                  }
                };
              }
              return { responseContent: "", toolCall: { tool: toolToUse, parametersJson } };
            }
          }
        }
      } catch (e) {
        return { responseContent: response };
      }
    }
    return { responseContent: response };

  } catch (error) {
    if (error instanceof ZodError) {
      console.error("Zod validation error in getAIResponse:", error.errors);
    }
    if (error instanceof Error && error.message.includes("Please contact customer support.")) {
        throw error;
    }
    return { responseContent: behavioralRules.defaultFallback || "Tuve un problema procesando tu solicitud." };
  }
}