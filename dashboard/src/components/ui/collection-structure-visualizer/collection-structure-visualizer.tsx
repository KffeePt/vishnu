"use client";

import React from 'react';
import { Card } from "@/components/ui/card";
import { Folder, FileText, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import DocumentViewer from './document-viewer';

interface CollectionStructureVisualizerProps {
  collectionName: string;
  documents: any[];
  isLoading: Record<string, boolean>;
  expandedSegments: string[];
  onToggleSegment: (path: string | null) => void;
  onDocumentClick: (doc: any) => void;
  viewerState: {
    isOpen: boolean;
    documentId: string;
    collectionPath: string;
    documentData: any;
    isLoading: boolean;
    error: string | null;
  };
  onViewerClose: () => void;
  onViewerUpdate: () => void;
}

const CollectionStructureVisualizer: React.FC<CollectionStructureVisualizerProps> = ({
  collectionName,
  documents,
  isLoading,
  expandedSegments,
  onToggleSegment,
  onDocumentClick,
  viewerState,
  onViewerClose,
  onViewerUpdate,
}) => {
  if (!collectionName) return null;

  return (
    <Card className="p-4 mt-6">
      <h6 className="text-md font-semibold mb-3">Visualizador de Estructura</h6>
      <div className="p-3 rounded-md bg-gray-50 dark:bg-gray-900 text-sm font-mono space-y-1">
        <div className="flex items-center cursor-pointer" onClick={() => onToggleSegment(collectionName)}>
          {expandedSegments.includes(collectionName) ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
          <Folder className="h-4 w-4 mr-2 text-yellow-600" />
          <span>{collectionName}</span>
        </div>

        {expandedSegments.includes(collectionName) && (
          <div style={{ paddingLeft: '20px' }}>
            {isLoading[collectionName] && <Loader2 className="h-4 w-4 animate-spin" />}
            {!isLoading[collectionName] && documents.filter(d => d.collectionPath === collectionName).map(doc => (
              <div key={doc.id} className="flex items-center cursor-pointer" onClick={() => onDocumentClick(doc)}>
                <FileText className="h-4 w-4 mr-2 text-gray-400" />
                <span>{doc.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <DocumentViewer
        isOpen={viewerState.isOpen}
        onClose={onViewerClose}
        documentId={viewerState.documentId}
        collectionPath={viewerState.collectionPath}
        documentData={viewerState.documentData}
        isLoading={viewerState.isLoading}
        error={viewerState.error}
        onUpdate={onViewerUpdate}
      />
    </Card>
  );
};

export default CollectionStructureVisualizer;