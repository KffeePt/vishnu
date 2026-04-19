"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, PlusCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { AssistantRuleItem, AssistantConfigData, ActionStep, ActionStepType } from "@/components/assistant/assistant-types";
import { v4 as uuidv4 } from 'uuid';

// Define flow steps (for general flow overrides, not the action steps)
const generalFlowSteps = [
  "OPEN",
  "DISCOVER_CLARIFY",
  "ASSURANCE_EMPATHY",
  "RESOLVE_PRESENT",
  "ESCALATION_PROPOSED",
  "AWAITING_ANYTHING_ELSE",
  "RECAP_THANK",
  "COMPLETE_CALL",
] as const;

interface ProblemResolutionGraphProps {
  item: AssistantRuleItem;
  originalIndex: number;
  assistantConfigData: AssistantConfigData;
  handleProblemClassificationChange: (index: number, field: keyof AssistantRuleItem, value: any) => void;
}

export default function ProblemResolutionGraph({
  item,
  originalIndex,
  assistantConfigData,
  handleProblemClassificationChange,
}: ProblemResolutionGraphProps) {
  const clarifyingQuestionSteps = item.clarifyingQuestionSteps || [];
  const suggestedResponseSteps = item.suggestedResponseSteps || [];
  const associatedToolAction = item.associatedToolAction;

  // Generic handler for adding/removing/moving steps in an array
  const handleArrayStepChange = (
    field: 'clarifyingQuestionSteps' | 'suggestedResponseSteps',
    newSteps: ActionStep[]
  ) => {
    handleProblemClassificationChange(originalIndex, field, newSteps);
  };

  const addStepToArray = (field: 'clarifyingQuestionSteps' | 'suggestedResponseSteps', type: 'clarifyingQuestion' | 'suggestedResponse') => {
    const currentSteps = (field === 'clarifyingQuestionSteps' ? clarifyingQuestionSteps : suggestedResponseSteps) as ActionStep[];
    const newStep: ActionStep = { type: type === 'clarifyingQuestion' ? 'clarification' : 'response', value: "" };
    handleArrayStepChange(field, [...currentSteps, newStep]);
  };

  const removeStepFromArray = (field: 'clarifyingQuestionSteps' | 'suggestedResponseSteps', stepIndex: number) => {
    const currentSteps = field === 'clarifyingQuestionSteps' ? clarifyingQuestionSteps : suggestedResponseSteps;
    const newSteps = currentSteps.filter((_, index) => index !== stepIndex);
    handleArrayStepChange(field, newSteps);
  };

  const moveStepInArray = (
    field: 'clarifyingQuestionSteps' | 'suggestedResponseSteps',
    stepIndex: number,
    direction: 'up' | 'down' | 'left' | 'right'
  ) => {
    const currentSteps = field === 'clarifyingQuestionSteps'
      ? (item.clarifyingQuestionSteps || [])
      : (item.suggestedResponseSteps || []);
    
    // Ensure stepIndex is valid and currentSteps is populated before proceeding
    if (stepIndex < 0 || stepIndex >= currentSteps.length) {
        return;
    }
    const stepToMove = currentSteps[stepIndex]; // Get the actual object reference from the original array

    let newArrangedSteps = [...currentSteps]; // Create a new array for modifications

    if ((direction === 'up' || direction === 'left') && stepIndex > 0) {
      newArrangedSteps.splice(stepIndex, 1); // Remove from its original position
      newArrangedSteps.splice(stepIndex - 1, 0, stepToMove); // Insert it at the new position
    } else if ((direction === 'down' || direction === 'right') && stepIndex < currentSteps.length - 1) {
      newArrangedSteps.splice(stepIndex, 1);
      newArrangedSteps.splice(stepIndex + 1, 0, stepToMove);
    }
    
    const finalSteps = newArrangedSteps.map(step => ({ ...step })); // Create new object references for all items
    handleArrayStepChange(field, finalSteps);
  };
  
  const updateStepInArray = (
    field: 'clarifyingQuestionSteps' | 'suggestedResponseSteps',
    stepIndex: number,
    newValue: string
  ) => {
    const currentSteps = field === 'clarifyingQuestionSteps' ? clarifyingQuestionSteps : suggestedResponseSteps;
    const newSteps = [...currentSteps];
    newSteps[stepIndex] = { ...newSteps[stepIndex], value: newValue };
    handleArrayStepChange(field, newSteps);
  };

  const updateStepParameterAssociation = (
    field: 'clarifyingQuestionSteps', // This will only apply to clarifying questions
    stepIndex: number,
    parameterName: string | undefined
  ) => {
    const currentSteps = clarifyingQuestionSteps; // Directly use, as this is specific
    const newSteps = [...currentSteps];
    newSteps[stepIndex] = { ...newSteps[stepIndex], associatedParameterName: parameterName === "none" ? undefined : parameterName };
    handleArrayStepChange(field, newSteps);
  };

  const handleAssociatedToolChange = (toolId: string) => {
    if (toolId === "none" || !toolId) {
      handleProblemClassificationChange(originalIndex, 'associatedToolAction', undefined);
    } else {
      const newToolAction: ActionStep = { type: 'tool_action', value: toolId };
      handleProblemClassificationChange(originalIndex, 'associatedToolAction', newToolAction);
    }
  };
  
  const renderStepList = (
    steps: ActionStep[],
    stepType: 'clarifyingQuestion' | 'suggestedResponse',
    title: string,
    placeholder: string,
    fieldKey: 'clarifyingQuestionSteps' | 'suggestedResponseSteps',
    isOrdered: boolean // New parameter to control ordering UI
  ) => {
    return (
      <Card className='p-4 shadow-sm'> {/* Increased padding and added subtle shadow */}
        <CardHeader className="pb-3 pt-2"> {/* Adjusted padding for header */}
          <CardTitle className="text-lg font-semibold">{title}</CardTitle> {/* Made title slightly larger and bolder */}
        </CardHeader>
        <CardContent className={isOrdered ? "flex flex-row flex-nowrap space-x-4 overflow-x-auto py-4" : "space-y-4 py-4"}> {/* Increased spacing and padding */}
          {steps.map((step, index) => (
            <Card
              key={index}
              className={`
                p-4 space-y-3 min-w-[280px] md:min-w-[320px] rounded-lg shadow-md hover:shadow-lg transition-shadow duration-150
                ${isOrdered
                  ? 'bg-sky-50 dark:bg-sky-900/50 border-2 border-sky-300 dark:border-sky-600'  // Increased border width and slightly adjusted colors
                  : 'bg-amber-50 dark:bg-amber-900/50 border-2 border-amber-300 dark:border-amber-600' // Increased border width and slightly adjusted colors
                }
              `}
            >
              <div className="flex justify-between items-center">
                <Label className="font-semibold text-sm">{isOrdered ? `Pregunta #${index + 1}` : `Respuesta #${index + 1}`}</Label>
                <div className="flex items-center space-x-1">
                  {isOrdered && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => moveStepInArray(fieldKey, index, 'left')} disabled={index === 0} className="h-7 w-7">
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => moveStepInArray(fieldKey, index, 'right')} disabled={index === steps.length - 1} className="h-7 w-7">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => removeStepFromArray(fieldKey, index)} className="h-7 w-7 hover:bg-destructive/20">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
              {stepType === 'clarifyingQuestion' ? (
                <>
                  <Input
                    value={step.value}
                    placeholder={placeholder}
                    onChange={(e) => updateStepInArray(fieldKey, index, e.target.value)}
                  />
                  {associatedToolAction?.value && assistantConfigData?.tools && (
                    (() => {
                      const selectedTool = assistantConfigData.tools.find(t => t.id === associatedToolAction.value);
                      if (selectedTool && selectedTool.parameters && selectedTool.parameters.length > 0) {
                        return (
                          <div className="mt-2">
                            <Label htmlFor={`param-select-${step.id}`} className="text-xs text-muted-foreground">Asociar con Parámetro de Herramienta:</Label>
                            <Select
                              value={step.associatedParameterName || "none"}
                              onValueChange={(paramName) => updateStepParameterAssociation('clarifyingQuestionSteps', index, paramName)}
                            >
                              <SelectTrigger id={`param-select-${step.id}`} className="mt-1 h-9">
                                <SelectValue placeholder="No asociado" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No asociado</SelectItem>
                                {selectedTool.parameters.map(param => (
                                  <SelectItem key={param.name} value={param.name}>
                                    {param.name} ({param.type}){param.required ? '*' : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      return null;
                    })()
                  )}
                </>
              ) : ( // Suggested responses are textareas
                <Textarea
                  value={step.value}
                  placeholder={placeholder}
                  rows={2}
                  onChange={(e) => updateStepInArray(fieldKey, index, e.target.value)}
                />
              )}
            </Card>
          ))}
          {steps.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">No hay {title.toLowerCase()} definidas.</p>
          )}
          
        </CardContent>
        <div className="pt-3"> {/* Added padding top for the button container */}
          <Button variant="outline" size="sm" onClick={() => addStepToArray(fieldKey, stepType)} className="w-full">
            <PlusCircle className="h-4 w-4 mr-2" />Añadir {stepType === 'clarifyingQuestion' ? 'Pregunta' : 'Respuesta'}
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <Card className="p-6 space-y-6 border-l-4 border-blue-500 shadow-md"> {/* Increased padding, shadow, and space-y */}
      <div>
        <Label htmlFor={`classification-name-${originalIndex}`} className="text-base font-medium mb-1 block">Nombre de la Clasificación</Label> {/* Enhanced label */}
        <Input
          id={`classification-name-${originalIndex}`}
          value={item.classification}
          placeholder="Nombre de la Clasificación (ej: Solicitud de Reembolso)"
          onChange={(e) => handleProblemClassificationChange(originalIndex, 'classification', e.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-base font-medium mb-1 block">Palabras Clave del Usuario (User Mentions)</Label> {/* Enhanced label */}
        {(item.userMentions || []).map((mention: string, mentionIndex: number) => (
          <div key={mentionIndex} className="flex items-center space-x-2 mt-2"> {/* Increased top margin */}
            <Input
              value={mention}
              placeholder={`Palabra clave #${mentionIndex + 1}`}
              onChange={(e) => {
                const newUserMentions = [...(item.userMentions || [])];
                newUserMentions[mentionIndex] = e.target.value;
                handleProblemClassificationChange(originalIndex, 'userMentions', newUserMentions);
              }}
            />
            <Button variant="ghost" size="icon" onClick={() => {
               const newUserMentions = (item.userMentions || []).filter((_, i) => i !== mentionIndex);
               handleProblemClassificationChange(originalIndex, 'userMentions', newUserMentions);
            }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => { {/* Increased top margin and made button full width */}
            const newUserMentions = [...(item.userMentions || []), ""];
            handleProblemClassificationChange(originalIndex, 'userMentions', newUserMentions);
        }}>Añadir Palabra Clave</Button>
      </div>

      <CardDescription className="!mt-8 !mb-3 text-center text-lg font-semibold">Flujo de Resolución del Problema</CardDescription> {/* Enhanced description */}
      
      {renderStepList(clarifyingQuestionSteps, 'clarifyingQuestion', 'Preguntas Aclaratorias', 'Escribe la pregunta aclaratoria...', 'clarifyingQuestionSteps', true)} {/* Removed (Opcional) for cleaner UI */}
      
      {renderStepList(suggestedResponseSteps, 'suggestedResponse', 'Respuestas Sugeridas', 'Escribe una respuesta sugerida...', 'suggestedResponseSteps', false)}

      <Card className="shadow-sm"> {/* Added subtle shadow */}
        <CardHeader className="pb-3 pt-2"> {/* Adjusted padding */}
          <CardTitle className="text-lg font-semibold">Herramienta Asociada (Opcional)</CardTitle> {/* Enhanced title */}
        </CardHeader>
        <CardContent>
          <Select
            value={associatedToolAction?.value || ""}
            onValueChange={handleAssociatedToolChange}
          >
            <SelectTrigger><SelectValue placeholder="Seleccionar herramienta..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ninguna</SelectItem>
              {(assistantConfigData?.tools || []).filter(t => t.enabled).map(tool => (
                <SelectItem key={tool.id} value={tool.id}>{tool.name} ({tool.type})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {associatedToolAction?.value && assistantConfigData?.tools.find(t => t.id === associatedToolAction.value)?.requiresPii && (
            <p className="text-xs text-orange-600 mt-1">Esta herramienta podría requerir acceso a PII.</p>
          )}
        </CardContent>
      </Card>
      
      {/* General Flow Step Overrides */}
      <CardDescription className="!mt-8 !mb-3 text-center text-lg font-semibold">Anulación del Flujo General de Conversación</CardDescription> {/* Enhanced description */}
      <div className="space-y-3"> {/* Increased spacing */}
        <div className="flex items-center space-x-3 p-3 rounded-md bg-slate-50 dark:bg-slate-800/30 border"> {/* Added background, padding, border */}
          <Switch
            id={`shouldOverrideCurrentFlowStep-${originalIndex}`}
            checked={!!item.shouldOverrideCurrentFlowStep}
            onCheckedChange={(checked) => {
              handleProblemClassificationChange(originalIndex, 'shouldOverrideCurrentFlowStep', checked);
              if (!checked) {
                handleProblemClassificationChange(originalIndex, 'currentFlowStepOverride', "");
              }
            }}
          />
          <Label htmlFor={`shouldOverrideCurrentFlowStep-${originalIndex}`} className="text-sm font-medium cursor-pointer">Anular Paso Actual del Flujo General</Label> {/* Added cursor-pointer */}
        </div>
        {item.shouldOverrideCurrentFlowStep && (
          <>
            <Select
              value={item.currentFlowStepOverride || ""}
              onValueChange={(value) => handleProblemClassificationChange(originalIndex, 'currentFlowStepOverride', value === "default" ? "" : value)}
            >
              <SelectTrigger id={`currentFlowStepOverride-${originalIndex}`}><SelectValue placeholder="Seleccionar paso actual..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">No anular (IA por defecto)</SelectItem>
                {generalFlowSteps.map(step => (
                  <SelectItem key={`current-${step}`} value={step}>{step}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Define explícitamente el paso actual del flujo general para esta clasificación.</p>
          </>
        )}
      </div>

      <div className="space-y-3"> {/* Increased spacing */}
        <div className="flex items-center space-x-3 p-3 rounded-md bg-slate-50 dark:bg-slate-800/30 border"> {/* Added background, padding, border */}
          <Switch
            id={`shouldOverrideNextFlowStep-${originalIndex}`}
            checked={!!item.shouldOverrideNextFlowStep}
            onCheckedChange={(checked) => {
              handleProblemClassificationChange(originalIndex, 'shouldOverrideNextFlowStep', checked);
              if (!checked) {
                handleProblemClassificationChange(originalIndex, 'nextFlowStepOverride', "");
              }
            }}
          />
          <Label htmlFor={`shouldOverrideNextFlowStep-${originalIndex}`} className="text-sm font-medium cursor-pointer">Anular Siguiente Paso del Flujo General</Label> {/* Added cursor-pointer */}
        </div>
        {item.shouldOverrideNextFlowStep && (
          <>
            <Select
              value={item.nextFlowStepOverride || ""}
              onValueChange={(value) => handleProblemClassificationChange(originalIndex, 'nextFlowStepOverride', value === "default" ? "" : value)}
            >
              <SelectTrigger id={`nextFlowStepOverride-${originalIndex}`}><SelectValue placeholder="Seleccionar siguiente paso..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">No anular (IA por defecto)</SelectItem>
                {generalFlowSteps.map(step => (
                  <SelectItem key={`next-${step}`} value={step}>{step}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Define explícitamente el siguiente paso del flujo general para esta clasificación.</p>
          </>
        )}
      </div>
    </Card>
  );
}
