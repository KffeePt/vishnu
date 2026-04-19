"use client";

import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2 } from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";
import { UserAuth } from "@/context/auth-context";

interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  userId: string;
  content?: string;
}

interface FileViewerProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileNode;
}

const FileViewer: React.FC<FileViewerProps> = ({ isOpen, onClose, file }) => {
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getIDToken } = UserAuth() as any;

  useEffect(() => {
    if (isOpen && file) {
      const fetchFileContent = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const token = await getIDToken();
          const response = await fetch(`/api/project-files/content?id=${encodeURIComponent(file.id)}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!response.ok) {
            throw new Error('Failed to fetch file content.');
          }
          const content = await response.text();
          setFileContent(content);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setIsLoading(false);
        }
      };
      fetchFileContent();
    }
  }, [isOpen, file, getIDToken]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const token = await getIDToken();
      await fetch('/api/project-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...file, content: fileContent }),
      });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl p-0">
        <SheetHeader className="p-6">
          <SheetTitle>File Editor</SheetTitle>
          <SheetDescription>
            Editing content for: <code className="font-mono text-sm bg-gray-100 dark:bg-gray-800 p-1 rounded">{file.path}</code>
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6 h-[calc(100vh-180px)]">
          {isLoading && !fileContent ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-red-500 text-sm">
              <p><strong>Error:</strong> {error}</p>
            </div>
          ) : (
            <Textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="h-full w-full resize-none"
            />
          )}
        </div>
        <SheetFooter className="p-6 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default FileViewer;