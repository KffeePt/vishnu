import { pomlService } from './poml-service';
import { AssistantTool, AssistantBehavioralRules } from '@/components/assistant/assistant-types';
import { Conversation } from '@/app/api/assistant/types';

class PromptService {
  getSpeechFormattingPrompt(): string {
    return pomlService.getPrompt('speech-formatting', 'speech_formatting') || '';
  }

  getToolParamExtractionPrompt(
    tool: AssistantTool,
    baseSystemPrompt: string,
    piiConsentGiven: boolean,
    latestOrderId?: string,
    userInput?: string
  ): string {
    const parameterSchema = tool.parameters?.map(p => ({
      name: p.name,
      type: p.type,
      description: p.description,
      required: p.required || false,
    })) || [];

    let prompt = pomlService.getPrompt('tool-param-extraction', 'tool_param_extraction', {
      'tool.name': tool.name,
      'tool.description': tool.description || 'No se proporcionó descripción.',
      'parameterSchema': JSON.stringify(parameterSchema, null, 2)
    }) || '';

    const orderIdParamName = tool.parameters?.find(p => p.name.toLowerCase() === 'order_id' || p.name.toLowerCase() === 'orderid')?.name;

    if (piiConsentGiven && latestOrderId && orderIdParamName && tool.name.toLowerCase().includes("order") && tool.name.toLowerCase().includes("status")) {
      prompt += pomlService.getPrompt('tool-param-extraction', 'critical_order_context', {
        'tool.name': tool.name,
        'latestOrderId': latestOrderId,
        'orderIdParamName': orderIdParamName,
        'userInput': userInput
      });
    } else if (piiConsentGiven && latestOrderId && orderIdParamName) {
      prompt += pomlService.getPrompt('tool-param-extraction', 'additional_order_context', {
        'latestOrderId': latestOrderId,
        'tool.name': tool.name,
        'orderIdParamName': orderIdParamName
      });
    }

    prompt += pomlService.getPrompt('tool-param-extraction', 'detailed_instructions');
    
    return `${baseSystemPrompt}\n${prompt}`;
  }

  getIntentAndFlowPrompt(
    conversationData: Conversation,
    detailedHistory: string,
    userInput: string,
    allIntentNames: string[],
    allFlowSteps: string[]
  ): string {
    return pomlService.getPrompt('intent-and-flow', 'intent_and_flow', {
      'conversationId': conversationData.id || 'N/A',
      'userId': conversationData.userId,
      'currentFlowStep': conversationData.currentFlowStep,
      'lastIntentClassification': conversationData.lastIntentClassification || 'N/A',
      'currentOrderId': conversationData.currentOrderId || 'N/A',
      'detailedHistory': detailedHistory,
      'userInput': userInput,
      'allIntentNames': allIntentNames.join(", "),
      'allFlowSteps': allFlowSteps.join(", ")
    }) || '';
  }
  
  getAIResponsePrompt(
    baseSystemPrompt: string,
    piiConsentGiven: boolean,
    behavioralRules: AssistantBehavioralRules,
    currentFlowStep: string,
    intentClassification: string,
    clarifyingQuestions: string,
    suggestedResponses: string,
    toolInfo: string,
    userInput: string,
    responseGuides: string
  ): string {
    const piiPolicy = piiConsentGiven
      ? pomlService.getPrompt('ai-response', 'pii_allowed')
      : pomlService.getPrompt('ai-response', 'pii_denied');
      
    const emojiPolicy = behavioralRules.forbidEmojiInResponses
      ? pomlService.getPrompt('ai-response', 'emoji_forbidden')
      : pomlService.getPrompt('ai-response', 'emoji_allowed');

    let base = pomlService.getPrompt('ai-response', 'ai_response_base', {
      'piiConsent': piiConsentGiven ? 'CONCEDIDO' : 'DENEGADO',
      'piiPolicy': piiPolicy,
      'overallPolicy': behavioralRules.overallPolicy || 'Sé útil y respetuoso.',
      'generalGuidelines': behavioralRules.generalGuidelines?.join("\n- ") || 'Sé cortés. Si no estás seguro, pide una aclaración.',
      'emojiPolicy': emojiPolicy,
      'currentFlowStep': currentFlowStep
    }) || '';

    const flowStepKey = `flow_step_${currentFlowStep.toLowerCase()}`;
    const flowStepInstruction = pomlService.getPrompt('ai-response', flowStepKey, {
        'intentClassification': intentClassification,
        'clarifyingQuestions': clarifyingQuestions,
        'suggestedResponses': suggestedResponses,
        'toolInfo': toolInfo,
        'userInput': userInput,
        'responseGuides': responseGuides,
        'currentFlowStep': currentFlowStep
    }) || pomlService.getPrompt('ai-response', 'flow_step_default', {
        'currentFlowStep': currentFlowStep,
        'intentClassification': intentClassification
    });

    base += flowStepInstruction;

    return `${baseSystemPrompt}\n${base}`;
  }

  getCriticalOrderStatusPrompt(intentClassification: string, toolName: string, latestOrderId: string): string {
    return pomlService.getPrompt('ai-response', 'critical_order_status', {
      'intentClassification': intentClassification,
      'tool.name': toolName,
      'latestOrderId': latestOrderId
    }) || '';
  }

  getEscalationSummaryPrompt(
    targetField: string,
    instruction: string,
    history: string,
    userInput: string
  ): string {
    const promptKey = targetField as 'request_reason' | 'conversation_summary';
    const promptTemplate = pomlService.getPrompt('escalation-summary', promptKey, {
      'history': history,
      'userInput': userInput
    }) || pomlService.getPrompt('escalation-summary', 'escalation_summary_base', {
      'targetField': targetField,
      'instruction': instruction,
      'history': history,
      'userInput': userInput
    });

    return promptTemplate || '';
  }
  
  getParameterCollectionPrompt(
    type: 'askNext' | 'askFirst' | 'askNextAfterImage',
    toolName: string,
    paramDesc: string,
    previousParam?: string,
    toolContext?: string
  ): string {
      const blockName = type === 'askNext' ? 'ask_next' : type === 'askFirst' ? 'ask_first' : 'ask_next_after_image';
      return pomlService.getPrompt('parameter-collection', blockName, {
          'toolName': toolName,
          'paramDesc': paramDesc,
          'previousParam': previousParam || 'la información anterior',
          'toolContext': toolContext || 'eso'
      }) || '';
  }

  getFinalResponsePrompt(
      type: 'afterTool' | 'afterSuccessfulEscalation' | 'afterFailedEscalation',
      toolResult: string
  ): string {
      const blockName = type === 'afterTool' ? 'after_tool' : type === 'afterSuccessfulEscalation' ? 'after_successful_escalation' : 'after_failed_escalation';
      return pomlService.getPrompt('final-response', blockName, {
          'toolResult': toolResult
      }) || '';
  }

  getFinalSummaryPrompt(history: string): string {
      return pomlService.getPrompt('final-summary', 'final_summary', {
          'history': history
      }) || '';
  }
}

export const promptService = new PromptService();