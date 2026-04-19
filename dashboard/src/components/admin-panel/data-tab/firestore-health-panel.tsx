"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { UserAuth } from "@/context/auth-context";
import { getAdminHeaders } from "@/lib/client-auth";
import { db } from "@/config/firebase";
import { doc, setDoc } from "firebase/firestore";
import { exportPublicKey, generateRSAKeyPair, wrapPrivateKey } from "@/lib/crypto-client";
import { AlertTriangle, CheckCircle, Database, Loader2, ShieldAlert, Trash2, Wrench } from "lucide-react";

type HealthStatus = {
  status: string;
  whitelisted: string[];
  outOfPlace: string[];
  missing: string[];
  topLevelCollectionCount?: number;
  collections: Record<string, { exists: boolean; details?: string }>;
};

export function FirestoreHealthPanel({
  masterPassword = "",
  headerActions,
}: {
  masterPassword?: string;
  headerActions?: React.ReactNode;
}) {
  const { getIDToken, user } = UserAuth();
  const { toast } = useToast();

  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isFixingDb, setIsFixingDb] = useState(false);
  const [fixReport, setFixReport] = useState<any>(null);
  const [isWhitelisting, setIsWhitelisting] = useState(false);
  const [isDeletingCollection, setIsDeletingCollection] = useState(false);
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");

  const checkHealth = async () => {
    try {
      setIsCheckingHealth(true);
      const idToken = await getIDToken();
      if (!idToken) return;
      const res = await fetch("/api/admin/data/health", {
        headers: getAdminHeaders(idToken),
      });
      const data = await res.json();
      setHealthStatus(data);
    } catch (error) {
      toast({ title: "Failed to check health", variant: "destructive" });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const fixDb = async () => {
    try {
      setIsFixingDb(true);
      const idToken = await getIDToken();
      if (!idToken) return;
      const res = await fetch("/api/admin/data/fix-db", {
        method: "POST",
        headers: getAdminHeaders(idToken),
      });
      const data = await res.json();
      setFixReport(data.report);

      if (data.ownersMissingKeys?.length > 0 && masterPassword && user) {
        try {
          const keyPair = await generateRSAKeyPair();
          const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
          const wrappedPrivKey = await wrapPrivateKey(keyPair.privateKey, masterPassword);

          for (const uid of data.ownersMissingKeys) {
            await setDoc(doc(db, "public", uid), {
              publicKey: publicKeyBase64,
              encryptedPrivateKey: wrappedPrivKey,
              createdAt: new Date().toISOString(),
            });
          }

          toast({
            title: "Database fixed successfully",
            description: `Also regenerated ${data.ownersMissingKeys.length} admin encryption key(s).`,
          });
        } catch (keyErr) {
          console.error("Failed to regenerate admin keys:", keyErr);
          toast({
            title: "Database fixed",
            description: "Warning: could not regenerate admin encryption keys.",
            variant: "destructive",
          });
        }
      } else {
        toast({ title: "Database fixed successfully" });
      }

      checkHealth();
    } catch (error) {
      toast({ title: "Failed to fix database", variant: "destructive" });
    } finally {
      setIsFixingDb(false);
    }
  };

  const handleWhitelistAction = async (action: "add" | "remove", collectionName: string) => {
    try {
      setIsWhitelisting(true);
      const idToken = await getIDToken();
      if (!idToken) return;

      const res = await fetch("/api/admin/data/collections/whitelist", {
        method: "POST",
        headers: getAdminHeaders(idToken),
        body: JSON.stringify({ action, collections: [collectionName] }),
      });

      if (!res.ok) {
        throw new Error("Action failed");
      }

      toast({
        title: `Successfully ${action === "add" ? "whitelisted" : "removed"} ${collectionName}`,
      });
      checkHealth();
    } catch (error: any) {
      toast({
        title: "Whitelist action failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsWhitelisting(false);
    }
  };

  const handleDeleteCollection = async () => {
    if (!confirmDeleteCollection || !deletePassword) return;

    try {
      setIsDeletingCollection(true);
      const idToken = await getIDToken();
      if (!idToken) return;

      const res = await fetch("/api/admin/data/collections/delete", {
        method: "DELETE",
        headers: getAdminHeaders(idToken),
        body: JSON.stringify({ collection: confirmDeleteCollection }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Deletion failed");
      }

      toast({ title: `Successfully deleted ${confirmDeleteCollection}` });
      setConfirmDeleteCollection(null);
      setDeletePassword("");
      checkHealth();
    } catch (error: any) {
      toast({
        title: "Deletion failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeletingCollection(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="border-b bg-slate-50/60">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              Firestore Health
            </CardTitle>
            <CardDescription>
              Always-on database structure health, repair tools, and collection hygiene controls.
            </CardDescription>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Badge
              variant={healthStatus?.status === "complete" ? "default" : "destructive"}
              className={healthStatus?.status === "complete" ? "bg-green-500 hover:bg-green-600" : ""}
            >
              {isCheckingHealth ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
              {healthStatus?.status?.toUpperCase() || "UNKNOWN"}
            </Badge>
            <Button size="sm" variant="outline" onClick={checkHealth} disabled={isCheckingHealth}>
              {isCheckingHealth ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Refresh Status
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={fixDb}
              disabled={isFixingDb || healthStatus?.status === "complete"}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isFixingDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
              Fix Database
            </Button>
            {headerActions}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        {fixReport && (
          <div className="rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">
            <div className="space-y-1.5">
              {fixReport.missing?.length > 0 && (
                <p><strong className="text-red-600 dark:text-red-400">Missing:</strong> {fixReport.missing.join(", ")}</p>
              )}
              {fixReport.created?.length > 0 && (
                <p><strong className="text-green-600 dark:text-green-400">Regenerated:</strong> {fixReport.created.join(", ")}</p>
              )}
              {fixReport.deleted?.length > 0 && (
                <p><strong className="text-amber-600 dark:text-amber-400">Cleaned:</strong> {fixReport.deleted.join(", ")}</p>
              )}
              {fixReport.skipped?.length > 0 && (
                <p><strong className="text-muted-foreground">Already OK:</strong> {fixReport.skipped.join(", ")}</p>
              )}
              {!fixReport.missing?.length && !fixReport.created?.length && !fixReport.deleted?.length && (
                <p className="text-muted-foreground">Database was already healthy. No changes made.</p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-green-200 bg-green-50/30 dark:border-green-800/50 dark:bg-green-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-green-700 dark:text-green-500">
                <CheckCircle className="h-5 w-5" />
                Whitelisted Collections
              </CardTitle>
              <CardDescription>Expected collections that make up the system structure.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid max-h-56 grid-cols-1 gap-x-4 gap-y-2 overflow-y-auto pr-2 sm:grid-cols-2">
                {healthStatus?.whitelisted?.map((collectionName) => (
                  <div
                    key={collectionName}
                    className="flex items-center justify-between rounded border border-green-100 bg-white/50 px-2 py-1 dark:border-green-900/30 dark:bg-black/20"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      {healthStatus?.collections?.[collectionName]?.exists ? (
                        <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <span className="truncate font-medium text-green-800 dark:text-green-300" title={collectionName}>
                        {collectionName}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-red-500"
                      onClick={() => handleWhitelistAction("remove", collectionName)}
                      disabled={isWhitelisting}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-purple-50/30 dark:border-purple-800/50 dark:bg-purple-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-purple-700 dark:text-purple-500">
                <ShieldAlert className="h-5 w-5" />
                Out of Place Collections
              </CardTitle>
              <CardDescription>Unexpected collections found in the database. Review and manage.</CardDescription>
            </CardHeader>
            <CardContent>
              {healthStatus?.outOfPlace?.length ? (
                <div className="grid max-h-56 grid-cols-1 gap-x-4 gap-y-2 overflow-y-auto pr-2 sm:grid-cols-2">
                  {healthStatus.outOfPlace.map((collectionName) => (
                    <div
                      key={collectionName}
                      className="flex items-center justify-between rounded border border-purple-200 bg-white/50 px-2 py-1 dark:border-purple-800/50 dark:bg-black/20"
                    >
                      <span className="truncate font-medium text-purple-800 dark:text-purple-300" title={collectionName}>
                        {collectionName}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs border-purple-300 bg-white dark:border-purple-700 dark:bg-slate-900"
                          onClick={() => handleWhitelistAction("add", collectionName)}
                          disabled={isWhitelisting}
                        >
                          Whitelist
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setConfirmDeleteCollection(collectionName)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No unexpected collections found.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {healthStatus?.missing?.length ? (
          <Card className="border-red-200 bg-red-50/30 dark:border-red-800/50 dark:bg-red-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-red-700 dark:text-red-500">
                <AlertTriangle className="h-5 w-5" />
                Missing Expected Collections
              </CardTitle>
              <CardDescription>These collections are whitelisted but do not currently exist.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {healthStatus.missing.map((collectionName) => (
                  <Badge
                    key={collectionName}
                    variant="outline"
                    className="border-red-300 bg-white/50 text-red-700 dark:bg-black/20 dark:text-red-400"
                  >
                    {collectionName}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <AlertDialog open={!!confirmDeleteCollection} onOpenChange={(open) => !open && setConfirmDeleteCollection(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Collection?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the collection <strong>{confirmDeleteCollection}</strong> and all of its
                documents. This action cannot be undone. Enter your master password to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-4">
              <Label htmlFor="firestore-health-delete-password">Master Password</Label>
              <Input
                id="firestore-health-delete-password"
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                placeholder="Master Password"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteCollection}
                disabled={isDeletingCollection || !deletePassword}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeletingCollection ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Collection"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
