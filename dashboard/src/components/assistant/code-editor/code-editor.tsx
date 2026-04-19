"use client";
import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { okaidia } from '@uiw/codemirror-theme-okaidia';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

interface AssistantCodeEditorProps {
  code: string;
  setCode: (code: string) => void;
  className?: string;
}

const AssistantCodeEditor = ({ code, setCode, className }: AssistantCodeEditorProps) => {
  return (
    <div className={cn("code-editor-container overflow-y-scroll h-full", className)}>
      <div className="flex items-center justify-between p-2 bg-black bg-opacity-20 border-b border-gray-700 ">
        <div className="flex items-center ">
          <span className="text-sm">Code Editor</span>
        </div>
        <div className="flex items-center space-x-2">
          <Switch id="toggle-mode" />
        </div>
      </div>
      <CodeMirror
        value={code}
        className="h-full max-h-[600px]"
        extensions={[javascript({ jsx: true })]}
        onChange={(value) => setCode(value)}
        theme={okaidia}
      />
    </div>
  );
};

export default AssistantCodeEditor;