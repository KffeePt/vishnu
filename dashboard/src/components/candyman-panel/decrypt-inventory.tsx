"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package, AlertTriangle, RefreshCw, Beaker, Flame } from 'lucide-react';
import { db } from '@/config/firebase';
import { collection, doc, onSnapshot, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShoppingCart, DollarSign } from 'lucide-react';
import { unwrapPrivateKey, envelopeDecrypt, envelopeEncrypt, fingerprintKey, type EnvelopeEncryptedPayload } from '@/lib/crypto-client';
import { pushSaleRecord } from '@/lib/client-push';
import { formatQty } from '@/lib/format-qty';
import { convertQty, SupportedUnit } from '@/lib/unit-conversion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StaffReportsDialog } from './dialogs/staff-reports-dialog';
import { StaffCraftingDialog } from './dialogs/staff-crafting-dialog';
import { StaffSellDialog } from './dialogs/staff-sell-dialog';
import { getCategoryCardClass, getCategoryBadgeClass } from '@/lib/category-styles';

interface WrappedPrivateKey {
    wrappedKey: string;
    salt: string;
    iv: string;
}

interface DecryptInventoryProps {
    masterPassword?: string;
    sessionToken: string;
    encryptedPrivateKey: WrappedPrivateKey | null;
    isUnlocked: boolean;
    section?: 'inventory' | 'sales' | 'finances' | 'loss' | 'crafting';
    salt: string;
    iv: string;
}

export interface DecryptedItem {
    id: string;
    name?: string;
    qty: number;
    value: number;
    unit?: string;
    originalCost?: number;
    note?: string;
    pushedAt?: string;
    assignedAt: string | null;
    error?: string;
    category?: string;
    flexiblePrice?: boolean;
    flexibilityPercent?: number;
    maxPriceCap?: number;
    baseValue?: number;
    masterQty?: number;
    baseOriginalCost?: number;
    craftable?: boolean;
    costOverride?: number;
    promoPricing?: { tiers: { qty: number; price: number }[] };
}

interface DecryptedSale {
    id: string;
    type?: 'sale' | 'payment' | 'debt';
    itemId?: string;
    qtySold?: number;
    value?: number;
    originalCost?: number;
    amount?: number; // for payments
    note?: string; // for payments/debts
    soldAt: Date;
    category?: string;
}

export default function DecryptInventory({ masterPassword, sessionToken, encryptedPrivateKey, isUnlocked, section, salt, iv }: DecryptInventoryProps) {
    const { user, getIDToken } = UserAuth();
    const { toast } = useToast();

    // Inventory State
    const [items, setItems] = useState<DecryptedItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [hasNewData, setHasNewData] = useState(false);

    // Recipes State
    const [privateRecipes, setPrivateRecipes] = useState<any[]>([]);
    const [publicRecipes, setPublicRecipes] = useState<any[]>([]);
    
    const recipes = React.useMemo(() => {
        const merged = [...publicRecipes, ...privateRecipes];
        return Array.from(new Map(merged.map(r => [r.id, r])).values());
    }, [publicRecipes, privateRecipes]);

    const [isCrafting, setIsCrafting] = useState<string | null>(null);

    // Sales History State
    const [sales, setSales] = useState<DecryptedSale[]>([]);
    const [isLoadingSales, setIsLoadingSales] = useState(false);
    const [profitPercent, setProfitPercent] = useState<number>(50);
    const [sellingRules, setSellingRules] = useState<Record<string, { unitValue: number }>>({});

    // Selling / Crypto State
    const [staffPubKey, setStaffPubKey] = useState<string | null>(null);
    const [adminPubKey, setAdminPubKey] = useState<string | null>(null);
    const [sellItem, setSellItem] = useState<DecryptedItem | null>(null);
    const [sellQty, setSellQty] = useState('');
    const [sellPrice, setSellPrice] = useState(''); // Added for flexible pricing
    const [sellNote, setSellNote] = useState('');
    const [isSelling, setIsSelling] = useState<string | null>(null);

    // Validating and tracking refund state
    const [pendingRefundSaleIds, setPendingRefundSaleIds] = useState<Set<string>>(new Set());

    // Dialog states
    const [isReportsDialogOpen, setIsReportsDialogOpen] = useState(false);
    const [isCraftingDialogOpen, setIsCraftingDialogOpen] = useState(false);
    const [isSellDialogOpen, setIsSellDialogOpen] = useState(false);

    useEffect(() => {
        const handleOpenCrafting = () => setIsCraftingDialogOpen(true);
        window.addEventListener('open-staff-crafting', handleOpenCrafting);
        return () => window.removeEventListener('open-staff-crafting', handleOpenCrafting);
    }, []);

    // Fetch Public Keys for re-encryption
    useEffect(() => {
        let isMounted = true;
        const initKeys = async () => {
            if (!user) return;
            try {
                const publicDoc = await getDoc(doc(db, 'public', user.uid));
                if (publicDoc.exists() && publicDoc.data().publicKey) {
                    if (isMounted) setStaffPubKey(publicDoc.data().publicKey);
                }
                const token = await getIDToken();
                if (!token) return;

                const [adminKeyRes, staffDataRes] = await Promise.all([
                    fetch(`/api/staff/admin-key?t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch('/api/staff/data', { headers: { 'Authorization': `Bearer ${token}`, 'x-master-password-session': sessionToken } })
                ]);

                if (adminKeyRes.ok) {
                    const adminKeyData = await adminKeyRes.json();
                    if (isMounted) setAdminPubKey(adminKeyData.publicKey);
                }

                if (staffDataRes.ok) {
                    const staffData = await staffDataRes.json();
                    if (isMounted) {
                        if (staffData.profitPercent !== undefined) {
                            setProfitPercent(staffData.profitPercent);
                        }
                        if (staffData.sellingRules) {
                            setSellingRules(staffData.sellingRules);
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load keys or staff data", e);
            }
        };
        initKeys();
        return () => { isMounted = false; };
    }, [user, getIDToken, sessionToken]);

    const loadAndDecrypt = useCallback(async (showLoading: boolean) => {
        if (!isUnlocked || !encryptedPrivateKey || !masterPassword) return;

        try {
            if (showLoading) setIsLoading(true);
            const token = await getIDToken();
            if (!token) return;

            // Fetch encrypted assignments from server
            const res = await fetch('/api/staff/inventory', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to fetch inventory');
            const assignments: {
                id: string;
                encryptedPayload?: string;
                encryptedData?: string;
                staffWrappedDEK?: string;
                adminWrappedDEK?: string;
                iv?: string;
                encryptionVersion?: number;
                assignedAt: string | null;
                status: string;
            }[] = await res.json();

            // With the new auto-push logic, the server just returns the staff member's single latest assignment doc
            if (!Array.isArray(assignments) || assignments.length === 0) {
                setItems([]);
                setHasLoaded(true);
                return;
            }

            // Unwrap the private key once using the master password
            let privateKey: CryptoKey;
            try {
                privateKey = await unwrapPrivateKey(encryptedPrivateKey, masterPassword);
            } catch {
                toast({ title: 'Error de Desencriptación', description: 'No se pudo desbloquear la llave privada. ¿Contraseña incorrecta?', variant: 'destructive' });
                return;
            }

            // Since there's only 1 document per staff member representing their current state:
            const singleAssignment = assignments[0];
            let decryptedState: DecryptedItem[] = [];

            try {
                let plaintext: string;
                if (singleAssignment.encryptionVersion === 2 && singleAssignment.staffWrappedDEK) {
                    // Envelope decryption (v2): unwrap DEK, then AES-decrypt payload
                    const envelope: EnvelopeEncryptedPayload = {
                        encryptedData: singleAssignment.encryptedData || singleAssignment.encryptedPayload || '',
                        iv: singleAssignment.iv || '',
                        staffWrappedDEK: singleAssignment.staffWrappedDEK,
                        adminWrappedDEK: singleAssignment.adminWrappedDEK || '',
                        encryptionVersion: 2,
                    };
                    plaintext = await envelopeDecrypt(envelope, envelope.staffWrappedDEK, privateKey);
                } else {
                    // Legacy v1 fallback: direct RSA-OAEP (for any old docs)
                    const { decryptWithPrivateKey } = await import('@/lib/crypto-client');
                    plaintext = await decryptWithPrivateKey(singleAssignment.encryptedPayload || '', privateKey);
                }

                const data = JSON.parse(plaintext);
                // The new payload format is { items: [...], recipes?: [...] }
                if (data.recipes && Array.isArray(data.recipes)) {
                    setPrivateRecipes(data.recipes);
                } else {
                    setPrivateRecipes([]);
                }

                if (data.items && Array.isArray(data.items)) {
                    decryptedState = data.items.map((i: any) => ({
                        id: i.id,
                        name: i.name,
                        qty: i.qty,
                        value: i.value,
                        unit: i.unit,
                        originalCost: i.originalCost ?? 0,
                        category: i.category,
                        flexiblePrice: i.flexiblePrice,
                        flexibilityPercent: i.flexibilityPercent,
                        maxPriceCap: i.maxPriceCap,
                        baseValue: i.baseValue,
                        masterQty: i.masterQty,
                        baseOriginalCost: i.baseOriginalCost,
                        craftable: i.craftable,
                        costOverride: i.costOverride,
                        note: i.note,
                        pushedAt: i.pushedAt,
                        assignedAt: singleAssignment.assignedAt
                    }));
                }
            } catch (error: any) {
                const spkFp = staffPubKey ? await fingerprintKey(staffPubKey) : 'none';
                console.warn(`[DecryptInventory] Decryption failed. Current staffPubKey FP: ${spkFp}. Error:`, error.name || error.message);
                toast({ title: 'Aviso de Encriptación', description: 'Algunos datos antiguos no se pudieron desencriptar con tus llaves nuevas.', variant: 'default' });
            }

            setItems(decryptedState);
        } catch (error) {
            toast({ title: 'Error', description: 'Error al cargar el inventario', variant: 'destructive' });
        } finally {
            if (showLoading) setIsLoading(false);
            setHasLoaded(true);
        }
    }, [encryptedPrivateKey, masterPassword, getIDToken, staffPubKey, toast]);

    // Real-time listener for public recipes
    useEffect(() => {
        if (!user || !isUnlocked || !masterPassword) return;
        
        const q = collection(db, 'recipes', 'public', 'items');
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const pubRecs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`[recipes/public/items] Snapshot fetched ${pubRecs.length} public recipes.`, pubRecs);
            setPublicRecipes(pubRecs);
        }, (err) => {
            console.error("Public recipes listener error:", err);
        });

        return () => unsubscribe();
    }, [user, isUnlocked, masterPassword]);


    useEffect(() => {
        if (isUnlocked && encryptedPrivateKey && !hasLoaded) {
            loadAndDecrypt(true);
        }
    }, [isUnlocked, encryptedPrivateKey, hasLoaded, masterPassword]);

    useEffect(() => {
        if (!user || !isUnlocked || !encryptedPrivateKey) return;

        const docRef = doc(db, 'inventory', user.uid);

        let initialLoad = true;
        const unsubscribe = onSnapshot(docRef, () => {
            if (initialLoad) {
                initialLoad = false;
                return;
            }
            setHasNewData(true);
            loadAndDecrypt(false);
            // Auto-dismiss the "new data" banner after a short delay
            setTimeout(() => setHasNewData(false), 3000);
        });

        return () => unsubscribe();
    }, [user, isUnlocked, encryptedPrivateKey, loadAndDecrypt]);

    useEffect(() => {
        if (!user || !isUnlocked || !encryptedPrivateKey || !masterPassword) return;

        let isMounted = true;

        const loadSales = async () => {
            if (!isMounted) return;
            try {
                setIsLoadingSales(true);
                // Dynamically import query and orderBy so we don't mess up top level imports
                const { query, orderBy, collection, onSnapshot } = await import('firebase/firestore');

                const salesRef = collection(db, 'finances', user.uid, 'records');
                const q = query(salesRef, orderBy('createdAt', 'desc'));

                const unsub = onSnapshot(q, async (snapshot) => {
                    if (!isMounted) return;

                    let privateKey: CryptoKey;
                    try {
                        privateKey = await unwrapPrivateKey(encryptedPrivateKey, masterPassword);
                    } catch (err) {
                        console.warn("[Inventory] Key unwrap failed for sales sync (password mismatch):", (err as Error).name);
                        return; // silently fail if pk fetch fails here, main inventory loop catches it
                    }

                    const decryptedSalesData: DecryptedSale[] = [];
                    for (const docSnap of snapshot.docs) {
                        const data = docSnap.data();
                        try {
                            const envelope: EnvelopeEncryptedPayload = {
                                encryptedData: data.encryptedData,
                                iv: data.iv,
                                staffWrappedDEK: data.staffWrappedDEK,
                                adminWrappedDEK: data.adminWrappedDEK,
                                encryptionVersion: data.encryptionVersion || 2,
                            };
                            const plaintext = await envelopeDecrypt(envelope, envelope.staffWrappedDEK, privateKey);
                            const parsed = JSON.parse(plaintext);

                            decryptedSalesData.push({
                                id: docSnap.id,
                                type: parsed.type || 'sale',
                                itemId: parsed.itemId || 'Unknown',
                                qtySold: parsed.qtySold || 0,
                                value: typeof parsed.value === 'number' ? parsed.value : 0,
                                originalCost: parsed.originalCost ?? 0,
                                amount: parsed.amount,
                                note: parsed.note,
                                soldAt: new Date(parsed.soldAt || parsed.paidAt || data.createdAt?.toDate?.() || Date.now()),
                                category: parsed.category || 'unknown',
                            });
                        } catch (e: any) {
                            const spkFp = staffPubKey ? await fingerprintKey(staffPubKey) : 'none';
                            console.warn(`[Inventory] Skipping legacy/corrupted sale record due to decryption failure (Current staffPubKey FP: ${spkFp}). Error:`, e.name || e.message);
                        }
                    }
                    if (isMounted) setSales(decryptedSalesData);
                });

                // Parallel query: get user's pending refunds to populate pendingRefundSaleIds
                const where = (await import('firebase/firestore')).where;
                const getDocs = (await import('firebase/firestore')).getDocs;
                const refundsRef = collection(db, 'refunds');
                const pendingRefundsQuery = query(refundsRef, where('employeeId', '==', user.uid), where('status', '==', 'pending'));

                try {
                    const privateKey = await unwrapPrivateKey(encryptedPrivateKey, masterPassword);
                    const refundsSnap = await getDocs(pendingRefundsQuery);
                    const pendingIds = new Set<string>();

                    for (const rDoc of refundsSnap.docs) {
                        const rData = rDoc.data();
                        if (rData.encryptedData && rData.staffWrappedDEK && rData.iv) {
                            try {
                                const envelope: EnvelopeEncryptedPayload = {
                                    encryptedData: rData.encryptedData,
                                    iv: rData.iv,
                                    staffWrappedDEK: rData.staffWrappedDEK,
                                    adminWrappedDEK: rData.adminWrappedDEK || '',
                                    encryptionVersion: rData.encryptionVersion || 2
                                };
                                const plaintext = await envelopeDecrypt(envelope, envelope.staffWrappedDEK, privateKey);
                                const parsed = JSON.parse(plaintext);
                                if (parsed.saleRecordId) {
                                    pendingIds.add(parsed.saleRecordId);
                                }
                            } catch (e) {
                                console.warn("[Inventory] Could not decrypt pending refund in candyman panel to get sale ID:", e);
                            }
                        }
                    }
                    if (isMounted) setPendingRefundSaleIds(pendingIds);
                } catch (e) {
                    console.error("[Inventory] Failed to load pending refunds", e);
                }

                return unsub;
            } catch (e) {
                console.error("Failed to setup sales listener", e);
            } finally {
                if (isMounted) setIsLoadingSales(false);
            }
        };

        const unsubPromise = loadSales();

        return () => {
            isMounted = false;
            unsubPromise.then(unsub => {
                if (typeof unsub === 'function') unsub();
            });
        };
    }, [user, isUnlocked, encryptedPrivateKey, masterPassword, staffPubKey]);


    const executeManualSell = useCallback(async (activeItem: DecryptedItem, qtyToSell: number, finalValue: number, sellNote: string | undefined) => {
        console.log('[SellFlow] Initiating sell process. Current state:', {
            hasSellItem: !!activeItem,
            qtyToSell: qtyToSell,
            hasStaffPubKey: !!staffPubKey,
            hasAdminPubKey: !!adminPubKey,
            isUnlocked: isUnlocked
        });

        if (!activeItem || !qtyToSell || !staffPubKey || !adminPubKey) {
            console.error('[SellFlow] ABORT: Missing required state for sell operation.');
            if (!adminPubKey) toast({ title: "Faltan Llaves del Administrador", description: "El administrador no ha configurado las llaves de encriptación. No se puede vender.", variant: "destructive" });
            return;
        }

        if (isNaN(qtyToSell) || qtyToSell <= 0 || qtyToSell > activeItem.qty) {
            console.error(`[SellFlow] ABORT: Invalid quantity. Expected > 0 and <= ${activeItem.qty}, got: ${qtyToSell}`);
            toast({ title: "Cantidad Inválida", description: "Por favor introduce una cantidad válida.", variant: "destructive" });
            return;
        }

        try {
            console.log(`[SellFlow] Pre-flight checks passed. Setting isSelling = ${activeItem.id}`);
            setIsSelling(activeItem.id);

            const updatedItems = items.map(itm => {
                if (itm.id === activeItem.id) {
                    let newValue = itm.value;
                    let newCost = itm.originalCost || 0;
                    const isBatch = itm.unit === 'grams' || itm.unit === 'kg' || itm.unit === 'oz';
                    if (isBatch) {
                        const ratio = qtyToSell / itm.qty;
                        newValue = formatQty(Math.max(0, itm.value - (itm.value * ratio)));
                        newCost = formatQty(Math.max(0, newCost - (newCost * ratio)));
                    }
                    return { ...itm, qty: formatQty(itm.qty - qtyToSell), value: newValue, originalCost: newCost };
                }
                return itm;
            }).filter(itm => itm.qty > 0 || recipes.some(r => r.outputItemId === itm.id)); // Drop items with 0 qty unless it's a craftable recipe output

            // Envelope Encrypt the new payload
            const payloadJSON = JSON.stringify({ items: updatedItems, recipes: recipes });

            // Fetch fresh keys before encrypting to prevent stale state issues
            const token = await getIDToken();
            if (!token) {
                console.error('[SellFlow] Failed to retrieve fresh ID token.');
                throw new Error("Failed to get authentication token");
            }

            let freshStaffPubKey = staffPubKey;
            let freshAdminPubKey = adminPubKey;

            const publicDoc = await getDoc(doc(db, 'public', user!.uid));
            if (publicDoc.exists() && publicDoc.data().publicKey) {
                freshStaffPubKey = publicDoc.data().publicKey;
                // And we fetch admin key
                const adminKeyFetch = await fetch(`/api/staff/admin-key?t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (adminKeyFetch.ok) {
                    const adminData = await adminKeyFetch.json();
                    freshAdminPubKey = adminData.publicKey;
                }
            }

            if (!freshStaffPubKey || !freshAdminPubKey) {
                throw new Error("Missing encryption keys for sell operation");
            }

            const sFp = await fingerprintKey(freshStaffPubKey);
            const aFp = await fingerprintKey(freshAdminPubKey);
            console.log(`[SellFlow] Encrypting updated inventory payload (${updatedItems.length} items remaining). Using fresh staffKey FP: ${sFp}, fresh adminKey FP: ${aFp}`);

            const payload = await envelopeEncrypt(payloadJSON, freshStaffPubKey, freshAdminPubKey);
            console.log('[SellFlow] Envelope encryption successful.');

            console.log('[SellFlow] Obtained ID token. Posting to /api/staff/inventory/sell...');

            const invRes = await fetch('/api/staff/inventory/sell', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...payload,
                    allSold: updatedItems.length === 0
                })
            });

            console.log(`[SellFlow] Inventory update response: ${invRes.status} ${invRes.statusText}`);
            if (!invRes.ok) {
                const errText = await invRes.text();
                console.error(`[SellFlow] Inventory update failed. Server response:`, errText);
                throw new Error("Failed to push inventory update");
            }

            // BLOCKING: Push E2E encrypted sale record to admin finances
            console.log(`[SellFlow] Starting E2E finance push via client-push.ts...`);
            // This is done sequentially. If finance push fails, the sale still
            // happened in inventory (which is OK for zero-knowledge, but UI error shows it)
            // Ideally we'd do a batch write, but they are separate collections/flows.
            const isBatch = activeItem.unit === 'grams' || activeItem.unit === 'kg' || activeItem.unit === 'oz';

            // Check if the item is a craftable output
            const isCraftable = recipes.some(r => r.outputItemId === activeItem.id);

            const unitValue = formatQty(isBatch ? (finalValue / (activeItem.qty || 1)) : finalValue);
            const unitCost = formatQty(isBatch ? ((activeItem.originalCost || 0) / (activeItem.qty || 1)) : (activeItem.originalCost || 0));

            const financeRes = await pushSaleRecord(
                {
                    itemId: activeItem.id,
                    qtySold: qtyToSell,
                    value: unitValue,
                    originalCost: unitCost,
                    note: sellNote || undefined,
                    unit: activeItem.unit,
                    weight: isBatch ? qtyToSell : undefined,
                    soldAt: new Date().toISOString(),
                    category: activeItem.category || 'unknown',
                },
                freshStaffPubKey,
                freshAdminPubKey,
                token,
                undefined, // staffUidOverride
                (activeItem.flexiblePrice && activeItem.category && !isCraftable) ? {
                    baseValue: sellingRules[activeItem.category]?.unitValue || activeItem.value,
                    flexibilityPercent: activeItem.flexibilityPercent || 0,
                    finalValue: finalValue
                } : (isCraftable ? {
                    baseValue: activeItem.value,
                    flexibilityPercent: 0,
                    finalValue: activeItem.value
                } : undefined)
            );

            console.log(`[SellFlow] Finance push returned:`, financeRes);
            if (!financeRes.success) {
                console.error('[SellFlow] Finance E2E push failed:', financeRes.error);
                // If finances failed, we throw an error but warn that inventory was still decremented locally
                throw new Error(`Error de sincronización financiera: ${financeRes.error}. Por favor notifica al administrador.`);
            }

            console.log('[SellFlow] Transaction fully completed successfully.');
            toast({ title: 'Venta Registrada', description: `Marcado exitosamente ${qtyToSell} como vendido.` });
            setSellItem(null);
            setSellPrice('');
            // onSnapshot will reload the list automatically
        } catch (error) {
            console.error("[SellFlow] EXCEPTION CAUGHT during sell flow:", error);
            toast({ title: 'Error', description: 'Error al completar la venta', variant: 'destructive' });
        } finally {
            setIsSelling(null);
        }
    }, [items, recipes, user, getIDToken, staffPubKey, adminPubKey, encryptedPrivateKey, masterPassword, isUnlocked, sellingRules]);

    const handleCraftSubmit = async (recipe: any, multiplier: number = 1) => {
        setIsCrafting(recipe.id);
        try {
            const token = await getIDToken();
            if (!token) throw new Error("Fallo de autenticación");

            let freshStaffPubKey = staffPubKey;
            let freshAdminPubKey = adminPubKey;

            const publicDoc = await getDoc(doc(db, 'public', user!.uid));
            if (publicDoc.exists() && publicDoc.data().publicKey) {
                freshStaffPubKey = publicDoc.data().publicKey;
                const adminKeyFetch = await fetch(`/api/staff/admin-key?t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (adminKeyFetch.ok) {
                    const adminData = await adminKeyFetch.json();
                    freshAdminPubKey = adminData.publicKey;
                }
            }

            if (!freshStaffPubKey || !freshAdminPubKey) {
                throw new Error("Faltan llaves de encriptación para fabricar");
            }

            // Create updated items array locally
            const updatedItems = items.map(itm => ({ ...itm }));

            // Deduct ingredients
            for (const ing of recipe.ingredients) {
                const idx = updatedItems.findIndex(i => i.id === ing.itemId);
                const deductionQty = ing.quantity * multiplier;
                if (idx === -1 || updatedItems[idx].qty < deductionQty) {
                    throw new Error("No tienes suficientes ingredientes");
                }
                const isBatchIng = updatedItems[idx].unit === 'grams' || updatedItems[idx].unit === 'kg' || updatedItems[idx].unit === 'oz';
                if (isBatchIng) {
                    const ratio = deductionQty / updatedItems[idx].qty;
                    updatedItems[idx].value = formatQty(Math.max(0, updatedItems[idx].value - (updatedItems[idx].value * ratio)));
                    updatedItems[idx].originalCost = formatQty(Math.max(0, (updatedItems[idx].originalCost || 0) - ((updatedItems[idx].originalCost || 0) * ratio)));
                }
                updatedItems[idx].qty = formatQty(updatedItems[idx].qty - deductionQty);
            }

            // Calculate crafted item value from consumed ingredients
            let craftedValue = 0;
            let craftedCost = 0;
            for (const ing of recipe.ingredients) {
                const ingItem = items.find(i => i.id === ing.itemId);
                if (ingItem) {
                    const isBatchIng = ingItem.unit === 'grams' || ingItem.unit === 'kg' || ingItem.unit === 'oz';
                    if (isBatchIng) {
                        const ratio = (ing.quantity * multiplier) / ingItem.qty;
                        craftedValue += ingItem.value * ratio;
                        craftedCost += (ingItem.originalCost || 0) * ratio;
                    } else {
                        // For PCS, ingItem.value is already per-unit
                        const usedQty = ing.quantity * multiplier;
                        craftedValue += ingItem.value * usedQty;
                        craftedCost += (ingItem.originalCost || 0) * usedQty;
                    }
                }
            }

            // Add output
            let outIdx = updatedItems.findIndex(i => i.id === recipe.outputItemId);
            if (outIdx === -1) {
                if (recipe.outputItemName) {
                    updatedItems.push({
                        id: recipe.outputItemId,
                        name: recipe.outputItemName,
                        qty: 0,
                        value: formatQty(craftedValue),
                        originalCost: formatQty(craftedCost),
                        unit: recipe.outputItemUnit || 'pcs',
                        category: 'crafting',
                        assignedAt: new Date().toISOString(),
                    });
                    outIdx = updatedItems.length - 1;
                } else {
                    throw new Error("No tienes el artículo fabricable asignado. Pídele al admin que te lo asigne primero o sincronice la receta.");
                }
            }

            const isBatchOut = updatedItems[outIdx].unit === 'grams' || updatedItems[outIdx].unit === 'kg' || updatedItems[outIdx].unit === 'oz';
            const craftQtyOut = recipe.outputQuantity * multiplier;
            
            if (isBatchOut && updatedItems[outIdx].baseValue !== undefined && updatedItems[outIdx].masterQty) {
                const ratio = craftQtyOut / updatedItems[outIdx].masterQty!;
                updatedItems[outIdx].value = formatQty(updatedItems[outIdx].value + (updatedItems[outIdx].baseValue! * ratio));
                updatedItems[outIdx].originalCost = formatQty((updatedItems[outIdx].originalCost || 0) + ((updatedItems[outIdx].baseOriginalCost || 0) * ratio));
            } else if (isBatchOut) {
                // New batch item or missing master data
                updatedItems[outIdx].value = formatQty(updatedItems[outIdx].value + craftedValue);
                updatedItems[outIdx].originalCost = formatQty((updatedItems[outIdx].originalCost || 0) + craftedCost);
            } else {
                // Non-batch (PCS): Calculate new UNIT value
                const currentTotalVal = updatedItems[outIdx].value * updatedItems[outIdx].qty;
                const newTotalVal = currentTotalVal + craftedValue;
                const currentTotalCost = (updatedItems[outIdx].originalCost || 0) * updatedItems[outIdx].qty;
                const newTotalCost = currentTotalCost + craftedCost;
                const newQty = updatedItems[outIdx].qty + craftQtyOut;
                
                updatedItems[outIdx].value = formatQty(newTotalVal / newQty);
                updatedItems[outIdx].originalCost = formatQty(newTotalCost / newQty);
            }
            
            updatedItems[outIdx].qty = formatQty(updatedItems[outIdx].qty + craftQtyOut);
            
            // Ensure category is preserved as crafting if it was added or is new
            if (outIdx >= 0 && (!updatedItems[outIdx].category || updatedItems[outIdx].category === 'unknown')) {
                updatedItems[outIdx].category = 'crafting';
            }

            // Remove 0 qty items EXCEPT craftable outputs
            const finalItems = updatedItems.filter(itm => itm.qty > 0 || recipes.some(r => r.outputItemId === itm.id));

            const payloadJSON = JSON.stringify({ items: finalItems, recipes: recipes });
            const payload = await envelopeEncrypt(payloadJSON, freshStaffPubKey, freshAdminPubKey);

            const invRes = await fetch('/api/staff/inventory/sell', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...payload,
                    allSold: false
                })
            });

            if (!invRes.ok) throw new Error("Error al actualizar inventario");

            // 2. Report ingredient consumption to master inventory via dedicated "crafting" records
            // This allows the admin UI to show these as "Sold" (deducted) in master views.
            if (user?.uid) {
                try {
                    for (const ing of recipe.ingredients) {
                        const ingItem = items.find(i => i.id === ing.itemId);
                        if (ingItem) {
                            await pushSaleRecord(
                                {
                                    type: 'crafting',
                                    itemId: ing.itemId,
                                    itemName: ingItem.name,
                                    qtySold: ing.quantity * multiplier,
                                    value: 0, // Consumption has no financial value for payroll
                                    originalCost: 0,
                                    category: ingItem.category || 'ingredient',
                                    soldAt: new Date().toISOString()
                                },
                                freshStaffPubKey,
                                freshAdminPubKey,
                                token
                            );
                        }
                    }
                } catch (e) {
                    console.error("[CraftFlow] Failed to push ingredient consumption records:", e);
                    // Non-blocking: E2E inventory is already updated
                }

                // 3. Register crafted output in staff shadow assignments
                // This ensures it renders in the "Staff Stock" assignment view for admins.
                try {
                    const assignmentRef = doc(db, 'employees', user.uid, 'assignments', recipe.outputItemId);
                    await setDoc(assignmentRef, {
                        employeeId: user.uid,
                        itemId: recipe.outputItemId,
                        itemName: recipe.outputItemName || 'Crafted Item',
                        quantity: formatQty(updatedItems[outIdx].qty), // The total currently held
                        unit: recipe.outputItemUnit || 'pcs',
                        category: 'crafting',
                        assignedAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                } catch (e) {
                    console.error("[CraftFlow] Failed to register shadow assignment:", e);
                    // Non-blocking
                }
            }

            toast({ title: 'Fabricación Exitosa', description: `Has fabricado ${recipe.outputQuantity * multiplier} unidad(es).` });
        } catch (error: any) {
            console.error("[CraftFlow] Error:", error);
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsCrafting(null);
        }
    };

    const handleUncraftSubmit = async (recipe: any, multiplier: number = 1, losses: Record<string, number> = {}) => {
        setIsCrafting(recipe.id);
        try {
            const token = await getIDToken();
            if (!token) throw new Error("Fallo de autenticación");

            let freshStaffPubKey = staffPubKey;
            let freshAdminPubKey = adminPubKey;

            const publicDoc = await getDoc(doc(db, 'public', user!.uid));
            if (publicDoc.exists() && publicDoc.data().publicKey) {
                freshStaffPubKey = publicDoc.data().publicKey;
                const adminKeyFetch = await fetch(`/api/staff/admin-key?t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (adminKeyFetch.ok) {
                    const adminData = await adminKeyFetch.json();
                    freshAdminPubKey = adminData.publicKey;
                }
            }

            if (!freshStaffPubKey || !freshAdminPubKey) {
                throw new Error("Faltan llaves de encriptación para desmantelar");
            }

            const updatedItems = items.map(itm => ({ ...itm }));

            let outIdx = updatedItems.findIndex(i => i.id === recipe.outputItemId);
            if (outIdx === -1) {
                throw new Error("No tienes el artículo a desmantelar.");
            }

            const isBatchOut = updatedItems[outIdx].unit === 'grams' || updatedItems[outIdx].unit === 'kg' || updatedItems[outIdx].unit === 'oz';
            const reqOutQty = recipe.outputQuantity * multiplier;

            if (updatedItems[outIdx].qty < reqOutQty) {
                throw new Error(`Cantidad insuficiente para desmantelar. Necesitas ${reqOutQty}.`);
            }

            // Deduct output item
            if (isBatchOut) {
                const ratio = reqOutQty / updatedItems[outIdx].qty;
                updatedItems[outIdx].value = formatQty(Math.max(0, updatedItems[outIdx].value - (updatedItems[outIdx].value * ratio)));
                updatedItems[outIdx].originalCost = formatQty(Math.max(0, (updatedItems[outIdx].originalCost || 0) - ((updatedItems[outIdx].originalCost || 0) * ratio)));
            }
            updatedItems[outIdx].qty = formatQty(updatedItems[outIdx].qty - reqOutQty);

            // Add ingredients back
            for (const ing of recipe.ingredients) {
                const defaultReturnPerBatch = ing.salvageQuantity !== undefined ? ing.salvageQuantity : ing.quantity;
                const customLossPerBatch = losses[ing.itemId] || 0;
                const actualReturnPerBatch = Math.max(0, defaultReturnPerBatch - customLossPerBatch);
                const totalReturn = actualReturnPerBatch * multiplier;

                if (totalReturn > 0) {
                    let idx = updatedItems.findIndex(i => i.id === ing.itemId);
                    if (idx !== -1) {
                        const isBatchIng = updatedItems[idx].unit === 'grams' || updatedItems[idx].unit === 'kg' || updatedItems[idx].unit === 'oz';
                        
                        if (isBatchIng) {
                            if (updatedItems[idx].baseValue !== undefined && updatedItems[idx].masterQty) {
                                const ratio = totalReturn / updatedItems[idx].masterQty!;
                                updatedItems[idx].value = formatQty(updatedItems[idx].value + (updatedItems[idx].baseValue! * ratio));
                                updatedItems[idx].originalCost = formatQty((updatedItems[idx].originalCost || 0) + ((updatedItems[idx].baseOriginalCost || 0) * ratio));
                            } else {
                                const valPerUnit = updatedItems[idx].qty > 0 ? (updatedItems[idx].value / updatedItems[idx].qty) : 0;
                                const costPerUnit = updatedItems[idx].qty > 0 ? ((updatedItems[idx].originalCost || 0) / updatedItems[idx].qty) : 0;
                                updatedItems[idx].value = formatQty(updatedItems[idx].value + (valPerUnit * totalReturn));
                                updatedItems[idx].originalCost = formatQty((updatedItems[idx].originalCost || 0) + (costPerUnit * totalReturn));
                            }
                        } else {
                            const currentTotalVal = updatedItems[idx].value * updatedItems[idx].qty;
                            const newTotalVal = currentTotalVal + (updatedItems[idx].value * totalReturn);
                            const currentTotalCost = (updatedItems[idx].originalCost || 0) * updatedItems[idx].qty;
                            const newTotalCost = currentTotalCost + ((updatedItems[idx].originalCost || 0) * totalReturn);
                            
                            const newQty = updatedItems[idx].qty + totalReturn;
                            updatedItems[idx].value = formatQty(newTotalVal / newQty);
                            updatedItems[idx].originalCost = formatQty(newTotalCost / newQty);
                        }
                        
                        updatedItems[idx].qty = formatQty(updatedItems[idx].qty + totalReturn);
                    } else {
                        // If ingredient is fully missing from array, we must fetch from public recipes or meta?
                        // For simplicity, skip. Admin handles full meta.
                        console.warn("[UncraftFlow] Ingredient not found in local array, cannot return to shadow state.");
                    }
                }
            }

            const finalItems = updatedItems.filter(itm => itm.qty > 0 || recipes.some(r => r.outputItemId === itm.id));

            const payloadJSON = JSON.stringify({ items: finalItems, recipes: recipes });
            const payload = await envelopeEncrypt(payloadJSON, freshStaffPubKey, freshAdminPubKey);

            const invRes = await fetch('/api/staff/inventory/sell', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...payload,
                    allSold: false
                })
            });

            if (!invRes.ok) throw new Error("Error al actualizar inventario");

            // Report recovery to shadow records
            if (user?.uid) {
                try {
                    for (const ing of recipe.ingredients) {
                        const defaultReturnPerBatch = ing.salvageQuantity !== undefined ? ing.salvageQuantity : ing.quantity;
                        const customLossPerBatch = losses[ing.itemId] || 0;
                        const actualReturnPerBatch = Math.max(0, defaultReturnPerBatch - customLossPerBatch);
                        const totalReturn = actualReturnPerBatch * multiplier;
                        
                        if (totalReturn > 0) {
                            const ingItem = items.find(i => i.id === ing.itemId);
                            if (ingItem) {
                                await pushSaleRecord(
                                    {
                                        type: 'recovery',
                                        itemId: ing.itemId,
                                        itemName: ingItem.name,
                                        qtySold: totalReturn, // Positive recovery to staff stock
                                        value: 0,
                                        originalCost: 0,
                                        category: ingItem.category || 'ingredient',
                                        soldAt: new Date().toISOString()
                                    },
                                    freshStaffPubKey,
                                    freshAdminPubKey,
                                    token
                                );
                            }
                        }
                    }
                } catch (e) {
                    console.error("[UncraftFlow] Failed to push recovery records:", e);
                }

                try {
                    const assignmentRef = doc(db, 'employees', user.uid, 'assignments', recipe.outputItemId);
                    await setDoc(assignmentRef, {
                        employeeId: user.uid,
                        itemId: recipe.outputItemId,
                        itemName: recipe.outputItemName || 'Crafted Item',
                        quantity: formatQty(updatedItems[outIdx].qty),
                        unit: recipe.outputItemUnit || 'pcs',
                        category: 'crafting',
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                } catch (e) {
                    console.error("[UncraftFlow] Failed to update shadow assignment:", e);
                }
            }

            toast({ title: 'Desmantelado Exitoso', description: `Has asegurado los ingredientes de ${recipe.outputQuantity * multiplier} unidad(es).` });
        } catch (error: any) {
            console.error("[UncraftFlow] Error:", error);
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsCrafting(null);
        }
    };



    if (!isUnlocked) return null;

    if (!encryptedPrivateKey) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        My Inventory
                    </CardTitle>
                    <CardDescription>Items assigned to you by the owner.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 text-amber-600 text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                            Your account doesn't have encryption keys yet. Re-enter your master password to generate them.
                        </span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-8">
            {(!section || section === 'inventory') && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5" />
                            Mi Inventario
                        </CardTitle>
                        <div className="flex items-center justify-between mt-1">
                            <CardDescription>
                                Artículos asignados a ti de forma segura. Desencriptados localmente.
                            </CardDescription>
                            <div className="flex items-center gap-2">
                                {(() => {
                                    const hasAvailableRecipes = recipes.some((r: any) => {
                                        for (const ing of r.ingredients) {
                                            const stockItem = items.find(i => i.id === ing.itemId) || items.find(i => i.name && ing.ingredientName && i.name.toLowerCase() === ing.ingredientName.toLowerCase());
                                            if (!stockItem || parseFloat(stockItem.qty.toString()) < parseFloat(ing.quantity.toString())) return false;
                                        }
                                        return true;
                                    });

                                    if (hasAvailableRecipes) {
                                        return (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                className="shadow-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                                                onClick={() => setIsCraftingDialogOpen(true)}
                                            >
                                                <Beaker className="h-4 w-4 mr-1.5" />
                                                Recetas Disponibles
                                            </Button>
                                        );
                                    }
                                    return null;
                                })()}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-background shadow-xs hover:bg-primary/10 transition-colors border-primary/20"
                                    onClick={() => loadAndDecrypt(true)}
                                    disabled={isLoading}
                                >
                                    <RefreshCw className={`h-3 w-3 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                                    Sincronizar Inventario
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {hasNewData && (
                            <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary animate-pulse">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Nuevo inventario recibido — desencriptando...
                            </div>
                        )}
                        {isLoading ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : items.length === 0 ? (
                            <div className="text-center text-muted-foreground text-sm py-6 border border-dashed rounded-md">
                                Aún no hay asignaciones de inventario.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {items.map((item) => (
                                    <div
                                        key={item.id}
                                        className={`flex flex-col gap-2 rounded-xl border p-4 relative overflow-hidden transition-all shadow-sm ${getCategoryCardClass(item.category, item.category === 'crafting' || !!item.craftable)}`}
                                    >
                                        <div className="absolute top-0 right-0 p-2 opacity-[0.03] rotate-12 scale-150">
                                            <Package className="h-20 w-20" />
                                        </div>
                                        {item.error ? (
                                            <div className="flex items-center gap-2 text-red-500 text-sm h-full justify-center">
                                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                                <span>{item.error}</span>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-2">
                                                    <div className="flex flex-col overflow-hidden pr-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="font-medium text-sm truncate" title={item.name}>{item.name}</p>
                                                            <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 leading-none ${getCategoryBadgeClass(item.category, item.category === 'crafting')}`}>{item.category || 'inventario'}</Badge>
                                                        </div>
                                                        <span className="text-[10px] font-mono tracking-tight text-primary/70">ID: {item.id.substring(0, 8)}</span>
                                                    </div>
                                                    <span className="text-[10px] uppercase font-bold text-muted-foreground whitespace-nowrap self-start">
                                                        {item.pushedAt ? new Date(item.pushedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'En vivo'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-end mt-1">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Cant.</span>
                                                        <span className="text-3xl font-black text-foreground tracking-tighter leading-none">{formatQty(item.qty)}</span>
                                                    </div>
                                                    <div className="flex flex-col text-right gap-1 relative z-10">
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                                            Valor {item.unit === 'grams' || item.unit === 'kg' || item.unit === 'oz' ? 'Total (Lote)' : 'Unitario'}
                                                        </span>
                                                        {item.unit === 'grams' || item.unit === 'kg' || item.unit === 'oz' ? (
                                                            <span className="text-xl font-bold text-green-600 dark:text-green-500 tracking-tight leading-none">${item.value.toFixed(2)}</span>
                                                        ) : (
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-xl font-bold text-green-600 dark:text-green-500 tracking-tight leading-none">${item.value.toFixed(2)} <span className="text-[10px] font-normal opacity-70">c/u</span></span>
                                                                <span className="text-[10px] text-muted-foreground mt-0.5">Total: ${(item.value * item.qty).toFixed(2)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {item.note || item.category === 'crafting' ? (
                                                    <div className="mt-4 bg-background border border-dashed border-border/60 p-2.5 rounded-md text-[11px] text-muted-foreground italic relative z-10 flex items-center justify-center min-h-[40px]">
                                                        {item.category === 'crafting' ? (
                                                            <span>"Crafted by Self"</span>
                                                        ) : (
                                                            <span>"Assigned by admin"</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="mt-4 min-h-[40px]"></div>
                                                )}
                                                <div className="mt-4 pt-4 border-t border-border/50 relative z-10 grid grid-cols-2 gap-2">
                                                    <Button
                                                        variant="outline"
                                                        className="w-full font-semibold border-primary/20 hover:bg-primary/10 hover:text-primary transition-colors text-xs sm:text-sm px-1"
                                                        onClick={() => {
                                                            setSellItem(item);
                                                            setSellQty(item.qty.toString());
                                                            setSellPrice(item.value.toString());
                                                        }}
                                                        disabled={!staffPubKey || !adminPubKey || !!isSelling}
                                                    >
                                                        <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                                                        Vender
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        className="w-full font-semibold border-amber-500/20 hover:bg-amber-500/10 text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 transition-colors text-xs sm:text-sm px-1"
                                                        onClick={() => {
                                                            window.dispatchEvent(new CustomEvent('open-staff-reports', { detail: { itemId: item.id } }));
                                                        }}
                                                        disabled={!staffPubKey || !adminPubKey || !!isSelling}
                                                    >
                                                        <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                                                        Pérdida
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>

                    {/* Sell Dialog */}
                    <Dialog open={!!sellItem} onOpenChange={(open) => {
                        if (!open) {
                            setSellItem(null);
                            setSellPrice('');
                        }
                    }}>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <ShoppingCart className="h-5 w-5 text-primary" />
                                    Registrar Venta
                                </DialogTitle>
                                <DialogDescription>
                                    Marca este artículo como vendido. La transacción representa un decremento de inventario irreversible de conocimiento cero.
                                </DialogDescription>
                            </DialogHeader>
                            {sellItem && (
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!sellItem) return;
                                    let qtyToSell = parseFloat(sellQty);
                                    let finalValue = sellItem.value;
                                    if (sellItem.flexiblePrice && sellPrice && sellItem.category) {
                                        finalValue = parseFloat(sellPrice);
                                    }
                                    executeManualSell(sellItem, qtyToSell, finalValue, sellNote);
                                }} className="space-y-4 py-4">
                                    <div className="bg-muted p-3 rounded-md border border-border/50 font-mono text-sm">
                                        <div><span className="text-muted-foreground">ID del Artículo:</span> {sellItem.id}</div>
                                        <div><span className="text-muted-foreground">Disponible:</span> {sellItem.qty}</div>
                                    </div>
                                    <div className="space-y-2 relative z-50">
                                        <Label className="flex items-center justify-between">
                                            <span>Cantidad Vendida</span>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-6 px-2 text-xs"
                                                onClick={() => setSellQty(formatQty(sellItem.qty).toString())}
                                            >
                                                Max: {formatQty(sellItem.qty)}
                                            </Button>
                                        </Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            max={sellItem.qty.toString()}
                                            value={sellQty}
                                            onChange={e => setSellQty(e.target.value)}
                                            autoFocus
                                            required
                                        />
                                        <span className="text-[10px] text-muted-foreground">Introduce la cantidad transaccionada con éxito.</span>
                                    </div>

                                    {/* Flexible Pricing Input */}
                                    {(sellItem.flexiblePrice && !recipes.some(r => r.outputItemId === sellItem.id)) && (
                                        <div className="space-y-2 relative z-50 mt-4 p-3 bg-primary/5 rounded-md border border-primary/20">
                                            <Label className="flex justify-between items-center text-primary font-semibold">
                                                <span>Precio a Cobrar</span>
                                                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Precio Flexible</Badge>
                                            </Label>
                                            {(() => {
                                                const isBatch = sellItem.unit === 'grams' || sellItem.unit === 'kg' || sellItem.unit === 'oz';
                                                const parsedQty = parseFloat(sellQty || "0");
                                                const expectedBasePrice = isBatch
                                                    ? (sellItem.value / (sellItem.qty || 1)) * parsedQty
                                                    : sellItem.value * parsedQty;

                                                const flex = (sellItem.flexibilityPercent || 0) / 100;
                                                const minPrice = expectedBasePrice * (1 - flex);
                                                const maxPrice = expectedBasePrice;

                                                return (
                                                    <>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={sellPrice}
                                                            onChange={e => setSellPrice(e.target.value)}
                                                            min={minPrice}
                                                            max={maxPrice}
                                                            required
                                                            className="font-mono"
                                                        />
                                                        <div className="flex justify-between text-[10px] text-muted-foreground pt-1 px-1 font-mono">
                                                            <span>Min: ${minPrice.toFixed(2)}</span>
                                                            <span>Max: ${maxPrice.toFixed(2)}</span>
                                                        </div>
                                                    </>
                                                )
                                            })()}
                                        </div>
                                    )}

                                    {recipes.some(r => r.outputItemId === sellItem.id) && (
                                        <div className="mt-4 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-start gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                                            <div className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
                                                Este artículo es fabricable. Su precio está bloqueado por el valor de sus ingredientes y no puede modificarse manualmente en el punto de venta.
                                            </div>
                                        </div>
                                    )}

                                    <DialogFooter className="mt-6">
                                        <Button type="button" variant="outline" onClick={() => {
                                            setSellItem(null);
                                            setSellPrice('');
                                        }}>Cancelar</Button>
                                        <Button type="submit" disabled={!sellQty || !!isSelling} className="bg-primary hover:bg-primary/90 text-primary-foreground dark:text-primary-foreground">
                                            {isSelling === sellItem.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Confirmar Venta
                                        </Button>
                                    </DialogFooter>
                                </form>
                            )}
                        </DialogContent>
                    </Dialog>

                </Card>
            )}

            {(!section || section === 'sales') && (
                <Card className={section ? "border-t-4 border-t-blue-500/20" : "mt-8 border-t-4 border-t-blue-500/20"}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-blue-600 dark:text-blue-500" />
                            Artículos Vendidos
                        </CardTitle>
                        <CardDescription>
                            Historial reciente de salidas de inventario.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {sales.filter(s => s.type !== 'debt' && s.type !== 'payment' && (s.type as string) !== 'crafting' && (s.type as string) !== 'recovery').slice(0, 6).map(sale => {
                                const matchedItem = items.find(i => i.id === sale.itemId);
                                const displayName = matchedItem?.name ? matchedItem.name : `ID: ${(sale.itemId || '').substring(0, 8)}...`;
                                return (
                                    <div key={sale.id} className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                            <span className="font-medium text-sm truncate pr-2" title={displayName}>{displayName}</span>
                                            <Badge variant="outline" className="text-[10px] shrink-0">{sale.soldAt.toLocaleDateString()}</Badge>
                                        </div>
                                        <div className="flex justify-between items-end mt-2">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Cant.</span>
                                                <span className="text-xl font-black leading-none">{sale.qtySold}</span>
                                            </div>
                                            <div className="flex flex-col text-right">
                                                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Valor Total</span>
                                                <span className="text-lg font-bold text-green-600 dark:text-green-500 leading-none">
                                                    ${((sale.qtySold || 0) * (sale.value || 0)).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-border/50 text-right">
                                            {pendingRefundSaleIds.has(sale.id) ? (
                                                <Badge variant="outline" className="text-xs bg-muted text-muted-foreground cursor-not-allowed">
                                                    Reembolso Pendiente
                                                </Badge>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/50 dark:hover:text-red-300"
                                                    onClick={() => {
                                                        window.dispatchEvent(new CustomEvent('open-staff-reports', {
                                                            detail: { saleRecords: sale }
                                                        }));
                                                    }}
                                                >
                                                    Solicitar Reembolso
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                            {sales.filter(s => s.type !== 'debt' && s.type !== 'payment' && (s.type as string) !== 'crafting' && (s.type as string) !== 'recovery').length === 0 && (
                                <div className="col-span-full text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg bg-muted/20">
                                    No hay ventas recientes.
                                </div>
                            )}
                        </div>
                    </CardContent>


                </Card>
            )}

            {(!section || section === 'finances') && (
                <Card className={section ? "border-t-4 border-t-primary/20" : "mt-8 border-t-4 border-t-primary/20"}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 flex-wrap">
                            <DollarSign className="h-5 w-5 text-green-600 dark:text-green-500" />
                            Finanzas Recientes
                            <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900 border-dashed">
                                {sales.length} registros desencriptados E2E
                            </Badge>
                            <div className="ml-auto flex items-center gap-2">
                                <Badge variant="default" className={`text-sm py-1 px-3 shadow-md ${(() => {
                                    const totals = sales.reduce((acc, sale) => {
                                        if (sale.type === 'payment') {
                                            acc.paid += (sale.amount || 0);
                                        } else if (sale.type === 'debt') {
                                            acc.debts += Math.abs(sale.value || 0); // debts are 1:1, negative values
                                            acc.earned += (sale.value || 0);
                                        } else {
                                            const totalRev = (sale.qtySold || 0) * (sale.value || 0);
                                            const totalCost = (sale.qtySold || 0) * (sale.originalCost || 0);
                                            acc.earned += (totalRev - totalCost) * (profitPercent / 100);
                                        }
                                        return acc;
                                    }, { earned: 0, paid: 0, debts: 0 });
                                    const gananciaTotal = totals.earned;
                                    if (gananciaTotal > 0) return 'bg-green-600 text-white';
                                    if (gananciaTotal < 0) return 'bg-red-600 text-white';
                                    return 'bg-primary text-primary-foreground';
                                })()
                                    }`}>
                                    Balance Actual: ${
                                        (() => {
                                            const computed = sales.reduce((acc, sale) => {
                                                if (sale.type === 'payment') {
                                                    if ((sale.amount || 0) < 0) {
                                                        // Repayment offsets debt, doesn't impact balance directly (already in debt)
                                                        return acc;
                                                    } else {
                                                        return acc - (sale.amount || 0); // Payment reduces pending balance
                                                    }
                                                } else if (sale.type === 'debt') {
                                                    return acc - Math.abs(sale.value || 0); // Debt reduces pending balance
                                                } else {
                                                    const totalRev = (sale.qtySold || 0) * (sale.value || 0);
                                                    const totalCost = (sale.qtySold || 0) * (sale.originalCost || 0);
                                                    return acc + (totalRev - totalCost) * (profitPercent / 100);
                                                }
                                            }, 0);
                                            return computed.toFixed(2);
                                        })()
                                    }
                                </Badge>
                            </div>
                        </CardTitle>
                        <CardDescription>
                            Tus registros procesados. Los datos se sincronizan de forma segura y se desencriptan localmente. Porcentaje de ganancia: {profitPercent}%.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {(() => {
                            const payroll = sales.reduce((acc, sale) => {
                                if (sale.type === 'payment') {
                                    if ((sale.amount || 0) < 0) {
                                        // Repayment: staff pays admin back.
                                        // ONLY reduces debts, does not increase earned.
                                        const repaymentAmount = Math.abs(sale.amount || 0);
                                        acc.debts = Math.max(0, acc.debts - repaymentAmount);
                                    } else {
                                        // Normal payment from admin to staff
                                        acc.paid += (sale.amount || 0);
                                    }
                                } else if (sale.type === 'debt') {
                                    acc.debts += Math.abs(sale.value || 0);
                                    acc.earned -= Math.abs(sale.value || 0); // explicit minus just in case
                                } else {
                                    const rev = (sale.qtySold || 0) * (sale.value || 0);
                                    const cost = (sale.qtySold || 0) * (sale.originalCost || 0);
                                    acc.earned += (rev - cost) * (profitPercent / 100);
                                }
                                return acc;
                            }, { earned: 0, paid: 0, debts: 0 });

                            const balance = payroll.earned - payroll.paid;

                            return (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 mt-2">
                                    <div className="p-4 rounded-xl border border-border/50 bg-muted/20 flex flex-col items-center text-center">
                                        <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-1">Ganado</span>
                                        <span className="text-2xl font-black text-foreground">${payroll.earned.toFixed(2)}</span>
                                    </div>
                                    <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex flex-col items-center text-center">
                                        <span className="text-xs uppercase tracking-widest text-red-500/70 font-bold mb-1">Deudas</span>
                                        <span className="text-2xl font-black text-red-500">${payroll.debts.toFixed(2)}</span>
                                    </div>
                                    <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 flex flex-col items-center text-center leading-none">
                                        <span className="text-xs uppercase tracking-widest text-blue-500/70 font-bold mb-1">Pagado</span>
                                        <span className="text-2xl font-black text-blue-500">${payroll.paid.toFixed(2)}</span>
                                    </div>
                                    <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col items-center text-center leading-none">
                                        <span className="text-xs uppercase tracking-widest text-emerald-600/70 dark:text-emerald-500/70 font-bold mb-1">Neto Pendiente</span>
                                        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">${Math.max(0, balance).toFixed(2)}</span>
                                    </div>
                                </div>
                            );
                        })()}

                        {isLoadingSales ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : sales.length === 0 ? (
                            <div className="text-center text-muted-foreground text-sm py-6 border border-dashed rounded-md bg-muted/20">
                                Aún no hay registros en la nómina.
                            </div>
                        ) : (
                            <div className="rounded-md border bg-card">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Concepto / Artículo</TableHead>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead className="text-right">Tipo</TableHead>
                                            <TableHead className="text-right">Cant.</TableHead>
                                            <TableHead className="text-right">Valor</TableHead>
                                            <TableHead className="text-right font-bold text-emerald-600 dark:text-emerald-400">Impacto Nómina</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sales.map((sale) => {
                                            if (sale.type === 'payment') {
                                                return (
                                                    <TableRow key={sale.id} className="bg-blue-50/50 dark:bg-blue-950/20">
                                                        <TableCell className="font-medium text-sm">
                                                            Pago Recibido
                                                            {sale.note && <div className="text-xs text-muted-foreground">{sale.note}</div>}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-xs">
                                                            {sale.soldAt.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Badge variant="outline" className="border-blue-300 text-blue-600 dark:border-blue-800 dark:text-blue-400">Pago</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right text-muted-foreground">-</TableCell>
                                                        <TableCell className="text-right font-bold text-blue-600 dark:text-blue-400">${(sale.amount || 0).toFixed(2)}</TableCell>
                                                        <TableCell className="text-right text-blue-600 dark:text-blue-400 font-bold">+${(Math.abs(sale.amount || 0)).toFixed(2)}</TableCell>
                                                    </TableRow>
                                                );
                                            }

                                            if (sale.type === 'debt') {
                                                return (
                                                    <TableRow key={sale.id} className="bg-red-50/50 dark:bg-red-950/20">
                                                        <TableCell className="font-medium text-sm">
                                                            Deuda / Deducción
                                                            {sale.note && <div className="text-xs text-muted-foreground">{sale.note}</div>}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-xs">
                                                            {sale.soldAt.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Badge variant="outline" className="border-red-300 text-red-600 dark:border-red-800 dark:text-red-400">Deuda</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right text-muted-foreground">-</TableCell>
                                                        <TableCell className="text-right text-red-500 font-bold">${(sale.value || 0).toFixed(2)}</TableCell>
                                                        <TableCell className="text-right font-bold text-red-500">${(sale.value || 0).toFixed(2)}</TableCell>
                                                    </TableRow>
                                                )
                                            }

                                            if ((sale.type as string) === 'crafting' || (sale.type as string) === 'recovery') return null;

                                            // Regular sale
                                            const qty = sale.qtySold || 0;
                                            const price = sale.value || 0;
                                            const cost = sale.originalCost || 0;
                                            const totalRevenue = qty * price;
                                            const totalCost = qty * cost;
                                            const earnings = (totalRevenue - totalCost) * (profitPercent / 100);

                                            return (
                                                <TableRow key={sale.id}>
                                                    <TableCell className="font-mono text-xs">{sale.itemId}</TableCell>
                                                    <TableCell className="text-muted-foreground text-xs">
                                                        {sale.soldAt.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                    </TableCell>
                                                    <TableCell className="text-right text-muted-foreground text-xs">Venta</TableCell>
                                                    <TableCell className="text-right font-medium">{qty}</TableCell>
                                                    <TableCell className="text-right text-muted-foreground">
                                                        <div className="flex flex-col">
                                                            <span>${price.toFixed(2)}</span>
                                                            {cost > 0 && <span className="text-[10px] text-muted-foreground/60">Costo: ${cost.toFixed(2)}</span>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                        +${earnings.toFixed(2)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <StaffReportsDialog 
                items={items} 
                recipes={recipes} 
                onDesmantelar={handleUncraftSubmit} 
                isSubmitting={!!isCrafting} 
            />

            <StaffCraftingDialog
                items={items}
                recipes={recipes}
                isCrafting={isCrafting}
                onCraft={handleCraftSubmit}
                open={isCraftingDialogOpen}
                onOpenChange={setIsCraftingDialogOpen}
            />

            <StaffSellDialog
                items={items}
                recipes={recipes}
                isSelling={isSelling}
                onConfirmSell={(itemId, qtySold, customPrice) => {
                    const item = items.find(i => i.id === itemId);
                    if (item) executeManualSell(item, parseFloat(qtySold), customPrice ? parseFloat(customPrice) : item.value, undefined);
                }}
            />
        </div>
    );
}
