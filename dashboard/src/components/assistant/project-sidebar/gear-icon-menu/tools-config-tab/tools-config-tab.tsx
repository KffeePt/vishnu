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
    AssistantConfigData, // Moved from "./assistant-manager"
    AssistantTool,       // Moved from "./assistant-manager"
    FirestoreAction,     // Moved from "./assistant-manager"
    FirestoreCollection, // Moved from "./assistant-manager"
    FirestoreAssistantTool,
    McpAssistantTool,
    RtdbAssistantTool,
    EscalationFieldMapping,
    FirestoreEscalationConfig,
    AssistantEscalation, // Added
    DefaultEscalationValueItem, // Added
    AssistantMainSettings, // Added
    DisplayToolConfig, // Kept for Display Tool config component
    DisplayToolConfigItem // Kept for Display Tool config component
} from "@/components/assistant/assistant-types";
import { Textarea } from "@/components/ui/textarea";
import DisplayToolConfigComponent from "./display-tool-config"; // Added import
import React from "react"; // Added for React.Fragment
import FirestoreToolConfig from "./firestore-tool-config";
interface ToolsConfigTabProps {
  assistantConfigData: AssistantConfigData & { 'assistant-settings'?: AssistantMainSettings }; // Ensure assistantSettings is recognized
  setAssistantConfigData: React.Dispatch<React.SetStateAction<(AssistantConfigData & { 'assistant-settings'?: AssistantMainSettings }) | null>>; // Adjust setter type
  editingTool: Partial<AssistantTool> | null;
  setEditingTool: React.Dispatch<React.SetStateAction<Partial<AssistantTool> | null>>;
  isAddingNewTool: boolean;
  setIsAddingNewTool: React.Dispatch<React.SetStateAction<boolean>>;
  handleAddNewTool: () => void;
  handleSaveTool: () => void;
  handleEditTool: (tool: AssistantTool) => void;
  handleDeleteTool: (toolId: string) => void;
  handleToolInputChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleToolConfigChange: (field: string, value: any) => void;
  handleToolTypeChange: (value: AssistantTool['type']) => void;
  handleToolEnabledChange: (toolId: string, checked: boolean) => void;
  addToolParameter: () => void;
  handleToolParameterChange: (paramIndex: number, field: keyof ToolParameter, value: string | boolean | string[]) => void;
  removeToolParameter: (paramIndex: number) => void;
  availableToolComponents: string[];
}

export default function ToolsConfigTab({
  assistantConfigData,
  setAssistantConfigData, // Added missing prop
  editingTool,
  setEditingTool,
  isAddingNewTool,
  setIsAddingNewTool,
  handleAddNewTool,
  handleSaveTool,
  handleEditTool,
  handleDeleteTool,
  handleToolInputChange,
  handleToolConfigChange,
  handleToolTypeChange,
  handleToolEnabledChange,
  addToolParameter,
  handleToolParameterChange,
  removeToolParameter,
  availableToolComponents, // Added missing prop
}: ToolsConfigTabProps) {
  const [localRtdbExcludedFieldsText, setLocalRtdbExcludedFieldsText] = useState<string>("");
  const [currentToolIdForRtdbSync, setCurrentToolIdForRtdbSync] = useState<string | undefined | null>(null);
  const [localFirestoreExcludedFieldsText, setLocalFirestoreExcludedFieldsText] = useState<string>("");
  const [localFirestoreFieldsToRecoverText, setLocalFirestoreFieldsToRecoverText] = useState<string>("");
  const [currentToolIdForFirestoreSync, setCurrentToolIdForFirestoreSync] = useState<string | undefined | null>(null);
  const [dynamicFirestoreCollections, setDynamicFirestoreCollections] = useState<any[]>([]);
  const [isLoadingFirestoreCollections, setIsLoadingFirestoreCollections] = useState<boolean>(false);
  const [firestoreCollectionsError, setFirestoreCollectionsError] = useState<string | null>(null);
  const editSectionRef = useRef<HTMLDivElement>(null);

  // Define constants for dropdowns
  const assistantEscalationFields: Array<{ value: keyof AssistantEscalation; label: string }> = [
    { value: 'conversationId', label: 'Conversation ID (conversationId)' },
    { value: 'userId', label: 'User ID (userId)' },
    { value: 'orderId', label: 'Order ID (orderId)' },
    { value: 'requestType', label: 'Request Type (requestType)' },
    { value: 'requestReason', label: 'Request Reason (requestReason)' },
    { value: 'restaurantId', label: 'Restaurant ID (restaurantId)' },
    { value: 'conversationSummary', label: 'Conversation Summary (conversationSummary)' },
  ];

  const defaultValueSourceTypes: Array<{ value: DefaultEscalationValueItem['valueSource']; label: string }> = [
    { value: 'static', label: 'Fixed Value' },
  ];

  const fetchFirestoreCollections = useCallback(async () => {
    setIsLoadingFirestoreCollections(true);
    setFirestoreCollectionsError(null);
    try {
      const response = await fetch('/api/admin/firestore-collections');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch collections: ${response.statusText}`);
      }
      const collections = await response.json();
      setDynamicFirestoreCollections(collections);
    } catch (error) {
      console.error("Error fetching dynamic Firestore collections:", error);
      setFirestoreCollectionsError(error instanceof Error ? error.message : "Unknown error");
      setDynamicFirestoreCollections([]);
    } finally {
      setIsLoadingFirestoreCollections(false);
    }
  }, []);

  useEffect(() => {
    if (editingTool && editingTool.type === 'firestore' && dynamicFirestoreCollections.length === 0 && !isLoadingFirestoreCollections && !firestoreCollectionsError) {
      fetchFirestoreCollections();
    }
  }, [editingTool, fetchFirestoreCollections, dynamicFirestoreCollections.length, isLoadingFirestoreCollections, firestoreCollectionsError]);

  useEffect(() => {
    if (editingTool && editingTool.type === 'rtdb') {
      if (editingTool.id !== currentToolIdForRtdbSync) {
        const rtdbTool = editingTool as Partial<RtdbAssistantTool>;
        const propValue = rtdbTool.rtdbExcludedFields;
        setLocalRtdbExcludedFieldsText(Array.isArray(propValue) ? propValue.join(", ") : typeof propValue === 'string' ? propValue : "");
        setCurrentToolIdForRtdbSync(editingTool.id);
      }
    } else if (currentToolIdForRtdbSync !== null) {
      setLocalRtdbExcludedFieldsText("");
      setCurrentToolIdForRtdbSync(null);
    }

    if (editingTool && editingTool.type === 'firestore') {
      const firestoreTool = editingTool as Partial<FirestoreAssistantTool>;
      if (editingTool.id !== currentToolIdForFirestoreSync) {
        const excludedPropValue = firestoreTool.firestoreExcludedFields;
        setLocalFirestoreExcludedFieldsText(Array.isArray(excludedPropValue) ? excludedPropValue.join(", ") : "");
        const recoverPropValue = firestoreTool.firestoreFieldsToRecover;
        setLocalFirestoreFieldsToRecoverText(Array.isArray(recoverPropValue) ? recoverPropValue.join(", ") : "");
        setCurrentToolIdForFirestoreSync(editingTool.id);
      }
    } else if (currentToolIdForFirestoreSync !== null) {
      setLocalFirestoreExcludedFieldsText("");
      setLocalFirestoreFieldsToRecoverText("");
      setCurrentToolIdForFirestoreSync(null);
    }
  }, [editingTool, currentToolIdForRtdbSync, currentToolIdForFirestoreSync]);

  useEffect(() => {
    if (editingTool && editSectionRef.current) {
      editSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [editingTool]);

  if (!assistantConfigData) return null;

  const sourceTypeOptions: Array<{ value: EscalationFieldMapping['sourceType']; label: string }> = [
    { value: 'parameter', label: 'Tool Parameter' },
    { value: 'ai_summary', label: 'AI Summary' },
    { value: 'static', label: 'Fixed Value' }
  ];

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        {/* Dedicated Display Tool Configuration Section */}
        {assistantConfigData && setAssistantConfigData && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="display-tool-config">
              <AccordionTrigger>
                <h6 className="text-md font-semibold">Display Tool Configuration</h6>
              </AccordionTrigger>
              <AccordionContent>
                <DisplayToolConfigComponent
                  assistantConfigData={assistantConfigData}
                  setAssistantConfigData={setAssistantConfigData}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        <div className="pt-4 mt-4 border-t"> {/* Added separator */}
            <div className="flex justify-between items-center">
                <h4 className="text-lg font-medium">Configured AI Tools (Actions)</h4>
                <Button onClick={handleAddNewTool} size="sm">Add AI Tool</Button>
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
              <Card ref={editSectionRef} className="p-4 mt-4 space-y-3 bg-slate-50 dark:bg-slate-800">
                <h5 className="text-md font-semibold">{editingTool.id ? "Edit Tool" : "Add New Tool"}</h5>
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
                    </SelectContent>
                  </Select>
                </div>

                {editingTool.type === 'firestore' && (
                  <FirestoreToolConfig
                    editingTool={editingTool}
                    handleToolConfigChange={handleToolConfigChange}
                    localFirestoreFieldsToRecoverText={localFirestoreFieldsToRecoverText}
                    setLocalFirestoreFieldsToRecoverText={setLocalFirestoreFieldsToRecoverText}
                    localFirestoreExcludedFieldsText={localFirestoreExcludedFieldsText}
                    setLocalFirestoreExcludedFieldsText={setLocalFirestoreExcludedFieldsText}
                    dynamicFirestoreCollections={dynamicFirestoreCollections}
                    isLoadingFirestoreCollections={isLoadingFirestoreCollections}
                    firestoreCollectionsError={firestoreCollectionsError}
                    assistantEscalationFields={assistantEscalationFields}
                    defaultValueSourceTypes={defaultValueSourceTypes}
                    sourceTypeOptions={sourceTypeOptions}
                  />
                )}

                {editingTool.type === 'rtdb' && ( /* RTDB Config UI */ <Card className="p-3 mt-2 space-y-2 border-l-4 border-green-500"><h6 className="text-sm font-medium">RTDB Tool Configuration</h6><div><Label htmlFor="rtdbPath">RTDB Path</Label><Input id="rtdbPath" value={(editingTool as Partial<RtdbAssistantTool>).rtdbPath || ""} onChange={(e) => handleToolConfigChange('rtdbPath', e.target.value)} placeholder="e.g., /orders/{orderId}/status"/></div><div><Label htmlFor="rtdbExcludedFields">Fields to Exclude (comma-separated)</Label><Textarea id="rtdbExcludedFields" value={localRtdbExcludedFieldsText} onChange={(e) => { setLocalRtdbExcludedFieldsText(e.target.value); handleToolConfigChange('rtdbExcludedFields', e.target.value);}} placeholder="e.g., progress, internalNotes" rows={2}/></div>{(editingTool as Partial<RtdbAssistantTool>).rtdbPath?.includes("{") && (editingTool as Partial<RtdbAssistantTool>).rtdbPath?.includes("}") && (<div><Label htmlFor="rtdbDynamicPathParameter">Parameter for Dynamic Segment</Label><Select value={(editingTool as Partial<RtdbAssistantTool>).rtdbDynamicPathParameter || ""} onValueChange={(val) => handleToolConfigChange('rtdbDynamicPathParameter', val)}><SelectTrigger><SelectValue placeholder="Select..."/></SelectTrigger><SelectContent>{(editingTool.parameters || []).filter(p => p.name?.trim()).map(p => <SelectItem key={p.name} value={p.name}>{p.name} ({p.type})</SelectItem>)}{(!editingTool.parameters || !editingTool.parameters.some(p=>p.name?.trim())) && <SelectItem value="_placeholder_disabled_" disabled>Define parameters</SelectItem>}</SelectContent></Select></div>)}</Card> )}
                {editingTool.type === 'mcp' && ( /* MCP Config UI */ <Card className="p-3 mt-2 space-y-2 border-l-4 border-sky-500"><h6 className="text-sm font-medium">MCP Tool Configuration</h6><div><Label htmlFor="mcpUrl">MCP: Endpoint URL</Label><Input id="mcpUrl" value={(editingTool as Partial<McpAssistantTool>).mcpConfig?.url || ""} onChange={(e) => { const c = (editingTool as Partial<McpAssistantTool>).mcpConfig || {url:"",method:"POST",headers:{}}; handleToolConfigChange('mcpConfig', {...c, url: e.target.value });}} placeholder="e.g., https://api.example.com/tool"/></div><div><Label htmlFor="mcpMethod">MCP: HTTP Method</Label><Select value={(editingTool as Partial<McpAssistantTool>).mcpConfig?.method || 'POST'} onValueChange={(val) => { const c = (editingTool as Partial<McpAssistantTool>).mcpConfig || {url:"",method:"POST",headers:{}}; handleToolConfigChange('mcpConfig', {...c, method: val as McpAssistantTool['mcpConfig']['method']} );}}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="POST">POST</SelectItem><SelectItem value="GET">GET</SelectItem><SelectItem value="PUT">PUT</SelectItem><SelectItem value="DELETE">DELETE</SelectItem><SelectItem value="PATCH">PATCH</SelectItem></SelectContent></Select></div><div><Label htmlFor="mcpHeaders">MCP: Headers (JSON)</Label><Textarea id="mcpHeaders" value={JSON.stringify((editingTool as Partial<McpAssistantTool>).mcpConfig?.headers || {}, null, 2)} onChange={(e) => { try { const h = JSON.parse(e.target.value); const c = (editingTool as Partial<McpAssistantTool>).mcpConfig || {url:"",method:"POST",headers:{}}; handleToolConfigChange('mcpConfig', {...c, headers: h }); } catch (err) {}}} placeholder='{ "Authorization": "Bearer YOUR_TOKEN" }' rows={3}/></div></Card> )}


                <Accordion type="single" collapsible className="w-full mt-3">
                  <AccordionItem value="tool-parameters">
                    <AccordionTrigger>
                      <Label className="text-sm font-medium">Tool Parameters (for AI)</Label>
                    </AccordionTrigger>
                    <AccordionContent>
                      {(editingTool.parameters || []).map((param, index) => (
                        <Accordion type="single" collapsible className="w-full" key={index}>
                          <AccordionItem value={`param-${index}`}>
                            <AccordionTrigger>
                              <p className="text-sm font-medium">Parameter #{index + 1}: {param.name}</p>
                            </AccordionTrigger>
                            <AccordionContent>
                              <Card className="p-3 mt-2 space-y-3 border-l-4 border-blue-500">
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
                                      <SelectItem value="image">Image</SelectItem>
                                      <SelectItem value="audio">Audio</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-center space-x-2 pt-1"><Switch id={`paramRequired-${index}`} checked={!!param.required} onCheckedChange={(checked) => handleToolParameterChange(index, 'required', checked)} /><Label htmlFor={`paramRequired-${index}`}>Required?</Label></div>
                              </Card>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
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
        {/* The original block for editingTool is now removed from here */}
      </CardContent>
    </Card>
  );
}
