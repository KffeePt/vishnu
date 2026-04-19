import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Settings, ChevronDown } from 'lucide-react';
import { UserSettings, AssistantConfigData } from '@/components/assistant/assistant-types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ApiKeysTab from './api-keys-tab/api-keys-tab';
import BehavioralRulesTab from './behavioral-rules-tab/behavioral-rules-tab';
import ToolsConfigTab from './tools-config-tab/tools-config-tab';
import LoadingSpinner from '@/components/loading-spinner';

interface GearIconMenuProps {
  userSettings: UserSettings | null;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings | null>>;
}

const GearIconMenu = ({ userSettings, setUserSettings }: GearIconMenuProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const assistantConfigData = userSettings ? userSettings.profiles[userSettings.activeProfile] : null;

  const setAssistantConfigData = (updater: React.SetStateAction<AssistantConfigData | null>) => {
    setUserSettings(prevSettings => {
        if (!prevSettings) return null;
        const currentProfile = prevSettings.profiles[prevSettings.activeProfile];
        const newProfile = typeof updater === 'function' 
            ? updater(currentProfile)
            : updater;
        if (!newProfile) return prevSettings;
        return {
            ...prevSettings,
            profiles: {
                ...prevSettings.profiles,
                [prevSettings.activeProfile]: newProfile
            }
        };
    });
  };

  const handleProfileChange = (profileName: string) => {
    setUserSettings(prev => {
      if (!prev) return null;
      return { ...prev, activeProfile: profileName };
    });
  };

  return (
    <>
      <div className="flex items-center rounded-md overflow-hidden">
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-r-none">
              <Settings className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl h-4/5 flex flex-col">
            <DialogHeader>
              <DialogTitle>Assistant Settings</DialogTitle>
            </DialogHeader>
            {assistantConfigData ? (
              <Tabs defaultValue="api-keys" className="h-full flex flex-col">
                <div className="flex justify-center">
                  <TabsList>
                    <TabsTrigger value="api-keys">API Keys</TabsTrigger>
                    <TabsTrigger value="behavioral-rules">Behavioral Rules</TabsTrigger>
                    <TabsTrigger value="tools-config">Tools</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="api-keys" className="flex-grow overflow-y-auto p-1">
                  <ApiKeysTab
                    assistantConfigData={assistantConfigData}
                    setAssistantConfigData={setAssistantConfigData}
                  />
                </TabsContent>
                <TabsContent value="behavioral-rules" className="flex-grow overflow-y-auto p-1">
                  <BehavioralRulesTab
                    assistantConfigData={assistantConfigData}
                    setAssistantConfigData={setAssistantConfigData}
                    handleBehavioralRuleChange={() => {}}
                    handleProblemClassificationChange={() => {}}
                    addProblemClassificationItem={() => {}}
                    removeProblemClassificationItem={() => {}}
                  />
                </TabsContent>
                <TabsContent value="tools-config" className="flex-grow overflow-y-auto p-1">
                  <ToolsConfigTab
                    assistantConfigData={assistantConfigData}
                    setAssistantConfigData={setAssistantConfigData}
                    editingTool={null}
                    setEditingTool={() => {}}
                    isAddingNewTool={false}
                    setIsAddingNewTool={() => {}}
                    handleAddNewTool={() => {}}
                    handleSaveTool={() => {}}
                    handleEditTool={() => {}}
                    handleDeleteTool={() => {}}
                    handleToolInputChange={() => {}}
                    handleToolConfigChange={() => {}}
                    handleToolTypeChange={() => {}}
                    handleToolEnabledChange={() => {}}
                    addToolParameter={() => {}}
                    handleToolParameterChange={() => {}}
                    removeToolParameter={() => {}}
                    availableToolComponents={[]}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <LoadingSpinner />
                <p className="mt-2">Loading assistant configuration...</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
        {userSettings && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-1 rounded-l-none border-l border-gray-700">
                <span className="truncate max-w-[100px]">{userSettings.activeProfile}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Profiles</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.keys(userSettings.profiles).map(profileName => (
                <DropdownMenuItem key={profileName} onSelect={() => handleProfileChange(profileName)}>
                  {profileName}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </>
  );
};

export default GearIconMenu;