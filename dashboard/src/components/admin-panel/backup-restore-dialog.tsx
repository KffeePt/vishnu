"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserAuth } from "@/context/auth-context";
import { Loader2, Lock, Download, Upload } from "lucide-react";
import { gzipSync, gunzipSync } from "fflate";

export function BackupRestoreDialog() {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<"backup" | "restore">("backup");
    const [password, setPassword] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusText, setStatusText] = useState("");
    const [isDragging, setIsDragging] = useState(false);

    // Results dialog state
    const [showResultsDialog, setShowResultsDialog] = useState(false);
    const [restoreResults, setRestoreResults] = useState<any>(null);
    const { getIDToken } = UserAuth();
    const { toast } = useToast();

    useEffect(() => {
        const handleTriggerBackup = () => {
            setMode("backup");
            setPassword("");
            setSelectedFile(null);
            setIsOpen(true);
        };
        const handleTriggerRestore = () => {
            setMode("restore");
            setPassword("");
            setSelectedFile(null);
            setIsOpen(true);
        };
        window.addEventListener("trigger-backup-database", handleTriggerBackup);
        window.addEventListener("trigger-restore-database", handleTriggerRestore);
        return () => {
            window.removeEventListener("trigger-backup-database", handleTriggerBackup);
            window.removeEventListener("trigger-restore-database", handleTriggerRestore);
        };
    }, []);

    const deriveKey = async (pass: string, salt: Uint8Array) => {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(pass),
            "PBKDF2",
            false,
            ["deriveBits", "deriveKey"]
        );
        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt as any,
                iterations: 100000,
                hash: "SHA-256",
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    };

    const handleBackup = async () => {
        if (!password) {
            toast({ title: "Error", description: "Encryption password is required", variant: "destructive" });
            return;
        }

        setIsLoading(true);
        try {
            setStatusText("Fetching database snapshot...");
            const token = await getIDToken();
            if (!token) throw new Error("Not authenticated");

            const response = await fetch("/api/admin/data/backup", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Failed to fetch backup from server");

            const jsonData = await response.text();

            setStatusText("Compressing (GZIP)...");
            const jsonBytes = new TextEncoder().encode(jsonData);
            const compressedBytes = gzipSync(jsonBytes, { level: 9 });

            setStatusText("Encrypting (AES-256-GCM)...");
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const key = await deriveKey(password, salt);

            const encryptedBuffer = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv as any },
                key,
                compressedBytes as any
            );

            setStatusText("Finalizing file...");
            const encryptedBytes = new Uint8Array(encryptedBuffer);
            const magicBytes = new TextEncoder().encode("CLBK");
            const versionObj = new Uint8Array([1]); // Byte 1 = version 1

            // File Structure: [MAGIC 4][VERSION 1][SALT 16][IV 12][DATA ...]
            const finalFile = new Uint8Array(4 + 1 + 16 + 12 + encryptedBytes.length);
            finalFile.set(magicBytes, 0);
            finalFile.set(versionObj, 4);
            finalFile.set(salt, 5);
            finalFile.set(iv, 21);
            finalFile.set(encryptedBytes, 33);

            const blob = new Blob([finalFile], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
        a.download = `vishnu-backup-${new Date().toISOString().split('T')[0]}.clbk`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast({ title: "Backup Complete", description: "Encrypted backup downloaded successfully" });
            setIsOpen(false);
        } catch (error: any) {
            console.error(error);
            toast({ title: "Backup Failed", description: error.message || "An unknown error occurred", variant: "destructive" });
        } finally {
            setIsLoading(false);
            setStatusText("");
        }
    };

    const handleRestore = async () => {
        if (!password || !selectedFile) {
            toast({ title: "Error", description: "Password and backup file are required", variant: "destructive" });
            return;
        }

        setIsLoading(true);
        try {
            setStatusText("Reading file...");
            const arrayBuffer = await selectedFile.arrayBuffer();
            const fileBytes = new Uint8Array(arrayBuffer);

            // Validate magic bytes and file length
            const magicBytes = new TextEncoder().encode("CLBK");
            if (fileBytes.length < 33 || !fileBytes.slice(0, 4).every((val, i) => val === magicBytes[i])) {
                throw new Error("Invalid backup file format (magic bytes mismatch or file too short)");
            }

            // Extract header info
            const version = fileBytes[4];
            if (version !== 1) {
                throw new Error(`Unsupported backup file version: ${version}. Only version 1 is supported.`);
            }
            const salt = fileBytes.slice(5, 21); // 16 bytes
            const iv = fileBytes.slice(21, 33); // 12 bytes
            const encryptedData = fileBytes.slice(33);

            setStatusText("Deriving decryption key...");
            const key = await deriveKey(password, salt);

            setStatusText("Decrypting (AES-256-GCM)...");
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv as any },
                key,
                encryptedData as any
            );
            const decryptedBytes = new Uint8Array(decryptedBuffer);

            setStatusText("Decompressing (GZIP)...");
            const decompressedBytes = gunzipSync(decryptedBytes);

            setStatusText("Parsing data...");
            const jsonData = new TextDecoder().decode(decompressedBytes);
            const dataToRestore = JSON.parse(jsonData);

            setStatusText("Sending data to server for restoration...");
            const token = await getIDToken();
            if (!token) throw new Error("Not authenticated");

            const response = await fetch("/api/admin/data/restore", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(dataToRestore)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to restore data on server");
            }

            const responseData = await response.json();

            setRestoreResults({
                ...responseData.metrics,
                snapshotInfo: responseData.snapshotInfo,
            });
            setShowResultsDialog(true);

            toast({ title: "Restore Complete", description: "Database restored successfully" });
            setSelectedFile(null); // Clear selected file on success
        } catch (error: any) {
            console.error(error);
            toast({ title: "Restore Failed", description: error.message || "An unknown error occurred", variant: "destructive" });
        } finally {
            setIsLoading(false);
            setStatusText("");
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.clbk')) {
            setSelectedFile(file);
        } else {
            toast({ title: "Invalid File", description: "Please upload a .clbk backup file.", variant: "destructive" });
        }
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !isLoading && setIsOpen(open)}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {mode === "backup" ? (
                                <><Download className="h-5 w-5" /> Export Database Backup</>
                            ) : (
                                <><Upload className="h-5 w-5" /> Restore Database Backup</>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            {mode === "backup"
                                ? "Exports the full Firestore database snapshot in a migration-safe format, then encrypts it with AES-256 and GZIP."
                                : "Restore the full Firestore snapshot from an encrypted backup. Existing documents not present in the backup are left untouched."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {mode === "restore" && (
                            <div className="space-y-2 mb-4">
                                <Label>Backup File (.clbk)</Label>
                                <div
                                    className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => document.getElementById('backup-file-input')?.click()}
                                >
                                    <Input
                                        id="backup-file-input"
                                        type="file"
                                        accept=".clbk"
                                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                        disabled={isLoading}
                                        className="hidden"
                                    />
                                    {selectedFile ? (
                                        <div className="text-center space-y-2">
                                            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                                                <Upload className="h-6 w-6 text-primary" />
                                            </div>
                                            <p className="text-sm font-medium">{selectedFile.name}</p>
                                            <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive h-auto py-1 px-2 text-xs"
                                                onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                                                disabled={isLoading}
                                            >
                                                Remove file
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="text-center space-y-2 pointer-events-none">
                                            <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                                                <Upload className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                            <p className="text-sm font-medium">Click to upload or drag and drop</p>
                                            <p className="text-xs text-muted-foreground">Only .clbk files are supported</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="password">Encryption Password</Label>
                            <div className="relative">
                                <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="Enter password..."
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-9"
                                    disabled={isLoading}
                                />
                            </div>
                            {mode === "backup" && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Do not lose this password. The file cannot be recovered without it.
                                </p>
                            )}
                        </div>
                    </div>

                    {isLoading && (
                        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground animate-pulse gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {statusText}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button onClick={mode === "backup" ? handleBackup : handleRestore} disabled={isLoading || !password || (mode === "restore" && !selectedFile)}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {mode === "backup" ? "Generate Backup" : "Restore Data"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Restore Results Dialog */}
            <Dialog open={showResultsDialog} onOpenChange={(open) => {
                setShowResultsDialog(open);
                if (!open) setIsOpen(false); // Close main dialog when results are closed
            }}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-green-500" />
                            Restore Completed
                        </DialogTitle>
                        <DialogDescription>
                            The Firestore snapshot has been restored successfully. Here are the details of the affected data.
                        </DialogDescription>
                    </DialogHeader>

                    {restoreResults && (
                        <div className="space-y-6 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-muted p-4 rounded-lg text-center">
                                    <p className="text-sm text-muted-foreground mb-1">Total Documents</p>
                                    <p className="text-2xl font-bold">{restoreResults.totalDocs || 0}</p>
                                </div>
                                <div className="bg-muted p-4 rounded-lg text-center">
                                    <p className="text-sm text-muted-foreground mb-1">Collections</p>
                                    <p className="text-2xl font-bold">{restoreResults.totalCollections || 0}</p>
                                </div>
                            </div>

                            {restoreResults.snapshotInfo && (
                                <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                                    <p><strong>Source Project:</strong> {restoreResults.snapshotInfo.sourceProjectId || 'Unknown / legacy backup'}</p>
                                    <p><strong>Target Project:</strong> {restoreResults.snapshotInfo.targetProjectId || 'Current Firebase project'}</p>
                                    <p><strong>Exported At:</strong> {restoreResults.snapshotInfo.exportedAt || 'Unknown'}</p>
                                </div>
                            )}

                            {restoreResults.details && restoreResults.details.length > 0 && (
                                <div className="space-y-2">
                                    <Label>Collection Breakdown</Label>
                                    <div className="border rounded-md overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-muted text-muted-foreground text-xs uppercase">
                                                <tr>
                                                    <th className="px-4 py-2">Collection</th>
                                                    <th className="px-4 py-2 text-right">Documents</th>
                                                    <th className="px-4 py-2 text-right">Sub-collections</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {restoreResults.details.map((detail: any, i: number) => (
                                                    <tr key={i} className="hover:bg-muted/50">
                                                        <td className="px-4 py-2 font-medium">{detail.collection}</td>
                                                        <td className="px-4 py-2 text-right">{detail.documents}</td>
                                                        <td className="px-4 py-2 text-right text-muted-foreground">{detail.subcollections}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button onClick={() => {
                            setShowResultsDialog(false);
                            setIsOpen(false);
                        }}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
