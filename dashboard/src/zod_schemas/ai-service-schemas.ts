import { z } from 'zod';
import { FLOW_STEP } from '@/app/api/assistant/types';

export const ModelHistoryPartSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(z.object({
    text: z.string(),
  })),
});

export const AssistantToolParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
  required: z.boolean(),
});

export const AssistantToolSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  parameters: z.array(AssistantToolParameterSchema),
  backendFunctionName: z.string().optional(),
});

export const AssistantBehavioralRuleSchema = z.object({
  classification: z.string(),
  clarifyingQuestionSteps: z.array(z.object({ value: z.string() })),
  suggestedResponseSteps: z.array(z.object({ value: z.string() })),
  associatedToolAction: z.object({ value: z.string() }).optional(),
});

export const AssistantBehavioralRulesSchema = z.object({
  initialSystemPrompt: z.string(),
  problemClassification: z.array(AssistantBehavioralRuleSchema),
  defaultFallback: z.string(),
});

export const AssistantConfigDataSchema = z.object({
  assistantName: z.string(),
  assistantId: z.string(),
  docId: z.string(),
  tools: z.array(AssistantToolSchema),
  behavioralRules: AssistantBehavioralRulesSchema,
  textModelInfo: z.object({
    provider: z.string(),
    id: z.string(),
  }),
  environmentVariables: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional(),
});

export const ConversationSchema = z.object({
  currentFlowStep: z.nativeEnum(FLOW_STEP),
  lastIntentClassification: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  currentOrderId: z.string().optional(),
});

export const ClassificationResultSchema = z.object({
  intentClassification: z.string(),
  nextFlowStep: z.nativeEnum(FLOW_STEP),
});