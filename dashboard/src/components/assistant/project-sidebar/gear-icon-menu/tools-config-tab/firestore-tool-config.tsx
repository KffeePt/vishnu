"use client";

import { ChangeEvent, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
    ToolParameter,
    AssistantTool,
    FirestoreAction,
    FirestoreCollection,
    FirestoreAssistantTool,
    EscalationFieldMapping,
    FirestoreEscalationConfig,
    AssistantEscalation,
    DefaultEscalationValueItem,
} from "@/components/assistant/assistant-types";
import { Textarea } from "@/components/ui/textarea";

interface FirestoreToolConfigProps {
  editingTool: Partial<AssistantTool> | null;
  handleToolConfigChange: (field: string, value: any) => void;
  localFirestoreFieldsToRecoverText: string;
  setLocalFirestoreFieldsToRecoverText: (value: string) => void;
  localFirestoreExcludedFieldsText: string;
  setLocalFirestoreExcludedFieldsText: (value: string) => void;
  dynamicFirestoreCollections: any[];
  isLoadingFirestoreCollections: boolean;
  firestoreCollectionsError: string | null;
  assistantEscalationFields: Array<{ value: keyof AssistantEscalation; label: string }>;
  defaultValueSourceTypes: Array<{ value: DefaultEscalationValueItem['valueSource']; label: string }>;
  sourceTypeOptions: Array<{ value: EscalationFieldMapping['sourceType']; label: string }>;
}

export default function FirestoreToolConfig({
  editingTool,
  handleToolConfigChange,
  localFirestoreFieldsToRecoverText,
  setLocalFirestoreFieldsToRecoverText,
  localFirestoreExcludedFieldsText,
  setLocalFirestoreExcludedFieldsText,
  dynamicFirestoreCollections,
  isLoadingFirestoreCollections,
  firestoreCollectionsError,
  assistantEscalationFields,
  defaultValueSourceTypes,
  sourceTypeOptions,
}: FirestoreToolConfigProps) {
  if (!editingTool || editingTool.type !== 'firestore') {
    return null;
  }

  const firestoreTool = editingTool as Partial<FirestoreAssistantTool>;
  const action = firestoreTool.firestoreAction;
  const useUserId = !!firestoreTool.firestoreUseUserIdAsDocumentId;
  const updateMode = firestoreTool.firestoreUpdateMode || 'simple';
  const showQueryField = action === 'query_by_field';
  const affectsDocIdResolution = action === 'get_document_by_id' || action === 'update_document_field';
  const showIdentifyingParameter = action === 'query_by_field' || (affectsDocIdResolution && !useUserId);
  const isUpdateAction = action === 'update_document_field';
  const isCreateEscalationAction = action === 'create_escalation_record';
  const recoveredFieldNames = localFirestoreFieldsToRecoverText.split(',').map(s => s.trim()).filter(s => s);

  const escalationConfig = firestoreTool.firestoreEscalationConfig || {
    escalationDocumentIdSource: 'user_id',
    defaultEscalationValues: [],
    escalationFieldMappings: [],
  };

  const handleEscalationConfigChange = (field: keyof FirestoreEscalationConfig, value: any) => {
    const currentMappings = escalationConfig.escalationFieldMappings || [];
    const currentDefaults = escalationConfig.defaultEscalationValues || [];
    const currentDocIdSource = escalationConfig.escalationDocumentIdSource || 'user_id';
    const currentDocIdSourceParam = escalationConfig.escalationIdentifyingParameter;
  
    let newEscalationConfigPartial: Partial<FirestoreEscalationConfig> = {
      escalationDocumentIdSource: currentDocIdSource,
      escalationIdentifyingParameter: currentDocIdSourceParam,
      defaultEscalationValues: currentDefaults,
      escalationFieldMappings: currentMappings,
    };
  
    // Apply the specific change
    newEscalationConfigPartial[field] = value;
  
    // Ensure all required fields have default values if they ended up undefined
    const newEscalationConfig: FirestoreEscalationConfig = {
      escalationDocumentIdSource: newEscalationConfigPartial.escalationDocumentIdSource || 'user_id',
      defaultEscalationValues: newEscalationConfigPartial.defaultEscalationValues || [],
      escalationFieldMappings: newEscalationConfigPartial.escalationFieldMappings || [],
      escalationIdentifyingParameter: newEscalationConfigPartial.escalationIdentifyingParameter, // Can be undefined
    };
  
    console.log("Updating firestoreEscalationConfig with (REVISED handleEscalationConfigChange):", JSON.stringify(newEscalationConfig, null, 2));
    handleToolConfigChange('firestoreEscalationConfig', newEscalationConfig);
  };
  
  const handleDefaultEscalationValueChange = (
    index: number, 
    field: keyof DefaultEscalationValueItem, 
    val: string | keyof AssistantEscalation | DefaultEscalationValueItem['valueSource']
  ) => {
    const newDefaults = [...(escalationConfig.defaultEscalationValues || [])] as DefaultEscalationValueItem[];
    if (newDefaults[index]) {
      // Create a new object for the item to ensure reactivity
      const updatedItem = { ...newDefaults[index], [field]: val };
      // If changing valueSource, reset value
      if (field === 'valueSource') {
        updatedItem.value = '';
      }
      newDefaults[index] = updatedItem;
      handleEscalationConfigChange('defaultEscalationValues', newDefaults);
    }
  };

  const addDefaultEscalationValue = () => {
    const newDefaultItem: DefaultEscalationValueItem = { 
      firestoreField: assistantEscalationFields[0]?.value || 'conversationId', // Default to first field or a fallback
      valueSource: 'static',
      value: "" 
    };
    const newDefaults = [...(escalationConfig.defaultEscalationValues || []), newDefaultItem];
    handleEscalationConfigChange('defaultEscalationValues', newDefaults);
  };

  const removeDefaultEscalationValue = (index: number) => {
    const newDefaults = (escalationConfig.defaultEscalationValues || []).filter((_, i) => i !== index);
    handleEscalationConfigChange('defaultEscalationValues', newDefaults);
  };

  const handleEscalationMappingChange = (index: number, field: keyof EscalationFieldMapping, value: string) => {
    const updatedMappings = [...(escalationConfig.escalationFieldMappings || [])];
    if(updatedMappings[index]) {
        (updatedMappings[index] as any)[field] = value;
         if (field === 'sourceType') { 
            updatedMappings[index].sourceValueOrName = '';
        }
        handleEscalationConfigChange('escalationFieldMappings', updatedMappings);
    }
  };

  const addEscalationMapping = () => {
    const newMapping: EscalationFieldMapping = { 
      parameter: '',
      firestoreField: assistantEscalationFields[0]?.value || 'requestReason', // Default to first field or a fallback
      targetPath: '', 
      sourceType: 'static',
      sourceValueOrName: '' 
    };
    handleEscalationConfigChange('escalationFieldMappings', [...(escalationConfig.escalationFieldMappings || []), newMapping]);
  };

  const removeEscalationMapping = (index: number) => {
    const updatedMappings = (escalationConfig.escalationFieldMappings || []).filter((_, i) => i !== index);
    handleEscalationConfigChange('escalationFieldMappings', updatedMappings);
  };
  
  return (
    <Card className="p-3 mt-2 space-y-2 border-l-4 border-orange-500">
      <h6 className="text-sm font-medium">Configuración de Herramienta Firestore</h6>
      <div><Label htmlFor="firestoreAction">Acción Firestore</Label>
        <Select value={action || 'query_by_field'} onValueChange={(val) => handleToolConfigChange('firestoreAction', val as FirestoreAction | 'create_escalation_record')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="query_by_field">Consultar por Campo</SelectItem>
            <SelectItem value="get_document_by_id">Obtener Documento por ID</SelectItem>
            <SelectItem value="update_document_field">Actualizar Campo de Documento</SelectItem>
            <SelectItem value="create_escalation_record">Crear Registro de Escalación</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label htmlFor="firestoreCollection">Colección Destino</Label>
        <Select value={firestoreTool.firestoreCollection || ''} onValueChange={(val) => handleToolConfigChange('firestoreCollection', val as FirestoreCollection)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar colección..." /></SelectTrigger>
          <SelectContent>
            {isLoadingFirestoreCollections && <SelectItem value="loading" disabled>Cargando...</SelectItem>}
            {firestoreCollectionsError && <SelectItem value="error" disabled>Error: {firestoreCollectionsError}</SelectItem>}
            {!isLoadingFirestoreCollections && !firestoreCollectionsError && dynamicFirestoreCollections.length === 0 && <SelectItem value="no-collections" disabled>No hay colecciones</SelectItem>}
            {dynamicFirestoreCollections.map(col => (<SelectItem key={col.id} value={col.id}>{col.id}</SelectItem>))}
            <SelectItem value="other_collection">Otra (manual)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {firestoreTool.firestoreCollection === 'other_collection' && (
        <Card className="p-3 mt-2 space-y-2 bg-slate-50 dark:bg-slate-800 border-l-4 border-blue-400">
          <Label htmlFor="firestoreCustomCollectionName">Nombre Colección Personalizada (Existente)</Label>
          <Input id="firestoreCustomCollectionName" value={firestoreTool.firestoreCustomCollectionName || ""} onChange={(e) => handleToolConfigChange('firestoreCustomCollectionName', e.target.value)} placeholder="Nombre exacto de la colección"/>
        </Card>
      )}
      {/* Switch for using User ID as Document ID - applicable to get, update, and create_escalation */}
      {(action === 'get_document_by_id' || action === 'update_document_field' || action === 'create_escalation_record') && (
        <div className="flex items-center space-x-2 mt-2">
          <Switch 
            id="firestoreUseUserIdAsDocumentId" 
            checked={useUserId} 
            onCheckedChange={(checked) => handleToolConfigChange('firestoreUseUserIdAsDocumentId', checked)} 
          />
          <Label htmlFor="firestoreUseUserIdAsDocumentId">
            Usar ID de Usuario como ID del Documento
          </Label>
        </div>
      )}
      {showQueryField && ( <div><Label htmlFor="firestoreQueryField">Campo para Consultar</Label><Input id="firestoreQueryField" value={firestoreTool.firestoreQueryField || ""} onChange={(e) => handleToolConfigChange('firestoreQueryField', e.target.value)} placeholder="Ej: orderId, email"/></div> )}
      {/* Identifying parameter: For query_by_field (value) or for get_document_by_id/update_document_field (doc ID if not using user ID) */}
      {showIdentifyingParameter && ( /* This implies !useUserId for get/update actions due to showIdentifyingParameter definition */
        <div className="mt-2">
          <Label htmlFor="firestoreIdentifyingParameter">
            {action === 'query_by_field' ? "Parámetro para Valor de Consulta" :
             "Parámetro para ID del Documento (si no usa ID de Usuario)"}
          </Label>
          <Select 
            value={firestoreTool.firestoreIdentifyingParameter || ""} 
            onValueChange={(val) => handleToolConfigChange('firestoreIdentifyingParameter', val)}
          >
            <SelectTrigger><SelectValue placeholder="Seleccionar parámetro..."/></SelectTrigger>
            <SelectContent>
              {(editingTool.parameters || []).filter(p => p.name?.trim()).map(p => <SelectItem key={p.name} value={p.name}>{p.name} ({p.type})</SelectItem>)}
              {(!editingTool.parameters || !editingTool.parameters.some(p=>p.name?.trim())) && <SelectItem value="_placeholder_disabled_" disabled>Defina parámetros</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      )}

      {isCreateEscalationAction && (
        <Accordion type="single" collapsible className="w-full mt-3">
          <AccordionItem value="escalation-config">
            <AccordionTrigger>
              <h6 className="text-md font-semibold">Configuración de Registro de Escalación</h6>
            </AccordionTrigger>
            <AccordionContent>
              <div className="p-1 pt-0 space-y-3">
                <div className="space-y-1"><p className="text-sm font-medium">Campos Automáticos Fijos:</p><ul className="list-disc list-inside text-xs text-muted-foreground pl-4"><li><code className="bg-muted px-1 rounded">conversationId</code>: (Contexto actual)</li><li><code className="bg-muted px-1 rounded">userId</code>: (Usuario autenticado - usado como ID del documento)</li></ul>
                  <p className="text-xs text-muted-foreground">La colección destino se define arriba en *Colección Destino*.</p>
                </div>
                
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="default-values">
                    <AccordionTrigger>
                      <Label className="font-medium">Valores por Defecto para Escalación (Automáticos)</Label>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-xs text-muted-foreground mb-2">Estos pares clave-valor se incluirán automáticamente en cada registro de escalación. Pueden ser referenciados en el mapeo de campos usando *Valor por Defecto (Clave)*.</p>
                      {(escalationConfig.defaultEscalationValues || [] as DefaultEscalationValueItem[]).map((item, itemIndex) => (
                        <Card key={`default-value-${itemIndex}`} className="p-3 mt-2 space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                            <div className="flex-1">
                              <Label htmlFor={`default-key-${itemIndex}`} className="text-xs">Clave (Campo de Escalación)</Label>
                              <Select
                                value={item.firestoreField}
                                onValueChange={(val) => handleDefaultEscalationValueChange(itemIndex, 'firestoreField', val as keyof AssistantEscalation)}
                              >
                                <SelectTrigger><SelectValue placeholder="Seleccionar campo..." /></SelectTrigger>
                                <SelectContent>
                                  {assistantEscalationFields.map(field => (
                                    <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex-1">
                              <Label htmlFor={`default-valueSource-${itemIndex}`} className="text-xs">Fuente del Valor</Label>
                              <Select
                                value={item.valueSource}
                                onValueChange={(val) => handleDefaultEscalationValueChange(itemIndex, 'valueSource', val as DefaultEscalationValueItem['valueSource'])}
                              >
                                <SelectTrigger><SelectValue placeholder="Seleccionar fuente..." /></SelectTrigger>
                                <SelectContent>
                                  {defaultValueSourceTypes.map(type => (
                                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex-1">
                              <Label htmlFor={`default-value-${itemIndex}`} className="text-xs">Valor</Label>
                              {/* Since valueSource can now only be 'fixed_value', we always show an Input */}
                              <Input
                                id={`default-value-${itemIndex}`}
                                value={item.value}
                                onChange={(e) => handleDefaultEscalationValueChange(itemIndex, 'value', e.target.value)}
                                placeholder="Valor fijo" // Placeholder updated
                              />
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeDefaultEscalationValue(itemIndex)} className="self-end text-red-500 hover:text-red-700 md:col-start-4"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </Card>
                      ))}
                      <Button variant="outline" size="sm" className="mt-2 w-full" onClick={addDefaultEscalationValue}>Añadir Valor por Defecto</Button>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="field-mappings">
                    <AccordionTrigger>
                      <Label className="font-medium">Mapeo de Campos para Escalación</Label>
                    </AccordionTrigger>
                    <AccordionContent>
                      {(escalationConfig.escalationFieldMappings || []).map((mapping, index) => (
                        <Accordion type="single" collapsible className="w-full" key={index}>
                          <AccordionItem value={`mapping-${index}`}>
                            <AccordionTrigger>
                              <p className="text-sm font-semibold">Mapeo de Campo #{index + 1}</p>
                            </AccordionTrigger>
                            <AccordionContent>
                              <Card className="p-3 mt-2 space-y-2">
                                <div className="flex justify-between items-center">
                                  <p className="text-sm font-semibold">Mapeo de Campo #{index + 1}</p>
                                  <Button variant="ghost" size="icon" onClick={() => removeEscalationMapping(index)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
                                </div>
                                <div>
                                  <Label htmlFor={`escalation-targetField-${index}`}>Nombre del Campo Destino</Label>
                                  <Select
                                    value={mapping.firestoreField}
                                    onValueChange={(val) => handleEscalationMappingChange(index, 'firestoreField', val as keyof AssistantEscalation)}
                                  >
                                    <SelectTrigger><SelectValue placeholder="Seleccionar campo destino..." /></SelectTrigger>
                                    <SelectContent>
                                      {assistantEscalationFields.map(field => (
                                        <SelectItem key={`target-${index}-${field.value}`} value={field.value}>{field.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div><Label htmlFor={`escalation-targetPath-${index}`}>Ruta del Campo Destino (Opcional)</Label><Input id={`escalation-targetPath-${index}`} value={mapping.targetPath || ""} onChange={(e) => handleEscalationMappingChange(index, 'targetPath', e.target.value)} placeholder="Ej: details.orderId (para anidar)"/></div>
                                <div><Label htmlFor={`escalation-sourceType-${index}`}>Tipo de Origen</Label>
                                  <Select value={mapping.sourceType} onValueChange={(val) => handleEscalationMappingChange(index, 'sourceType', val as EscalationFieldMapping['sourceType'])}>
                                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sourceTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div><Label htmlFor={`escalation-sourceValue-${index}`}>Nombre/Valor del Origen</Label>
                                  {mapping.sourceType === 'parameter' ? (
                                    <Select value={mapping.sourceValueOrName} onValueChange={(val) => handleEscalationMappingChange(index, 'sourceValueOrName', val)}>
                                      <SelectTrigger><SelectValue placeholder="Seleccionar parámetro..."/></SelectTrigger><SelectContent>{(editingTool.parameters || []).filter(p => p.name?.trim()).map(p => <SelectItem key={`esc-param-${index}-${p.name}`} value={p.name}>{p.name} ({p.type})</SelectItem>)}{(!editingTool.parameters || !editingTool.parameters.some(p=>p.name?.trim())) && <SelectItem value="_placeholder_disabled_" disabled>Defina parámetros</SelectItem>}</SelectContent>
                                    </Select>
                                  ) : mapping.sourceType === 'ai_summary' ? (
                                    <Textarea
                                      id={`escalation-sourceValue-${index}`}
                                      value={mapping.sourceValueOrName}
                                      onChange={(e) => handleEscalationMappingChange(index, 'sourceValueOrName', e.target.value)}
                                      placeholder="Escriba el prompt para que la IA genere este valor. Ej: Resume la razón por la cual el usuario necesita ayuda con su pedido."
                                      rows={3}
                                    />
                                  ) : (
                                    <Input
                                      id={`escalation-sourceValue-${index}`}
                                      value={mapping.sourceValueOrName}
                                      onChange={(e) => handleEscalationMappingChange(index, 'sourceValueOrName', e.target.value)}
                                      placeholder="Valor"
                                    />
                                  )}
                                </div>
                              </Card>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      ))}
                      <Button variant="outline" size="sm" className="mt-2 w-full" onClick={addEscalationMapping}>Añadir Mapeo de Campo</Button>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {isUpdateAction && !isCreateEscalationAction && (
        <Accordion type="single" collapsible className="w-full mt-3">
          <AccordionItem value="update-config">
            <AccordionTrigger>
              <h6 className="text-md font-semibold">Configuración de Actualización de Documento</h6>
            </AccordionTrigger>
            <AccordionContent>
              <div className="p-1 pt-0">
                <div className="flex items-center justify-between mb-2"><Label htmlFor="firestoreUpdateMode" className="font-medium">Modo de Actualización</Label><div className="flex items-center space-x-2"><span className="text-xs text-muted-foreground">{updateMode === 'simple' ? 'Simple' : 'Avanzado (Recuperar y Mapear)'}</span><Switch id="firestoreUpdateMode" checked={updateMode === 'recover_and_map'} onCheckedChange={(checked) => handleToolConfigChange('firestoreUpdateMode', checked ? 'recover_and_map' : 'simple')}/></div></div>
                {updateMode === 'simple' && ( <><div><Label htmlFor="firestoreFieldToUpdatePath">Ruta del Campo a Actualizar</Label><Input id="firestoreFieldToUpdatePath" value={firestoreTool.firestoreFieldToUpdatePath || ""} onChange={(e) => handleToolConfigChange('firestoreFieldToUpdatePath', e.target.value)} placeholder="Ej: status, userProfile.age"/></div><div className="mt-2"><Label htmlFor="firestoreFieldValueParameter">Parámetro con el Nuevo Valor</Label><Select value={firestoreTool.firestoreFieldValueParameter || ""} onValueChange={(val) => handleToolConfigChange('firestoreFieldValueParameter', val)}><SelectTrigger><SelectValue placeholder="Seleccionar..."/></SelectTrigger><SelectContent>{(editingTool.parameters || []).filter(p => p.name?.trim()).map(p => <SelectItem key={`val-param-${p.name}`} value={p.name}>{p.name} ({p.type})</SelectItem>)}{(!editingTool.parameters || !editingTool.parameters.some(p=>p.name?.trim())) && <SelectItem value="_placeholder_disabled_" disabled>Defina parámetros</SelectItem>}</SelectContent></Select></div></> )}
                {updateMode === 'recover_and_map' && ( <div className="space-y-3 mt-2"><div><Label htmlFor="firestoreFieldsToRecover">Campos a Recuperar (separados por coma)</Label><Textarea id="firestoreFieldsToRecover" value={localFirestoreFieldsToRecoverText} onChange={(e) => { setLocalFirestoreFieldsToRecoverText(e.target.value); handleToolConfigChange('firestoreFieldsToRecover', e.target.value.split(',').map(s => s.trim()).filter(s => s)); }} placeholder="Ej: userInfo.name, lastLogin" rows={2}/></div><div><Label className="font-medium">Mapeo de Campos para Actualización</Label>{(firestoreTool.firestoreFieldMappings || []).map((mapping, mapIndex) => ( <Card key={mapIndex} className="p-3 mt-2 space-y-2"><div className="flex justify-between items-center"><p className="text-xs font-semibold">Mapeo #{mapIndex + 1}</p><Button variant="ghost" size="icon" onClick={() => { const updatedMappings = (firestoreTool.firestoreFieldMappings || []).filter((_, i) => i !== mapIndex); handleToolConfigChange('firestoreFieldMappings', updatedMappings); }} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button></div><div><Label htmlFor={`mapSourceType-${mapIndex}`}>Tipo de Origen</Label><Select value={mapping.sourceType || 'parameter'} onValueChange={(val) => { const updatedMappings = (firestoreTool.firestoreFieldMappings || []).map((m, i) => i === mapIndex ? { ...m, sourceType: val as 'recovered' | 'parameter', sourceName: '' } : m); handleToolConfigChange('firestoreFieldMappings', updatedMappings);}}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="parameter">Parámetro de Herramienta</SelectItem><SelectItem value="recovered">Campo Recuperado</SelectItem></SelectContent></Select></div><div><Label htmlFor={`mapSourceName-${mapIndex}`}>Nombre del Origen</Label><Select value={mapping.sourceName || ''} onValueChange={(val) => { const updatedMappings = (firestoreTool.firestoreFieldMappings || []).map((m, i) => i === mapIndex ? { ...m, sourceName: val } : m); handleToolConfigChange('firestoreFieldMappings', updatedMappings);}}><SelectTrigger><SelectValue placeholder="Seleccionar..."/></SelectTrigger><SelectContent>{mapping.sourceType === 'recovered' && recoveredFieldNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}{mapping.sourceType === 'recovered' && recoveredFieldNames.length === 0 && <SelectItem value="_placeholder_disabled_" disabled>Defina campos a recuperar</SelectItem>}{(mapping.sourceType === 'parameter' && (editingTool.parameters || []).filter(p => p.name?.trim()).map(p => <SelectItem key={p.name} value={p.name}>{p.name} ({p.type})</SelectItem>))}{(mapping.sourceType === 'parameter' && (!editingTool.parameters || !editingTool.parameters.some(p=>p.name?.trim()))) && <SelectItem value="_placeholder_disabled_" disabled>Defina parámetros</SelectItem>}</SelectContent></Select></div><div><Label htmlFor={`mapTargetPath-${mapIndex}`}>Ruta del Campo Destino</Label><Input id={`mapTargetPath-${mapIndex}`} value={mapping.targetPath || ''} onChange={(e) => { const updatedMappings = (firestoreTool.firestoreFieldMappings || []).map((m, i) => i === mapIndex ? { ...m, targetPath: e.target.value } : m); handleToolConfigChange('firestoreFieldMappings', updatedMappings);}} placeholder="Ej: profile.name"/></div></Card> ))}<Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => { const newMapping = { sourceName: '', sourceType: 'parameter', targetPath: '' }; handleToolConfigChange('firestoreFieldMappings', [...(firestoreTool.firestoreFieldMappings || []), newMapping]);}}>Añadir Mapeo</Button></div></div> )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
      {action !== 'update_document_field' && !isCreateEscalationAction && ( <div className="mt-3"><Label htmlFor="firestoreExcludedFields">Campos a Excluir del Resultado (separados por coma)</Label><Textarea id="firestoreExcludedFields" value={localFirestoreExcludedFieldsText} onChange={(e) => { setLocalFirestoreExcludedFieldsText(e.target.value); handleToolConfigChange('firestoreExcludedFields', e.target.value.split(',').map(s => s.trim()).filter(s => s)); }} placeholder="Ej: userAddress, paymentDetails.card" rows={2}/></div> )}
    </Card>
  );
}