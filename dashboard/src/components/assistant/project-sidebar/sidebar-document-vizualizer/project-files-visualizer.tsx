"use client";

import { useState, useEffect, useCallback } from "react";
import { File, Folder, ChevronDown, ChevronRight, Loader2, MoreVertical, Plus, Edit, Trash2 } from "lucide-react";
import FileViewer from './file-viewer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAuth } from "@/context/auth-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  userId: string;
}

const ProjectFilesVisualizer = () => {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const { getIDToken } = UserAuth() as any;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", type: 'directory' as 'file' | 'directory', parentId: null as string | null });

  const fetchFileTree = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getIDToken();
      const response = await fetch('/api/project-files', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch project files.');
      }
      const data = await response.json();
      setFileTree(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [getIDToken]);

  useEffect(() => {
    const checkTokenAndFetch = async () => {
      try {
        const token = await getIDToken();
        if (token) {
          fetchFileTree();
        }
      } catch (error) {
        console.error("Error getting ID token:", error);
        setError("Authentication failed. Please log in again.");
      }
    };

    checkTokenAndFetch();
  }, [fetchFileTree, getIDToken]);

  const openCreateDialog = (parentId: string | null, type: 'file' | 'directory') => {
    setNewItem({ name: "", type, parentId });
    setIsCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!newItem.name) return;

    const parent = newItem.parentId ? findNodeById(fileTree, newItem.parentId) : null;
    const newPath = parent ? `${parent.path}/${newItem.name}` : newItem.name;
    
    const token = await getIDToken();
    await fetch('/api/project-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: newItem.name, path: newPath, type: newItem.type, content: '', children: [] }),
    });
    fetchFileTree();
    setIsCreateDialogOpen(false);
  };

  const handleRename = async (node: FileNode) => {
    if (!newName) {
      setRenamingPath(null);
      return;
    }
    const newPath = node.path.substring(0, node.path.lastIndexOf('/') + 1) + newName;
    const token = await getIDToken();
    await fetch('/api/project-files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: node.id, newPath, newName }),
    });
    setRenamingPath(null);
    setNewName("");
    fetchFileTree();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to delete this item?`)) return;
    const token = await getIDToken();
    await fetch(`/api/project-files?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    fetchFileTree();
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const handleFileClick = (file: FileNode) => {
    setSelectedFile(file);
    setIsViewerOpen(true);
  };

  const handleViewerClose = () => {
    setIsViewerOpen(false);
    setSelectedFile(null);
  };

  const findNodeById = (nodes: FileNode[], id: string): FileNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };
  
  const renderTree = (nodes: FileNode[], level = 0): React.ReactElement[] => {
    return nodes.map(node => (
      <div key={node.id} style={{ paddingLeft: `${level * 1.5}rem` }} className="group">
        <div className="flex items-center hover:bg-gray-700 rounded p-1 justify-between">
          <div className="flex items-center cursor-pointer" onClick={() => node.type === 'directory' ? toggleFolder(node.path) : handleFileClick(node)}>
            {node.type === 'directory' ? (
              expandedFolders.has(node.path) ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />
            ) : null}
            {node.type === 'directory' ? <Folder className="h-5 w-5 mr-2 text-yellow-500" /> : <File className="h-5 w-5 mr-2 text-blue-400" />}
            {renamingPath === node.path ? (
              <Input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => handleRename(node)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename(node)}
                autoFocus
                className="h-6"
              />
            ) : (
              <span>{node.name}</span>
            )}
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {node.type === 'directory' && (
                  <>
                    <DropdownMenuItem onClick={() => openCreateDialog(node.id, 'file')}>
                      <Plus className="mr-2 h-4 w-4" /> New File
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openCreateDialog(node.id, 'directory')}>
                      <Plus className="mr-2 h-4 w-4" /> New Folder
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => { setRenamingPath(node.path); setNewName(node.name); }}>
                  <Edit className="mr-2 h-4 w-4" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(node.id)} className="text-red-500">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {node.type === 'directory' && expandedFolders.has(node.path) && node.children && renderTree(node.children, level + 1)}
      </div>
    ));
  };

  if (isLoading) {
    return <div className="flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div>
      <Button onClick={() => openCreateDialog(null, 'directory')} className="mb-4">
        <Plus className="mr-2 h-4 w-4" /> New Project
      </Button>
      {renderTree(fileTree)}
      {selectedFile && (
        <FileViewer
          isOpen={isViewerOpen}
          onClose={handleViewerClose}
          file={selectedFile}
        />
      )}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New {newItem.type}</DialogTitle>
            <DialogDescription>
              Enter a name for your new {newItem.type}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                className="col-span-3"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectFilesVisualizer;
