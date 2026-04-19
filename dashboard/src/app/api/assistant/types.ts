import { FieldValue } from 'firebase-admin/firestore';
import { Part } from "@google/generative-ai";

export const FLOW_STEP = {
  OPEN: "OPEN",
  DISCOVER_CLARIFY: "DISCOVER_CLARIFY",
  ASSURANCE_EMPATHY: "ASSURANCE_EMPATHY",
  RESOLVE_PRESENT: "RESOLVE_PRESENT",
  ESCALATION_PROPOSED: "ESCALATION_PROPOSED",
  AWAITING_TOOL_PARAMETERS: "AWAITING_TOOL_PARAMETERS",
  AWAITING_ANYTHING_ELSE: "AWAITING_ANYTHING_ELSE",
  RECAP_THANK: "RECAP_THANK",
  COMPLETE_CALL: "COMPLETE_AL"
};

export interface PendingToolCallInfo {
  toolId: string;
  toolName: string;
  targetParametersSchema: Array<{ name: string; description: string; type: string; required?: boolean }>;
  collectedParameters: Record<string, any>;
  requestedParameterName?: string;
  missingParametersList?: string[];
}

export interface StoredMessage {
  id?: string;
  content: string;
  sender: "user" | "assistant";
  timestamp: FieldValue | Date;
  classification?: string;
  flowStep?: string;
}

export interface Conversation {
  id?: string;
  userId: string;
  conversationId: string;
  createdAt: FieldValue | Date;
  updatedAt: FieldValue | Date;
  status: "active" | "completed" | "summarized";
  lastMessageSnippet?: string;
  summary?: string;
  concern?: string;
  actionsTaken?: string;
  currentFlowStep: string;
  lastIntentClassification?: string;
  currentOrderId?: string;
  conversationNumber?: number;
  finalSummary?: string;
  pendingToolCallInfo?: PendingToolCallInfo | null;
  imageJustUploaded?: boolean;
}

export type ModelHistoryPart = { role: "user" | "model"; parts: Part[] };

export interface ClassificationResult {
  intentClassification: string;
  nextFlowStep: string;
  confidence?: number;
}