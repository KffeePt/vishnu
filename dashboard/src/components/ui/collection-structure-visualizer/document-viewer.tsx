"use client";

import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documentData: Record<string, any> | null;
  documentId: string;
  collectionPath: string;
  isLoading: boolean;
  error: string | null;
  onUpdate: () => void;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({
  isOpen,
  onClose,
  documentData,
  documentId,
  collectionPath,
  isLoading,
  error,
  onUpdate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [jsonString, setJsonString] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (documentData) {
      setJsonString(JSON.stringify(documentData, null, 2));
    }
  }, [documentData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedData = JSON.parse(jsonString);
      const response = await fetch(`/api/admin/firestore-documents?collectionPath=${encodeURIComponent(collectionPath)}&docId=${encodeURIComponent(documentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update document');
      }
      
      toast({ title: "Éxito", description: "Documento actualizado correctamente." });
      setIsEditing(false);
      onUpdate(); // Trigger a refresh
    } catch (error: any) {
      toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg p-0">
        <SheetHeader className="p-6">
          <SheetTitle>Visor de Documento</SheetTitle>
          <SheetDescription>
            Mostrando contenido para el documento: <code className="font-mono text-sm bg-gray-100 dark:bg-gray-800 p-1 rounded">{documentId}</code>
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6 h-[calc(100vh-180px)] overflow-y-auto">
          <Card>
            <CardContent className="p-4">
              {isLoading && (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {error && (
                <div className="text-red-500 text-sm">
                  <p><strong>Error:</strong> {error}</p>
                </div>
              )}
              {documentData && !isLoading && (
                isEditing ? (
                  <Textarea
                    value={jsonString}
                    onChange={(e) => setJsonString(e.target.value)}
                    rows={20}
                    className="font-mono text-sm"
                  />
                ) : (
                  <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">
                    {JSON.stringify(documentData, null, 2)}
                  </pre>
                )
              )}
            </CardContent>
          </Card>
        </div>
        <SheetFooter className="p-6 border-t flex justify-between">
          <div>
            <Button onClick={() => setIsEditing(!isEditing)} variant="outline" disabled={!documentData}>
              {isEditing ? 'Cancelar' : 'Editar JSON'}
            </Button>
          </div>
          <div>
            {isEditing && (
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar Cambios'}
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="ml-2">Cerrar</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default DocumentViewer;
