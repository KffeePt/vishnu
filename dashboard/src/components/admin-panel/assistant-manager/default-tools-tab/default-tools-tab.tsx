"use client";

import { ChangeEvent, useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Pencil, X } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
    ToolParameter,
    AssistantConfigData,
    AssistantTool,
    FirestoreAssistantTool,
    McpAssistantTool,
    RtdbAssistantTool,
    ComponentUseAssistantTool,
    AssistantMainSettings,
} from "@/components/assistant/assistant-types";
import { Textarea } from "@/components/ui/textarea";
import React from "react";

interface DefaultToolsTabProps {
  assistantConfigData: AssistantConfigData & { 'assistant-settings'?: AssistantMainSettings };
  setAssistantConfigData: React.Dispatch<React.SetStateAction<(AssistantConfigData & { 'assistant-settings'?: AssistantMainSettings }) | null>>;
}

export default function DefaultToolsTab({
  assistantConfigData,
  setAssistantConfigData,
}: DefaultToolsTabProps) {
  const [editingTool, setEditingTool] = useState<Partial<AssistantTool> | null>(null);
  const [isAddingNewTool, setIsAddingNewTool] = useState(false);

  const defaultTools: AssistantTool[] = [
    // Add your default tools here
  ];

  const handleAddNewTool = () => {
    const newTool: FirestoreAssistantTool = {
      id: Math.random().toString(36).substr(2, 9),
      name: "New Tool",
      description: "",
      type: 'firestore',
      enabled: true,
      requiresPii: false,
      isEscalationTool: false,
      parameters: [],
      firestoreAction: 'query_by_field',
      firestoreCollection: 'users',
    };
    setEditingTool(newTool);
    setIsAddingNewTool(true);
  };

  const handleResetToDefault = () => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      return { ...prev, tools: defaultTools };
    });
  };

  const handleSaveTool = () => {
    if (!editingTool) return;
    setAssistantConfigData(prev => {
      if (!prev) return null;
      const newTools = [...(prev.tools || [])];
      const existingIndex = newTools.findIndex(t => t.id === editingTool.id);
      if (existingIndex > -1) {
        newTools[existingIndex] = editingTool as AssistantTool;
      } else {
        newTools.push(editingTool as AssistantTool);
      }
      return { ...prev, tools: newTools };
    });
    setEditingTool(null);
    setIsAddingNewTool(false);
  };

  const handleEditTool = (tool: AssistantTool) => {
    setEditingTool({ ...tool });
    setIsAddingNewTool(false);
  };

  const handleDeleteTool = (toolId: string) => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      return { ...prev, tools: (prev.tools || []).filter(t => t.id !== toolId) };
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
    setEditingTool(prev => {
      if (!prev) return null;
      const newToolState: Partial<AssistantTool> = {
        id: prev.id,
        name: prev.name,
        description: prev.description,
        enabled: prev.enabled,
        requiresPii: prev.requiresPii,
        isEscalationTool: prev.isEscalationTool,
        parameters: prev.parameters,
        type: value,
      };
      return newToolState;
    });
  };

  const handleToolEnabledChange = (toolId: string, checked: boolean) => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tools: (prev.tools || []).map(tool =>
          tool.id === toolId ? { ...tool, enabled: checked } : tool
        ),
      };
    });
  };

  const addToolParameter = () => {
    if (!editingTool) return;
    setEditingTool(prev => {
      if (!prev) return null;
      return {
        ...prev,
        parameters: [...(prev.parameters || []), { name: "", type: 'string', description: "", required: false }],
      };
    });
  };

  const handleToolParameterChange = (paramIndex: number, field: keyof ToolParameter, value: string | boolean) => {
    if (!editingTool || !editingTool.parameters) return;
    setEditingTool(prev => {
      if (!prev || !prev.parameters) return null;
      const updatedParameters = [...prev.parameters];
      const paramToUpdate = updatedParameters[paramIndex];
      (paramToUpdate as any)[field] = value;
      return { ...prev, parameters: updatedParameters };
    });
  };

  const removeToolParameter = (paramIndex: number) => {
    if (!editingTool || !editingTool.parameters) return;
    setEditingTool(prev => {
      if (!prev || !prev.parameters) return null;
      return {
        ...prev,
        parameters: prev.parameters.filter((_, i) => i !== paramIndex),
      };
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex justify-between items-center">
          <h4 className="text-lg font-medium">Default Tools</h4>
          <div>
            <Button onClick={handleAddNewTool} size="sm" className="mr-2">Add Tool</Button>
            <Button onClick={handleResetToDefault} size="sm" variant="outline">Reset to Default</Button>
          </div>
        </div>

        {(assistantConfigData.tools || []).map((tool: AssistantTool) => (
          <React.Fragment key={tool.id}>
            <Card className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="font-semibold">{tool.name || "New Tool"}</p>
                <div>
                  <Switch checked={tool.enabled} onCheckedChange={(checked) => handleToolEnabledChange(tool.id, checked)} className="mr-2" />
                  <Button variant="ghost" size="icon" onClick={() => editingTool?.id === tool.id ? setEditingTool(null) : handleEditTool(tool)} className="mr-1">
                    {editingTool?.id === tool.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteTool(tool.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Type: {tool.type} - Status: {tool.enabled ? "Enabled" : "Disabled"}</p>
            </Card>

            {editingTool && editingTool.id === tool.id && (
              <Card className="p-4 mt-4 space-y-3 bg-slate-50 dark:bg-slate-800">
                <h5 className="text-md font-semibold">{isAddingNewTool ? "Add New Tool" : "Edit Tool"}</h5>
                <div><Label htmlFor="toolName">Name</Label><Input id="toolName" name="name" value={editingTool.name || ""} onChange={handleToolInputChange} placeholder="Descriptive name"/></div>
                <div><Label htmlFor="toolDescription">Description (for AI)</Label><Textarea id="toolDescription" name="description" value={editingTool.description || ""} onChange={handleToolInputChange} rows={2} placeholder="What it does and when to use it."/></div>
                <div className="flex items-center space-x-2 pt-1"><Switch id="toolRequiresPii" checked={!!editingTool.requiresPii} onCheckedChange={(checked) => handleToolConfigChange('requiresPii', checked)} /><Label htmlFor="toolRequiresPii">Requires PII?</Label></div>
                <div className="flex items-center space-x-2 pt-1"><Switch id="toolIsEscalation" checked={!!editingTool.isEscalationTool} onCheckedChange={(checked) => handleToolConfigChange('isEscalationTool', checked)} /><Label htmlFor="toolIsEscalation">Is Escalation Tool?</Label></div>
                <div className="mt-3"><Label htmlFor="toolType">Tool Type</Label>
                  <Select onValueChange={(value) => handleToolTypeChange(value as AssistantTool['type'])} value={editingTool.type || 'firestore'}>
                    <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="firestore">Firestore</SelectItem>
                      <SelectItem value="rtdb">RTDB</SelectItem>
                      <SelectItem value="mcp">MCP</SelectItem>
                      <SelectItem value="component_use_tool">Component Use</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Accordion type="single" collapsible className="w-full mt-3">
                  <AccordionItem value="tool-parameters">
                    <AccordionTrigger>
                      <Label className="text-sm font-medium">Tool Parameters (for AI)</Label>
                    </AccordionTrigger>
                    <AccordionContent>
                      {(editingTool.parameters || []).map((param, index) => (
                        <Card className="p-3 mt-2 space-y-3 border-l-4 border-blue-500" key={index}>
                          <div className="flex justify-between items-center"><p className="text-sm font-medium">Parameter #{index + 1}</p><Button variant="ghost" size="icon" onClick={() => removeToolParameter(index)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button></div>
                          <div><Label htmlFor={`paramName-${index}`}>Name</Label><Input id={`paramName-${index}`} value={param.name} onChange={(e) => handleToolParameterChange(index, 'name', e.target.value)} placeholder="e.g., order_id"/></div>
                          <div><Label htmlFor={`paramDescription-${index}`}>Description</Label><Textarea id={`paramDescription-${index}`} value={param.description} onChange={(e) => handleToolParameterChange(index, 'description', e.target.value)} rows={2} placeholder="Describe the parameter"/></div>
                          <div><Label htmlFor={`paramType-${index}`}>Type</Label>
                            <Select value={param.type} onValueChange={(val) => handleToolParameterChange(index, 'type', val as ToolParameter['type'])}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="string">Text</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="boolean">Boolean</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center space-x-2 pt-1"><Switch id={`paramRequired-${index}`} checked={!!param.required} onCheckedChange={(checked) => handleToolParameterChange(index, 'required', checked)} /><Label htmlFor={`paramRequired-${index}`}>Required?</Label></div>
                        </Card>
                      ))}
                      <Button variant="outline" size="sm" className="mt-2 w-full" onClick={addToolParameter}>Add Parameter</Button>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <div className="flex justify-end space-x-2 mt-3"><Button variant="ghost" onClick={() => { setEditingTool(null); setIsAddingNewTool(false); }}>Cancel</Button><Button onClick={handleSaveTool}>Save Tool</Button></div>
              </Card>
            )}
          </React.Fragment>
        ))}
      </CardContent>
    </Card>
  );
}