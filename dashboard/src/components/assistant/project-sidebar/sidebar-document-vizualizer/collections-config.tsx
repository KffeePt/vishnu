import { useState, useEffect, useCallback } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import SidebarDocumentVizualizer from './sidebar-document-vizualizer';

type ValueType = 'literal' | 'env' | 'preset' | 'user_uid';

interface BaseConfig {
  id: number;
  type: ValueType;
  value: string;
}

interface FieldConfig extends BaseConfig {
  name: string;
}

interface DocIdSegment extends BaseConfig { }

interface CollectionConfig {
  id: string;
  name: string;
  docIdSegments: DocIdSegment[];
  fields: FieldConfig[];
}

const CollectionsConfig = () => {
  const [collections, setCollections] = useState<CollectionConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [expandedSegments, setExpandedSegments] = useState<string[]>([]);
  const [viewerState, setViewerState] = useState({
    isOpen: false,
    documentId: '',
    collectionPath: '',
    documentData: null,
    isLoading: false,
    error: null,
  });

  const fetchCollections = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/firestore-collections');
      if (!response.ok) {
        throw new Error('Failed to fetch collections');
      }
      const data = await response.json();
      setCollections(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleToggleSegment = async (path: string | null) => {
    if (!path) return;

    const isExpanded = expandedSegments.includes(path);
    if (isExpanded) {
      setExpandedSegments(expandedSegments.filter(s => s !== path && !s.startsWith(path + '/')));
    } else {
      setExpandedSegments([...expandedSegments, path]);
      setLoadingStates(prev => ({ ...prev, [path]: true }));
      try {
        const response = await fetch(`/api/admin/firestore-documents?path=${path}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch documents for ${path}`);
        }
        const newDocs = await response.json();
        setDocuments(prev => [...prev.filter(d => d.collectionPath !== path), ...newDocs.map((d: any) => ({ ...d, collectionPath: path }))]);
      } catch (error: any) {
        console.error(error);
      } finally {
        setLoadingStates(prev => ({ ...prev, [path]: false }));
      }
    }
  };

  const handleDocumentClick = async (doc: any) => {
    setViewerState({
      isOpen: true,
      documentId: doc.id,
      collectionPath: doc.collectionPath,
      documentData: null,
      isLoading: true,
      error: null,
    });
    try {
      const response = await fetch(`/api/admin/firestore-documents?path=${doc.collectionPath}/${doc.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch document data.');
      }
      const data = await response.json();
      setViewerState(prev => ({ ...prev, documentData: data, isLoading: false }));
    } catch (error: any) {
      setViewerState(prev => ({ ...prev, error: error.message, isLoading: false }));
    }
  };

  const handleViewerClose = () => {
    setViewerState({
      isOpen: false,
      documentId: '',
      collectionPath: '',
      documentData: null,
      isLoading: false,
      error: null,
    });
  };

  const handleViewerUpdate = () => {
    if (viewerState.collectionPath) {
      handleToggleSegment(viewerState.collectionPath);
      if (viewerState.isOpen && viewerState.documentId) {
        handleDocumentClick({ id: viewerState.documentId, collectionPath: viewerState.collectionPath });
      }
    }
  };

  const handleAddCollection = () => {
    const newCollection: CollectionConfig = {
      id: `new-collection-${Date.now()}`,
      name: '',
      docIdSegments: [],
      fields: [],
    };
    setCollections([...collections, newCollection]);
  };

  const handleUpdateCollection = (id: string, updatedConfig: Partial<CollectionConfig>) => {
    setCollections(collections.map(c => c.id === id ? { ...c, ...updatedConfig } : c));
  };

  const handleRemoveCollection = (id: string) => {
    setCollections(collections.filter(c => c.id !== id));
  };

  const handleSaveChanges = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/firestore-collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collections),
      });
      if (!response.ok) {
        throw new Error('Failed to save collections');
      }
      await fetchCollections();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <Accordion type="single" collapsible className="w-full">
        {collections.map(collection => (
          <AccordionItem key={collection.id} value={collection.id}>
            <AccordionTrigger>{collection.name || "New Collection"}</AccordionTrigger>
            <AccordionContent>
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <Label>Collection Name</Label>
                    <Input
                      value={collection.name}
                      onChange={(e) => handleUpdateCollection(collection.id, { name: e.target.value })}
                    />
                  </div>
                  <SidebarDocumentVizualizer
                    collectionName={collection.name}
                    documents={[]}
                    isLoading={{}}
                    expandedSegments={[]}
                    onToggleSegment={() => { }}
                    onDocumentClick={() => { }}
                    viewerState={{
                      isOpen: false,
                      documentId: '',
                      collectionPath: '',
                      documentData: null,
                      isLoading: false,
                      error: null,
                    }}
                    onViewerClose={() => { }}
                    onViewerUpdate={() => { }}
                  />
                </div>
                <Button variant="destructive" onClick={() => handleRemoveCollection(collection.id)} className="mt-4">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </Card>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <Button onClick={handleAddCollection} className="mt-4">
        <Plus className="mr-2 h-4 w-4" /> Add Collection
      </Button>
      <Button onClick={handleSaveChanges} disabled={isLoading} className="mt-4 ml-4">
        {isLoading ? 'Saving...' : 'Save Changes'}
      </Button>
      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
};

export default CollectionsConfig;