import { NextResponse } from 'next/server';
import admin from '@/config/firebase-admin';
import { getDatabase } from 'firebase-admin/database';

import { FieldValue } from 'firebase-admin/firestore';
import { consoleDebug as debugLogger } from "@/utils/console-debug";
import { PerformanceMonitor, withTimeout } from "@/utils/performance-monitor";
import { AssistantTool, FirestoreAssistantTool } from '@/components/assistant/assistant-types';
import { StoredMessage, Conversation, ModelHistoryPart, FLOW_STEP } from './types';
import { loadAssistantConfigFromFirestore } from './lib/config-service';
import { formatTextForSpeech } from './lib/text-utils';
import { getAIIntentAndFlowStep, getAIResponse } from './lib/ai-service';
import { promptService } from './lib/prompt-service';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: Request) {
  const perfMonitor = new PerformanceMonitor("Assistant API POST");
  
  let sessionUserId: string | null = null;
  let sessionUserRole: string | undefined = undefined;

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7);
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      sessionUserId = decodedToken.uid;
      sessionUserRole = decodedToken.role as string | undefined; 
    } catch (firebaseAuthError) {
      debugLogger.warn("[Assistant API POST] Firebase ID token verification failed:", { component: "POSTAuth", error: firebaseAuthError });
    }
  }

  if (!sessionUserId) {
    try {
      
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    } catch (sessionError) {
      return NextResponse.json({ error: 'Session validation error' }, { status: 500 });
    }
  }
  
  if (!sessionUserId) { 
      return NextResponse.json({ error: 'Unauthorized - User ID missing after auth' }, { status: 401 });
  }

  try {
    const { userInput, userId, conversationId: currentConversationIdFromRequest } = await request.json();
    
    if (!userInput || !userId) return NextResponse.json({ error: "Missing userInput or userId." }, { status: 400 });

    if (userId !== sessionUserId && sessionUserRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: You can only interact with the assistant as yourself.' }, { status: 403 });
    }
    
    const effectiveUserId = sessionUserRole === 'admin' && userId !== sessionUserId ? userId : sessionUserId;

    const assistantConfig = await withTimeout(
      loadAssistantConfigFromFirestore(effectiveUserId),
      5000,
      "loadAssistantConfigFromFirestore"
    );
    perfMonitor.checkpoint("Config loaded");
    
    if (!assistantConfig?.behavioralRules || !assistantConfig.textModelInfo || !assistantConfig.tools) {
      return NextResponse.json({ error: "AI Assistant config incomplete." }, { status: 503 });
    }
    const { textModelInfo, behavioralRules, tools } = assistantConfig;
    
    const adminDb = admin.firestore();
    const adminRtdb = getDatabase();

    let piiConsentGiven = false;
    let latestOrderId: string | undefined = undefined;
    let restaurantIdForEscalation: string | null = null;
    
    const userDocRef = adminDb.collection("users").doc(effectiveUserId);
    const userDocSnap = await userDocRef.get();
    if (userDocSnap.exists) {
      const userProfileData = userDocSnap.data();
      if (userProfileData) {
        piiConsentGiven = userProfileData.piiConsentGiven === true;
        latestOrderId = userProfileData.latestOrderId;
      }
    }

    if (latestOrderId && piiConsentGiven) {
      const orderDocRef = adminDb.collection("orders").doc(latestOrderId);
      const orderDocSnap = await orderDocRef.get();
      if (orderDocSnap.exists) {
        restaurantIdForEscalation = orderDocSnap.data()?.restaurantId || null;
      }
    }

    let actualConversationDocId: string = '';
    let conversationData: Conversation | null = null;
    let isNewConversation = false;

    if (currentConversationIdFromRequest && currentConversationIdFromRequest !== "PENDING_NEW_CONVERSATION") {
        const convRef = adminDb.collection("conversations").doc(currentConversationIdFromRequest);
        const convSnap = await convRef.get();
        if (convSnap.exists && convSnap.data()?.userId === effectiveUserId) {
            actualConversationDocId = currentConversationIdFromRequest;
            conversationData = { id: convSnap.id, ...convSnap.data() } as Conversation;
        }
    }

    if (!conversationData) {
        isNewConversation = true;
        actualConversationDocId = adminDb.collection("conversations").doc().id;
        const conversationRef = adminDb.collection("conversations").doc(actualConversationDocId);
        conversationData = {
            id: actualConversationDocId,
            userId: effectiveUserId,
            conversationId: actualConversationDocId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            status: "active",
            currentFlowStep: FLOW_STEP.DISCOVER_CLARIFY,
            pendingToolCallInfo: null,
        };
        await conversationRef.set(conversationData);
    }

    let currentFlowStep = conversationData.currentFlowStep || FLOW_STEP.DISCOVER_CLARIFY;

    const messagesRef = adminDb.collection("conversations").doc(actualConversationDocId).collection("messages").orderBy("timestamp", "desc").limit(5);
    const messagesSnap = await messagesRef.get();
    const pastMessages: StoredMessage[] = messagesSnap.docs.map(doc => doc.data() as StoredMessage).reverse();

    const userMessageDataForStore: StoredMessage = {
        content: userInput,
        sender: "user",
        timestamp: FieldValue.serverTimestamp(),
        flowStep: currentFlowStep
    };
    const userMessageRef = await adminDb.collection("conversations").doc(actualConversationDocId).collection("messages").add(userMessageDataForStore);

    const currentHistoryForAI: ModelHistoryPart[] = [
        ...pastMessages.map(msg => ({
            role: (msg.sender === "assistant" ? "model" : "user") as "user" | "model",
            parts: [{ text: msg.content }]
        })),
        { role: "user" as "user", parts: [{ text: userInput }] }
    ];

    let finalAssistantResponseContent = "";
    let finalSummaryForStorage: string | undefined = undefined;
    let effectiveNextFlowStep = currentFlowStep;
    let intentClassification = conversationData.lastIntentClassification || "N/A";
    let assistantStateIndicator: 'processing_complete' | 'gathering_parameters' | 'error' = 'processing_complete';
    
    let aiResponse: { 
        responseContent: string; 
        toolCall?: { tool: AssistantTool; parametersJson: string };
        startParameterCollection?: { tool: AssistantTool; missingParameters: string[] };
    } | null = null;

    if (currentFlowStep === FLOW_STEP.AWAITING_TOOL_PARAMETERS && conversationData.pendingToolCallInfo) {
        // Simplified parameter collection logic for brevity
        finalAssistantResponseContent = "Parameter collection logic would go here.";
        effectiveNextFlowStep = FLOW_STEP.AWAITING_ANYTHING_ELSE;
    } else {
        const classificationResult = await withTimeout(
          getAIIntentAndFlowStep(userInput, currentHistoryForAI, conversationData, behavioralRules, tools, textModelInfo),
          25000,
          "getAIIntentAndFlowStep"
        );
        perfMonitor.checkpoint("Intent classification completed");
        intentClassification = classificationResult.intentClassification;
        effectiveNextFlowStep = classificationResult.nextFlowStep;

        await userMessageRef.update({ classification: intentClassification });
        
        aiResponse = await withTimeout(
          getAIResponse(
              userInput, currentHistoryForAI, intentClassification, currentFlowStep,
              behavioralRules, tools, textModelInfo, piiConsentGiven,
              effectiveUserId, latestOrderId, assistantConfig, actualConversationDocId, restaurantIdForEscalation
          ),
          12000,
          "getAIResponse"
        );
        perfMonitor.checkpoint("AI response generated");
    }
    
    if (aiResponse?.startParameterCollection) {
        // Simplified start parameter collection logic
        finalAssistantResponseContent = "Starting parameter collection.";
        effectiveNextFlowStep = FLOW_STEP.AWAITING_TOOL_PARAMETERS;
        assistantStateIndicator = 'gathering_parameters';
    } else if (aiResponse?.toolCall) {
        // Simplified tool call logic
        finalAssistantResponseContent = `Executing tool: ${aiResponse.toolCall.tool.name}`;
        effectiveNextFlowStep = FLOW_STEP.AWAITING_ANYTHING_ELSE;
    } else if (aiResponse?.responseContent) {
        finalAssistantResponseContent = aiResponse.responseContent;
    } else {
        finalAssistantResponseContent = behavioralRules.defaultFallback || "You are Graviton a helpful AI assistant.";
        assistantStateIndicator = 'error';
        effectiveNextFlowStep = FLOW_STEP.AWAITING_ANYTHING_ELSE;
    }

    if (effectiveNextFlowStep === FLOW_STEP.COMPLETE_CALL) {
        const historyForSummary = [...currentHistoryForAI, { role: "model" as "model", parts: [{ text: finalAssistantResponseContent }] }];
        const historyString = historyForSummary.map(h => `${h.role}: ${h.parts[0].text}`).join('\n');
        finalSummaryForStorage = await promptService.getFinalSummaryPrompt(historyString);
    }

    const speechContent = await formatTextForSpeech(finalAssistantResponseContent, OPENAI_API_KEY, assistantConfig);

    const assistantMessageData: StoredMessage = {
        content: finalAssistantResponseContent,
        sender: "assistant",
        timestamp: FieldValue.serverTimestamp(),
        classification: intentClassification, 
        flowStep: effectiveNextFlowStep,
    };
    await adminDb.collection("conversations").doc(actualConversationDocId).collection("messages").add(assistantMessageData);

    const updateData: Partial<Conversation> = {
        updatedAt: FieldValue.serverTimestamp(),
        lastMessageSnippet: speechContent.substring(0, 100),
        currentFlowStep: effectiveNextFlowStep,
        lastIntentClassification: intentClassification, 
        pendingToolCallInfo: conversationData.pendingToolCallInfo, 
    };
    
    if (effectiveNextFlowStep === FLOW_STEP.COMPLETE_CALL) {
        updateData.status = "completed";
        updateData.finalSummary = finalSummaryForStorage;
    }

    await adminDb.collection("conversations").doc(actualConversationDocId).update(updateData);

    perfMonitor.finish();
    
    return NextResponse.json({
        content: finalAssistantResponseContent,
        speechContent: speechContent,
        classification: intentClassification,
        flowStep: effectiveNextFlowStep,
        sender: "assistant",
        conversationId: actualConversationDocId,
        assistantStateIndicator: assistantStateIndicator,
    });

  } catch (error) {
    debugLogger.error("Error in /api/assistant POST handler:", { component: "POSTHandler", error });
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Error processing AI request: ${errorMessage}`, classification: "system_error", assistantStateIndicator: 'error' },
      { status: 500 }
    );
  }
}