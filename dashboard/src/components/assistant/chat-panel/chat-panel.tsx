"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Annoyed, Puzzle, Camera, FileImage, Upload, Globe, X, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import LoadingSpinner from "@/components/loading-spinner"
import { User } from "firebase/auth"
import { IdTokenResult } from "firebase/auth"

interface Model {
  id: string;
  name: string;
  provider: string;
}

interface ChatPanelProps {
  user: User | null;
  userClaims: IdTokenResult['claims'] | null;
  loading: boolean;
  isPublic: boolean;
  unavailableMessage: string;
  models: Model[];
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  isBuildMode: boolean;
  toggleBuildMode: () => void;
  isCodeEditorVisible: boolean;
  toggleCodeEditor: () => void;
  isProjectSidebarVisible: boolean;
  toggleProjectSidebar: () => void;
}

export default function ChatPanel({
  user,
  userClaims,
  loading,
  isPublic,
  unavailableMessage,
  models,
  selectedModel,
  setSelectedModel,
  isBuildMode,
  toggleBuildMode,
  isCodeEditorVisible,
  toggleCodeEditor,
  isProjectSidebarVisible,
  toggleProjectSidebar,
}: ChatPanelProps) {
  const [inputValue, setInputValue] = useState("")
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim()) return
    console.log("Submitted:", inputValue)
    setInputValue("")
  }

  const actionButtons = [
    { icon: Camera, label: "Clone a Screenshot" },
    { icon: FileImage, label: "Import from Figma" },
    { icon: Upload, label: "Upload a Project" },
    { icon: Globe, label: "Landing Page" },
  ]

  const isAdminOrOwner = !!userClaims?.admin || !!userClaims?.owner;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="h-full bg-transparent text-white flex flex-col relative overflow-hidden">
      {!isPublic && isAdminOrOwner ? (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <Badge variant="destructive" className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            <span>Public access is disabled. Only admins and owners can see this.</span>
          </Badge>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 z-10 overflow-y-auto">
        {isPublic || isAdminOrOwner ? (
          <>
            <h1 className="text-4xl md:text-5xl font-medium text-center mb-12 max-w-4xl">What can I help you build?</h1>

            <div className="w-full max-w-3xl space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-48 bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select Model" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 text-white">
                    {models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div onClick={toggleBuildMode} className="relative h-10 w-40 cursor-pointer">
                  <Button className={`absolute inset-0 transition-all duration-300 flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white ${isBuildMode ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                    <Puzzle className="h-4 w-4" />
                    <span>Build Mode</span>
                  </Button>
                  <Button className={`absolute inset-0 transition-all duration-300 flex items-center justify-center gap-2 w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 ${!isBuildMode ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                    <Annoyed className="h-4 w-4" />
                    <span>Normal Mode</span>
                  </Button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="relative">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask v0 to build..."
                  className="w-full h-14 px-4 pr-16 text-base bg-gray-900 border-gray-800 text-white placeholder-gray-400 rounded-lg focus:border-gray-600 focus:ring-0"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-gray-800 hover:bg-gray-700 border border-gray-700"
                  disabled={!inputValue.trim()}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </Button>
              </form>

              {showUpgradeBanner && (
                <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <span className="text-gray-300 text-sm">
                    Upgrade to Pro plan for more usage and features!
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300 hover:bg-gray-800">
                      Upgrade Plan
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-gray-300 hover:bg-gray-800"
                      onClick={() => setShowUpgradeBanner(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-3 mt-8">
              {actionButtons.map((button, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  className="h-10 px-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white rounded-lg"
                >
                  <button.icon className="h-4 w-4 mr-2" />
                  {button.label}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center text-lg text-gray-400">
            {unavailableMessage}
          </div>
        )}
      </div>
    </div>
  )
}