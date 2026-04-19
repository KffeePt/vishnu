import { useState, useEffect, useCallback } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Database, RotateCcw } from "lucide-react";
import CollectionStructureVisualizer from './collection-structure-visualizer';

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
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBulkOperationLoading, setIsBulkOperationLoading] = useState(false);

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
      const response = await fetch('/api/admin/data/collection-configs');
      if (!response.ok) {
        throw new Error('Failed to fetch collections');
      }
      const data = await response.json();
      // Filter out appConfig and users collections, and map data to expected format
      const filteredData = data
        .filter((collection: any) => collection.id !== 'app-config' && collection.id !== 'users')
        .map((collection: any) => ({
          id: collection.id,
          name: collection.id,
          docIdSegments: collection.docIdSegments || [],
          fields: collection.fields || [],
          isUnconfigured: collection.isUnconfigured,
          isOrphaned: collection.isOrphaned,
        }));
      setCollections(filteredData);
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
        const response = await fetch(`/api/admin/firestore/documents?path=${path}`);
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
      const response = await fetch(`/api/admin/firestore/documents?path=${doc.collectionPath}/${doc.id}`);
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
    const updatedCollections = collections.map(c => c.id === id ? { ...c, ...updatedConfig } : c);
    setCollections(updatedCollections);
    // Auto-save when changes are made
    saveCollections(updatedCollections);
  };

  const handleRemoveCollection = (id: string) => {
    setCollections(collections.filter(c => c.id !== id));
  };

  const handleSaveChanges = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/data/collection-configs', {
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

  const saveCollections = async (collectionsToSave: CollectionConfig[]) => {
    try {
      const response = await fetch('/api/admin/data/collection-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectionsToSave),
      });
      if (!response.ok) {
        throw new Error('Failed to save collections');
      }
      await fetchCollections();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSelectionChange = (collectionId: string, checked: boolean) => {
    setSelectedCollections(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(collectionId);
      } else {
        newSet.delete(collectionId);
      }
      return newSet;
    });
  };

  const handleBulkDeleteCollections = async () => {
    if (selectedCollections.size === 0) return;

    setIsBulkOperationLoading(true);
    try {
      for (const collectionId of selectedCollections) {
        const response = await fetch('/api/admin/data/collection-configs', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectionName: collectionId, deleteCollection: true }),
        });
        if (!response.ok) {
          throw new Error(`Failed to delete collection ${collectionId}`);
        }
      }
      setSelectedCollections(new Set());
      await fetchCollections();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleBulkDeleteData = async () => {
    if (selectedCollections.size === 0) return;

    setIsBulkOperationLoading(true);
    try {
      for (const collectionId of selectedCollections) {
        const response = await fetch('/api/admin/data/collection-configs', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectionName: collectionId }),
        });
        if (!response.ok) {
          throw new Error(`Failed to delete data from collection ${collectionId}`);
        }
      }
      setSelectedCollections(new Set());
      await fetchCollections();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  const handleBulkInitializeStructure = async () => {
    if (selectedCollections.size === 0) return;

    setIsBulkOperationLoading(true);
    try {
      for (const collectionId of selectedCollections) {
        // Clear all data and create structure via API
        const response = await fetch(`/api/admin/system/initialize?collectionId=${encodeURIComponent(collectionId)}`);
        if (!response.ok) {
          throw new Error(`Failed to initialize structure for collection ${collectionId}`);
        }
      }
      setSelectedCollections(new Set());
      await fetchCollections();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBulkOperationLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Bulk Operations</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleBulkDeleteCollections}
            disabled={selectedCollections.size === 0 || isBulkOperationLoading}
            variant="destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Collections ({selectedCollections.size})
          </Button>
          <Button
            onClick={handleBulkDeleteData}
            disabled={selectedCollections.size === 0 || isBulkOperationLoading}
            variant="destructive"
          >
            <Database className="mr-2 h-4 w-4" />
            Clear Data ({selectedCollections.size})
          </Button>
          <Button
            onClick={handleBulkInitializeStructure}
            disabled={selectedCollections.size === 0 || isBulkOperationLoading}
            variant="outline"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Initialize Structure ({selectedCollections.size})
          </Button>
        </div>
        {selectedCollections.size > 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            {selectedCollections.size} collection{selectedCollections.size !== 1 ? 's' : ''} selected
          </p>
        )}
      </div>

      <Accordion type="single" collapsible className="w-full">
        {collections.map(collection => (
          <AccordionItem key={collection.id} value={collection.id}>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`select-${collection.id}`}
                checked={selectedCollections.has(collection.id)}
                onCheckedChange={(checked) => handleSelectionChange(collection.id, checked as boolean)}
              />
              <AccordionTrigger className="flex-1">{collection.name || "New Collection"}</AccordionTrigger>
            </div>
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
                  <CollectionStructureVisualizer
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
      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
};

export default CollectionsConfig;
