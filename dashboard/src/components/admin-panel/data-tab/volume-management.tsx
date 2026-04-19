"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Eye, FileText, Database, Lock, Search, Unlock, Folders, ShieldAlert, Globe, Activity, EyeOff, AlertTriangle } from "lucide-react";
import { UserAuth } from "@/context/auth-context";
import { CANADY_STORE_COLLECTIONS } from "@/zod_schemas/firestore-registry";
import CollectionStructureVisualizer from "@/components/ui/collection-structure-visualizer/collection-structure-visualizer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuthenticationRequired } from "../authentication-tab/authentication-required";
import { useAuthentication } from "@/hooks/use-authentication";
import { AuthSession } from "@/types/candyland";
import { VolumeTestingSuite } from "./volume-testing-suite";
import { FirestoreHealthPanel } from "./firestore-health-panel";
import { FirestoreUsageMapDialog } from "./firestore-usage-map-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDatabase, ref, onValue } from "firebase/database";
import { app } from "@/config/firebase";

interface VolumeDocument {
  id: string;
  type: string;
  createdAt: string;
  dataHash: string;
}

interface VolumeSummary {
  totalChunks: number;
  metadataDocs: number;
  documents: VolumeDocument[];
  dataUsage: {
    value: number;
    unit: string;
  };
  summary: {
    totalDocuments: number;
    dataChunks: number;
    metadataDocuments: number;
    totalDataSize: number;
  };
}

interface PeekResult {
  id: string;
  decryptedContent: any;
  metadata: {
    type: string;
    createdAt: string;
    dataHash: string;
  };
}

interface StaffOption {
  id: string;
  name: string;
  email?: string;
  username?: string;
  status?: string;
}

const JsonNode = ({ label, value, defaultOpen = false }: { label: string, value: any, defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isObject = value !== null && typeof value === 'object';

  if (!isObject) {
    return (
      <div className="flex items-center gap-2 py-1 pl-4 hover:bg-muted/50 rounded px-2">
        <span className="font-medium text-emerald-700 min-w-32">{label}:</span>
        <span className={typeof value === 'string' ? "text-amber-600" : typeof value === 'number' ? "text-blue-500" : "text-purple-500"}>
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }

  return (
    <div className="pl-4">
      <div
        className="flex items-center gap-1 py-1 cursor-pointer hover:bg-muted/50 rounded px-2 select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground stroke-[3]" /> : <ChevronRight className="w-4 h-4 text-muted-foreground stroke-[3]" />}
        <span className="font-semibold text-indigo-700">{label}</span>
        <span className="text-xs text-muted-foreground ml-2">
          {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
        </span>
      </div>
      {isOpen && (
        <div className="border-l-2 border-muted ml-2 pb-1">
          {Object.entries(value).map(([k, v]) => (
            <JsonNode key={k} label={k} value={v} />
          ))}
        </div>
      )}
    </div>
  );
};

export function VolumeManagement({ masterPassword, sessionToken }: { masterPassword?: string, sessionToken?: string }) {
  const { getIDToken, logOut } = UserAuth();
  const { toast } = useToast();
  const { authenticateMasterPassword, authenticateWithPasskey } = useAuthentication();

  const [activeTab, setActiveTab] = useState("encrypted");
  const [rtdbData, setRtdbData] = useState<any>(null);

  const [volumeData, setVolumeData] = useState<VolumeSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [peekDialogOpen, setPeekDialogOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [peekPassword, setPeekPassword] = useState("");
  const [peekResult, setPeekResult] = useState<PeekResult | null>(null);
  const [isPeeking, setIsPeeking] = useState(false);
  const [dangerZoneAction, setDangerZoneAction] = useState<string>("");
  const [dangerZonePassword, setDangerZonePassword] = useState("");
  const [dangerZoneNewPassword, setDangerZoneNewPassword] = useState("");
  const [dangerZoneConfirmNewPassword, setDangerZoneConfirmNewPassword] = useState("");
  const [dangerZoneStaffId, setDangerZoneStaffId] = useState("");
  const [dangerZoneStaffRemovalMode, setDangerZoneStaffRemovalMode] = useState<'firestore-only' | 'full-auth-delete'>('full-auth-delete');
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false);
  const [isPerformingDangerAction, setIsPerformingDangerAction] = useState(false);
  const [isMasterPasswordAuthenticated, setIsMasterPasswordAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [decryptedVault, setDecryptedVault] = useState<Record<string, any> | null>(null);

  // Collection Taxonomy state
  const [healthData, setHealthData] = useState<{
    status: string;
    whitelisted: string[];
    outOfPlace: string[];
    missing: string[];
    topLevelCollectionCount?: number;
    collections: Record<string, { exists: boolean, details?: string }>;
  } | null>(null);

  // Visualizer state
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<Record<string, boolean>>({});
  const [expandedSegments, setExpandedSegments] = useState<string[]>([]);
  const [viewerState, setViewerState] = useState({ isOpen: false, documentId: '', collectionPath: '', documentData: null, isLoading: false, error: null });

  // Decrypted Explorer State
  const [decryptedAssignments, setDecryptedAssignments] = useState<any[] | null>(null);
  const [isDecryptingAll, setIsDecryptingAll] = useState(false);
  const [decryptAllPassword, setDecryptAllPassword] = useState("");
  const [decryptedFilterUser, setDecryptedFilterUser] = useState("");
  const [decryptedFilterItem, setDecryptedFilterItem] = useState("");
  const [decryptedFilterMinQty, setDecryptedFilterMinQty] = useState("");
  const [decryptedFilterMinValue, setDecryptedFilterMinValue] = useState("");

  const [isCollectionsOpen, setIsCollectionsOpen] = useState(false);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);

  const filteredDocuments = volumeData?.documents
    .filter(doc =>
      (doc.id?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (doc.type?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    )
    .slice(0, 20) || [];

  const fetchVolumeData = async (isBackground = false) => {
    try {
      if (!isBackground) setIsLoading(true);
      const idToken = await getIDToken();
      if (!idToken) {
        if (!isBackground) toast({ title: "Authentication required", variant: "destructive" });
        return;
      }

      const response = await fetch('/api/admin/volume', {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        setVolumeData(data);
      } else {
        const error = await response.json();
        if (!isBackground) toast({ title: "Failed to fetch volume data", description: error.error, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error fetching volume data:", error);
      if (!isBackground) toast({ title: "An unexpected error occurred", variant: "destructive" });
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  };

  const fetchHealthData = async () => {
    try {
      const idToken = await getIDToken();
      if (!idToken) return;
      const response = await fetch('/api/admin/data/health', {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHealthData(data);
      }
    } catch (error) {
      console.error("Error fetching health data:", error);
    }
  };

  const fetchStaffOptions = async () => {
    try {
      const idToken = await getIDToken();
      if (!idToken) return;
      const response = await fetch('/api/admin/staff', {
        headers: { 'Authorization': `Bearer ${idToken}` },
        cache: 'no-store',
      });

      if (!response.ok) return;

      const data = await response.json();
      const nextStaff = Array.isArray(data)
        ? data
          .filter((entry: any) => entry?.id && entry?.status !== 'rejected')
          .map((entry: any) => ({
            id: entry.id,
            name: entry.name || 'Unknown Staff',
            email: entry.email || '',
            username: entry.username || '',
            status: entry.status || 'approved',
          }))
        : [];

      setStaffOptions(nextStaff);
    } catch (error) {
      console.error("Error fetching staff options:", error);
    }
  };

  const fetchDocumentsForPath = async (path: string) => {
    setIsLoadingDocs(prev => ({ ...prev, [path]: true }));
    try {
      const response = await fetch(`/api/admin/firestore/documents?collectionPath=${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error(`Failed to fetch documents for ${path}`);
      const data = await response.json();
      setDocuments(prev => [
        ...prev.filter(d => d.collectionPath !== path),
        ...data.map((d: any) => ({ ...d, collectionPath: path }))
      ]);
      setExpandedSegments(prev => [...new Set([...prev, path])]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingDocs(prev => ({ ...prev, [path]: false }));
    }
  };

  const handleToggleSegment = (path: string | null) => {
    if (!path) return;
    const isExpanded = expandedSegments.includes(path);
    if (isExpanded) {
      setExpandedSegments(prev => prev.filter(p => p !== path));
    } else {
      fetchDocumentsForPath(path);
    }
  };

  const handleDocumentClick = async (doc: any) => {
    const { id: docId, collectionPath } = doc;
    setViewerState({ isOpen: true, documentId: docId, collectionPath: collectionPath, documentData: null, isLoading: true, error: null });
    try {
      const response = await fetch(`/api/admin/firestore/documents?collectionPath=${encodeURIComponent(collectionPath)}&docId=${encodeURIComponent(docId)}`);
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to fetch document');
      const data = await response.json();
      setViewerState(prev => ({ ...prev, documentData: data, isLoading: false }));
    } catch (error: any) {
      setViewerState(prev => ({ ...prev, error: error.message, isLoading: false }));
    }
  };

  const handlePeekDocument = async () => {
    if (!selectedDocId || !peekPassword) {
      toast({ title: "Please enter password", variant: "destructive" });
      return;
    }

    try {
      setIsPeeking(true);
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: "Authentication required", variant: "destructive" });
        return;
      }

      const response = await fetch(`/api/admin/volume?peek=${selectedDocId}&password=${encodeURIComponent(peekPassword)}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPeekResult(data);
        toast({ title: "Document decrypted successfully" });
      } else {
        const error = await response.json();
        toast({ title: "Failed to peek document", description: error.error, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error peeking document:", error);
      toast({ title: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setIsPeeking(false);
    }
  };

  const openPeekDialog = (docId: string) => {
    setSelectedDocId(docId);
    setPeekPassword("");
    setPeekResult(null);
    setPeekDialogOpen(true);
  };

  const handleMasterPasswordAuthenticated = (session: AuthSession) => {
    setIsMasterPasswordAuthenticated(true);
  };

  const handleDecryptAllVolume = async () => {
    if (!decryptAllPassword) {
      toast({ title: "Please enter master password", variant: "destructive" });
      return;
    }
    try {
      setIsDecryptingAll(true);
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: "Authentication required", variant: "destructive" });
        return;
      }

      const response = await fetch('/api/admin/volume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'decrypt-all',
          masterPassword: decryptAllPassword
        })
      });

      if (response.ok) {
        const { data } = await response.json();
        setDecryptedVault(data);

        // Also keep assignments for backward comp if explicitly needed by certain components, 
        // but Decrypted Explorer uses decryptedVault
        const assignments: any[] = [];
        if (data && data.inventory && Array.isArray(data.inventory)) {
          data.inventory.forEach((item: any) => {
            if (item.assignments && Array.isArray(item.assignments)) {
              item.assignments.forEach((assign: any) => {
                assignments.push({
                  itemName: item.name,
                  unitValue: item.unitValue,
                  category: item.category,
                  employeeId: assign.employeeId,
                  employeeName: assign.employeeName,
                  quantity: assign.quantity,
                  assignedValue: (assign.quantity * (item.unitValue || 0)).toFixed(2)
                });
              });
            }
          });
        }
        setDecryptedAssignments(assignments);
        toast({ title: "Volume decrypted successfully", description: `Found ${Object.keys(data || {}).length} root collections.` });
        setDecryptAllPassword("");
      } else {
        const error = await response.json();
        toast({ title: "Failed to decrypt volume", description: error.error, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error decrypting entire volume:", error);
      toast({ title: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setIsDecryptingAll(false);
    }
  };

  useEffect(() => {
    fetchVolumeData();
    fetchHealthData();
    fetchStaffOptions();

    // Real-time background polling
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchVolumeData(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'rtdb') {
      const rtdb = getDatabase(app);
      const rootRef = ref(rtdb, '/');
      const unsubscribe = onValue(rootRef, (snapshot) => {
        if (snapshot.exists()) {
          setRtdbData(snapshot.val());
        } else {
          setRtdbData(null);
        }
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  useEffect(() => {
    // Check if master password session is valid
    const sessionStr = sessionStorage.getItem('vishnu_admin_session');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        const now = new Date();
        const expiry = new Date(session.expiresAt);
        if (now < expiry) {
          setIsMasterPasswordAuthenticated(true);
        } else {
          sessionStorage.removeItem('vishnu_admin_session');
        }
      } catch (e) {
          sessionStorage.removeItem('vishnu_admin_session');
      }
    }
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <span className="ml-2">Loading volume data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Require master password authentication for volume management
  if (!isMasterPasswordAuthenticated) {
    return <AuthenticationRequired onAuthenticated={handleMasterPasswordAuthenticated} />;
  }

  // Group collections by taxonomy
  const groupedCollections = CANADY_STORE_COLLECTIONS.reduce((acc, coll) => {
    const cls = coll.classification || 'unknown';
    if (!acc[cls]) acc[cls] = [];
    acc[cls].push(coll);
    return acc;
  }, {} as Record<string, typeof CANADY_STORE_COLLECTIONS>);

  // Render classification badge
  const renderTaxonomyBadge = (classification: string) => {
    switch (classification) {
      case 'public': return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300"><Globe className="w-3 h-3 mr-1" />Public</Badge>;
      case 'private': return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300"><Lock className="w-3 h-3 mr-1" />Private</Badge>;
      case 'shared': return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300"><Folders className="w-3 h-3 mr-1" />Shared PII</Badge>;
      case 'private-plaintext': return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300"><EyeOff className="w-3 h-3 mr-1" />Internal Auth</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Legacy Volume Summary (udhhmbtc) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Volume Structure
            <div className="ml-auto w-auto flex items-center justify-center space-x-2">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 animate-pulse">
                <Activity className="w-3 h-3 mr-1" />
                Live Feed Active
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2 xl:grid-cols-5">
            <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">Total Documents</span>
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2 text-3xl font-bold text-blue-900 tabular-nums">{volumeData?.summary.totalDocuments || 0}</div>
              <p className="text-xs text-blue-700/70 mt-1">Encrypted entities mapped</p>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-emerald-900">AES Data Chunks</span>
                <Database className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-3xl font-bold text-emerald-900 tabular-nums">{volumeData?.summary.dataChunks || 0}</div>
              <p className="text-xs text-emerald-700/70 mt-1">Volume payload partitions</p>
            </div>

            <div className="bg-purple-50/50 border border-purple-100 p-4 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-900">Metadata Docs</span>
                <Lock className="w-4 h-4 text-purple-600" />
              </div>
              <div className="mt-2 text-3xl font-bold text-purple-900 tabular-nums">{volumeData?.summary.metadataDocuments || 0}</div>
              <p className="text-xs text-purple-700/70 mt-1">Headers & encryption keys</p>
            </div>

            <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-indigo-900">Volume Utilization</span>
                <Database className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-indigo-900 tabular-nums">{volumeData?.dataUsage.value || 0}</span>
                <span className="text-lg font-semibold text-indigo-900/70">{volumeData?.dataUsage.unit || 'B'}</span>
              </div>
              <div className="mt-2 w-full bg-indigo-200/50 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(((volumeData?.summary.totalDataSize || 0) / 1048576) * 100, 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-indigo-700/70 font-mono">
                <span>Used</span>
                <span>1MB Limit (Chunk)</span>
              </div>
            </div>

            <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-amber-900">Collections</span>
                <Folders className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2 text-3xl font-bold text-amber-900 tabular-nums">{healthData?.topLevelCollectionCount || 0}</div>
              <p className="text-xs text-amber-700/70 mt-1">Top-level Firestore collections</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <FirestoreHealthPanel
        masterPassword={masterPassword}
        headerActions={<FirestoreUsageMapDialog />}
      />

      {/* Collapsible Test Menu */}
      <Collapsible className="w-full border rounded-lg overflow-hidden bg-card text-card-foreground shadow-sm">
        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="w-5 h-5 text-indigo-600" />
            Volume Testing Suite
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t bg-muted/10">
          <VolumeTestingSuite masterPassword={masterPassword || ""} sessionToken={sessionToken || ""} showHealthSection={false} />
        </CollapsibleContent>
      </Collapsible>

      {/* Main 3-Tab Viewer */}
      <Tabs defaultValue="encrypted" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-3 mb-6">
          <TabsTrigger value="encrypted" className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            <span className="hidden sm:inline">Encrypted Volume Chunks</span>
            <span className="sm:hidden">Encrypted</span>
          </TabsTrigger>
          <TabsTrigger value="decrypted" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline">Decrypted Data Explorer</span>
            <span className="sm:hidden">Decrypted</span>
          </TabsTrigger>
          <TabsTrigger value="rtdb" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            <span className="hidden sm:inline">RTDB Structure</span>
            <span className="sm:hidden">RTDB</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Encrypted Volume Chunks */}
        <TabsContent value="encrypted" className="space-y-6">
          {/* Collections Taxonomy Overview */}
          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-600" /> Collection Platform
                  </CardTitle>
                  <CardDescription>All recognized Firestore collections organized by access taxonomy.</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  {healthData?.status === 'complete' ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><Activity className="w-3 h-3 mr-1" /> Healthy</Badge>
                  ) : (
                    <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> Issues Detected</Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCollectionsOpen(!isCollectionsOpen)}
                    className="flex items-center gap-1"
                  >
                    {isCollectionsOpen ? (
                      <><ChevronUp className="w-4 h-4" /> Hide Layout</>
                    ) : (
                      <><ChevronDown className="w-4 h-4" /> View Layout</>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>

            {isCollectionsOpen && (
              <CardContent className="pt-4 p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x border-b">

                  {/* Public */}
                  <div className="p-4 space-y-3 bg-zinc-50/50">
                    <h3 className="font-semibold text-sm text-zinc-500 uppercase flex items-center gap-2"><Globe className="w-4 h-4" /> Public Configurations</h3>
                    {groupedCollections['public']?.map(coll => (
                      <div key={coll.name} className="flex flex-col gap-2 p-3 bg-white border rounded-md shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-sm font-medium">{coll.name}</span>
                          {healthData?.collections[coll.name]?.exists === false && <Badge variant="destructive" className="scale-75">Missing</Badge>}
                        </div>
                        <CollectionStructureVisualizer
                          collectionName={coll.name}
                          documents={documents.filter(d => d.collectionPath.startsWith(coll.name))}
                          isLoading={isLoadingDocs}
                          expandedSegments={expandedSegments}
                          onToggleSegment={handleToggleSegment}
                          onDocumentClick={handleDocumentClick}
                          viewerState={viewerState}
                          onViewerClose={() => setViewerState(prev => ({ ...prev, isOpen: false }))}
                          onViewerUpdate={() => { if (viewerState.collectionPath) fetchDocumentsForPath(viewerState.collectionPath); }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Shared PII */}
                  <div className="p-4 space-y-3 bg-blue-50/30">
                    <h3 className="font-semibold text-sm text-blue-800 uppercase flex items-center gap-2"><Folders className="w-4 h-4" /> Shared PII (Envelope)</h3>
                    {groupedCollections['shared']?.map(coll => (
                      <div key={coll.name} className="flex flex-col gap-2 p-3 bg-white border border-blue-100 rounded-md shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-sm font-medium">{coll.name}</span>
                        </div>
                        <CollectionStructureVisualizer
                          collectionName={coll.name}
                          documents={documents.filter(d => d.collectionPath.startsWith(coll.name))}
                          isLoading={isLoadingDocs}
                          expandedSegments={expandedSegments}
                          onToggleSegment={handleToggleSegment}
                          onDocumentClick={handleDocumentClick}
                          viewerState={viewerState}
                          onViewerClose={() => setViewerState(prev => ({ ...prev, isOpen: false }))}
                          onViewerUpdate={() => { if (viewerState.collectionPath) fetchDocumentsForPath(viewerState.collectionPath); }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Private Plaintext (Internal/Auth) */}
                  <div className="p-4 space-y-3 bg-amber-50/30">
                    <h3 className="font-semibold text-sm text-amber-800 uppercase flex items-center gap-2"><EyeOff className="w-4 h-4" /> Auth & Internal</h3>
                    {groupedCollections['private-plaintext']?.map(coll => (
                      <div key={coll.name} className="flex flex-col gap-2 p-3 bg-white border border-amber-100 rounded-md shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-sm font-medium">{coll.name}</span>
                        </div>
                        <CollectionStructureVisualizer
                          collectionName={coll.name}
                          documents={documents.filter(d => d.collectionPath.startsWith(coll.name))}
                          isLoading={isLoadingDocs}
                          expandedSegments={expandedSegments}
                          onToggleSegment={handleToggleSegment}
                          onDocumentClick={handleDocumentClick}
                          viewerState={viewerState}
                          onViewerClose={() => setViewerState(prev => ({ ...prev, isOpen: false }))}
                          onViewerUpdate={() => { if (viewerState.collectionPath) fetchDocumentsForPath(viewerState.collectionPath); }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Private Master */}
                  <div className="p-4 space-y-3 bg-red-50/30">
                    <h3 className="font-semibold text-sm text-red-800 uppercase flex items-center gap-2"><Lock className="w-4 h-4" /> AES-256 Volume</h3>
                    {groupedCollections['private']?.map(coll => (
                      <div key={coll.name} className="flex flex-col gap-2 p-3 bg-white border border-red-100 rounded-md shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-sm font-medium">{coll.name}</span>
                        </div>
                        <CollectionStructureVisualizer
                          collectionName={coll.name}
                          documents={documents.filter(d => d.collectionPath.startsWith(coll.name))}
                          isLoading={isLoadingDocs}
                          expandedSegments={expandedSegments}
                          onToggleSegment={handleToggleSegment}
                          onDocumentClick={handleDocumentClick}
                          viewerState={viewerState}
                          onViewerClose={() => setViewerState(prev => ({ ...prev, isOpen: false }))}
                          onViewerUpdate={() => { if (viewerState.collectionPath) fetchDocumentsForPath(viewerState.collectionPath); }}
                        />
                      </div>
                    ))}
                  </div>

                </div>
              </CardContent>
            )}
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Encrypted Documents
              </CardTitle>
              <div className="relative w-64 text-muted-foreground">
                <Search className="absolute left-2 top-2.5 h-4 w-4" />
                <Input
                  placeholder="Search by ID or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Document ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-sm">{doc.id}</TableCell>
                        <TableCell>
                          <Badge variant={doc.type === 'meta-data' || doc.type === 'auth' ? 'secondary' : 'default'}>
                            {doc.type || 'data'}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(doc.createdAt).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <Lock className="w-3 h-3 mr-1" />
                            Encrypted
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPeekDialog(doc.id)}
                            className="flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            Peek
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredDocuments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No documents found matching "{searchQuery}"
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                Showing {filteredDocuments.length} of {volumeData?.documents.length || 0} documents (capped at 20)
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        {/* Tab 2: Decrypted Data Explorer */}
        <TabsContent value="decrypted" className="space-y-6">
          {/* Decrypted Volume Explorer */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
              <CardTitle className="flex items-center gap-2 text-green-700">
                <Unlock className="w-5 h-5" />
                Global Decrypted Data Explorer
              </CardTitle>
              {!decryptedVault && (
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    placeholder="Master Password"
                    value={decryptAllPassword}
                    onChange={(e) => setDecryptAllPassword(e.target.value)}
                    className="w-48"
                  />
                  <Button onClick={handleDecryptAllVolume} disabled={isDecryptingAll || !decryptAllPassword}>
                    {isDecryptingAll ? "Decrypting..." : "Decrypt All"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-6">
              {!decryptedVault ? (
                <div className="text-center text-muted-foreground py-8">
                  <Lock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>Enter your master password to comprehensively decrypt and explore the aggregated volume payload.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-end mb-4">
                    <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setDecryptedVault(null); setDecryptedAssignments(null); }}>
                      <Lock className="w-4 h-4 mr-2" /> Re-lock Volume
                    </Button>
                  </div>

                  <Tabs defaultValue={Object.keys(decryptedVault)[0]} className="w-full">
                    <TabsList className="mb-4 flex flex-wrap h-auto gap-2">
                      {Object.keys(decryptedVault).map(key => (
                        <TabsTrigger key={key} value={key} className="capitalize flex items-center gap-2">
                          <Database className="w-3 h-3" />
                          <span className="hidden sm:inline">
                            {key} ({Array.isArray(decryptedVault[key]) ? decryptedVault[key].length : 1})
                          </span>
                          <span className="sm:hidden">{key}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {Object.entries(decryptedVault).map(([key, value]) => {
                      const isArray = Array.isArray(value);
                      const columns = isArray && value.length > 0
                        ? Array.from(new Set((value as any[]).flatMap(item => Object.keys(item || {})))).filter(c => typeof c === 'string').slice(0, 10)
                        : [];

                      return (
                        <TabsContent key={key} value={key}>
                          <div className="rounded-md border p-1 bg-background relative overflow-hidden">
                            {!isArray || value.length === 0 ? (
                              <pre className="text-sm p-4 overflow-auto max-h-[500px]">
                                {JSON.stringify(value, null, 2)}
                              </pre>
                            ) : (
                              <div className="max-h-[500px] overflow-auto">
                                <Table>
                                  <TableHeader className="sticky top-0 bg-secondary/80 backdrop-blur z-10 border-b">
                                    <TableRow>
                                      {columns.map(col => <TableHead key={col} className="font-semibold text-xs whitespace-nowrap">{col}</TableHead>)}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(value as any[]).slice(0, 500).map((row, i) => (
                                      <TableRow key={i} className="hover:bg-muted/50">
                                        {columns.map(col => (
                                          <TableCell key={col} className="max-w-[200px] truncate text-xs py-2">
                                            {typeof row[col] === 'object' && row[col] !== null
                                              ? JSON.stringify(row[col])
                                              : String(row[col] ?? '')}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                    {(value as any[]).length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">No records</TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                            {isArray && value.length > 500 && (
                              <div className="w-full p-2 text-center text-xs font-medium bg-muted/30 border-t text-muted-foreground">
                                Showing 500 of {value.length} records in `{key}`
                              </div>
                            )}
                          </div>
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: RTDB Structure Visualizer */}
        <TabsContent value="rtdb" className="space-y-6">
          <Card className="border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b bg-blue-50/50 rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <Database className="w-5 h-5" />
                Sentinel RTDB Visualizer (Live)
              </CardTitle>
              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 animate-pulse">
                Live Feed
              </Badge>
            </CardHeader>
            <CardContent className="pt-6">
              {!rtdbData ? (
                <div className="text-center text-muted-foreground py-12">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-20 animate-pulse" />
                  <p>Connecting to Realtime Database...</p>
                </div>
              ) : (
                <div className="rounded-md border bg-zinc-50/50 p-4 max-h-[600px] overflow-auto font-mono text-sm shadow-inner">
                  <JsonNode label="root" value={rtdbData} defaultOpen={true} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Peek Dialog */}
      <Dialog open={peekDialogOpen} onOpenChange={setPeekDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Peek into Document: {selectedDocId}
            </DialogTitle>
            <DialogDescription>
              Enter your master password to decrypt and view the contents of this encrypted document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="peek-password">Master Password</Label>
              <Input
                id="peek-password"
                type="password"
                value={peekPassword}
                onChange={(e) => setPeekPassword(e.target.value)}
                placeholder="Enter master password"
              />
            </div>

            {peekResult && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Document Content:</h4>
                {peekResult.metadata.type === 'data-chunk' ? (
                  <div className="text-sm bg-white p-3 rounded border">
                    <p className="text-amber-600 font-medium">⚠️ Data Chunk Document</p>
                    <p className="mt-2">{peekResult.decryptedContent.message}</p>
                    <div className="mt-3 text-gray-600">
                      <p><strong>Chunk Length:</strong> {peekResult.decryptedContent.chunkInfo.chunkLength} characters</p>
                      <p><strong>Updated:</strong> {new Date(peekResult.decryptedContent.chunkInfo.updatedAt).toLocaleString()}</p>
                    </div>
                  </div>
                ) : (
                  <pre className="text-sm bg-white p-3 rounded border overflow-auto max-h-64">
                    {JSON.stringify(peekResult.decryptedContent, null, 2)}
                  </pre>
                )}
                <div className="mt-3 text-sm text-gray-600">
                  <p><strong>Type:</strong> {peekResult.metadata.type}</p>
                  <p><strong>Created:</strong> {new Date(peekResult.metadata.createdAt).toLocaleString()}</p>
                  {peekResult.metadata.dataHash && (
                    <p><strong>Data Hash:</strong> {peekResult.metadata.dataHash}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPeekDialogOpen(false)}>
                Close
              </Button>
              <Button onClick={handlePeekDocument} disabled={isPeeking}>
                {isPeeking ? "Decrypting..." : "Decrypt & View"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600 flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            Danger Zone
          </CardTitle>
          <CardDescription>
            These actions are irreversible and may result in permanent data loss.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-1">
            {/* Reset Volume Data */}
            <div className="border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-red-900">Reset Volume Data</h4>
                  <p className="text-sm text-red-700">
                    Clears all sales and product data but preserves the volume structure and authentication.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDangerZoneAction('reset-volume-data');
                    setIsDangerZoneOpen(true);
                  }}
                >
                  Reset Data
                </Button>
              </div>
            </div>

            {/* Nuke Database */}
            <div className="border border-red-200 rounded-lg p-4">
              <div className="flex flex-col gap-2">
                <div>
                  <h4 className="font-semibold text-red-900">Nuke Database</h4>
                  <p className="text-sm text-red-700">
                    Permanently deletes ALL data and collections.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setDangerZoneAction('nuke-preserve-config');
                      setIsDangerZoneOpen(true);
                    }}
                  >
                    Wipe Everything (keep config)
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="bg-red-900 hover:bg-black"
                    onClick={() => {
                      setDangerZoneAction('nuke-full-wipe');
                      setIsDangerZoneOpen(true);
                    }}
                  >
                    Full Wipe (including config)
                  </Button>
                </div>
              </div>
            </div>

            {/* Reset Staff Public Keys */}
            <div className="border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-red-900">Reset Staff Public Keys</h4>
                  <p className="text-sm text-red-700">
                    Forces all staff to create new encryption keys. Deletes public keys.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDangerZoneAction('reset-staff-keys');
                    setIsDangerZoneOpen(true);
                  }}
                >
                  Reset Keys
                </Button>
              </div>
            </div>

            {/* Delete All Staff Data */}
            <div className="border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-red-900">Delete All Staff Data</h4>
                  <p className="text-sm text-red-700">
                    Full staff wipe: keys, assignments, and encrypted data.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDangerZoneAction('reset-staff-all');
                    setIsDangerZoneOpen(true);
                  }}
                >
                  Delete Data
                </Button>
              </div>
            </div>

            <div className="border border-red-200 rounded-lg p-4">
              <div className="flex flex-col gap-3">
                <div>
                  <h4 className="font-semibold text-red-900">Delete Specific Staff Member</h4>
                  <p className="text-sm text-red-700">
                    Completely wipe one staff member from the system, including auth, username, keys, passkeys, inventory traces, and chats.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="danger-zone-staff">Staff Member</Label>
                    <Select value={dangerZoneStaffId} onValueChange={setDangerZoneStaffId}>
                      <SelectTrigger id="danger-zone-staff">
                        <SelectValue placeholder="Select a staff member to purge" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffOptions.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.name}{staff.username ? ` (@${staff.username})` : ''}{staff.email ? ` - ${staff.email}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!dangerZoneStaffId}
                    onClick={() => {
                      setDangerZoneStaffRemovalMode('full-auth-delete');
                      setDangerZoneAction('delete-specific-staff');
                      setIsDangerZoneOpen(true);
                    }}
                  >
                    Purge Staff
                  </Button>
                </div>
              </div>
            </div>

            {/* Rotate Sentinel Codebook */}
            <div className="border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-red-900">Rotate Sentinel Codebook</h4>
                  <p className="text-sm text-red-700">
                    Immediately invalidates all staff encrypted signal channels and forces them to re-setup.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDangerZoneAction('rotate-codebook');
                    setIsDangerZoneOpen(true);
                  }}
                >
                  Rotate Codebook
                </Button>
              </div>
            </div>

            {/* Change Master Password */}
            <div className="border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-red-900">Change Master Password</h4>
                  <p className="text-sm text-red-700">
                    Decrypts all data with current password and re-encrypts with new password.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDangerZoneAction('change-master-password');
                    setIsDangerZoneOpen(true);
                  }}
                >
                  Change Password
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone Confirmation Dialog */}
      <Dialog open={isDangerZoneOpen} onOpenChange={setIsDangerZoneOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {dangerZoneAction === 'reset-volume-data' && 'Reset Volume Data'}
              {dangerZoneAction === 'reset-staff-keys' && 'Reset Staff Public Keys'}
              {dangerZoneAction === 'reset-staff-all' && 'Delete All Staff Data'}
              {dangerZoneAction === 'delete-specific-staff' && 'Delete Specific Staff Member'}
              {dangerZoneAction === 'rotate-codebook' && 'Rotate Sentinel Codebook'}
              {dangerZoneAction === 'nuke-preserve-config' && 'Nuke Database (Preserve Config)'}
              {dangerZoneAction === 'nuke-full-wipe' && 'Nuke Database (Full Wipe)'}
              {dangerZoneAction === 'change-master-password' && 'Change Master Password'}
            </DialogTitle>
            <DialogDescription>
              {dangerZoneAction === 'reset-volume-data' && 'This will delete all sales, product, user and staff data but keep the volume structure. Master password will require re-setup.'}
              {dangerZoneAction === 'reset-staff-keys' && 'This will delete all staff public keys and force them to generate new ones. Master password required.'}
              {dangerZoneAction === 'reset-staff-all' && 'This will delete ALL staff documents including keys and inventory assignments. Master password required.'}
              {dangerZoneAction === 'delete-specific-staff' && 'This permanently removes the selected staff member from the system, including auth, passkeys, inventory traces, and volume-linked records. Master password required.'}
              {dangerZoneAction === 'rotate-codebook' && 'This will securely rotate the Sentinel codebook system wide. Master password required.'}
              {dangerZoneAction === 'nuke-preserve-config' && 'This will permanently delete ALL data and collections, except app-config and assistant-config. This action cannot be undone. Master password required.'}
              {dangerZoneAction === 'nuke-full-wipe' && 'This will permanently delete EVERY collection including configurations. This action cannot be undone. Master password required.'}
              {dangerZoneAction === 'change-master-password' && 'This will decrypt all data with your current password and re-encrypt it with the new password.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {dangerZoneAction === 'delete-specific-staff' && (
              <div className="space-y-3 rounded-md border border-red-200 bg-red-50/70 p-3 text-sm text-red-800">
                <div className="space-y-2">
                  <Label>Selected Staff</Label>
                  <div>
                    {staffOptions.find((staff) => staff.id === dangerZoneStaffId)?.name || 'No staff member selected'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Removal Mode</Label>
                  <Select
                    value={dangerZoneStaffRemovalMode}
                    onValueChange={(value: 'firestore-only' | 'full-auth-delete') => setDangerZoneStaffRemovalMode(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-auth-delete">Delete Firestore data + Firebase Auth user</SelectItem>
                      <SelectItem value="firestore-only">Delete Firestore data only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-red-700">
                  {dangerZoneStaffRemovalMode === 'full-auth-delete'
                    ? 'The selected user will be removed from Firebase Authentication as well.'
                    : 'The selected user will remain in Firebase Authentication and can be reattached later.'}
                </div>
              </div>
            )}

            {(dangerZoneAction === 'reset-volume-data' || dangerZoneAction === 'reset-staff-keys' || dangerZoneAction === 'reset-staff-all' || dangerZoneAction === 'delete-specific-staff' || dangerZoneAction === 'rotate-codebook' || dangerZoneAction === 'nuke-preserve-config' || dangerZoneAction === 'nuke-full-wipe') && (
              <div>
                <Label htmlFor="reset-password">Confirm Master Password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  value={dangerZonePassword}
                  onChange={(e) => setDangerZonePassword(e.target.value)}
                  placeholder="Enter master password"
                />
              </div>
            )}

            {dangerZoneAction === 'change-master-password' && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="current-password">Current Master Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={dangerZonePassword}
                    onChange={(e) => setDangerZonePassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <Label htmlFor="new-password">New Master Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={dangerZoneNewPassword}
                    onChange={(e) => setDangerZoneNewPassword(e.target.value)}
                    placeholder="Enter new password (min 12 characters)"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-new-password">Confirm New Master Password</Label>
                  <Input
                    id="confirm-new-password"
                    type="password"
                    value={dangerZoneConfirmNewPassword}
                    onChange={(e) => setDangerZoneConfirmNewPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDangerZoneOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDangerZoneAction}
                disabled={isPerformingDangerAction}
              >
                {isPerformingDangerAction ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  async function handleDangerZoneAction() {
    if (!dangerZoneAction) return;

    try {
      setIsPerformingDangerAction(true);
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: "Authentication required", variant: "destructive" });
        return;
      }

      const requestBody: any = { action: dangerZoneAction };

      if (dangerZoneAction === 'reset-volume-data' || dangerZoneAction === 'reset-staff-keys' || dangerZoneAction === 'reset-staff-all' || dangerZoneAction === 'delete-specific-staff' || dangerZoneAction === 'rotate-codebook' || dangerZoneAction === 'nuke-preserve-config' || dangerZoneAction === 'nuke-full-wipe') {
        if (!dangerZonePassword) {
          toast({ title: "Master password is required", variant: "destructive" });
          return;
        }
        if (dangerZoneAction === 'reset-volume-data') {
          requestBody.masterPassword = dangerZonePassword;
        }
        if (dangerZoneAction === 'nuke-preserve-config') {
          requestBody.preserveAppConfig = true;
        }
        if (dangerZoneAction === 'nuke-full-wipe') {
          requestBody.preserveAppConfig = false;
        }
      } else if (dangerZoneAction === 'change-master-password') {
        if (!dangerZonePassword || !dangerZoneNewPassword || !dangerZoneConfirmNewPassword) {
          toast({ title: "All password fields are required", variant: "destructive" });
          return;
        }
        if (dangerZoneNewPassword !== dangerZoneConfirmNewPassword) {
          toast({ title: "New passwords do not match", variant: "destructive" });
          return;
        }
        if (dangerZoneNewPassword.length < 12) {
          toast({ title: "New password must be at least 12 characters long", variant: "destructive" });
          return;
        }
        requestBody.masterPassword = dangerZonePassword;
        requestBody.newMasterPassword = dangerZoneNewPassword;
        requestBody.confirmNewMasterPassword = dangerZoneConfirmNewPassword;
      }

      let url = '/api/admin/volume';
      let headers: any = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      };

      if (dangerZonePassword) {
        requestBody.masterPassword = dangerZonePassword;
      }

      if (dangerZoneAction === 'reset-staff-keys' || dangerZoneAction === 'reset-staff-all') {
        url = '/api/admin/data/reset-staff';
      } else if (dangerZoneAction === 'delete-specific-staff') {
        if (!dangerZoneStaffId) {
          toast({ title: "Select a staff member first", variant: "destructive" });
          return;
        }
        url = `/api/admin/staff-data/${dangerZoneStaffId}`;
        requestBody.deleteAuthUser = dangerZoneStaffRemovalMode === 'full-auth-delete';
      } else if (dangerZoneAction === 'rotate-codebook') {
        url = '/api/rtdb/codebook';
        requestBody.action = 'rotate';
      } else if (dangerZoneAction === 'nuke-preserve-config' || dangerZoneAction === 'nuke-full-wipe') {
        url = '/api/admin/data/nuke';
      }

      const response = await fetch(url, {
        method: dangerZoneAction === 'delete-specific-staff' ? 'DELETE' : 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const result = await response.json();
        toast({ title: result.message });

        // Refresh volume data
        await fetchVolumeData();
        await fetchStaffOptions();

        // Close dialog and reset form
        setIsDangerZoneOpen(false);
        setDangerZonePassword('');
        setDangerZoneNewPassword('');
        setDangerZoneConfirmNewPassword('');
        setDangerZoneAction('');
        setDangerZoneStaffId('');
        setDangerZoneStaffRemovalMode('full-auth-delete');

        // Force reauthentication for security
        if (dangerZoneAction === 'change-master-password') {
          await logOut();
        }
      } else {
        const error = await response.json();
        toast({ title: "Operation failed", description: error.error, variant: "destructive" });
      }
    } catch (error) {
      console.error("Error performing danger zone action:", error);
      toast({ title: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setIsPerformingDangerAction(false);
    }
  }
}
