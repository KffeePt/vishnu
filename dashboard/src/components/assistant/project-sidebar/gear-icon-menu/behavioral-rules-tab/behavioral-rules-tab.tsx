"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch"; // Added Switch
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Search, PlusCircle } from "lucide-react"; // Added Search and PlusCircle icon
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssistantConfigData, AssistantBehavioralRules, AssistantRuleItem, CustomContextVariable } from "@/components/assistant/assistant-types";
import { useState, useMemo, useEffect } from "react";
import ProblemResolutionGraph from "./problem-resolution-graph";
import { v4 as uuidv4 } from 'uuid';

interface BehavioralRulesTabProps {
  assistantConfigData: AssistantConfigData; // Contains assistantConfigData.tools
  setAssistantConfigData: React.Dispatch<React.SetStateAction<AssistantConfigData | null>>;
  handleBehavioralRuleChange: (field: keyof AssistantBehavioralRules, value: any) => void;
  handleProblemClassificationChange: (index: number, field: string | number | symbol, value: any) => void;
  addProblemClassificationItem: () => void;
  removeProblemClassificationItem: (index: number) => void;
  // handleSolutionSuggestionChange: (classification: string, value: string) => void;
}

const flowSteps = [
  "OPEN",
  "DISCOVER_CLARIFY",
  "ASSURANCE_EMPATHY",
  "RESOLVE_PRESENT",
  "ESCALATION_PROPOSED",
  "AWAITING_ANYTHING_ELSE",
  "RECAP_THANK",
  "COMPLETE_CALL", // Added new flow step
] as const; // Make it a const assertion for stricter typing if used directly

type FlowStep = typeof flowSteps[number]; // Create a type from the array values

export default function BehavioralRulesTab({
  assistantConfigData,
  setAssistantConfigData,
  handleBehavioralRuleChange,
  handleProblemClassificationChange,
  addProblemClassificationItem,
  removeProblemClassificationItem,
}: BehavioralRulesTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [customFlowInput, setCustomFlowInput] = useState<string>(""); // Initialize empty, will be set by useEffect

  // --- Environment Variables Handlers ---
  const handleAddEnvironmentVariable = () => {
    const newVariable: CustomContextVariable = {
      id: uuidv4(),
      name: "",
      value: "",
      description: "",
      isSystemVariable: false,
      isNameEditable: true,
    };
    setAssistantConfigData(prev => {
      if (!prev) return null;
      const updatedVariables = [...(prev.environmentVariables || []), newVariable];
      return {
        ...prev,
        environmentVariables: updatedVariables
      };
    });
  };

  const handleEnvironmentVariableChange = (index: number, field: keyof CustomContextVariable, value: string) => {
    setAssistantConfigData(prev => {
      if (!prev || !prev.environmentVariables) return prev;
      
      const updatedVariables = prev.environmentVariables.map((variable: CustomContextVariable, i: number) => {
        if (i === index) {
          return { ...variable, [field]: value };
        }
        return variable;
      });

      return {
        ...prev,
        environmentVariables: updatedVariables
      };
    });
  };

  const handleRemoveEnvironmentVariable = (id: string) => {
    setAssistantConfigData(prev => {
      if (!prev || !prev.environmentVariables) return prev;

      const updatedVariables = prev.environmentVariables.filter((variable: CustomContextVariable) => variable.id !== id);

      return {
        ...prev,
        environmentVariables: updatedVariables
      };
    });
  };
  // --- End Environment Variables Handlers ---

  const problemClassificationData = useMemo(() => {
    return assistantConfigData?.behavioralRules?.problemClassification || [];
  }, [assistantConfigData?.behavioralRules?.problemClassification]);

  const filteredClassifications = useMemo(() => {
    if (!searchTerm) {
      return problemClassificationData;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return problemClassificationData.filter((item: AssistantRuleItem) => {
      const classificationMatch = item.classification?.toLowerCase().includes(lowerSearchTerm);
      const descriptionMatch = item.description?.toLowerCase().includes(lowerSearchTerm);
      const userMentionsMatch = (item.userMentions || []).some((mention: string) => mention.toLowerCase().includes(lowerSearchTerm));
      
      const clarifyingQuestionsMatch = (item.clarifyingQuestionSteps || []).some((step: { value: string }) => step.value.toLowerCase().includes(lowerSearchTerm));
      const suggestedResponsesMatch = (item.suggestedResponseSteps || []).some((step: { value: string }) => step.value.toLowerCase().includes(lowerSearchTerm));
      // We don't typically search by tool ID directly in the filter, but if needed, it could be added:
      // const toolMatch = item.associatedToolAction?.value.toLowerCase().includes(lowerSearchTerm);

      return classificationMatch || descriptionMatch || userMentionsMatch || clarifyingQuestionsMatch || suggestedResponsesMatch;
    });
  }, [searchTerm, problemClassificationData]);
  
  // Effect to update local customFlowInput if the prop changes from parent (e.g., on load or external update)
  // Also handles initial setting of customFlowInput
  useEffect(() => {
    if (assistantConfigData?.behavioralRules) {
      setCustomFlowInput((assistantConfigData.behavioralRules.conversationFlow || flowSteps).join("\n"));
    } else {
      setCustomFlowInput(flowSteps.join("\n")); // Default if no config
    }
  }, [assistantConfigData?.behavioralRules]);

  if (!assistantConfigData || !assistantConfigData.behavioralRules) return null;

  const { behavioralRules } = assistantConfigData;

  const handleCustomFlowChange = () => {
    const newFlowArray = customFlowInput
      .split("\n")
      .map(step => step.trim())
      .filter(step => flowSteps.includes(step as FlowStep)); // Validate against known steps
    
    // Only update if the new flow is valid and different, or if clearing a custom flow
    if (newFlowArray.length > 0) {
      handleBehavioralRuleChange('conversationFlow', newFlowArray);
    } else if (customFlowInput.trim() === "" && behavioralRules.conversationFlow) {
      // If textarea is cleared and there was a custom flow, reset to default by passing undefined or an empty array
      handleBehavioralRuleChange('conversationFlow', undefined); // Or [] depending on how you want to signify default
    }
  };

  return (
    <Accordion type="multiple" className="w-full lg:w-3/4 mx-auto space-y-4" defaultValue={[]}>
      <AccordionItem value="initial-system-prompt">
        <AccordionTrigger className="text-base font-medium">Initial System Prompt</AccordionTrigger>
        <AccordionContent>
          <div className="pt-2 space-y-2">
            <Label htmlFor="initialSystemPrompt">
              Define the base behavior and context for the assistant.
            </Label>
            <Textarea
              id="initialSystemPrompt"
              value={behavioralRules.initialSystemPrompt || ""}
              onChange={(e) => handleBehavioralRuleChange('initialSystemPrompt', e.target.value)}
              placeholder="e.g., You are a friendly assistant for Triada Culinaria..."
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              You can use dynamic placeholders like: <code className="bg-muted px-1 rounded">{`{{USER_ID}}`}</code>, <code className="bg-muted px-1 rounded">{`{{LATEST_ORDER_ID}}`}</code>, and <code className="bg-muted px-1 rounded">{`{{CONVERSATION_ID}}`}</code>. These will be replaced with the actual values during the conversation if available and PII consent is granted.
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="overall-policy">
        <AccordionTrigger className="text-base font-medium">Overall Policy</AccordionTrigger>
        <AccordionContent>
          <div className="pt-2">
            <Label htmlFor="overallPolicy" className="sr-only">Overall Policy</Label>
            <Input
              id="overallPolicy"
              value={behavioralRules.overallPolicy}
              onChange={(e) => handleBehavioralRuleChange('overallPolicy', e.target.value)}
              placeholder="e.g., Do not assist with illegal tasks."
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="general-guidelines">
        <AccordionTrigger className="text-base font-medium">General Guidelines</AccordionTrigger>
        <AccordionContent>
          <div className="pt-2 space-y-2">
            {(behavioralRules.generalGuidelines || []).map((guideline: string, index: number) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  value={guideline}
                  onChange={(e) => {
                    const newGuidelines = [...(behavioralRules.generalGuidelines || [])];
                    newGuidelines[index] = e.target.value;
                    handleBehavioralRuleChange('generalGuidelines', newGuidelines);
                  }}
                  placeholder={`Guideline #${index + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newGuidelines = (behavioralRules.generalGuidelines || []).filter((_: string, i: number) => i !== index);
                    handleBehavioralRuleChange('generalGuidelines', newGuidelines);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newGuidelines = [...(behavioralRules.generalGuidelines || []), ""];
                handleBehavioralRuleChange('generalGuidelines', newGuidelines);
              }}
              className="mt-2"
            >
              Add Guideline
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="problem-classification">
        <AccordionTrigger className="text-base font-medium">Problem Classification and Responses</AccordionTrigger>
        <AccordionContent>
          <div className="pt-2 space-y-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search classifications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full mb-4"
              />
            </div>

            {filteredClassifications.length === 0 && searchTerm && (
              <p className="text-muted-foreground text-center">No classifications found matching {'"{searchTerm}"'}.</p>
            )}

            <Accordion type="multiple" className="w-full space-y-2">
              {filteredClassifications.map((item: AssistantRuleItem, index: number) => {
                // Find original index if filtering is active
                const originalIndex = (behavioralRules.problemClassification || []).findIndex((origItem: AssistantRuleItem) => origItem.classification === item.classification && JSON.stringify(origItem.userMentions) === JSON.stringify(item.userMentions));
                const itemKey = `classification-item-${originalIndex}`;
                
                return (
                  <AccordionItem value={itemKey} key={itemKey}>
                    <AccordionTrigger className="text-sm font-medium hover:no-underline bg-slate-50 dark:bg-slate-800 px-3 rounded-md">
                      <div className="flex justify-between items-center w-full">
                        <span className="flex-grow">{item.classification || `Classification #${originalIndex + 1}`}</span>
                        <Button asChild variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeProblemClassificationItem(originalIndex); }} className="hover:bg-destructive/20">
                          <span>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </span>
                        </Button>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-1">
                      <ProblemResolutionGraph
                        item={item}
                        originalIndex={originalIndex}
                        assistantConfigData={assistantConfigData}
                        handleProblemClassificationChange={handleProblemClassificationChange}
                        // handleNestedArrayChange, addNestedArrayElement, and removeNestedArrayElement are no longer needed
                        // as ProblemResolutionGraph now manages its internal state for the flow.
                      />
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
            <Button variant="outline" className="mt-3 w-full" onClick={addProblemClassificationItem}>Add New Problem Classification</Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="default-fallback">
        <AccordionTrigger className="text-base font-medium">Default Fallback</AccordionTrigger>
        <AccordionContent>
          <div className="pt-2 space-y-4">
            <div>
              <Label htmlFor="defaultFallback">Default Fallback Response</Label>
              <Input
                id="defaultFallback"
                value={behavioralRules.defaultFallback || ""}
                onChange={(e) => handleBehavioralRuleChange('defaultFallback', e.target.value)}
                placeholder="e.g., I'm not sure how to help with that."
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="defaultFallbackMaxTries">Maximum Fallback Attempts</Label>
              <Input
                id="defaultFallbackMaxTries"
                type="number"
                min="1"
                value={behavioralRules.defaultFallbackMaxTries || 1}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = parseInt(value, 10);
                  handleBehavioralRuleChange('defaultFallbackMaxTries', value === '' ? undefined : (isNaN(numValue) ? undefined : Math.max(1, numValue)));
                }}
                placeholder="e.g., 3"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Define how many times (minimum 1) the assistant can use the default fallback before using the exceeded attempts message.
              </p>
            </div>

            <div>
              <Label htmlFor="defaultFallbackExceededMessage">Fallback Attempts Exceeded Message</Label>
              <Textarea
                id="defaultFallbackExceededMessage"
                value={behavioralRules.defaultFallbackExceededMessage || ""}
                onChange={(e) => handleBehavioralRuleChange('defaultFallbackExceededMessage', e.target.value)}
                placeholder="e.g., It seems I'm still not understanding. Please contact support or try rephrasing your question."
                rows={3}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This message will be used if the assistant reaches the maximum number of fallback attempts.
              </p>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="response-preferences">
        <AccordionTrigger className="text-base font-medium">Response Preferences</AccordionTrigger>
        <AccordionContent>
          <div className="pt-2 space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="forbidEmojiInResponses"
                checked={behavioralRules.forbidEmojiInResponses === true}
                onCheckedChange={(checked) => handleBehavioralRuleChange('forbidEmojiInResponses', checked)}
              />
              <Label htmlFor="forbidEmojiInResponses" className="cursor-pointer">
                Forbid the use of emojis in assistant responses
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              If enabled, the assistant will be instructed not to use emojis and attempts will be made to remove them from its responses.
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="conversation-flow-config">
        <AccordionTrigger className="text-base font-medium">Conversation Flow Configuration</AccordionTrigger>
        <AccordionContent>
          <div className="pt-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Define the order of the conversation flow steps. The default order is: {flowSteps.join(" -> ")}.
              If you customize the flow, make sure to include all necessary steps in a logical order.
            </p>
            <div>
              <Label htmlFor="customConversationFlow">Custom Step Order (one per line):</Label>
              <Textarea
                id="customConversationFlow"
                value={customFlowInput}
                onChange={(e) => setCustomFlowInput(e.target.value)}
                onBlur={handleCustomFlowChange}
                placeholder={flowSteps.join("\n")}
                rows={flowSteps.length + 2}
                className="mt-1 font-mono text-sm"
              />
               <Button onClick={handleCustomFlowChange} size="sm" className="mt-2">
                Apply Custom Order
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 ml-2"
                onClick={() => {
                  setCustomFlowInput(flowSteps.join("\n"));
                  handleBehavioralRuleChange('conversationFlow', undefined);
                }}
              >
                Restore Default Flow
              </Button>
            </div>
            <div className="mt-2">
              <h5 className="text-sm font-semibold mb-1">Current Configured Flow:</h5>
              <ol className="list-decimal list-inside text-sm space-y-1 p-2 bg-slate-50 dark:bg-slate-800 rounded-md">
                {(behavioralRules.conversationFlow ? behavioralRules.conversationFlow as FlowStep[] : flowSteps).map((step: FlowStep, index: number) => (
                  <li key={index} className="font-mono">{step}</li>
                ))}
              </ol>
            </div>
             <p className="text-xs text-muted-foreground mt-1">
                Note: The assistant's internal logic may have fixed transitions between certain steps (e.g., after a tool). This configuration mainly affects the general sequence and the AI's decisions on the next step when there is flexibility.
              </p>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="environment-variables">
        <AccordionTrigger className="text-base font-medium">Global Environment Variables</AccordionTrigger>
        <AccordionContent>
          <Card className="p-4 mt-2 border-l-4 border-teal-500">
            <p className="text-sm text-muted-foreground mb-3">
              Define global variables (e.g., <code className="bg-muted px-1 rounded">{`{{API_ENDPOINT}}`}</code>, <code className="bg-muted px-1 rounded">{`{{DEFAULT_COUNTRY_CODE}}`}</code>) that can be used in prompts or tool values across the assistant's configuration.
            </p>
            {(assistantConfigData.environmentVariables || []).length === 0 && (
              <p className="text-sm text-muted-foreground">No global environment variables defined.</p>
            )}
            <div className="space-y-3">
              {(assistantConfigData.environmentVariables || []).map((variable: CustomContextVariable, index: number) => (
                <Card key={variable.id} className="p-3 space-y-2 bg-background hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-semibold">
                      Variable #{index + 1} {variable.isSystemVariable && <span className="text-xs text-blue-600 dark:text-blue-400">(System)</span>}
                    </p>
                    {!variable.isSystemVariable && (
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveEnvironmentVariable(variable.id)} className="text-red-500 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div>
                    <Label htmlFor={`envVarName-${index}`} className="text-xs">Variable Name (e.g., <code className="bg-muted px-1 rounded">{`{{MY_VARIABLE}}`}</code>)</Label>
                    <Input
                      id={`envVarName-${index}`}
                      value={variable.name}
                      onChange={(e) => handleEnvironmentVariableChange(index, 'name', e.target.value)}
                      placeholder="e.g., API_ENDPOINT or {{DEFAULT_LOCALE}}"
                      className="mt-1 text-sm"
                      readOnly={variable.isSystemVariable || variable.isNameEditable === false}
                      disabled={variable.isSystemVariable || variable.isNameEditable === false}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use the <code className="bg-muted px-1 rounded">{`{{VARIABLE_NAME}}`}</code> format for automatic replacement in prompts, or a simple name for internal/tool reference.
                      {variable.isSystemVariable && " System variable names are not editable."}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor={`envVarValue-${index}`} className="text-xs">Variable Value</Label>
                    <Input
                      id={`envVarValue-${index}`}
                      value={variable.isSystemVariable ? "[Dynamic system value]" : variable.value}
                      onChange={(e) => handleEnvironmentVariableChange(index, 'value', e.target.value)}
                      placeholder={variable.isSystemVariable ? "[Dynamic system value]" : "Value of the variable"}
                      className="mt-1 text-sm"
                      readOnly={variable.isSystemVariable}
                      disabled={variable.isSystemVariable}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`envVarDesc-${index}`} className="text-xs">Description (Optional)</Label>
                    <Textarea
                      id={`envVarDesc-${index}`}
                      value={variable.description || ""}
                      onChange={(e) => handleEnvironmentVariableChange(index, 'description', e.target.value)}
                      placeholder="What this variable is used for globally"
                      rows={2}
                      className="mt-1 text-sm"
                    />
                  </div>
                </Card>
              ))}
            </div>
            <Button variant="outline" className="mt-4 w-full flex items-center justify-center gap-2" onClick={handleAddEnvironmentVariable}>
              <PlusCircle className="h-4 w-4" /> Add Global Environment Variable
            </Button>
          </Card>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
