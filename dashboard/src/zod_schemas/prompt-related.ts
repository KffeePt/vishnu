import { z } from 'zod';

// Generic POML Block Schema
export const PomlBlockSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  variables: z.array(z.string()).optional(),
  template: z.string().optional(),
});

// Speech Formatting
export const SpeechFormattingPromptSchema = PomlBlockSchema.extend({
  name: z.literal('speech_formatting'),
});

// Tool Parameter Extraction
export const ToolParamExtractionPromptSchema = PomlBlockSchema.extend({
  name: z.literal('tool_param_extraction'),
  variables: z.array(z.enum(['tool.name', 'tool.description', 'parameterSchema'])).optional(),
});

export const CriticalOrderContextPromptSchema = PomlBlockSchema.extend({
  name: z.literal('critical_order_context'),
  variables: z.array(z.enum(['tool.name', 'latestOrderId', 'orderIdParamName', 'userInput'])).optional(),
});

export const AdditionalOrderContextPromptSchema = PomlBlockSchema.extend({
  name: z.literal('additional_order_context'),
  variables: z.array(z.enum(['latestOrderId', 'tool.name', 'orderIdParamName'])).optional(),
});

// Intent and Flow
export const IntentAndFlowPromptSchema = PomlBlockSchema.extend({
  name: z.literal('intent_and_flow'),
  variables: z.array(z.enum([
    'conversationId', 'userId', 'currentFlowStep', 'lastIntentClassification', 
    'currentOrderId', 'detailedHistory', 'userInput', 'allIntentNames', 'allFlowSteps'
  ])).optional(),
});

// AI Response
export const AiResponseBasePromptSchema = PomlBlockSchema.extend({
  name: z.literal('ai_response_base'),
  variables: z.array(z.enum([
    'piiConsent', 'piiPolicy', 'overallPolicy', 'generalGuidelines', 'emojiPolicy', 'currentFlowStep'
  ])).optional(),
});

export const FlowStepDiscoverClarifyPromptSchema = PomlBlockSchema.extend({
  name: z.literal('flow_step_discover_clarify'),
  variables: z.array(z.enum(['intentClassification', 'clarifyingQuestions'])).optional(),
});

export const FlowStepAssuranceEmpathyPromptSchema = PomlBlockSchema.extend({
  name: z.literal('flow_step_assurance_empathy'),
  variables: z.array(z.enum(['intentClassification'])).optional(),
});

export const FlowStepResolvePresentPromptSchema = PomlBlockSchema.extend({
  name: z.literal('flow_step_resolve_present'),
  variables: z.array(z.enum([
    'intentClassification', 'suggestedResponses', 'toolInfo', 'userInput', 'responseGuides'
  ])).optional(),
});

export const FlowStepRecapThankPromptSchema = PomlBlockSchema.extend({
    name: z.literal('flow_step_recap_thank'),
    variables: z.array(z.enum(['userInput'])).optional(),
});

export const FlowStepDefaultPromptSchema = PomlBlockSchema.extend({
    name: z.literal('flow_step_default'),
    variables: z.array(z.enum(['currentFlowStep', 'intentClassification'])).optional(),
});

export const CriticalOrderStatusPromptSchema = PomlBlockSchema.extend({
    name: z.literal('critical_order_status'),
    variables: z.array(z.enum(['intentClassification', 'tool.name', 'latestOrderId'])).optional(),
});

// Escalation Summary
export const EscalationSummaryBasePromptSchema = PomlBlockSchema.extend({
  name: z.literal('escalation_summary_base'),
  variables: z.array(z.enum(['targetField', 'instruction', 'history', 'userInput'])).optional(),
});

export const RequestReasonPromptSchema = PomlBlockSchema.extend({
    name: z.literal('request_reason'),
    variables: z.array(z.enum(['history', 'userInput'])).optional(),
});

export const ConversationSummaryPromptSchema = PomlBlockSchema.extend({
    name: z.literal('conversation_summary'),
    variables: z.array(z.enum(['history', 'userInput'])).optional(),
});

// Parameter Collection
export const AskNextPromptSchema = PomlBlockSchema.extend({
  name: z.literal('ask_next'),
  variables: z.array(z.enum(['toolName', 'previousParam', 'paramDesc'])).optional(),
});

export const AskFirstPromptSchema = PomlBlockSchema.extend({
  name: z.literal('ask_first'),
  variables: z.array(z.enum(['toolName', 'paramDesc', 'toolContext'])).optional(),
});

export const AskNextAfterImagePromptSchema = PomlBlockSchema.extend({
  name: z.literal('ask_next_after_image'),
  variables: z.array(z.enum(['toolName', 'paramDesc'])).optional(),
});

// Final Response
export const AfterToolPromptSchema = PomlBlockSchema.extend({
  name: z.literal('after_tool'),
  variables: z.array(z.enum(['toolResult'])).optional(),
});

export const AfterSuccessfulEscalationPromptSchema = PomlBlockSchema.extend({
  name: z.literal('after_successful_escalation'),
  variables: z.array(z.enum(['toolResult'])).optional(),
});

export const AfterFailedEscalationPromptSchema = PomlBlockSchema.extend({
  name: z.literal('after_failed_escalation'),
  variables: z.array(z.enum(['toolResult'])).optional(),
});

// Final Summary
export const FinalSummaryPromptSchema = PomlBlockSchema.extend({
  name: z.literal('final_summary'),
  variables: z.array(z.enum(['history'])).optional(),
});

export type PomlBlock = z.infer<typeof PomlBlockSchema> & { template: string };