"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AssistantConfigData } from "@/components/assistant/assistant-types";

interface ApiKeysTabProps {
  assistantConfigData: AssistantConfigData;
  setAssistantConfigData: React.Dispatch<React.SetStateAction<AssistantConfigData | null>>;
}

export default function ApiKeysTab({ assistantConfigData, setAssistantConfigData }: ApiKeysTabProps) {
  const handleApiKeyChange = (key: string, value: string) => {
    setAssistantConfigData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        apiKeys: {
          ...prev.apiKeys,
          [key]: value,
        },
      };
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
        <CardDescription>
          Manage API keys for different services used by the assistant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="openai-api-key">OpenAI API Key</Label>
          <Input
            id="openai-api-key"
            type="password"
            value={assistantConfigData.apiKeys?.openai || ""}
            onChange={(e) => handleApiKeyChange('openai', e.target.value)}
            placeholder="sk-..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="google-api-key">Google Gemini API Key</Label>
          <Input
            id="google-api-key"
            type="password"
            value={assistantConfigData.apiKeys?.google || ""}
            onChange={(e) => handleApiKeyChange('google', e.target.value)}
            placeholder="AIza..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="elevenlabs-api-key">ElevenLabs API Key</Label>
          <Input
            id="elevenlabs-api-key"
            type="password"
            value={assistantConfigData.apiKeys?.elevenlabs || ""}
            onChange={(e) => handleApiKeyChange('elevenlabs', e.target.value)}
            placeholder="..."
          />
        </div>
      </CardContent>
    </Card>
  );
}