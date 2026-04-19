import { Timestamp } from "firebase/firestore";

// Base interface for all tool parameters
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[]; // Optional: for string type to restrict values
}

// Base for all assistant tools
export interface AssistantToolBase {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  requiresPii: boolean;
  isEscalationTool?: boolean;
  parameters: ToolParameter[];
  associatedIntent?: string;
}

// Firestore Tool
export interface FirestoreAssistantTool extends AssistantToolBase {
  type: 'firestore';
  firestoreCollection: 'users' | 'orders' | 'restaurants' | 'other_collection';
  firestoreCustomCollectionName?: string;
  firestoreAction: 'query_by_field' | 'get_document_by_id' | 'update_document_field' | 'create_document' | 'create_escalation_record';
  firestoreIdentifyingParameter?: string;
  firestoreUseUserIdAsDocumentId?: boolean;
  firestoreQueryField?: string;
  firestoreExcludedFields?: string[];
  firestoreFieldToUpdatePath?: string;
  firestoreFieldValueParameter?: string;
  firestoreUpdateMode?: 'simple' | 'recover_and_map';
  firestoreFieldsToRecover?: string[];
  firestoreFieldMappings?: EscalationFieldMapping[];
  firestoreEscalationConfig?: FirestoreEscalationConfig;
}

// MCP Tool
export interface McpAssistantTool extends AssistantToolBase {
  type: 'mcp';
  mcpConfig: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers: Record<string, string>;
  };
}

// RTDB Tool
export interface RtdbAssistantTool extends AssistantToolBase {
  type: 'rtdb';
  rtdbPath: string;
  rtdbDynamicPathParameter?: string;
  rtdbExcludedFields?: string[];
}

// Component Use Tool
export interface ComponentUseAssistantTool extends AssistantToolBase {
  type: 'component_use_tool';
  componentName: string;
  componentDisplayConfig?: any[]; // Define more strictly if possible
}

// Union type for all possible assistant tools
export type AssistantTool = FirestoreAssistantTool | McpAssistantTool | RtdbAssistantTool | ComponentUseAssistantTool;

// For DisplayTool configuration
export interface DisplayToolConfigItem {
  id: string;
  label: string;
  aiResponsePath: string;
  displayType: 'text' | 'badge' | 'progress' | 'currency' | 'list' | 'key_value_pairs' | 'order_picker';
  isVisible: boolean;
  progressValuePath?: string;
  listItemsPath?: string;
  listItemNamePath?: string;
  listItemValuePath?: string;
  listItemSubTextPath?: string;
  keyValuePairsPath?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  trueConditionPath?: string;
  falseConditionPath?: string;
  userIdPath?: string;
}

export interface DisplayToolConfig {
  isEnabled: boolean;
  title: string;
  items: DisplayToolConfigItem[];
}

// For Behavioral Rules
export interface AssistantRuleItem {
  classification: string;
  userMentions: string[];
  clarifyingQuestionSteps: ActionStep[];
  suggestedResponseSteps: ActionStep[];
  associatedToolAction?: {
    value: string;
  };
  nextFlowStep?: string;
  currentFlowStepOverride?: string;
  nextFlowStepOverride?: string;
  shouldOverrideCurrentFlowStep?: boolean;
  shouldOverrideNextFlowStep?: boolean;
  description?: string;
}

export interface AssistantBehavioralRules {
  initialSystemPrompt: string;
  overallPolicy: string;
  generalGuidelines: string[];
  problemClassification: AssistantRuleItem[];
  solutionSuggestions: Record<string, string>;
  defaultFallback: string;
  defaultFallbackMaxTries: number;
  defaultFallbackExceededMessage: string;
  forbidEmojiInResponses: boolean;
  conversationFlow?: any; // Define more strictly if possible
}

// For General Assistant Settings
export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  capabilities?: string[];
}

export interface ElevenLabsConfig {
  voiceId?: string;
  modelId?: string;
}

export interface OpenAiTtsConfig {
  modelId?: string;
  voice?: string;
}

export type TextToSpeechProvider = 'web-speech-api' | 'elevenlabs' | 'openai' | null;
export type SpeechToTextProvider = 'platform' | 'elevenlabs';
export interface ElevenLabsSttConfig {
  modelId?: string;
}
export type ImageAnalysisProvider = 'platform' | 'openai' | 'google' | 'elevenlabs';
export interface ElevenLabsImageAnalysisConfig {
  modelId?: string;
}

export interface CustomContextVariable {
  id: string;
  name: string;
  value: string;
  description: string;
  isSystemVariable: boolean;
  isNameEditable: boolean;
}

export interface AssistantEscalation {
  id: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  userId: string;
  conversationId: string;
  summary: string;
  assignedTo?: string;
  orderId?: string;
  requestType?: string;
  requestReason?: string;
  restaurantId?: string;
  conversationSummary?: string;
}

export type ActionStepType = 'clarification' | 'response' | 'tool_action';

export interface ActionStep {
  id?: string;
  type: ActionStepType;
  value: string;
  associatedParameterName?: string;
}

export type FirestoreAction = 'query_by_field' | 'get_document_by_id' | 'update_document_field' | 'create_document' | 'create_escalation_record';

export type FirestoreCollection = 'users' | 'orders' | 'restaurants' | 'other_collection';

export interface EscalationFieldMapping {
  parameter: string;
  firestoreField: string;
  sourceType: 'parameter' | 'ai_summary' | 'static' | 'recovered';
  sourceValueOrName?: string;
  sourceName?: string;
  targetEscalationField?: string;
  targetPath?: string;
}

export interface DefaultEscalationValueItem {
  firestoreField: string;
  value: any;
  valueSource: 'static' | 'user_id' | 'timestamp';
}

export interface FirestoreEscalationConfig {
  escalationDocumentIdSource: 'user_id' | 'parameter';
  escalationIdentifyingParameter?: string;
  escalationFieldMappings: EscalationFieldMapping[];
  defaultEscalationValues: DefaultEscalationValueItem[];
}

// Main Assistant Configuration Data Structure
export interface AssistantMainSettings {
  textModelInfo: ModelInfo | null;
  sttModelInfo: ModelInfo | null;
  imageAnalysisProvider: ImageAnalysisProvider;
  imageAnalysisModelInfo: ModelInfo | null;
  elevenLabsImageAnalysisConfig?: ElevenLabsImageAnalysisConfig;
  textToSpeechProvider: TextToSpeechProvider;
  elevenLabsConfig?: ElevenLabsConfig;
  openAiTtsConfig?: OpenAiTtsConfig;
  speechToTextProvider: SpeechToTextProvider;
  elevenLabsSttConfig?: ElevenLabsSttConfig;
  customTextModels?: ModelInfo[];
  isPublic: boolean;
  unavailableMessage: string;
}

export interface AssistantConfigData extends AssistantMainSettings {
  tools: AssistantTool[];
  displayToolConfig: DisplayToolConfig;
  environmentVariables: CustomContextVariable[];
  behavioralRules: AssistantBehavioralRules;
  main?: any; // For legacy or other properties
  apiKeys?: { [key: string]: string };
}

// For conversation history
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Timestamp;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface UserSettings {
  activeProfile: string;
  profiles: {
    [key: string]: AssistantConfigData;
  };
}