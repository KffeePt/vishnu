"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { UserAuth } from "@/context/auth-context";
import { getAdminHeaders } from "@/lib/client-auth";
import { Database, FolderTree, HardDrive, Loader2 } from "lucide-react";

type UsageNode = {
  name: string;
  path: string;
  bytes: number;
  directBytes: number;
  directDocCount: number;
  totalDocCount: number;
  collectionCount: number;
  children: UsageNode[];
};

type UsageMapResponse = {
  generatedAt: string;
  summary: {
    totalBytes: number;
    totalDocuments: number;
    totalCollections: number;
    topLevelCollections: number;
  };
  tree: UsageNode;
};

function formatBytes(bytes: number) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
}

function getNodeColor(path: string) {
  const palette = [
    "from-rose-500/20 to-orange-400/20 border-rose-300/60",
    "from-sky-500/20 to-cyan-400/20 border-sky-300/60",
    "from-emerald-500/20 to-lime-400/20 border-emerald-300/60",
    "from-violet-500/20 to-fuchsia-400/20 border-violet-300/60",
    "from-amber-500/20 to-yellow-400/20 border-amber-300/60",
    "from-teal-500/20 to-green-400/20 border-teal-300/60",
  ];

  const hash = Array.from(path).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function flattenDescendants(node: UsageNode): UsageNode[] {
  return node.children.flatMap((child) => [child, ...flattenDescendants(child)]);
}

export function FirestoreUsageMapDialog() {
  const { getIDToken } = UserAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [usageData, setUsageData] = useState<UsageMapResponse | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

  useEffect(() => {
    if (!open || usageData || isLoading) return;

    const loadUsageMap = async () => {
      try {
        setIsLoading(true);
        const idToken = await getIDToken();
        if (!idToken) return;

        const response = await fetch("/api/admin/data/usage-map", {
          headers: getAdminHeaders(idToken),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || "Failed to load Firestore usage map");
        }

        const data = await response.json();
        setUsageData(data);
        setSelectedPath([]);
      } catch (error: any) {
        toast({
          title: "Failed to load usage map",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadUsageMap();
  }, [open, usageData, isLoading, getIDToken, toast]);

  const currentNode = useMemo(() => {
    if (!usageData) return null;

    let node = usageData.tree;
    for (const path of selectedPath) {
      const nextNode = node.children.find((child) => child.path === path);
      if (!nextNode) break;
      node = nextNode;
    }
    return node;
  }, [selectedPath, usageData]);

  const breadcrumbs = useMemo(() => {
    if (!usageData || !currentNode) return [];
    const nodes: UsageNode[] = [usageData.tree];
    let node = usageData.tree;

    for (const path of selectedPath) {
      const nextNode = node.children.find((child) => child.path === path);
      if (!nextNode) break;
      nodes.push(nextNode);
      node = nextNode;
    }

    return nodes;
  }, [currentNode, selectedPath, usageData]);

  const rankedChildren = useMemo(() => {
    if (!currentNode) return [];
    return [...currentNode.children].sort((a, b) => b.bytes - a.bytes);
  }, [currentNode]);

  const heaviestDescendants = useMemo(() => {
    if (!currentNode) return [];
    return flattenDescendants(currentNode).sort((a, b) => b.bytes - a.bytes).slice(0, 8);
  }, [currentNode]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <HardDrive className="h-4 w-4" />
          Open Usage Map
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-amber-600" />
            Firestore Usage Map
          </DialogTitle>
          <DialogDescription>
            Explore Firestore storage like a Filelight-style map to see which collections and subcollections use the most space.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !usageData || !currentNode ? (
          <div className="flex h-[60vh] items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building collection usage map...
            </div>
          </div>
        ) : (
          <div className="space-y-4 overflow-hidden">
            <div className="grid gap-3 md:grid-cols-4">
              <Card className="bg-amber-50/50">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-amber-800">Estimated Size</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-950">{formatBytes(usageData.summary.totalBytes)}</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50/50">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-blue-800">Collections</p>
                  <p className="mt-1 text-2xl font-semibold text-blue-950">{usageData.summary.totalCollections}</p>
                </CardContent>
              </Card>
              <Card className="bg-emerald-50/50">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-emerald-800">Documents</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-950">{usageData.summary.totalDocuments}</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50/50">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-purple-800">Generated</p>
                  <p className="mt-1 text-sm font-semibold text-purple-950">{new Date(usageData.generatedAt).toLocaleString()}</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {breadcrumbs.map((node, index) => (
                <React.Fragment key={node.path}>
                  <Button
                    variant={index === breadcrumbs.length - 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedPath(breadcrumbs.slice(1, index + 1).map((entry) => entry.path))}
                  >
                    {node.name}
                  </Button>
                  {index < breadcrumbs.length - 1 ? <span className="text-muted-foreground">/</span> : null}
                </React.Fragment>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
              <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Usage Mosaic</CardTitle>
                  <CardDescription>
                    Click a block to drill into a collection path. Larger blocks represent more estimated storage usage.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {rankedChildren.length > 0 ? (
                    <div className="flex min-h-[420px] flex-wrap gap-3">
                      {rankedChildren.map((node) => {
                        const share = currentNode.bytes > 0 ? Math.max((node.bytes / currentNode.bytes) * 100, 8) : 12;
                        return (
                          <button
                            key={node.path}
                            type="button"
                            onClick={() => setSelectedPath((prev) => [...prev, node.path])}
                            className={`relative flex min-h-[120px] min-w-[180px] flex-1 basis-[220px] flex-col justify-between overflow-hidden rounded-xl border bg-gradient-to-br p-4 text-left transition-transform hover:-translate-y-0.5 ${getNodeColor(node.path)}`}
                            style={{ flexGrow: Math.max(node.bytes, 1), minWidth: `${Math.min(360, Math.max(180, share * 4))}px` }}
                          >
                            <div className="space-y-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{node.name}</p>
                              <p className="text-[11px] text-slate-700">{node.path.replace(/\//g, " / ")}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-lg font-bold text-slate-950">{formatBytes(node.bytes)}</p>
                              <div className="flex flex-wrap gap-2 text-[11px] text-slate-700">
                                <span>{node.totalDocCount} docs</span>
                                <span>{node.collectionCount} collections</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                      This collection path has no deeper child collections.
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Current Selection</CardTitle>
                    <CardDescription>{currentNode.path === "__root__" ? "Root database summary" : currentNode.path}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Estimated size</span>
                      <Badge variant="secondary">{formatBytes(currentNode.bytes)}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Direct documents</span>
                      <span>{currentNode.directDocCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total documents</span>
                      <span>{currentNode.totalDocCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Nested collections</span>
                      <span>{currentNode.collectionCount}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Most Used Here</CardTitle>
                    <CardDescription>Largest child collections in the current view.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[220px]">
                      <div className="space-y-2 p-4">
                        {rankedChildren.length > 0 ? rankedChildren.map((node) => {
                          const percentage = currentNode.bytes > 0 ? (node.bytes / currentNode.bytes) * 100 : 0;
                          return (
                            <button
                              key={node.path}
                              type="button"
                              onClick={() => setSelectedPath((prev) => [...prev, node.path])}
                              className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium">{node.name}</span>
                                <span className="text-xs text-muted-foreground">{formatBytes(node.bytes)}</span>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                                <div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.max(percentage, 4)}%` }} />
                              </div>
                            </button>
                          );
                        }) : (
                          <p className="text-sm text-muted-foreground">No child collections to rank here.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Heaviest Descendants</CardTitle>
                    <CardDescription>The biggest collection paths under the current selection.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[220px]">
                      <div className="space-y-2 p-4">
                        {heaviestDescendants.length > 0 ? heaviestDescendants.map((node) => (
                          <div key={node.path} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium">{node.name}</span>
                              <span className="text-xs text-muted-foreground">{formatBytes(node.bytes)}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">{node.path}</p>
                          </div>
                        )) : (
                          <p className="text-sm text-muted-foreground">No deeper descendants under this path.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
