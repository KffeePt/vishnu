"use client";

import { useEffect, useState } from "react"; // Added useEffect, useState
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea"; // Added Textarea
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button"; // Added Button
import { Trash2, PlusCircle } from "lucide-react"; // Added Trash2 and PlusCircle icon
import { v4 as uuidv4 } from 'uuid'; // For unique IDs
import {
  AssistantConfigData,
  ModelInfo,
  TextToSpeechProvider
  // SpeechToTextProvider, // Not a distinct exported type, part of AssistantConfigData
  // ImageAnalysisProvider // Not a distinct exported type, part of AssistantConfigData
} from "../../../assistant/assistant-types"; // Assuming types are exported from parent
import { 
  CustomContextVariable, // Moved from ./assistant-manager
  AssistantMainSettings // Changed from AssistantSettings
  // AssistantSettings was removed, ensure no direct import of it.
} from "../../../assistant/assistant-types"; // Corrected import path

interface GeneralConfigTabProps {
  assistantConfigData: AssistantConfigData & { main?: AssistantMainSettings }; // Ensure main is recognized
  setAssistantConfigData: React.Dispatch<React.SetStateAction<(AssistantConfigData & { main?: AssistantMainSettings }) | null>>; // Adjust setter type
  availableModels: ModelInfo[];
  textModels: ModelInfo[];
  sttModels: ModelInfo[];
  imageAnalysisModels: ModelInfo[];
  openAiImageAnalysisModels: ModelInfo[];
  googleImageAnalysisModels: ModelInfo[];
}

export default function GeneralConfigTab({
  assistantConfigData,
  setAssistantConfigData,
  availableModels,
  textModels,
  sttModels,
  imageAnalysisModels,
  openAiImageAnalysisModels,
  googleImageAnalysisModels,
}: GeneralConfigTabProps) {
  const [elevenLabsVoices, setElevenLabsVoices] = useState<{ voice_id: string; name: string }[]>([]);
  const [elevenLabsTtsModels, setElevenLabsTtsModels] = useState<{ model_id: string; name: string }[]>([]); // Renamed for clarity
  const [elevenLabsSttModels, setElevenLabsSttModels] = useState<{ model_id: string; name: string }[]>([]); // New state for STT models
  const [isLoadingElevenLabsOptions, setIsLoadingElevenLabsOptions] = useState(false);
  const [elevenLabsOptionsError, setElevenLabsOptionsError] = useState<string | null>(null);

  // State for the new custom text model form
  const [newCustomTextModel, setNewCustomTextModel] = useState<Omit<ModelInfo, 'capabilities'>>({ id: "", name: "", provider: "" });


  // Handler to add a custom text model
  const handleAddCustomTextModel = () => {
    if (!newCustomTextModel.id || !newCustomTextModel.name || !newCustomTextModel.provider) {
      alert("Model ID, Name, and Provider are required for custom models.");
      return;
    }
    // Assuming new custom text models are for text/chat capabilities.
    // This could be made more flexible if needed (e.g., a dropdown for capabilities).
    const modelToAdd: ModelInfo = { ...newCustomTextModel, capabilities: ["text", "chat"] };

    setAssistantConfigData(prev => {
      if (!prev) return null;
      const existingCustomModels = prev.customTextModels || [];
      if (existingCustomModels.some(m => m.id === modelToAdd.id)) {
        alert(`Custom model with ID ${modelToAdd.id} already exists.`);
        return prev;
      }
      // Also check against standard text models to avoid ID collision if desired, though less critical
      // if (textModels.some(m => m.id === modelToAdd.id)) {
      //   alert(`A standard model with ID ${modelToAdd.id} already exists. Custom model IDs should be unique.`);
      //   return prev;
      // }
      return {
        ...prev,
        customTextModels: [...existingCustomModels, modelToAdd]
      };
    });
    setNewCustomTextModel({ id: "", name: "", provider: "" }); // Reset form
  };

  // Handler to remove a custom text model
  const handleRemoveCustomTextModel = (modelIdToRemove: string) => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      const updatedCustomModels = (prev.customTextModels || []).filter(m => m.id !== modelIdToRemove);
      let newTextModelInfo = prev.textModelInfo;
      if (prev.textModelInfo?.id === modelIdToRemove) {
        newTextModelInfo = null; // Clear selection if the removed model was selected
      }
      return {
        ...prev,
        customTextModels: updatedCustomModels,
        textModelInfo: newTextModelInfo
      };
    });
  };

  // Handler to select a custom text model (sets it as the main textModelInfo)
  const handleSelectCustomTextModel = (model: ModelInfo) => {
    setAssistantConfigData(prev => prev ? { ...prev, textModelInfo: model } : null);
  };

  useEffect(() => {
    // Automatically select the first available platform image analysis model
    // if 'platform' provider is selected and no model is currently set.
    if (
      assistantConfigData &&
      assistantConfigData.imageAnalysisProvider === 'platform' &&
      !assistantConfigData.imageAnalysisModelInfo &&
      imageAnalysisModels && imageAnalysisModels.length > 0
    ) {
      setAssistantConfigData(prev => {
        if (!prev) return null; // Should be guarded by the outer check
        return {
          ...prev,
          imageAnalysisModelInfo: imageAnalysisModels[0],

 // Default to the first available platform model
        };
      });
    }
  }, [
    assistantConfigData, // Added missing dependency
    assistantConfigData?.imageAnalysisProvider,
    assistantConfigData?.imageAnalysisModelInfo,
    imageAnalysisModels,
    setAssistantConfigData
  ]);

  useEffect(() => {
    if (assistantConfigData && assistantConfigData.textToSpeechProvider === 'elevenlabs') {
      const fetchElevenLabsOptions = async () => {
        setIsLoadingElevenLabsOptions(true);
        setElevenLabsOptionsError(null);
        try {
          const response = await fetch('/api/admin/elevenlabs-options');
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to fetch ElevenLabs options: ${response.statusText}`);
          }
          const data = await response.json();
          setElevenLabsVoices(data.voices || []);
          setElevenLabsTtsModels(data.ttsModels || []); // Use ttsModels from API
          setElevenLabsSttModels(data.sttModels || []); // Use sttModels from API
        } catch (error) {
          console.error("Error fetching ElevenLabs options:", error);
          setElevenLabsOptionsError(error instanceof Error ? error.message : "Unknown error occurred");
        } finally {
          setIsLoadingElevenLabsOptions(false);
        }
      };
      fetchElevenLabsOptions();
    }
  }, [assistantConfigData, assistantConfigData?.textToSpeechProvider]); // Use optional chaining for direct access

  if (!assistantConfigData) return null;

  return (
    <Card>
      <CardContent className="space-y-6 p-6"> {/* Increased spacing */}
        {/* Assistant Access Control */}
        <Card className="p-4 border-l-4 border-red-500">
          <h5 className="text-md font-semibold mb-3">Public Access Control</h5>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="is-public-switch" className="text-base">
                Assistant Public Access
              </Label>
              <p className="text-sm text-muted-foreground">
                Enable or disable assistant access for all users.
              </p>
            </div>
            <Switch
              id="is-public-switch"
              checked={assistantConfigData.isPublic}
              onCheckedChange={(isChecked) => {
                setAssistantConfigData(prev => prev ? { ...prev, isPublic: isChecked } : null);
              }}
            />
          </div>
          {!assistantConfigData.isPublic && (
            <div className="mt-4">
              <Label htmlFor="unavailableMessage" className="text-sm font-medium">
                Unavailable Message
              </Label>
              <Textarea
                id="unavailableMessage"
                value={assistantConfigData.unavailableMessage || ""}
                onChange={(e) => {
                  setAssistantConfigData(prev => prev ? { ...prev, unavailableMessage: e.target.value } : null);
                }}
                placeholder="The assistant is currently under maintenance. Please check back later."
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This message will be displayed to users when the assistant is not public.
              </p>
            </div>
          )}
        </Card>

        <div>
          <Label htmlFor="textModel" className="text-base font-medium block mb-1">Main Text Model</Label>
          <Select
            value={assistantConfigData.textModelInfo?.id || ""}
            onValueChange={(modelId) => {
              const selected = availableModels.find(m => m.id === modelId);
              setAssistantConfigData(prev => prev ? { ...prev, textModelInfo: selected || null } : null);
            }}
          >
            <SelectTrigger id="textModel">
              <SelectValue placeholder="Select a text model" />
            </SelectTrigger>
            <SelectContent>
              {textModels.map(model => (
                <SelectItem key={`text-${model.id}`} value={model.id}>
                  {`${model.provider}: ${model.name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom Text Models Management */}
        <Card className="p-4 mt-4 border-l-4 border-indigo-500">
          <h5 className="text-md font-semibold mb-3">Custom Text Models</h5>
          {(assistantConfigData.customTextModels || []).length === 0 && (
            <p className="text-sm text-muted-foreground">No custom models added.</p>
          )}
          <div className="space-y-2 mb-4">
            {(assistantConfigData.customTextModels || []).map(customModel => (
              <div key={customModel.id} className="flex items-center justify-between p-2 border rounded-md bg-background hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">{customModel.provider}: {customModel.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {customModel.id}</p>
                </div>
                <div className="space-x-1">
                  <Button
                    variant={assistantConfigData.textModelInfo?.id === customModel.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSelectCustomTextModel(customModel)}
                    disabled={assistantConfigData.textModelInfo?.id === customModel.id}
                  >
                    {assistantConfigData.textModelInfo?.id === customModel.id ? "Selected" : "Select"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveCustomTextModel(customModel.id)} aria-label="Remove custom model">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t">
            <h6 className="text-sm font-semibold mb-2">Add New Custom Text Model</h6>
            <div className="space-y-3">
              <div>
                <Label htmlFor="customTextModelId" className="text-xs">Model ID</Label>
                <Input id="customTextModelId" value={newCustomTextModel.id} onChange={(e) => setNewCustomTextModel(prev => ({...prev, id: e.target.value}))} placeholder="e.g., custom-gpt-4o" className="text-sm"/>
              </div>
              <div>
                <Label htmlFor="customTextModelName" className="text-xs">Model Name</Label>
                <Input id="customTextModelName" value={newCustomTextModel.name} onChange={(e) => setNewCustomTextModel(prev => ({...prev, name: e.target.value}))} placeholder="e.g., Custom GPT-4 Omni (Personalized)" className="text-sm"/>
              </div>
              <div>
                <Label htmlFor="customTextModelProvider" className="text-xs">Provider</Label>
                <Input id="customTextModelProvider" value={newCustomTextModel.provider} onChange={(e) => setNewCustomTextModel(prev => ({...prev, provider: e.target.value}))} placeholder="e.g., MyCompanyAI" className="text-sm"/>
              </div>
              <Button onClick={handleAddCustomTextModel} size="sm" className="mt-2">Add Custom Model</Button>
            </div>
          </div>
        </Card>
        
        {/* TTS Provider Selection */}
        <div>
          <Label htmlFor="textToSpeechProvider" className="text-base font-medium block mb-1">Text-to-Speech (TTS) Provider</Label>
          <Select
            value={assistantConfigData.textToSpeechProvider || ""}
            onValueChange={(value) => {
              setAssistantConfigData(prev => prev ? { ...prev, textToSpeechProvider: value as TextToSpeechProvider } : null);
            }}
          >
            <SelectTrigger id="textToSpeechProvider">
              <SelectValue placeholder="Select TTS provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="web-speech-api">Web Speech API (Browser)</SelectItem>
              <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
              <SelectItem value="openai">OpenAI TTS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ElevenLabs Specific Config */}
        {assistantConfigData.textToSpeechProvider === 'elevenlabs' && (
          <Card className="p-4 mt-4 border-l-4 border-blue-500">
            <h5 className="text-md font-semibold mb-2">ElevenLabs Configuration</h5>
            {isLoadingElevenLabsOptions && <p className="text-sm text-muted-foreground">Loading ElevenLabs options...</p>}
            {elevenLabsOptionsError && <p className="text-sm text-red-500">Error: {elevenLabsOptionsError}</p>}
            
            {!isLoadingElevenLabsOptions && !elevenLabsOptionsError && (
              <>
                <div className="mt-2">
                  <Label htmlFor="elevenLabsVoiceId" className="block mb-1">ElevenLabs Voice</Label>
                  <Select
                    value={assistantConfigData.elevenLabsConfig?.voiceId || ""}
                    onValueChange={(voiceId) => {
                      setAssistantConfigData(prev => prev ? { ...prev, elevenLabsConfig: { ...prev.elevenLabsConfig, voiceId: voiceId } } : null);
                    }}
                  >
                    <SelectTrigger id="elevenLabsVoiceId">
                      <SelectValue placeholder="Select a voice" />
                    </SelectTrigger>
                    <SelectContent>
                      {elevenLabsVoices.length > 0 ? (
                        elevenLabsVoices.map(voice => (
                          <SelectItem key={voice.voice_id} value={voice.voice_id}>
                            {voice.name} ({voice.voice_id})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-voices-placeholder" disabled>No voices available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-4">
                  <Label htmlFor="elevenLabsModelId" className="block mb-1">ElevenLabs Model (TTS)</Label>
                  <Select
                    value={assistantConfigData.elevenLabsConfig?.modelId || "USE_DEFAULT_MODEL"}
                    onValueChange={(selectedValue) => {
                      const actualModelId = selectedValue === "USE_DEFAULT_MODEL" ? "" : selectedValue;
                      setAssistantConfigData(prev => prev ? { ...prev, elevenLabsConfig: { ...prev.elevenLabsConfig, modelId: actualModelId } } : null);
                    }}
                  >
                    <SelectTrigger id="elevenLabsModelId">
                      <SelectValue placeholder="Select a model (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USE_DEFAULT_MODEL">Use voice's default model</SelectItem>
                      {elevenLabsTtsModels.length > 0 ? (
                        elevenLabsTtsModels.map(model => (
                          <SelectItem key={model.model_id} value={model.model_id}>
                            {model.name} ({model.model_id})
                          </SelectItem>
                        ))
                      ) : (
                         !isLoadingElevenLabsOptions && <SelectItem value="no-models-placeholder" disabled>No specific TTS models listed</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                   <p className="text-xs text-muted-foreground mt-1">
                    Some voices may have a default model. Selecting one here will override it.
                  </p>
                </div>
              </>
            )}
            <div className="mt-2">
              <Label htmlFor="elevenLabsVoiceIdFallback" className="block mb-1 text-xs text-muted-foreground">
                Voice ID (Manual - use if voice is not in the list or to add a new one)
              </Label>
              <Input
                id="elevenLabsVoiceIdFallback"
                value={assistantConfigData.elevenLabsConfig?.voiceId || ""}
                onChange={(e) => setAssistantConfigData(prev => prev ? { ...prev, elevenLabsConfig: { ...prev.elevenLabsConfig, voiceId: e.target.value } } : null)}
                placeholder="e.g., pNInz6obpgDQGcFmaJgB"
              />
            </div>

             {(isLoadingElevenLabsOptions || elevenLabsOptionsError || elevenLabsTtsModels.length === 0) && (
                <>
                  <div className="mt-2">
                    <Label htmlFor="elevenLabsModelIdFallback" className="block mb-1 text-xs text-muted-foreground">Model ID (Manual, Optional)</Label>
                    <Input
                      id="elevenLabsModelIdFallback"
                      value={assistantConfigData.elevenLabsConfig?.modelId || ""}
                      onChange={(e) => setAssistantConfigData(prev => prev ? { ...prev, elevenLabsConfig: { ...prev.elevenLabsConfig, modelId: e.target.value } } : null)}
                      placeholder="e.g., eleven_multilingual_v2"
                    />
                  </div>
                </>
             )}
          </Card>
        )}

        {/* OpenAI TTS Specific Config */}
        {assistantConfigData.textToSpeechProvider === 'openai' && (
          <Card className="p-4 mt-4 border-l-4 border-green-500">
            <h5 className="text-md font-semibold mb-2">OpenAI TTS Configuration</h5>
            <div>
              <Label htmlFor="openAiTtsModelId" className="block mb-1">OpenAI TTS Model</Label>
              <Input
                id="openAiTtsModelId"
                value={assistantConfigData.openAiTtsConfig?.modelId || ""}
                onChange={(e) => setAssistantConfigData(prev => prev ? { ...prev, openAiTtsConfig: { ...prev.openAiTtsConfig, modelId: e.target.value } } : null)}
                placeholder="e.g., tts-1 (leave empty for default)"
              />
            </div>
            <div className="mt-2">
              <Label htmlFor="openAiTtsVoice" className="block mb-1">OpenAI TTS Voice</Label>
              <Input
                id="openAiTtsVoice"
                value={assistantConfigData.openAiTtsConfig?.voice || ""}
                onChange={(e) => setAssistantConfigData(prev => prev ? { ...prev, openAiTtsConfig: { ...prev.openAiTtsConfig, voice: e.target.value } } : null)}
                placeholder="e.g., alloy (leave empty for default)"
              />
            </div>
          </Card>
        )}

        {/* STT Provider Selection */}
        <div>
          <Label htmlFor="speechToTextProvider" className="text-base font-medium block mb-1">Speech-to-Text (STT) Provider</Label>
          <Select
            value={assistantConfigData.speechToTextProvider}
            onValueChange={(value) => {
              setAssistantConfigData(prev => prev ? { ...prev, speechToTextProvider: value as AssistantConfigData['speechToTextProvider'] } : null);
            }}
          >
            <SelectTrigger id="speechToTextProvider">
              <SelectValue placeholder="Select STT provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="platform">Platform Models (Generic)</SelectItem>
              <SelectItem value="elevenlabs">ElevenLabs STT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ElevenLabs STT Specific Config */}
        {assistantConfigData.speechToTextProvider === 'elevenlabs' && (
          <Card className="p-4 mt-4 border-l-4 border-purple-500">
            <h5 className="text-md font-semibold mb-2">ElevenLabs STT Configuration</h5>
            {isLoadingElevenLabsOptions && <p className="text-sm text-muted-foreground">Loading ElevenLabs STT models...</p>}
            {elevenLabsOptionsError && !isLoadingElevenLabsOptions && <p className="text-sm text-red-500">Error loading STT models: {elevenLabsOptionsError}</p>}
            
            {!isLoadingElevenLabsOptions && !elevenLabsOptionsError && (
              <div className="mt-2">
                <Label htmlFor="elevenLabsSttModelIdSelect" className="block mb-1">ElevenLabs STT Model</Label>
                <Select
                  value={assistantConfigData.elevenLabsSttConfig?.modelId || "USE_DEFAULT_STT_MODEL"}
                  onValueChange={(selectedValue) => {
                    const actualModelId = selectedValue === "USE_DEFAULT_STT_MODEL" ? "" : selectedValue;
                    setAssistantConfigData(prev => prev ? { ...prev, elevenLabsSttConfig: { ...prev.elevenLabsSttConfig, modelId: actualModelId } } : null);
                  }}
                >
                  <SelectTrigger id="elevenLabsSttModelIdSelect">
                    <SelectValue placeholder="Select STT model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USE_DEFAULT_STT_MODEL">Use default STT model</SelectItem>
                    {elevenLabsSttModels.length > 0 ? (
                      elevenLabsSttModels.map(model => (
                        <SelectItem key={model.model_id} value={model.model_id}>
                          {model.name} ({model.model_id})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-stt-models-placeholder" disabled>No ElevenLabs STT models listed</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(isLoadingElevenLabsOptions || elevenLabsOptionsError || elevenLabsSttModels.length === 0) && (
              <div className="mt-2">
                <Label htmlFor="elevenLabsSttModelIdFallback" className="block mb-1 text-xs text-muted-foreground">STT Model ID (Manual)</Label>
                <Input
                  id="elevenLabsSttModelIdFallback"
                  value={assistantConfigData.elevenLabsSttConfig?.modelId || ""}
                  onChange={(e) => setAssistantConfigData(prev => prev ? { ...prev, elevenLabsSttConfig: { ...prev.elevenLabsSttConfig, modelId: e.target.value } } : null)}
                  placeholder="e.g., scribe_v1 (or leave empty for default)"
                />
              </div>
            )}
          </Card>
        )}
        
        {/* Generic STT Model Selection (shown if 'platform' is selected) */}
        {assistantConfigData.speechToTextProvider === 'platform' && (
          <div>
            <Label htmlFor="sttModel" className="text-base font-medium block mb-1">Speech Recognition Model (Platform)</Label>
            <Select
              value={assistantConfigData.sttModelInfo?.id || ""}
              onValueChange={(modelId) => {
                const selected = availableModels.find(m => m.id === modelId);
                setAssistantConfigData(prev => prev ? { ...prev, sttModelInfo: selected || null } : null);
              }}
            >
              <SelectTrigger id="sttModel">
                <SelectValue placeholder="Select platform STT model" />
              </SelectTrigger>
              <SelectContent>
                {sttModels.map(model => (
                  <SelectItem key={`stt-${model.id}`} value={model.id}>
                    {`${model.provider}: ${model.name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Image Analysis Provider Selection */}
        <div>
          <Label htmlFor="imageAnalysisProvider" className="text-base font-medium block mb-1">Image Analysis Provider</Label>
          <Select
            value={assistantConfigData.imageAnalysisProvider}
            onValueChange={(newProvider) => {
              setAssistantConfigData(prev => {
                if (!prev) return null;
                return {
                  ...prev,
                  imageAnalysisProvider: newProvider as AssistantConfigData['imageAnalysisProvider'],
                  imageAnalysisModelInfo: null,
                  elevenLabsImageAnalysisConfig: {
                    ...(prev.elevenLabsImageAnalysisConfig || {}),
                    modelId: "",
                  }
                };
              });
            }}
          >
            <SelectTrigger id="imageAnalysisProvider">
              <SelectValue placeholder="Select image analysis provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="platform">Platform (All Providers)</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Platform Generic Image Analysis Model Selection */}
        {assistantConfigData.imageAnalysisProvider === 'platform' && (
          <div className="mt-2">
            <Label htmlFor="platformImageAnalysisModel" className="text-sm font-medium block mb-1">Image Analysis Model (Platform)</Label>
            <Select
              value={assistantConfigData.imageAnalysisModelInfo?.id || ""}
              onValueChange={(modelId) => {
                const selected = imageAnalysisModels.find(m => m.id === modelId);
                setAssistantConfigData(prev => prev ? { ...prev, imageAnalysisModelInfo: selected || null } : null);
              }}
            >
              <SelectTrigger id="platformImageAnalysisModel">
                <SelectValue placeholder="Select platform model" />
              </SelectTrigger>
              <SelectContent>
                {imageAnalysisModels.map(model => (
                  <SelectItem key={`platform-img-${model.id}`} value={model.id}>
                    {`${model.provider}: ${model.name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* OpenAI Image Analysis Model Selection */}
        {assistantConfigData.imageAnalysisProvider === 'openai' && (
          <div className="mt-2">
            <Label htmlFor="openAiImageAnalysisModel" className="text-sm font-medium block mb-1">Image Analysis Model (OpenAI)</Label>
            <Select
              value={assistantConfigData.imageAnalysisModelInfo?.id || ""}
              onValueChange={(modelId) => {
                const selected = openAiImageAnalysisModels.find(m => m.id === modelId);
                setAssistantConfigData(prev => prev ? { ...prev, imageAnalysisModelInfo: selected || null } : null);
              }}
            >
              <SelectTrigger id="openAiImageAnalysisModel">
                <SelectValue placeholder="Select OpenAI model" />
              </SelectTrigger>
              <SelectContent>
                {openAiImageAnalysisModels.map(model => (
                  <SelectItem key={`openai-img-${model.id}`} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
                {openAiImageAnalysisModels.length === 0 && <SelectItem value="no-models" disabled>No OpenAI models available</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Google Image Analysis Model Selection */}
        {assistantConfigData.imageAnalysisProvider === 'google' && (
          <div className="mt-2">
            <Label htmlFor="googleImageAnalysisModel" className="text-sm font-medium block mb-1">Image Analysis Model (Google)</Label>
            <Select
              value={assistantConfigData.imageAnalysisModelInfo?.id || ""}
              onValueChange={(modelId) => {
                const selected = googleImageAnalysisModels.find(m => m.id === modelId);
                setAssistantConfigData(prev => prev ? { ...prev, imageAnalysisModelInfo: selected || null } : null);
              }}
            >
              <SelectTrigger id="googleImageAnalysisModel">
                <SelectValue placeholder="Select Google model" />
              </SelectTrigger>
              <SelectContent>
                {googleImageAnalysisModels.map(model => (
                  <SelectItem key={`google-img-${model.id}`} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
                {googleImageAnalysisModels.length === 0 && <SelectItem value="no-models" disabled>No Google models available</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        )}
        
        {/* ElevenLabs Image Analysis Specific Config */}
        {assistantConfigData.imageAnalysisProvider === 'elevenlabs' && (
          <Card className="p-4 mt-4 border-l-4 border-yellow-500">
            <h5 className="text-md font-semibold mb-2">ElevenLabs Configuration (Image Analysis)</h5>
            <div>
              <Label htmlFor="elevenLabsImageModelId" className="block mb-1">ElevenLabs Image Analysis Model ID</Label>
              <Input
                id="elevenLabsImageModelId"
                value={assistantConfigData.elevenLabsImageAnalysisConfig?.modelId || ""}
                onChange={(e) => setAssistantConfigData(prev => prev ? { ...prev, elevenLabsImageAnalysisConfig: { ...prev.elevenLabsImageAnalysisConfig, modelId: e.target.value } } : null)}
                placeholder="e.g., eleven_image_analyzer_v1 (if applicable)"
              />
            </div>
          </Card>
        )}

      </CardContent>
    </Card>
  );
}