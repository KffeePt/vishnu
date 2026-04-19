import React, { useState, ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import ApiKeysTab from '@/components/assistant/project-sidebar/gear-icon-menu/api-keys-tab/api-keys-tab';
import BehavioralRulesTab from '@/components/assistant/project-sidebar/gear-icon-menu/behavioral-rules-tab/behavioral-rules-tab';
import ToolsConfigTab from '@/components/assistant/project-sidebar/gear-icon-menu/tools-config-tab/tools-config-tab';
import { AssistantConfigData, AssistantBehavioralRules, AssistantRuleItem, AssistantTool, ToolParameter } from '@/components/assistant/assistant-types';
import { v4 as uuidv4 } from 'uuid';

interface AssistantSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  assistantConfigData: AssistantConfigData | null;
  setAssistantConfigData: React.Dispatch<React.SetStateAction<AssistantConfigData | null>>;
}

const AssistantSettingsDialog = ({
  isOpen,
  onClose,
  assistantConfigData,
  setAssistantConfigData,
}: AssistantSettingsDialogProps) => {
  const [editingTool, setEditingTool] = useState<Partial<AssistantTool> | null>(null);
  const [isAddingNewTool, setIsAddingNewTool] = useState(false);

  if (!assistantConfigData) return null;

  const handleBehavioralRuleChange = (field: string | number | symbol, value: any) => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        behavioralRules: {
          ...prev.behavioralRules,
          [field as keyof AssistantBehavioralRules]: value,
        },
      };
    });
  };

  const handleProblemClassificationChange = (index: number, field: string | number | symbol, value: any) => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      const updatedProblemClassification = [...(prev.behavioralRules.problemClassification || [])];
      if (updatedProblemClassification[index]) {
        const key = field as keyof AssistantRuleItem;
        (updatedProblemClassification[index] as any)[key] = value;
      }
      return {
        ...prev,
        behavioralRules: {
          ...prev.behavioralRules,
          problemClassification: updatedProblemClassification,
        },
      };
    });
  };

  const addProblemClassificationItem = () => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      const newProblemClassification: AssistantRuleItem = {
        classification: `New Classification ${prev.behavioralRules.problemClassification.length + 1}`,
        userMentions: [],
        clarifyingQuestionSteps: [],
        suggestedResponseSteps: [],
        description: "",
      };
      return {
        ...prev,
        behavioralRules: {
          ...prev.behavioralRules,
          problemClassification: [...prev.behavioralRules.problemClassification, newProblemClassification],
        },
      };
    });
  };

  const removeProblemClassificationItem = (index: number) => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      const updatedProblemClassification = [...prev.behavioralRules.problemClassification];
      updatedProblemClassification.splice(index, 1);
      return {
        ...prev,
        behavioralRules: {
          ...prev.behavioralRules,
          problemClassification: updatedProblemClassification,
        },
      };
    });
  };

  const handleAddNewTool = () => {
    setIsAddingNewTool(true);
    setEditingTool({
      id: uuidv4(),
      name: "",
      description: "",
      enabled: true,
      requiresPii: false,
      isEscalationTool: false,
      parameters: [],
      type: 'firestore',
    });
  };

  const handleSaveTool = () => {
    if (!editingTool) return;
    setAssistantConfigData(prev => {
      if (!prev) return null;
      const tools = [...(prev.tools || [])];
      const index = tools.findIndex(t => t.id === editingTool.id);
      if (index > -1) {
        tools[index] = editingTool as AssistantTool;
      } else {
        tools.push(editingTool as AssistantTool);
      }
      return { ...prev, tools };
    });
    setEditingTool(null);
    setIsAddingNewTool(false);
  };

  const handleEditTool = (tool: AssistantTool) => {
    setEditingTool(tool);
    setIsAddingNewTool(false);
  };

  const handleDeleteTool = (toolId: string) => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tools: prev.tools.filter(t => t.id !== toolId),
      };
    });
  };

  const handleToolInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editingTool) return;
    const { name, value } = e.target;
    setEditingTool(prev => prev ? { ...prev, [name]: value } : null);
  };

  const handleToolConfigChange = (field: string, value: any) => {
    if (!editingTool) return;
    setEditingTool(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleToolTypeChange = (value: AssistantTool['type']) => {
    if (!editingTool) return;
    setEditingTool(prev => prev ? { ...prev, type: value } : null);
  };

  const handleToolEnabledChange = (toolId: string, checked: boolean) => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tools: prev.tools.map(t => t.id === toolId ? { ...t, enabled: checked } : t),
      };
    });
  };

  const addToolParameter = () => {
    if (!editingTool) return;
    const newParam: ToolParameter = { name: "", type: 'string', description: "", required: false };
    setEditingTool(prev => prev ? { ...prev, parameters: [...(prev.parameters || []), newParam] } : null);
  };

  const handleToolParameterChange = (paramIndex: number, field: keyof ToolParameter, value: string | boolean | string[]) => {
    if (!editingTool || !editingTool.parameters) return;
    const updatedParameters = [...editingTool.parameters];
    updatedParameters[paramIndex] = { ...updatedParameters[paramIndex], [field]: value };
    setEditingTool(prev => prev ? { ...prev, parameters: updatedParameters } : null);
  };

  const removeToolParameter = (paramIndex: number) => {
    if (!editingTool || !editingTool.parameters) return;
    const updatedParameters = [...editingTool.parameters];
    updatedParameters.splice(paramIndex, 1);
    setEditingTool(prev => prev ? { ...prev, parameters: updatedParameters } : null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Assistant Configuration</DialogTitle>
          <DialogDescription>
            Manage your assistant's settings.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="api-keys" className="py-4">
          <TabsList>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="behavioral-rules">Behavioral Rules</TabsTrigger>
            <TabsTrigger value="tools-config">Tools Config</TabsTrigger>
          </TabsList>
          <TabsContent value="api-keys">
            <ApiKeysTab
              assistantConfigData={assistantConfigData}
              setAssistantConfigData={setAssistantConfigData}
            />
          </TabsContent>
          <TabsContent value="behavioral-rules">
            <BehavioralRulesTab
              assistantConfigData={assistantConfigData}
              setAssistantConfigData={setAssistantConfigData}
              handleBehavioralRuleChange={handleBehavioralRuleChange}
              handleProblemClassificationChange={handleProblemClassificationChange}
              addProblemClassificationItem={addProblemClassificationItem}
              removeProblemClassificationItem={removeProblemClassificationItem}
            />
          </TabsContent>
          <TabsContent value="tools-config">
            <ToolsConfigTab
              assistantConfigData={assistantConfigData}
              setAssistantConfigData={setAssistantConfigData}
              editingTool={editingTool}
              setEditingTool={setEditingTool}
              isAddingNewTool={isAddingNewTool}
              setIsAddingNewTool={setIsAddingNewTool}
              handleAddNewTool={handleAddNewTool}
              handleSaveTool={handleSaveTool}
              handleEditTool={handleEditTool}
              handleDeleteTool={handleDeleteTool}
              handleToolInputChange={handleToolInputChange}
              handleToolConfigChange={handleToolConfigChange}
              handleToolTypeChange={handleToolTypeChange}
              handleToolEnabledChange={handleToolEnabledChange}
              addToolParameter={addToolParameter}
              handleToolParameterChange={handleToolParameterChange}
              removeToolParameter={removeToolParameter}
              availableToolComponents={[]}
            />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssistantSettingsDialog;