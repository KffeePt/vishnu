"use client"

import type React from "react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

interface AssistantNavBarProps {
  isProjectSidebarVisible: boolean
  onToggleProjectSidebar: () => void
  isAdminOrOwner: boolean
  isCodeEditorVisible: boolean
  onToggleCodeEditor: () => void
  isCanvasVisible: boolean
  onToggleCanvas: () => void
  isTestMode: boolean
  onToggleTestMode: () => void
}

export default function AssistantNavBar({
  isProjectSidebarVisible,
  onToggleProjectSidebar,
  isAdminOrOwner,
  isCodeEditorVisible,
  onToggleCodeEditor,
  isCanvasVisible,
  onToggleCanvas,
  isTestMode,
  onToggleTestMode,
}: AssistantNavBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-20">
      <div className="flex items-center p-4 bg-transparent backdrop-blur-md border-b border-gray-700/50">
        <div className="flex-grow"></div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="project-sidebar-toggle"
              checked={isProjectSidebarVisible}
              onCheckedChange={onToggleProjectSidebar}
            />
            <Label htmlFor="project-sidebar-toggle">Project Sidebar</Label>
          </div>
          {isAdminOrOwner && (
            <div className="flex items-center space-x-2">
              <Switch
                id="code-editor-toggle"
                checked={isCodeEditorVisible}
                onCheckedChange={onToggleCodeEditor}
              />
              <Label htmlFor="code-editor-toggle">Code Editor</Label>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <Switch
              id="canvas-toggle"
              checked={isCanvasVisible}
              onCheckedChange={onToggleCanvas}
            />
            <Label htmlFor="canvas-toggle">Canvas</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="test-mode-toggle"
              checked={isTestMode}
              onCheckedChange={onToggleTestMode}
            />
            <Label htmlFor="test-mode-toggle">Test Mode</Label>
          </div>
        </div>
      </div>
    </div>
  )
}