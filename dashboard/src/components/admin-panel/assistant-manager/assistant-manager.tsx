"use client"

import { useState, useEffect, ChangeEvent, useMemo, useRef, useCallback } from "react";
import { doc, getDoc, setDoc, collection, writeBatch } from "firebase/firestore";
import { db } from "@/config/firebase";
import { useDebounce } from "@/hooks/use-debounce";
import { UserAuth } from "@/context/auth-context"; // Import the auth context
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import GeneralConfigTab from "./general-config-tab/general-config-tab";
import ApiKeysTab from "./api-keys-tab/api-keys-tab";
import DefaultToolsTab from "./default-tools-tab/default-tools-tab";
import { useIsMobile } from "@/hooks/use-mobile";
import { Settings, ListChecks, Wrench, LayoutDashboard, Save, AlertTriangle, KeyRound } from "lucide-react";
import {
  AssistantTool as ImportedAssistantTool,
  FirestoreAssistantTool,
  McpAssistantTool,
  RtdbAssistantTool,
  ComponentUseAssistantTool,
  ToolParameter,
  AssistantMainSettings, // Added
  CustomContextVariable, // Added
  AssistantConfigData // Added import
} from '@/components/assistant/assistant-types';

// New interfaces for DisplayTool configuration
export interface DisplayToolConfigItem {
  id: string;
  label: string;
  aiResponsePath: string; // e.g., "order.status.text" or "userInfo.name"
  displayType: 'text' | 'badge' | 'progress' | 'currency' | 'list' | 'key_value_pairs' | 'order_picker';
  isVisible: boolean;
  // For progress
  progressValuePath?: string; // Path to the progress value (0-100)
  // For list
  listItemsPath?: string; // Path to the array of items in AI response
  listItemNamePath?: string; // Path to name/label within each list item
  listItemValuePath?: string; // Path to value within each list item (optional)
  listItemSubTextPath?: string; // Path to sub-text within each list item (optional)
  // For key_value_pairs
  keyValuePairsPath?: string; // Path to an object or array of {key, value} in AI response
  // General styling/options
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline'; // Aligned with shadcn/ui Badge variants
  trueConditionPath?: string; // Path to a boolean in AI response, if true, display this item
  falseConditionPath?: string; // Path to a boolean in AI response, if false, display this item
  // For order_picker
  userIdPath?: string; // Path to the user ID for fetching orders
}

export interface DisplayToolConfig {
  isEnabled: boolean;
  title: string;
  items: DisplayToolConfigItem[];
}

export type AssistantTool = ImportedAssistantTool;
export type FirestoreAction = FirestoreAssistantTool['firestoreAction'];
export type FirestoreCollection = FirestoreAssistantTool['firestoreCollection'];

// Local AssistantRuleItem and AssistantBehavioralRules removed to use canonical versions from assistant-types.ts

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

// Local AssistantConfigData removed to use canonical version from assistant-types.ts

const generateId = () => Math.random().toString(36).substr(2, 9);

function removeUndefinedValues(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedValues).filter(item => item !== undefined);
  const newObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== undefined) {
        const cleanedValue = removeUndefinedValues(value);
        if (cleanedValue !== undefined) newObj[key] = cleanedValue;
      }
    }
  }
  return newObj;
}

export default function AssistantManager() {
  const { user, loading: authLoading, userClaims, forceRefreshUser: refreshClaims } = UserAuth(); // Get user, claims, and auth loading state

  const canManageAssistant = userClaims && (userClaims.admin === true || userClaims.owner === true);
  const [assistantConfigData, setAssistantConfigData] = useState<AssistantConfigData | null>(null);
  const [isLoadingAssistantConfig, setIsLoadingAssistantConfig] = useState(true);
  const [assistantConfigError, setAssistantConfigError] = useState<string | null>(null);
  const [isSavingAssistantConfig, setIsSavingAssistantConfig] = useState(false);
  const [isInitializingConfig, setIsInitializingConfig] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [editingTool, setEditingTool] = useState<Partial<AssistantTool> | null>(null);
  const [isAddingNewTool, setIsAddingNewTool] = useState(false);
  // Removed "ConfigurableUIDisplay" as it's getting its own tab/config
  const [availableToolComponents, setAvailableToolComponents] = useState<string[]>([]); 

  const { toast } = useToast();
  const isMobile = useIsMobile();
  const hasFetchedInitialDataRef = useRef(false); // Guard for initial data fetch

  const defaultSystemVariables: CustomContextVariable[] = useMemo(() => [
    { id: "7264a37d-2238-4c44-8908-7a771fb941af", name: "{{USER_ID}}", value: "ID del usuario autenticado", description: "Reemplazado automáticamente con el ID del usuario actual.", isSystemVariable: true, isNameEditable: false },
    { id: "f5d1bba8-3ffb-45b6-9afc-7e2bf2cdf3e1", name: "{{CONVERSATION_ID}}", value: "ID de la conversación actual", description: "Reemplazado automáticamente con el ID de la conversación en curso.", isSystemVariable: true, isNameEditable: false },
    { id: "c164e375-21fe-4cfd-95ac-356ef989fc4a", name: "{{ORDER_ID}}", value: "ID de la orden más reciente o relevante", description: "Reemplazado automáticamente con el ID de la orden (si aplica en el contexto).", isSystemVariable: true, isNameEditable: false },
    { id: "c84df353-2488-4c5c-8306-b1a6e4919acd", name: "{{RESTAURANT_ID}}", value: "ID del restaurante asociado (ej: de una orden)", description: "Reemplazado automáticamente con el ID del restaurante (si aplica en el contexto, ej: desde una orden).", isSystemVariable: true, isNameEditable: false }
  ], []);

  const textModels = useMemo(() => availableModels.filter(m => m.capabilities?.includes("text") || m.capabilities?.includes("chat")), [availableModels]);
  const sttModels = useMemo(() => availableModels.filter(m => m.capabilities?.includes("stt")), [availableModels]);
  const imageAnalysisModels = useMemo(() => availableModels.filter(m => m.capabilities?.includes("image_analysis")), [availableModels]);
  const openAiImageAnalysisModels = useMemo(() => availableModels.filter(m => m.capabilities?.includes("image_analysis") && m.provider.toLowerCase().includes("openai")), [availableModels]);
  const googleImageAnalysisModels = useMemo(() => availableModels.filter(m => m.capabilities?.includes("image_analysis") && (m.provider.toLowerCase().includes("google") || m.provider.toLowerCase().includes("gemini"))), [availableModels]);

  const fetchAndPrepareData = useCallback(async () => {
    if (!user) return;

    try {
      await refreshClaims();
    } catch (error) {
      console.error("Error forcing token refresh:", error);
      setAssistantConfigError("Failed to verify user permissions.");
      setIsLoadingAssistantConfig(false);
      return;
    }

    setIsLoadingAssistantConfig(true);
    setIsLoadingModels(true);
    setAssistantConfigError(null);
    let configError = null;

    try {
      const settingsCollectionRef = collection(db, "assistant-settings");
      const requiredDocs = ['apiKeys', 'generalConfig', 'defaultToolsConfig'];
      const docRefs = requiredDocs.map(id => doc(settingsCollectionRef, id));
      const docSnaps = await Promise.all(docRefs.map(getDoc));

      const docsData: { [key: string]: any } = {};
      let allDocsExist = true;
      docSnaps.forEach((docSnap, index) => {
        if (docSnap.exists()) {
          docsData[requiredDocs[index]] = docSnap.data();
        } else {
          allDocsExist = false;
        }
      });

      if (!allDocsExist) {
        setAssistantConfigError("Configuración incompleta. Por favor, inicialice la configuración.");
        setIsLoadingAssistantConfig(false);
        setIsLoadingModels(false);
        return;
      }

      const combinedData: AssistantConfigData = {
        ...docsData['generalConfig'],
        ...docsData['defaultToolsConfig'],
        apiKeys: docsData['apiKeys'],
      };
      
      let envVarsToUse: CustomContextVariable[] = docsData['generalConfig'].environmentVariables || [];
      if (envVarsToUse.length === 0) {
        envVarsToUse = defaultSystemVariables;
      } else {
        defaultSystemVariables.forEach(defaultVar => {
          if (!envVarsToUse.find(existingVar => existingVar.id === defaultVar.id || existingVar.name === defaultVar.name)) {
            envVarsToUse.push(defaultVar);
          }
        });
      }
      combinedData.environmentVariables = envVarsToUse;

      setAssistantConfigData(combinedData);

    } catch (error) {
      console.error("Error fetching assistant config:", error);
      console.error("Full Firestore error object:", JSON.stringify(error, null, 2));
      const errorMessage = error instanceof Error ? error.message : "No se pudo cargar la configuración.";
      setAssistantConfigError(errorMessage);
      toast({ title: "Error de Configuración", description: errorMessage, variant: "destructive" });
      configError = errorMessage;
    } finally {
      setIsLoadingAssistantConfig(false);
    }

    if (!configError) {
      try {
        const response = await fetch('/api/admin/available-models');
        if (!response.ok) throw new Error(`Error ${response.status} al cargar modelos`);
        const models = await response.json();
        setAvailableModels(models);
      } catch (error) {
        console.error("Error fetching available models:", error);
        const modelErrorMessage = error instanceof Error ? error.message : "No se pudieron cargar los modelos.";
        setAssistantConfigError(prev => prev ? `${prev}\n${modelErrorMessage}` : modelErrorMessage);
        toast({ title: "Error al Cargar Modelos", description: modelErrorMessage, variant: "destructive" });
      } finally {
        setIsLoadingModels(false);
      }
    }
  }, [user, defaultSystemVariables, toast, refreshClaims]);

  useEffect(() => {
    if (!user || hasFetchedInitialDataRef.current) return;
    hasFetchedInitialDataRef.current = true;
    fetchAndPrepareData();
  }, [user, fetchAndPrepareData]);

  // Debounce the assistantConfigData state for saving
  const debouncedAssistantConfigData = useDebounce(assistantConfigData, 500);

  const handleSaveAssistantConfig = useCallback(async (
    configToSave: AssistantConfigData | null = assistantConfigData,
    options: { showSuccessToast?: boolean } = {}
  ) => {
    const { showSuccessToast = false } = options;
    setIsSavingAssistantConfig(true);
    setAssistantConfigError(null);
    if (!configToSave) {
      toast({ title: "Error", description: "No hay datos de configuración para guardar.", variant: "destructive" });
      setIsSavingAssistantConfig(false);
      return;
    }

    try {
      const batch = writeBatch(db);
      const settingsCollectionRef = collection(db, "assistant-settings");

      const { tools, displayToolConfig, environmentVariables, apiKeys, ...generalConfig } = configToSave;

      const generalConfigDocRef = doc(settingsCollectionRef, 'generalConfig');
      batch.set(generalConfigDocRef, removeUndefinedValues(JSON.parse(JSON.stringify({ ...generalConfig, environmentVariables }))), { merge: true });

      const toolsConfigDocRef = doc(settingsCollectionRef, 'defaultToolsConfig');
      batch.set(toolsConfigDocRef, removeUndefinedValues(JSON.parse(JSON.stringify({ tools, displayToolConfig }))), { merge: true });
      
      if (apiKeys) {
        const apiKeysDocRef = doc(settingsCollectionRef, 'apiKeys');
        batch.set(apiKeysDocRef, removeUndefinedValues(JSON.parse(JSON.stringify(apiKeys))), { merge: true });
      }

      await batch.commit();

      if (showSuccessToast) {
        toast({ title: "Éxito", description: "La configuración del asistente se ha guardado." });
      }
    } catch (error) {
      console.error("Error saving assistant config:", error);
      const errorMessage = error instanceof Error ? error.message : "No se pudo guardar la configuración.";
      setAssistantConfigError(errorMessage);
      toast({ title: "Error al Guardar", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSavingAssistantConfig(false);
    }
  }, [toast, assistantConfigData]);

  // Effect to save debounced config data
  useEffect(() => {
    // Only save if the debounced data is not null and is different from the initial fetch data
    // This prevents saving immediately on load
    // Only save if user is authenticated and data has been fetched
    if (user && debouncedAssistantConfigData && hasFetchedInitialDataRef.current) {
      handleSaveAssistantConfig(debouncedAssistantConfigData);
    }
  }, [debouncedAssistantConfigData, handleSaveAssistantConfig, user]); // Add user dependency

  const handleAddNewTool = () => {
    const newTool: FirestoreAssistantTool = {
      id: generateId(),
      name: "Nueva Herramienta",
      description: "",
      type: 'firestore',
      enabled: true,
      requiresPii: false,
      isEscalationTool: false,
      parameters: [],
      firestoreAction: 'query_by_field',
      firestoreCollection: 'users',
      firestoreCustomCollectionName: "",
      firestoreIdentifyingParameter: "",
      firestoreUseUserIdAsDocumentId: false,
      firestoreQueryField: "",
      firestoreExcludedFields: [],
      firestoreFieldsToRecover: [],
      firestoreFieldMappings: [],
      firestoreUpdateMode: 'simple',
      firestoreFieldToUpdatePath: '',
      firestoreFieldValueParameter: '',
      firestoreEscalationConfig: {
        escalationDocumentIdSource: 'user_id',
        escalationFieldMappings: [],
        defaultEscalationValues: [],
      }
    };

    setAssistantConfigData((prev: AssistantConfigData | null) => {
      if (!prev) return null;
      const updatedTools = [...(prev.tools || []), newTool];
      return { ...prev, tools: updatedTools };
    });

    setEditingTool(newTool);
    setIsAddingNewTool(true);
  };

  const handleSaveTool = () => {
    if (!editingTool || !editingTool.name || !editingTool.type) {
      toast({ title: "Error", description: "Nombre y tipo de herramienta son requeridos.", variant: "destructive" });
      return;
    }

    let fullToolToSave: AssistantTool;

    const baseProperties = {
      id: editingTool.id || generateId(),
      name: editingTool.name!,
      description: editingTool.description || "",
      enabled: typeof editingTool.enabled === 'boolean' ? editingTool.enabled : true,
      requiresPii: typeof editingTool.requiresPii === 'boolean' ? editingTool.requiresPii : false,
      isEscalationTool: typeof editingTool.isEscalationTool === 'boolean' ? editingTool.isEscalationTool : false, // Add isEscalationTool
      parameters: editingTool.parameters || [],
      associatedIntent: editingTool.associatedIntent || undefined,
    };

    switch (editingTool.type) {
      case 'firestore':
        const firestoreToolPartial = editingTool as Partial<FirestoreAssistantTool>;
        const firestoreExcludedFieldsValue = firestoreToolPartial.firestoreExcludedFields; // This can be string | string[] | undefined
        let firestoreExcludedFieldsArray: string[] = [];

        if (typeof firestoreExcludedFieldsValue === 'string') {
          const stringValue = firestoreExcludedFieldsValue as string; // Use type assertion
          const trimmedStringValue = stringValue.trim();
          if (trimmedStringValue !== "") {
            firestoreExcludedFieldsArray = trimmedStringValue
              .split(',')
              .map((field: string) => field.trim())
              .filter((field: string) => field !== "");
          }
        } else if (Array.isArray(firestoreExcludedFieldsValue)) {
          firestoreExcludedFieldsArray = firestoreExcludedFieldsValue
            .map((field: any) => String(field).trim())
            .filter((field: string) => field !== "");
        }
        // If firestoreExcludedFieldsValue is undefined, firestoreExcludedFieldsArray remains []
        
        fullToolToSave = {
          ...baseProperties,
          type: 'firestore',
          firestoreAction: firestoreToolPartial.firestoreAction || 'query_by_field',
          firestoreCollection: firestoreToolPartial.firestoreCollection || 'users',
          firestoreCustomCollectionName: firestoreToolPartial.firestoreCustomCollectionName || "",
          firestoreQueryField: firestoreToolPartial.firestoreAction === 'query_by_field' ? firestoreToolPartial.firestoreQueryField || "" : undefined,
          firestoreIdentifyingParameter: firestoreToolPartial.firestoreIdentifyingParameter || "",
          firestoreUseUserIdAsDocumentId: typeof firestoreToolPartial.firestoreUseUserIdAsDocumentId === 'boolean' ? firestoreToolPartial.firestoreUseUserIdAsDocumentId : false,
          firestoreFieldToUpdatePath: firestoreToolPartial.firestoreAction === 'update_document_field' ? firestoreToolPartial.firestoreFieldToUpdatePath || "" : undefined,
          firestoreFieldValueParameter: firestoreToolPartial.firestoreAction === 'update_document_field' && firestoreToolPartial.firestoreUpdateMode !== 'recover_and_map' 
            ? firestoreToolPartial.firestoreFieldValueParameter || "" 
            : undefined,
          firestoreExcludedFields: firestoreExcludedFieldsArray,
          
          // Config for 'create_escalation_record'
          firestoreEscalationConfig: firestoreToolPartial.firestoreAction === 'create_escalation_record' 
            ? firestoreToolPartial.firestoreEscalationConfig // This is the complete object from the state
            : undefined,
            
          // Config for 'update_document_field' (recover_and_map mode)
          firestoreUpdateMode: firestoreToolPartial.firestoreAction === 'update_document_field'
            ? firestoreToolPartial.firestoreUpdateMode || 'simple'
            : undefined,
          firestoreFieldsToRecover: firestoreToolPartial.firestoreAction === 'update_document_field' && firestoreToolPartial.firestoreUpdateMode === 'recover_and_map'
            ? (firestoreToolPartial.firestoreFieldsToRecover || []).map((s: any) => String(s).trim()).filter((s: string) => s)
            : undefined,
          firestoreFieldMappings: firestoreToolPartial.firestoreAction === 'update_document_field' && firestoreToolPartial.firestoreUpdateMode === 'recover_and_map'
            ? firestoreToolPartial.firestoreFieldMappings || [] // This is the array of mapping objects
            : undefined,
        };
        break;
      case 'mcp':
        fullToolToSave = {
          ...baseProperties,
          type: 'mcp',
          mcpConfig: (editingTool as Partial<McpAssistantTool>).mcpConfig ? {
            url: (editingTool as Partial<McpAssistantTool>).mcpConfig?.url || "",
            method: (editingTool as Partial<McpAssistantTool>).mcpConfig?.method || 'POST',
            headers: (editingTool as Partial<McpAssistantTool>).mcpConfig?.headers || {},
          } : { url: "", method: 'POST', headers: {} },
        };
        break;
      case 'rtdb':
        const rtdbToolPartial = editingTool as Partial<RtdbAssistantTool>;
        const rtdbExcludedFieldsValue = rtdbToolPartial.rtdbExcludedFields; // This can be string | string[] | undefined
        let rtdbExcludedFieldsArray: string[] = [];

        if (typeof rtdbExcludedFieldsValue === 'string') {
          const stringValue = rtdbExcludedFieldsValue as string; // Use type assertion
          const trimmedStringValue = stringValue.trim();
          if (trimmedStringValue !== "") {
            rtdbExcludedFieldsArray = trimmedStringValue
              .split(',')
              .map((field: string) => field.trim())
              .filter((field: string) => field !== "");
          }
        } else if (Array.isArray(rtdbExcludedFieldsValue)) {
          // Ensure all elements are strings and trim them
          rtdbExcludedFieldsArray = rtdbExcludedFieldsValue
            .map((field: any) => String(field).trim()) // Convert to string first, then trim
            .filter((field: string) => field !== "");
        }
        // If rtdbExcludedFieldsValue is undefined, rtdbExcludedFieldsArray remains []

        fullToolToSave = {
          ...baseProperties,
          type: 'rtdb',
          rtdbPath: rtdbToolPartial.rtdbPath || "",
          rtdbDynamicPathParameter: rtdbToolPartial.rtdbDynamicPathParameter || "",
          rtdbExcludedFields: rtdbExcludedFieldsArray,
        };
        break;
      case 'component_use_tool':
        fullToolToSave = {
          ...baseProperties,
          type: 'component_use_tool',
          componentName: (editingTool as Partial<ComponentUseAssistantTool>).componentName || "ConfigurableUIDisplay",
          componentDisplayConfig: (editingTool as Partial<ComponentUseAssistantTool>).componentDisplayConfig || [],
        };
        break;
      default:
        toast({ title: "Error", description: "Tipo de herramienta no reconocido al guardar.", variant: "destructive" });
        return;
    }
    
    const cleanedTool = removeUndefinedValues(JSON.parse(JSON.stringify(fullToolToSave)));

    setAssistantConfigData((prev: AssistantConfigData | null) => {
      if (!prev) return null;
      const newTools = [...(prev.tools || [])];
      const existingIndex = newTools.findIndex((t: AssistantTool) => t.id === cleanedTool.id);
      if (existingIndex > -1) {
        newTools[existingIndex] = cleanedTool as AssistantTool;
      } else {
        newTools.push(cleanedTool as AssistantTool);
      }
      return { ...prev, tools: newTools };
    });
    setEditingTool(null);
    setIsAddingNewTool(false);
    // toast({ title: "Herramienta Guardada Localmente", description: `"${cleanedTool.name}" guardada. Presiona "Guardar Configuración" para persistir.`});
  };

  const handleEditTool = (tool: AssistantTool) => { setEditingTool({ ...tool }); setIsAddingNewTool(false); };
  
  const handleDeleteTool = (toolId: string) => {
    setAssistantConfigData((prev: AssistantConfigData | null) => prev ? { ...prev, tools: (prev.tools || []).filter((t: AssistantTool) => t.id !== toolId) } : null);
  };

  const handleToolInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editingTool) return;
    const { name, value } = e.target;
    if (e.target.type === 'checkbox') {
      setEditingTool((prev: Partial<AssistantTool> | null) => prev ? { ...prev, [name]: (e.target as HTMLInputElement).checked } : null);
    } else {
      setEditingTool((prev: Partial<AssistantTool> | null) => prev ? { ...prev, [name]: value } : null);
    }
  };
  
  const handleToolConfigChange = (fieldName: string, value: any) => {
    if (!editingTool) return;

    setEditingTool((prev: Partial<AssistantTool> | null) => {
        if (!prev) return null;
        
        let newToolState: Partial<AssistantTool> = { ...prev };

        if (fieldName === 'type') {
            const newType = value as AssistantTool['type'];
            newToolState = {
                id: prev.id,
                name: prev.name,
                description: prev.description,
                enabled: prev.enabled,
                requiresPii: prev.requiresPii,
                parameters: prev.parameters,
                associatedIntent: prev.associatedIntent,
                type: newType,
            };

            switch (newType) {
                case 'firestore':
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreAction = 'query_by_field';
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreCollection = 'users';
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreCustomCollectionName = "";
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreQueryField = "";
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreIdentifyingParameter = "";
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreUseUserIdAsDocumentId = false;
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreFieldToUpdatePath = "";
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreFieldValueParameter = "";
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreExcludedFields = [];
                    break;
                case 'mcp':
                    (newToolState as Partial<McpAssistantTool>).mcpConfig = { url: "", method: 'POST', headers: {} };
                    break;
                case 'rtdb':
                    (newToolState as Partial<RtdbAssistantTool>).rtdbPath = "";
                    (newToolState as Partial<RtdbAssistantTool>).rtdbDynamicPathParameter = "";
                    (newToolState as Partial<RtdbAssistantTool>).rtdbExcludedFields = [];
                    break;
                case 'component_use_tool':
                    (newToolState as Partial<ComponentUseAssistantTool>).componentName = "ConfigurableUIDisplay";
                    (newToolState as Partial<ComponentUseAssistantTool>).componentDisplayConfig = [];
                    break;
            }
        } else {
            if (fieldName === 'requiresPii') {
                (newToolState as Partial<AssistantTool>).requiresPii = value as boolean;
            } else {
                (newToolState as any)[fieldName] = value;
            }

            if (newToolState.type === 'firestore') {
                if (fieldName === 'firestoreCollection' && value !== 'other_collection') {
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreCustomCollectionName = "";
                }
                if (fieldName === 'firestoreUseUserIdAsDocumentId' && value === true) {
                    (newToolState as Partial<FirestoreAssistantTool>).firestoreIdentifyingParameter = "";
                }
                if (fieldName === 'firestoreAction') {
                    const currentAction = (newToolState as Partial<FirestoreAssistantTool>).firestoreAction;
                    if (currentAction !== 'query_by_field') {
                        (newToolState as Partial<FirestoreAssistantTool>).firestoreQueryField = undefined;
                    }
                    if (currentAction !== 'update_document_field') {
                        (newToolState as Partial<FirestoreAssistantTool>).firestoreFieldToUpdatePath = undefined;
                        (newToolState as Partial<FirestoreAssistantTool>).firestoreFieldValueParameter = undefined;
                    }
                    if (currentAction !== 'query_by_field' && !(newToolState as Partial<FirestoreAssistantTool>).firestoreUseUserIdAsDocumentId) {
                    }
                }
            }
        }
        return newToolState;
    });
  };

  const handleToolTypeChange = (value: AssistantTool['type']) => { 
    if (editingTool) handleToolConfigChange('type', value); 
  };
  
  const handleToolEnabledChange = (toolId: string, checked: boolean) => {
    setAssistantConfigData((prev: AssistantConfigData | null) => prev ? { ...prev, tools: (prev.tools || []).map((tool: AssistantTool) => tool.id === toolId ? { ...tool, enabled: checked } : tool) } : null);
  };

  // Revised handleToolConfigChange in assistant-manager.tsx
  // const handleToolConfigChange = (fieldName: string, value: any) => {
  //   if (!editingTool) return;
  //   setEditingTool(prevTool => {
  //     if (!prevTool) return null;
  
  //     let newToolState = { ...prevTool };
  
  //     if (fieldName === 'type') {
  //       const newType = value as AssistantTool['type'];
  //       newToolState = {
  //         id: prevTool.id,
  //         name: prevTool.name,
  //         description: prevTool.description,
  //         enabled: prevTool.enabled,
  //         requiresPii: prevTool.requiresPii,
  //         isEscalationTool: prevTool.isEscalationTool,
  //         parameters: prevTool.parameters,
  //         associatedIntent: prevTool.associatedIntent,
  //         type: newType,
  //       } as Partial<AssistantTool>;
  
  //       switch (newType) {
  //         case 'firestore':
  //           (newToolState as Partial<FirestoreAssistantTool>).firestoreAction = 'query_by_field';
  //           (newToolState as Partial<FirestoreAssistantTool>).firestoreCollection = 'users';
  //           // ... other firestore defaults
  //           break;
  //         // ... other cases
  //       }
  //     } else if (fieldName === 'firestoreEscalationConfig') {
  //       // Directly replace the entire firestoreEscalationConfig object
  //       (newToolState as Partial<FirestoreAssistantTool>).firestoreEscalationConfig = value;
  //     } else {
  //       (newToolState as any)[fieldName] = value;
  //     }
  
  //     // Special handling for dependent fields (ensure this doesn't unintentionally reset firestoreEscalationConfig)
  //     if (newToolState.type === 'firestore' && fieldName !== 'firestoreEscalationConfig') {
  //       if (fieldName === 'firestoreCollection' && value !== 'other_collection') {
  //         (newToolState as Partial<FirestoreAssistantTool>).firestoreCustomCollectionName = "";
  //       }
  //       if (fieldName === 'firestoreUseUserIdAsDocumentId' && value === true) {
  //         (newToolState as Partial<FirestoreAssistantTool>).firestoreIdentifyingParameter = "";
  //       }
  //       if (fieldName === 'firestoreAction') {
  //         const currentAction = (newToolState as Partial<FirestoreAssistantTool>).firestoreAction;
  //         if (currentAction !== 'query_by_field') {
  //           (newToolState as Partial<FirestoreAssistantTool>).firestoreQueryField = undefined;
  //         }
  //         if (currentAction !== 'update_document_field') {
  //           (newToolState as Partial<FirestoreAssistantTool>).firestoreFieldToUpdatePath = undefined;
  //           (newToolState as Partial<FirestoreAssistantTool>).firestoreFieldValueParameter = undefined;
  //         }
  //         // If action changes away from create_escalation_record, clear its specific config
  //         // This was missing and could be a source of stale data if not handled.
  //         // However, the primary issue is ensuring firestoreEscalationConfig is updated correctly.
  //         // The current approach of replacing the whole object when fieldName is 'firestoreEscalationConfig' is more direct.
  //       }
  //     }
  //     return newToolState;
  //   });
  // };
  // End of revised handleToolConfigChange

  const addToolParameter = () => {
    if (!editingTool) return;
    setEditingTool((prev: Partial<AssistantTool> | null) => prev ? { ...prev, parameters: [...(prev.parameters || []), { name: "", type: 'string', description: "", required: false, enum: [] }] } : null);
  };

  const handleToolParameterChange = (paramIndex: number, field: string | number | symbol, value: string | boolean | string[]) => {
    if (!editingTool || !editingTool.parameters) return;
    setEditingTool((prev: Partial<AssistantTool> | null) => {
      if (!prev || !prev.parameters) return null;
      const updatedParameters = [...prev.parameters];
      const paramToUpdate = updatedParameters[paramIndex];
      if (field in paramToUpdate) {
        (paramToUpdate as any)[field] = value;
      }
      return { ...prev, parameters: updatedParameters };
    });
  };

  const removeToolParameter = (paramIndex: number) => {
    if (!editingTool || !editingTool.parameters) return;
    setEditingTool((prev: Partial<AssistantTool> | null) => {
      if (!prev || !prev.parameters) return null;
      const updatedParameters = prev.parameters.filter((_: ToolParameter, i: number) => i !== paramIndex);
      const newToolState: Partial<AssistantTool> = { ...prev, parameters: updatedParameters };
      if (prev.type === 'firestore') {
        const fsTool = prev as Partial<FirestoreAssistantTool>;
        if (fsTool.firestoreIdentifyingParameter && !updatedParameters.find((p: ToolParameter) => p.name === fsTool.firestoreIdentifyingParameter)) {
          (newToolState as Partial<FirestoreAssistantTool>).firestoreIdentifyingParameter = "";
        }
        if (fsTool.firestoreFieldValueParameter && !updatedParameters.find((p: ToolParameter) => p.name === fsTool.firestoreFieldValueParameter)) {
          (newToolState as Partial<FirestoreAssistantTool>).firestoreFieldValueParameter = "";
        }
      }
      if (prev.type === 'rtdb' && (prev as RtdbAssistantTool).rtdbDynamicPathParameter && !updatedParameters.find((p: ToolParameter) => p.name === (prev as RtdbAssistantTool).rtdbDynamicPathParameter)) {
        (newToolState as Partial<RtdbAssistantTool>).rtdbDynamicPathParameter = "";
      }
      return newToolState;
    });
  };

  const handleInitializeConfig = async () => {
    setIsInitializingConfig(true);
    setAssistantConfigError(null);
    if (!user) {
      toast({ title: "Error", description: "No hay un usuario autenticado.", variant: "destructive" });
      setIsInitializingConfig(false);
      return;
    }
    try {
      const response = await fetch('/api/admin/initialize-on-first-load', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to initialize configuration.');
      }
      toast({
        title: "Éxito",
        description: "La configuración ha sido inicializada.",
      });
      // Re-fetch the configuration without reloading
      await fetchAndPrepareData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
      setAssistantConfigError(errorMessage);
      toast({
        title: "Error de Inicialización",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsInitializingConfig(false);
    }
  };

  // Show a loading spinner if auth is loading or if the main config is loading
  if (authLoading || isLoadingAssistantConfig || isLoadingModels) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-center">
          {authLoading ? "Verificando autenticación..." : "Cargando configuración del asistente..."}
        </p>
      </div>
    );
  }

  if (!canManageAssistant) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive mb-4" />
        <p className="text-destructive mb-4">
          Acceso denegado. No tienes permiso para gestionar el asistente.
        </p>
      </div>
    );
  }

  if (assistantConfigError && !assistantConfigData) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive mb-4" />
        <p className="text-destructive mb-4">{assistantConfigError}</p>
        <Button onClick={handleInitializeConfig} disabled={isInitializingConfig}>
          {isInitializingConfig ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Inicializando...
            </>
          ) : (
            "Inicializar Configuración"
          )}
        </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {assistantConfigData && (
        <Tabs defaultValue="general-config" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general-config">
              {isMobile ? <Settings className="h-5 w-5" /> : "General"}
            </TabsTrigger>
            <TabsTrigger value="api-keys">
              {isMobile ? <KeyRound className="h-5 w-5" /> : "API Keys"}
            </TabsTrigger>
            <TabsTrigger value="default-tools">
              {isMobile ? <Wrench className="h-5 w-5" /> : "Default Tools"}
            </TabsTrigger>
          </TabsList>
  
          <TabsContent value="general-config" className="mt-4">
            <GeneralConfigTab
              assistantConfigData={assistantConfigData}
              setAssistantConfigData={setAssistantConfigData}
              availableModels={availableModels}
              textModels={textModels}
              sttModels={sttModels}
              imageAnalysisModels={imageAnalysisModels}
              openAiImageAnalysisModels={openAiImageAnalysisModels}
              googleImageAnalysisModels={googleImageAnalysisModels}
            />
          </TabsContent>
  
          <TabsContent value="api-keys" className="mt-4">
            <ApiKeysTab
              assistantConfigData={assistantConfigData}
              setAssistantConfigData={setAssistantConfigData}
            />
          </TabsContent>

          <TabsContent value="default-tools" className="mt-4">
            <DefaultToolsTab
              assistantConfigData={assistantConfigData}
              setAssistantConfigData={setAssistantConfigData}
            />
          </TabsContent>
        </Tabs>
      )}

      {assistantConfigError && <p className="text-sm text-red-500 mt-4">{assistantConfigError}</p>}
      <Button onClick={() => handleSaveAssistantConfig(assistantConfigData, { showSuccessToast: true })} disabled={isSavingAssistantConfig || !assistantConfigData} className="mt-6 w-full sm:w-auto">
        {isSavingAssistantConfig ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Guardar
          </>
        )}
      </Button>
    </div>
  );
}