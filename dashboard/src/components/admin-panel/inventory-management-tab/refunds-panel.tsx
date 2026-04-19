"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { UserAuth } from "@/context/auth-context";
import { getAdminHeaders } from '@/lib/client-auth';
import { EnvelopeEncryptedPayload, envelopeDecrypt, unwrapPrivateKey } from '@/lib/crypto-client';
import { useMasterPassword } from "@/hooks/use-master-password";
import { db } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, RefreshCw, CheckCircle2, XCircle, RotateCcw, PackageX, ArrowUpLeft, Flame } from 'lucide-react';
import { RefundRequest } from '@/types/candyland';

export default function RefundsPanel() {
    const [refunds, setRefunds] = useState<RefundRequest[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [isEncryptingReturn, setIsEncryptingReturn] = useState(false);

    // Return Dialog State
    const [returnDialogRefund, setReturnDialogRefund] = useState<RefundRequest | null>(null);
    const [returnQty, setReturnQty] = useState('');

    const { getIDToken, user } = UserAuth();
    const { toast } = useToast();
    const { authSession } = useMasterPassword();
    const masterPassword = authSession?.masterPassword;

    useEffect(() => {
        if (!masterPassword || !user) return;

        let isMounted = true;
        setIsLoading(true);

        const fetchKeysAndListen = async () => {
            try {
                const token = await getIDToken();
                if (!token) throw new Error("No auth token");

                // Get Admin's encrypted private key
                const keyRes = await fetch('/api/admin/keys', {
                    headers: await getAdminHeaders(token)
                });
                if (!keyRes.ok) throw new Error("Failed to fetch admin keys");
                const adminKeyData = await keyRes.json();
                const encryptedPrivateKey = adminKeyData.encryptedPrivateKey;
                if (!encryptedPrivateKey) throw new Error("Admin private key not found");

                let privateKey: CryptoKey;
                try {
                    privateKey = await unwrapPrivateKey(encryptedPrivateKey, masterPassword);
                } catch (e) {
                    if (isMounted) {
                        toast({ title: "Error de Llave", description: "Contraseña maestra incorrecta", variant: "destructive" });
                        setIsLoading(false);
                    }
                    return;
                }

                if (!isMounted) return;

                // Setup snapshot listener
                const { collection, query, where, orderBy, onSnapshot } = await import('firebase/firestore');

                const q = query(
                    collection(db, 'refunds'),
                    where('status', '==', 'pending'),
                    orderBy('createdAt', 'desc')
                );

                const unsubscribe = onSnapshot(q, async (snapshot) => {
                    // Diagnostic: log admin key fingerprint for cross-referencing
                    const { fingerprintKey } = await import('@/lib/crypto-client');
                    const adminPubKey = adminKeyData.publicKey;
                    if (adminPubKey) {
                        const fp = await fingerprintKey(adminPubKey);
                        console.log(`[RefundsPanel] Decrypting with admin key FP: ${fp}, key length: ${adminPubKey.length}`);
                    }
                    const decryptedRefunds: RefundRequest[] = [];
                    for (const doc of snapshot.docs) {
                        const r = { id: doc.id, ...doc.data() } as any;
                        try {
                            const envelope: EnvelopeEncryptedPayload = {
                                encryptedData: r.encryptedData,
                                iv: r.iv,
                                staffWrappedDEK: r.staffWrappedDEK,
                                adminWrappedDEK: r.adminWrappedDEK,
                                encryptionVersion: r.encryptionVersion || 2
                            };
                            const plaintext = await envelopeDecrypt(envelope, envelope.adminWrappedDEK, privateKey);
                            const parsed = JSON.parse(plaintext);

                            decryptedRefunds.push({
                                ...r,
                                reason: parsed.reason,
                                note: parsed.note,
                                saleRecordId: parsed.saleRecordId,
                                
                                // Parse items array for new format, or map legacy flat format
                                reportItems: parsed.items && Array.isArray(parsed.items) ? parsed.items : [{
                                    itemId: parsed.itemId,
                                    itemName: parsed.itemName,
                                    quantity: parsed.quantity,
                                    unit: parsed.unit,
                                    originalCost: parsed.originalCost,
                                    value: parsed.saleValue,
                                    lossType: parsed.lossType
                                }],
                                
                                // Keep legacy flat fields mapped to the first item for easy UI fallback
                                itemId: parsed.itemId || (parsed.items && parsed.items[0]?.itemId),
                                itemName: parsed.itemName || (parsed.items && parsed.items[0]?.itemName),
                                qtySold: parsed.qtySold,
                                saleValue: parsed.saleValue || (parsed.items && parsed.items[0]?.value),
                                originalCost: parsed.originalCost || (parsed.items && parsed.items[0]?.originalCost),
                                unit: parsed.unit || (parsed.items && parsed.items[0]?.unit),
                                soldAt: parsed.soldAt,
                                quantity: parsed.quantity || (parsed.items && parsed.items[0]?.quantity), // Needed for inventory_loss
                            });
                        } catch (e) {
                            console.error(`Failed to decrypt refund ${doc.id}`, e);
                            decryptedRefunds.push({
                                ...r,
                                reason: undefined,
                                note: 'Encryption Key Mismatch',
                                itemName: 'Unknown Payload',
                                qtySold: 0,
                                saleValue: 0,
                                isCorrupted: true
                            });
                        }
                    }

                    if (isMounted) {
                        setRefunds(decryptedRefunds);
                        setIsLoading(false);
                    }
                }, (error) => {
                    console.error("Refunds listener error:", error);
                    if (isMounted) {
                        toast({ title: "Error", description: "Fallo la sincronización en tiempo real.", variant: "destructive" });
                        setIsLoading(false);
                    }
                });

                return unsubscribe;
            } catch (error) {
                console.error("Setup error:", error);
                if (isMounted) {
                    toast({ title: "Error", description: "Error al configurar reembolsos.", variant: "destructive" });
                    setIsLoading(false);
                }
            }
        };

        const cleanupPromise = fetchKeysAndListen();

        return () => {
            isMounted = false;
            cleanupPromise.then(unsubscribe => {
                if (typeof unsubscribe === 'function') unsubscribe();
            });
        };
    }, [masterPassword, user]);

    const handleApproveWithoutReturn = async (refund: RefundRequest) => {
        setProcessingId(refund.id);
        try {
            const token = await getIDToken();
            if (!token) throw new Error("No token");

            const res = await fetch('/api/admin/refunds/respond', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    refundId: refund.id,
                    action: 'approve_without_return',
                    saleRecordId: refund.saleRecordId
                })
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err || "Failed to approve without return");
            }

            // Burn the item in the master inventory explicitly so it's deducted from staff assignments (lost/wasted)
            const targetQty = refund.refundQty || refund.qtySold || 1;
            const burnRes = await fetch(`/api/admin/inventory/${refund.itemId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'burn_item',
                    employeeId: refund.employeeId,
                    quantity: targetQty
                })
            });

            if (!burnRes.ok) {
                console.warn("Could not explicitly burn the item in master inventory, but refund succeeded.");
            }

            toast({ title: "Completado", description: "Reembolso procesado (sin devolución)." });
        } catch (error: any) {
            console.error("Error processing refund:", error);
            toast({ title: "Error", description: error.message || "Hubo un error al aprobar el reembolso.", variant: "destructive" });
        } finally {
            setProcessingId(null);
        }
    };

    const handleApproveLoss = async (refund: RefundRequest) => {
        setProcessingId(refund.id);
        setIsEncryptingReturn(true);
        try {
            const token = await getIDToken();
            if (!token) throw new Error("No session token");
            if (!masterPassword) throw new Error("Master password required for decryption");

            // 1. Fetch Admin keys
            const keysRes = await fetch('/api/admin/keys', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!keysRes.ok) throw new Error("Failed to load admin key envelope");
            const keysData = await keysRes.json();

            const { unwrapPrivateKey, envelopeDecrypt, envelopeEncrypt } = await import('@/lib/crypto-client');
            const adminPrivateKey = await unwrapPrivateKey(keysData.encryptedPrivateKey, masterPassword);

            // 2. Fetch the staff's E2E doc
            const invDocRef = doc(db, 'inventory', refund.employeeId);
            const invDocSnap = await getDoc(invDocRef);

            let currentItems: any[] = [];
            let currentRecipes: any[] = [];
            if (invDocSnap.exists()) {
                const invData = invDocSnap.data();
                if (invData.encryptedData && invData.adminWrappedDEK) {
                    const envelope: EnvelopeEncryptedPayload = {
                        encryptedData: invData.encryptedData,
                        iv: invData.iv,
                        staffWrappedDEK: invData.staffWrappedDEK,
                        adminWrappedDEK: invData.adminWrappedDEK,
                        encryptionVersion: invData.encryptionVersion || 2
                    };
                    const plaintext = await envelopeDecrypt(envelope, envelope.adminWrappedDEK, adminPrivateKey);
                    const parsed = JSON.parse(plaintext);
                    if (parsed.items && Array.isArray(parsed.items)) {
                        currentItems = parsed.items;
                    }
                    if (parsed.recipes && Array.isArray(parsed.recipes)) {
                        currentRecipes = parsed.recipes;
                    }
                }
            }

            // 3. Subtract the lost/returned quantity
            const itemsToProcess = refund.reportItems && refund.reportItems.length > 0
                ? refund.reportItems 
                : [{ itemId: refund.itemId, quantity: refund.quantity || 1, lossType: refund.lossType }];

            let modifiedStaffInventory = false;

            for (const item of itemsToProcess) {
                if (!item.itemId) continue;
                
                const targetQty = item.quantity || 1;
                const existingItemIndex = currentItems.findIndex(i => i.id === item.itemId);
                
                if (existingItemIndex >= 0) {
                    currentItems[existingItemIndex].qty -= targetQty;
                    modifiedStaffInventory = true;
                    
                    if (currentItems[existingItemIndex].qty <= 0) {
                        currentItems.splice(existingItemIndex, 1);
                    }
                } else {
                    console.warn(`Item ${item.itemId} was not found in staff's local inventory. Skipping local deduction.`);
                }
            }

            // 4. Fetch the staff member's public key
            const staffPubDoc = await getDoc(doc(db, 'public', refund.employeeId));
            const staffPubKey = staffPubDoc.exists() ? staffPubDoc.data().publicKey : null;

            if (!staffPubKey || !keysData.publicKey) {
                throw new Error("Missing public keys required for envelope re-encryption");
            }

            // 5. Re-encrypt payload, preserving existing recipes
            const newPayload = JSON.stringify({ items: currentItems, recipes: currentRecipes });
            const newEnvelope = await envelopeEncrypt(newPayload, staffPubKey, keysData.publicKey);

            // 6. Push to backend
            const pushRes = await fetch('/api/admin/inventory/push', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    staffUid: refund.employeeId,
                    ...newEnvelope
                })
            });

            if (!pushRes.ok) {
                const err = await pushRes.text();
                throw new Error(err || "Failed to push updated inventory back to staff member");
            }

            // 7. Call the respond endpoint to finalize
            const res = await fetch('/api/admin/refunds/respond', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    refundId: refund.id,
                    action: 'approve_loss'
                })
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err || "Failed to approve inventory loss");
            }

            // 8. Adjust master inventory based on lossType (Looping through reported items)
            for (const item of itemsToProcess) {
                if (!item.itemId) continue;
                
                const isReturnToMaster = item.lossType === 'return_to_master' || (!item.lossType && refund.lossType === 'return_to_master');
                const masterAction = isReturnToMaster ? 'unassign' : 'burn_item';
                const targetQty = item.quantity || 1;

                const masterRes = await fetch(`/api/admin/inventory/${item.itemId}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        action: masterAction,
                        employeeId: refund.employeeId,
                        quantity: targetQty
                    })
                });

                if (!masterRes.ok) {
                    console.warn(`Could not explicitly ${masterAction} the lost item ${item.itemId} in master inventory, but request succeeded.`);
                }
            }

            toast({ title: "Completado", description: `Reporte aprobado y stock ajustado exitosamente.` });
        } catch (error: any) {
            console.error("Error processing loss:", error);
            toast({ title: "Error", description: error.message || "Hubo un error al aprobar la pérdida.", variant: "destructive" });
        } finally {
            setProcessingId(null);
            setIsEncryptingReturn(false);
        }
    };

    const handleApproveWithReturnSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!returnDialogRefund) return;

        const qty = parseFloat(returnQty);
        if (isNaN(qty) || qty <= 0) {
            toast({ title: "Error", description: "Cantidad inválida.", variant: "destructive" });
            return;
        }

        setIsEncryptingReturn(true);
        setProcessingId(returnDialogRefund.id);

        try {
            const token = await getIDToken();
            if (!token) throw new Error("No session token");
            if (!masterPassword) throw new Error("Master password required for decryption");

            // 1. Fetch Admin's derived private key mapping
            const keysRes = await fetch('/api/admin/keys', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!keysRes.ok) throw new Error("Failed to load admin key envelope");
            const keysData = await keysRes.json();

            const { unwrapPrivateKey, envelopeDecrypt, envelopeEncrypt } = await import('@/lib/crypto-client');
            const adminPrivateKey = await unwrapPrivateKey(keysData.encryptedPrivateKey, masterPassword);

            // 2. Fetch the staff member's current E2E inventory doc
            const invDocRef = doc(db, 'inventory', returnDialogRefund.employeeId);
            const invDocSnap = await getDoc(invDocRef);

            let currentItems: any[] = [];
            let currentRecipes: any[] = [];
            if (invDocSnap.exists()) {
                const invData = invDocSnap.data();
                if (invData.encryptedData && invData.adminWrappedDEK) {
                    const envelope: EnvelopeEncryptedPayload = {
                        encryptedData: invData.encryptedData,
                        iv: invData.iv,
                        staffWrappedDEK: invData.staffWrappedDEK,
                        adminWrappedDEK: invData.adminWrappedDEK,
                        encryptionVersion: invData.encryptionVersion || 2
                    };
                    const plaintext = await envelopeDecrypt(envelope, envelope.adminWrappedDEK, adminPrivateKey);
                    const parsed = JSON.parse(plaintext);
                    if (parsed.items && Array.isArray(parsed.items)) {
                        currentItems = parsed.items;
                    }
                    if (parsed.recipes && Array.isArray(parsed.recipes)) {
                        currentRecipes = parsed.recipes;
                    }
                }
            }

            // 3. Increment the returned quantity
            const targetItemId = returnDialogRefund.itemId;
            if (!targetItemId) throw new Error("Missing itemId on refund record");

            const existingItemIndex = currentItems.findIndex(i => i.id === targetItemId);

            if (existingItemIndex >= 0) {
                // Item still exists in staff inventory, increment it
                currentItems[existingItemIndex].qty = (currentItems[existingItemIndex].qty || 0) + qty;
            } else {
                // Item was completely sold out / deleted from staff inventory. Needs reinjection.
                // Fetch the original master item to restore it
                const masterDocRef = doc(db, 'inventory', 'master', 'items', targetItemId);
                const masterDocSnap = await getDoc(masterDocRef);

                if (masterDocSnap.exists()) {
                    const masterData = masterDocSnap.data();
                    // Construct a fresh assigned item object
                    currentItems.push({
                        id: masterDocSnap.id,
                        name: masterData.name || returnDialogRefund.itemName || 'Unknown Item',
                        qty: qty,
                        unit: returnDialogRefund.unit || masterData.unit || 'pcs',
                        category: masterData.category || 'unknown',
                        originalCost: masterData.originalCost || returnDialogRefund.originalCost || 0,
                        value: returnDialogRefund.saleValue || masterData.price || 0,
                        pushedAt: new Date().toISOString()
                    });
                } else {
                    // The item was deleted from the master inventory entirely!
                    // Reinject a stub based purely on the refund data so the staff doesn't lose the value.
                    currentItems.push({
                        id: targetItemId,
                        name: returnDialogRefund.itemName || 'Returned Item',
                        qty: qty,
                        unit: returnDialogRefund.unit || 'pcs',
                        category: 'returned',
                        originalCost: returnDialogRefund.originalCost || 0,
                        value: returnDialogRefund.saleValue || 0,
                        pushedAt: new Date().toISOString(),
                        note: 'System stub created during return.'
                    });
                }
            }

            // 4. Fetch the staff member's public key
            const staffPubDoc = await getDoc(doc(db, 'public', returnDialogRefund.employeeId));
            const staffPubKey = staffPubDoc.exists() ? staffPubDoc.data().publicKey : null;

            if (!staffPubKey || !keysData.publicKey) {
                throw new Error("Missing public keys required for envelope re-encryption");
            }

            // 5. Re-encrypt payload, preserving existing recipes
            const newPayload = JSON.stringify({ items: currentItems, recipes: currentRecipes });
            const newEnvelope = await envelopeEncrypt(newPayload, staffPubKey, keysData.publicKey);

            // 6. Push to backend for assignment (which updates the assignedAt / status)
            const pushRes = await fetch('/api/admin/inventory/push', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    staffUid: returnDialogRefund.employeeId,
                    ...newEnvelope
                })
            });

            if (!pushRes.ok) {
                const err = await pushRes.text();
                throw new Error(err || "Failed to push updated inventory back to staff member");
            }

            // 7. Call the respond endpoint to finalize (wipe finance, update status to approved_with_return)
            const respondRes = await fetch('/api/admin/refunds/respond', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    refundId: returnDialogRefund.id,
                    action: 'approve_with_return_backend_only',
                    saleRecordId: returnDialogRefund.saleRecordId
                })
            });

            if (!respondRes.ok) {
                const err = await respondRes.text();
                throw new Error(err || "Backend finalized error: could not resolve refund db record");
            }

            // 8. Restock the item in the master inventory so it's added back to staff assignment numbers
            const restockRes = await fetch(`/api/admin/inventory/${targetItemId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'restock_item',
                    employeeId: returnDialogRefund.employeeId,
                    quantity: qty
                })
            });

            if (!restockRes.ok) {
                console.warn("Could not explicitly restock the item in master inventory, but refund succeeded via frontend payload rewrite.");
            }

            // 9. Burn the remainder (unreturned) quantity from the master inventory so global stats properly account for the lost stock
            const targetQty = returnDialogRefund.refundQty || returnDialogRefund.qtySold || 1;
            const burntQty = targetQty - qty;

            if (burntQty > 0) {
                const burnRes = await fetch(`/api/admin/inventory/${targetItemId}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        action: 'burn_item',
                        employeeId: returnDialogRefund.employeeId,
                        quantity: burntQty
                    })
                });

                if (!burnRes.ok) {
                    console.warn(`Could not explicitly burn the unreturned quantity (${burntQty}) in master inventory.`);
                }
            }

            toast({ title: "Inventario Retornado", description: "Se ha restaurado el inventario y aprobado el reembolso." });
            setReturnDialogRefund(null);

        } catch (error: any) {
            console.error("Crypto Return Flow Error:", error);
            toast({ title: "Error Criptográfico", description: error.message || "Fallo en la re-encriptación del inventario.", variant: "destructive" });
        } finally {
            setIsEncryptingReturn(false);
            setProcessingId(null);
        }
    };

    const handleReject = async (refundId: string) => {
        setProcessingId(refundId);
        try {
            const token = await getIDToken();
            if (!token) throw new Error("No token");

            const res = await fetch('/api/admin/refunds/respond', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refundId, action: 'deny' })
            });

            if (!res.ok) throw new Error("Failed to reject refund");

            toast({ title: "Rechazado", description: "La solicitud de reembolso ha sido rechazada" });
        } catch (error) {
            console.error("Error rejecting refund:", error);
            toast({ title: "Error", description: "Hubo un error al rechazar el reembolso.", variant: "destructive" });
        } finally {
            setProcessingId(null);
        }
    };

    const getReasonLabel = (reason?: string) => {
        switch (reason) {
            case 'calidad': return 'Calidad';
            case 'venta_por_error': return 'Venta por Error';
            case 'venta_cancelada': return 'Cancelada';
            case 'inventory_loss': return 'Reporte de Inventario';
            default: return reason || 'Desconocido';
        }
    };

    return (
        <Card className="border-t-4 border-t-amber-500/20 shadow-sm mt-4">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <PackageX className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                        Reembolsos y Devoluciones
                    </CardTitle>
                    <CardDescription>
                        Gestiona las solicitudes de reembolso pendientes. Totalmente desencriptado E2E.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading && refunds.length === 0 ? (
                    <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : refunds.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl bg-muted/20">
                        No hay solicitudes de reembolso pendientes.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {refunds.map(refund => {
                            const isCorrupted = (refund as any).isCorrupted;
                            return (
                                <div key={refund.id} className={`p-4 rounded-xl border ${isCorrupted ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'} shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start md:items-center`}>
                                    <div className="space-y-2 flex-1">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={`text-xs ${isCorrupted ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400'}`}>
                                                {getReasonLabel(refund.reason)}
                                            </Badge>
                                            <span className="font-semibold text-sm">{refund.employeeName}</span>
                                            <span className="text-xs text-muted-foreground">{new Date(refund.createdAt).toLocaleString()}</span>
                                            {isCorrupted && <span className="text-xs text-destructive font-bold ml-2">Decryption Failed</span>}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-4 text-sm bg-muted/30 p-2 rounded-md border border-border/50">
                                            {refund.reason === 'inventory_loss' ? (
                                                <div className="w-full space-y-2">
                                                    {(refund.reportItems && refund.reportItems.length > 0) ? (
                                                        <>
                                                            <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">Ítems Reportados ({refund.reportItems.length})</div>
                                                            <div className="space-y-1">
                                                                {refund.reportItems.map((item, idx) => (
                                                                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-card border rounded p-2 text-xs">
                                                                        <div className="font-medium">{item.itemName}</div>
                                                                        <div className="flex items-center gap-3 mt-1 sm:mt-0">
                                                                            <span className="text-muted-foreground">Acción: <span className="font-medium text-foreground">{item.lossType === 'return_to_master' ? 'Devolver al Master' : item.lossType === 'full' ? 'Pérdida Total' : 'Pérdida Parcial'}</span></span>
                                                                            <span className="text-amber-600 font-bold">{item.quantity} {item.unit}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div><span className="text-muted-foreground">Ítem:</span> {refund.itemName}</div>
                                                            <div><span className="text-muted-foreground">Acción Solicitada:</span> <span className="font-medium">
                                                                {refund.lossType === 'return_to_master' ? 'Devolver al Master' :
                                                                 refund.lossType === 'full' ? 'Pérdida Total' : 'Pérdida Parcial'}
                                                            </span></div>
                                                            <div><span className="text-muted-foreground">{refund.lossType === 'return_to_master' ? 'Retornando:' : 'Perdidos:'}</span> <span className="font-bold text-amber-600">{refund.quantity} {refund.unit}</span></div>
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    <div><span className="text-muted-foreground">Ítem:</span> {refund.itemName}</div>
                                                    {!isCorrupted && (
                                                        <>
                                                            <div><span className="text-muted-foreground">Cant{('refundQty' in refund && refund.refundQty) ? ' Reembolso' : ''}:</span> <span className="font-bold">{('refundQty' in refund ? refund.refundQty : null) || refund.qtySold}</span> {(('refundQty' in refund && refund.refundQty) && refund.refundQty !== refund.qtySold) && <span className="opacity-50 line-through ml-1">{refund.qtySold}</span>}</div>
                                                            <div><span className="text-muted-foreground">Valor Cobrado:</span> <span className="text-green-600 font-medium">${((refund.qtySold || 0) * (refund.saleValue || 0)).toFixed(2)}</span></div>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        {refund.note && (
                                            <div className="text-xs text-muted-foreground italic bg-background border border-dashed p-2 rounded-md">
                                                "{refund.note}"
                                            </div>
                                        )}
                                        {isCorrupted && (
                                            <div className="text-xs text-muted-foreground italic mt-1">
                                                This refund request was encrypted with an old or mismatched public key. It cannot be mathematically decrypted. Please discard it.
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-2 w-full md:w-auto shrink-0">
                                        {!isCorrupted && (
                                            <>
                                                {refund.reason === 'inventory_loss' ? (
                                                    <Button
                                                        size="sm"
                                                        variant="default"
                                                        className={refund.lossType === 'return_to_master' ? "!bg-emerald-600 hover:!bg-emerald-700 !text-white w-full" : "!bg-amber-600 hover:!bg-amber-700 !text-white w-full"}
                                                        disabled={!!processingId}
                                                        onClick={() => handleApproveLoss(refund)}
                                                    >
                                                        {processingId === refund.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : (refund.lossType === 'return_to_master' ? <RotateCcw className="h-4 w-4 mr-2" /> : <Flame className="h-4 w-4 mr-2" />)}
                                                        {refund.lossType === 'return_to_master' ? 'Aprobar Devolución' : 'Aprobar Pérdida'}
                                                    </Button>
                                                ) : (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="default"
                                                            className="!bg-green-600 hover:!bg-green-700 !text-white w-full"
                                                            disabled={!!processingId}
                                                            onClick={() => {
                                                                const targetQty = ('refundQty' in refund ? refund.refundQty : null) || refund.qtySold || 1;
                                                                setReturnQty(targetQty.toString());
                                                                setReturnDialogRefund(refund);
                                                            }}
                                                        >
                                                            {processingId === refund.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                                                            Aprobar y Devolver Stock
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="w-full"
                                                            disabled={!!processingId}
                                                            onClick={() => handleApproveWithoutReturn(refund)}
                                                        >
                                                            {processingId === refund.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                                            Aprobar Sin Devolución
                                                        </Button>
                                                    </>
                                                )}
                                            </>
                                        )}
                                        <Button
                                            size="sm"
                                            variant={isCorrupted ? "default" : "outline"}
                                            className={isCorrupted ? "bg-destructive text-white hover:bg-destructive/90 w-full" : "text-destructive border-destructive/50 hover:bg-destructive hover:text-white w-full"}
                                            disabled={!!processingId}
                                            onClick={() => handleReject(refund.id)}
                                        >
                                            {processingId === refund.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                                            {isCorrupted ? "Descartar Corrupto" : "Rechazar"}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>

            {/* Return Dialog UI */}
            <Dialog open={!!returnDialogRefund} onOpenChange={(open) => {
                if (!open && !isEncryptingReturn) {
                    setReturnDialogRefund(null);
                    setReturnQty('');
                }
            }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ArrowUpLeft className="h-5 w-5 text-emerald-500" />
                            Aprobar y Devolver
                        </DialogTitle>
                        <DialogDescription>
                            El inventario será desencriptado por tu sesión, la cantidad será actualizada y se re-encriptará para el empleado.
                        </DialogDescription>
                    </DialogHeader>
                    {returnDialogRefund && (
                        <form onSubmit={handleApproveWithReturnSubmit} className="space-y-4 py-4">
                            <div className="bg-muted p-3 rounded-md border border-border/50 text-sm">
                                <div className="flex justify-between mb-1">
                                    <span className="text-muted-foreground">Originalmente Vendido:</span>
                                    <span className="font-bold">{returnDialogRefund.qtySold || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Pedida en Reembolso:</span>
                                    <span className="font-bold text-amber-600">{returnDialogRefund.refundQty || returnDialogRefund.qtySold || 0}</span>
                                </div>
                            </div>
                            <div className="space-y-2 relative z-50">
                                <Label className="flex items-center justify-between">
                                    <span>Cantidad a Retornar al Inventario</span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => setReturnQty((returnDialogRefund.refundQty ?? returnDialogRefund.qtySold ?? 1).toString())}
                                    >
                                        Max: {returnDialogRefund.refundQty ?? returnDialogRefund.qtySold}
                                    </Button>
                                </Label>
                                <Input
                                    type="number"
                                    className="bg-background text-foreground border-input"
                                    step={(returnDialogRefund.unit === 'grams' || returnDialogRefund.unit === 'oz' || returnDialogRefund.unit === 'kg') ? "any" : "1"}
                                    min={(returnDialogRefund.unit === 'grams' || returnDialogRefund.unit === 'oz' || returnDialogRefund.unit === 'kg') ? "0.1" : "1"}
                                    max={(returnDialogRefund.refundQty ?? returnDialogRefund.qtySold ?? 9999).toString()}
                                    value={returnQty}
                                    onChange={e => setReturnQty(e.target.value)}
                                    autoFocus
                                    required
                                    disabled={isEncryptingReturn}
                                />
                                <p className="text-[10px] text-muted-foreground italic mt-2">
                                    Esta operación usa cifrado End-to-End local en tu navegador. El servidor nunca ve los datos.
                                </p>
                            </div>
                            <DialogFooter className="mt-6">
                                <Button type="button" variant="outline" disabled={isEncryptingReturn} onClick={() => {
                                    setReturnDialogRefund(null);
                                    setReturnQty('');
                                }}>Cancelar</Button>
                                <Button type="submit" variant="ghost" disabled={isEncryptingReturn || !returnQty} className="bg-green-600 hover:bg-green-700 !text-white">
                                    {isEncryptingReturn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Procesar Devolución Segura
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
