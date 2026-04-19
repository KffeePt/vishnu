"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAuth } from "@/context/auth-context";
import { useMasterPassword } from "@/hooks/use-master-password";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Plus, Search, Edit2, Check, X, ArrowRightLeft, Trash2, Flame, MoreHorizontal } from 'lucide-react';
import { InventoryItem, InventoryAssignment, Employee } from '@/types/candyland';
import { autoPushStaffInventory } from '@/lib/client-push';
import { getAdminHeaders } from '@/lib/client-auth';
import { db } from '@/config/firebase';
import { collection, onSnapshot, doc, getDocs } from 'firebase/firestore';
import { convertQty, SupportedUnit } from '@/lib/unit-conversion';
import { formatQty } from '@/lib/format-qty';
import { buildStaffPayload, fetchAndDecryptStaffItems } from '@/lib/staff-payload';
import { RefreshCw, Package } from 'lucide-react';
import { DeleteItemDialog } from './delete-item-dialog';
import { getCategoryBadgeClass } from '@/lib/category-styles';
import { getCalculatedCost } from '@/lib/inventory-utils';

export default function InventoryTab({ soldMap = {} }: { soldMap?: Record<string, number> }) {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [recipes, setRecipes] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [shadowAssignments, setShadowAssignments] = useState<Record<string, any[]>>({});

    // Filtering
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);


    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<InventoryItem>>({
        quantity: 0,
        unit: 'pcs',
        unitValue: 0,
        originalCost: 0,
        flexiblePrice: false,
        flexibilityPercent: 0,
        maxPriceCap: 0,
        costOverride: undefined,
        promoPricing: { tiers: [] }
    });
    // Assign Dialog State
    const [assignItem, setAssignItem] = useState<InventoryItem | null>(null);
    const [assignEmployeeId, setAssignEmployeeId] = useState('');
    const [assignQuantity, setAssignQuantity] = useState('');
    const [assignAction, setAssignAction] = useState<'assign' | 'unassign' | 'burn_item'>('assign');
    const [isAssigning, setIsAssigning] = useState(false);

    // Delete State
    const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
    const [isUnassigningAll, setIsUnassigningAll] = useState(false);



    const { getIDToken } = UserAuth();
    const { authSession } = useMasterPassword();
    const { toast } = useToast();

    // Data timestamps to prevent infinite reload loops on mount
    const [lastVolumeUpdate, setLastVolumeUpdate] = useState<string | null>(null);

    useEffect(() => {
        if (!authSession?.masterPassword) return;

        loadData(true);

        // Listen to assignment changes
        const unsubAssignments = onSnapshot(collection(db, 'inventory'), () => {
            loadData(false);
        });

        // Listen to staff-data changes (e.g. name changes, role changes, or key setup)
        const unsubStaff = onSnapshot(collection(db, 'staff-data'), () => {
            loadData(false);
        });

        // Listen to encrypted volume metadata changes
        // This tells us when the master inventory list or assignments have been modified
        const unsubVolume = onSnapshot(doc(db, 'udhhmbtc', 'meta-data'), (snapshot) => {
            if (snapshot.exists()) {
                const updated = snapshot.data().updatedAt;
                const updatedStr = updated?.toDate ? updated.toDate().toISOString() : String(updated);

                // Only trigger reload if the timestamp actually changed
                setLastVolumeUpdate(prev => {
                    if (prev !== null && prev !== updatedStr) {
                        // Only reload if we already had a timestamp AND it differs
                        setTimeout(() => loadData(false), 500); // small buffer for batch commits
                    }
                    return updatedStr;
                });
            }
        });

        return () => {
            unsubAssignments();
            unsubStaff();
            unsubVolume();
        };
    }, [authSession?.masterPassword]);

    // Listen for custom event to refresh inventory when items are added globally
    useEffect(() => {
        const handleRefresh = () => loadData(false);
        window.addEventListener('inventory-updated', handleRefresh);
        return () => window.removeEventListener('inventory-updated', handleRefresh);
    }, [authSession?.masterPassword]);

    const loadData = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const token = await getIDToken();
            if (!token) return;

            const [itemsRes, empRes, recipesRes] = await Promise.all([
                fetch('/api/admin/inventory', { headers: getAdminHeaders(token) }),
                fetch('/api/admin/staff', { headers: getAdminHeaders(token) }),
                fetch('/api/admin/recipes', { headers: getAdminHeaders(token) })
            ]);

            if (itemsRes.ok) setItems(await itemsRes.json());
            const emps: Employee[] = empRes.ok ? await empRes.json() : [];
            if (empRes.ok) setEmployees(emps);
            if (recipesRes.ok) {
                const rData = await recipesRes.json();
                if (Array.isArray(rData)) setRecipes(rData);
            }

            // Fetch shadow assignments (crafted items) from employees collection
            if (emps.length > 0) {
                const shadowMap: Record<string, any[]> = {};
                await Promise.all(emps.map(async (emp) => {
                    try {
                        const snap = await getDocs(collection(db, 'employees', emp.id, 'assignments'));
                        snap.forEach(doc => {
                            const data = doc.data();
                            if (data.quantity > 0) {
                                const itemId = doc.id;
                                if (!shadowMap[itemId]) shadowMap[itemId] = [];
                                shadowMap[itemId].push({
                                    employeeId: emp.id,
                                    employeeName: emp.name,
                                    quantity: data.quantity,
                                    unit: data.unit,
                                    category: data.category
                                });
                            }
                        });
                    } catch (e) {
                        console.error(`Failed to fetch shadow assignments for ${emp.name}`, e);
                    }
                }));
                setShadowAssignments(shadowMap);
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to load inventory data", variant: "destructive" });
        } finally {
            if (showLoading) setIsLoading(false);
        }
    };





    const startEdit = (item: InventoryItem) => {
        setEditingId(item.id);
        setEditForm({
            quantity: item.quantity,
            unit: item.unit as SupportedUnit,
            unitValue: item.unitValue,
            originalCost: item.originalCost,
            flexiblePrice: item.flexiblePrice,
            flexibilityPercent: item.flexibilityPercent,
            maxPriceCap: item.maxPriceCap,
            costOverride: item.costOverride,
            promoPricing: item.promoPricing || { tiers: [] }
        });
    };

    const saveEdit = async (item: InventoryItem) => {
        try {
            const token = await getIDToken();

            const toUnit = editForm.unit as SupportedUnit;

            // Quantity is now correctly scaled immediately when the unit dropdown changes in the UI.
            // No need to scale again here to prevent double-conversion bugs.

            const response = await fetch(`/api/admin/inventory/${item.id}`, {
                method: 'PUT',
                headers: getAdminHeaders(token),
                body: JSON.stringify({
                    quantity: editForm.quantity,
                    unit: toUnit,
                    unitValue: editForm.unitValue,
                    originalCost: editForm.originalCost,
                    flexiblePrice: editForm.flexiblePrice,
                    flexibilityPercent: editForm.flexibilityPercent,
                    maxPriceCap: editForm.maxPriceCap,
                    costOverride: editForm.costOverride,
                    promoPricing: editForm.promoPricing
                })
            });
            if (!response.ok) throw new Error('Failed to update');
            setEditingId(null);
            loadData();
            
            // Re-fetch all inventory to apply to assignments
            const tokenFresh = await getIDToken();
            if (tokenFresh) {
               // Need to wait slightly for firestore write or it could fetch stale data locally
               setTimeout(async () => {
                   window.dispatchEvent(new CustomEvent('inventory-updated'));
                   // Identify staff with this item assigned
                   const affectedStaff = new Set<string>();
                   if (item.assignments) {
                       item.assignments.forEach(a => {
                           if (a.employeeId) affectedStaff.add(a.employeeId);
                       });
                   }
                   if (affectedStaff.size > 0) {
                      const ids = Array.from(affectedStaff);
                      console.log('[inventory-tab] Auto-pushing to staff devices for edited item:', ids);
                      await handlePushToAffectedStaff(ids);
                   }
               }, 500);
            }
            
            toast({ title: "Updated", description: "Inventory item updated" });
        } catch {
            toast({ title: "Error", description: "Update failed", variant: "destructive" });
        }
    };

    const openAssignDialog = (item: InventoryItem) => {
        setAssignItem(item);
        setAssignEmployeeId('');
        setAssignQuantity('');

        // Smart default: if no capacity, default to unassign
        const assigned = getAssignedQty(item);
        const available = item.quantity - assigned;
        if (available <= 0 && assigned > 0) {
            setAssignAction('unassign');
        } else {
            setAssignAction('assign');
        }
    };

    const handleAssign = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignItem) return;
        try {
            setIsAssigning(true);
            const token = await getIDToken();
            const response = await fetch(`/api/admin/inventory/${assignItem.id}`, {
                method: 'PUT',
                headers: getAdminHeaders(token),
                body: JSON.stringify({
                    action: assignAction,
                    employeeId: assignEmployeeId,
                    quantity: parseFloat(assignQuantity),
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Assignment failed');
            setAssignItem(null);
            loadData();

            // Fetch target employee's selling rules to apply overrides
            let staffRules: Record<string, { unitValue: number }> = {};
            try {
                const rulesRes = await fetch(`/api/admin/staff/${assignEmployeeId}/selling-rules`, {
                    headers: getAdminHeaders(token)
                });
                if (rulesRes.ok) {
                    const rData = await rulesRes.json();
                    staffRules = rData.rules || {};
                }
            } catch (e) {
                console.error("Failed to fetch staff rules for push payload", e);
            }

            if (!token) return;
            // Fetch existing items to preserve crafted inventory
            const existingItems = await fetchAndDecryptStaffItems(assignEmployeeId, token, authSession?.masterPassword);

            // Fire and forget auto-push
            const updatedItems = await fetch('/api/admin/inventory', { headers: getAdminHeaders(token) }).then(r => r.json());
            const myPayload = buildStaffPayload(assignEmployeeId, updatedItems, staffRules, recipes, soldMap, `Assigned by admin`, existingItems);
            
            if (token) {
                autoPushStaffInventory(assignEmployeeId, token, myPayload);
            }

        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsAssigning(false);
        }
    };

    const handleUnassignAll = async (item: InventoryItem) => {
        if ((item.assignments ?? []).length === 0) return;
        setIsUnassigningAll(true);
        try {
            const token = await getIDToken();
            await Promise.all(
                (item.assignments ?? []).map(a =>
                    fetch(`/api/admin/inventory/${item.id}`, {
                        method: 'PUT',
                        headers: getAdminHeaders(token),
                        body: JSON.stringify({ action: 'unassign', employeeId: a.employeeId, quantity: a.quantity }),
                    })
                )
            );
            toast({ title: 'Unassigned All', description: `All assignments removed from ${item.name}` });
            loadData();

            const updatedItems = await fetch('/api/admin/inventory', { headers: getAdminHeaders(token) }).then(r => r.json());

            // Fire auto push for every affected employee
            for (const a of (item.assignments ?? [])) {

                // Fetch target employee's selling rules to apply overrides
                let staffRules: Record<string, { unitValue: number }> = {};
                try {
                    const rulesRes = await fetch(`/api/admin/staff/${a.employeeId}/selling-rules`, {
                        headers: getAdminHeaders(token)
                    });
                    if (rulesRes.ok) {
                        const rData = await rulesRes.json();
                        staffRules = rData.rules || {};
                    }
                } catch (e) {
                    console.error("Failed to fetch staff rules for push payload", e);
                }

                if (!token) continue;
                // Fetch existing items to preserve crafted inventory
                const existingItems = await fetchAndDecryptStaffItems(a.employeeId, token, authSession?.masterPassword);

                const myPayload = buildStaffPayload(a.employeeId, updatedItems, staffRules, recipes, soldMap, `Updated by admin`, existingItems);
                
                if (token) {
                    autoPushStaffInventory(a.employeeId, token, myPayload);
                }
            }

        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsUnassigningAll(false);
        }
    };

    const handlePushToAffectedStaff = async (affectedEmployeeIds: string[]) => {
        if (!affectedEmployeeIds.length) return;
        try {
            const token = await getIDToken();
            if (!token) return;

            const updatedItems = await fetch('/api/admin/inventory', { headers: getAdminHeaders(token) }).then(r => r.json());

            for (const empId of affectedEmployeeIds) {
                // Fetch target employee's selling rules to apply overrides
                let staffRules: Record<string, { unitValue: number }> = {};
                try {
                    const rulesRes = await fetch(`/api/admin/staff/${empId}/selling-rules`, {
                        headers: getAdminHeaders(token)
                    });
                    if (rulesRes.ok) {
                        const rData = await rulesRes.json();
                        staffRules = rData.rules || {};
                    }
                } catch (e) {
                    console.error("Failed to fetch staff rules for push payload", e);
                }

                // Fetch existing items to preserve crafted inventory
                const existingItems = await fetchAndDecryptStaffItems(empId, token, authSession?.masterPassword);

                const myPayload = buildStaffPayload(empId, updatedItems, staffRules, recipes, soldMap, `Updated by admin action`, existingItems);
                
                autoPushStaffInventory(empId, token, myPayload);
            }
        } catch (error) {
            console.error("Error pushing to affected staff:", error);
        }
    };


    const getShadowQty = (item: InventoryItem) => {
        // Returns the additional items crafted by staff (excess of what was admin-assigned)
        return (shadowAssignments[item.id] ?? []).reduce((sum, sa) => {
            const masterA = (item.assignments ?? []).find(ma => ma.employeeId === sa.employeeId);
            const masterQty = masterA ? masterA.quantity : 0;
            return sum + Math.max(0, sa.quantity - masterQty);
        }, 0);
    };

    const getAssignedQty = (item: InventoryItem) => {
        // Returns total items currently assigned/held by staff (master + crafted)
        const empIds = new Set([
            ...(item.assignments ?? []).map(a => a.employeeId),
            ...(shadowAssignments[item.id] ?? []).map(sa => sa.employeeId)
        ]);
        
        let total = 0;
        empIds.forEach(eid => {
            const masterA = (item.assignments ?? []).find(a => a.employeeId === eid);
            const shadowA = (shadowAssignments[item.id] ?? []).find(sa => sa.employeeId === eid);
            
            const mQty = masterA ? masterA.quantity : 0;
            const sQty = shadowA ? shadowA.quantity : 0;
            
            // If shadow exists, it's the ground truth for what's on the device (synced).
            // If not found in shadow, it might not be synced yet, so use master.
            total += shadowA ? sQty : mQty;
        });
        return total;
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    // Employees that already have an assignment for the selected item
    const assignedEmployeeIds = new Set((assignItem?.assignments ?? []).map(a => a.employeeId));

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex gap-4 items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search items..." className="pl-8" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {[...new Set(items.map(i => i.category))].sort().map(cat => (
                            <SelectItem key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Item Name</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Unit Value</TableHead>
                                <TableHead>Cost</TableHead>
                                <TableHead>Total Qty</TableHead>
                                <TableHead>Available</TableHead>
                                <TableHead>Status / Assignments</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-10">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredItems.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No items found.</TableCell>
                                </TableRow>
                            ) : (
                                filteredItems.map((item) => {
                                    const shadowQty = getShadowQty(item);
                                    const totalQty = item.quantity + shadowQty;
                                    const assignedQty = getAssignedQty(item);
                                    const availableQty = totalQty - assignedQty;
                                    const isEditing = editingId === item.id;
                                    return (
                                        <React.Fragment key={item.id}>
                                            <TableRow
                                                className={item.craftable ? "cursor-pointer hover:bg-muted/50" : ""}
                                                onClick={() => { if (item.craftable) setExpandedRecipeId(expandedRecipeId === item.id ? null : item.id); }}
                                            >
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        {item.name}
                                                        {item.craftable && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">🔨 Craftable</Badge>}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={`capitalize ${getCategoryBadgeClass(item.category, item.craftable)}`}>{item.category}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing ? (
                                                        <div className="flex flex-col gap-2 relative">
                                                            <Input type="number" className="w-24 h-8" value={editForm.unitValue} onChange={e => setEditForm({ ...editForm, unitValue: parseFloat(e.target.value) })} />
                                                            <div className="flex flex-col gap-2 mt-1 z-50 bg-background/95 p-2 rounded-md border shadow-sm top-10 absolute left-0 w-[180px]">
                                                                <div className="flex items-center gap-2">
                                                                    <Label className="text-xs whitespace-nowrap">Flexible</Label>
                                                                    <Switch className="scale-75 origin-left" checked={editForm.flexiblePrice || false} onCheckedChange={c => setEditForm({ ...editForm, flexiblePrice: c as boolean })} />
                                                                    {editForm.flexiblePrice && (
                                                                        <div className="flex items-center gap-1">
                                                                            <Input type="number" min="0" max="100" className="w-16 h-6 text-xs" value={editForm.flexibilityPercent || ''} onChange={e => setEditForm({ ...editForm, flexibilityPercent: parseFloat(e.target.value) || 0 })} placeholder="%" />
                                                                            <span className="text-xs text-muted-foreground">%</span>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="border-t pt-2 mt-1">
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Promo Tiers</Label>
                                                                        <Button 
                                                                            type="button" 
                                                                            variant="ghost" 
                                                                            size="icon" 
                                                                            className="h-5 w-5 hover:bg-primary/10 hover:text-primary"
                                                                            onClick={() => {
                                                                                const tiers = [...(editForm.promoPricing?.tiers || [])];
                                                                                tiers.push({ qty: 1, price: editForm.unitValue || 0 });
                                                                                setEditForm({ ...editForm, promoPricing: { tiers } });
                                                                            }}
                                                                        >
                                                                            <Plus className="h-3 w-3" />
                                                                        </Button>
                                                                    </div>
                                                                    <div className="space-y-1 max-h-[100px] overflow-y-auto pr-1 custom-scrollbar">
                                                                        {(editForm.promoPricing?.tiers || []).map((tier, idx) => (
                                                                            <div key={idx} className="flex items-center gap-1 animate-in fade-in slide-in-from-right-1">
                                                                                <Input 
                                                                                    type="number" 
                                                                                    className="h-6 text-[10px] px-1 w-12" 
                                                                                    value={tier.qty} 
                                                                                    onChange={e => {
                                                                                        const tiers = [...(editForm.promoPricing?.tiers || [])];
                                                                                        tiers[idx].qty = parseFloat(e.target.value) || 0;
                                                                                        setEditForm({ ...editForm, promoPricing: { tiers } });
                                                                                    }}
                                                                                    placeholder="Qty"
                                                                                />
                                                                                <span className="text-[10px] text-muted-foreground">×</span>
                                                                                <Input 
                                                                                    type="number" 
                                                                                    className="h-6 text-[10px] px-1 flex-1" 
                                                                                    value={tier.price} 
                                                                                    onChange={e => {
                                                                                        const tiers = [...(editForm.promoPricing?.tiers || [])];
                                                                                        tiers[idx].price = parseFloat(e.target.value) || 0;
                                                                                        setEditForm({ ...editForm, promoPricing: { tiers } });
                                                                                    }}
                                                                                    placeholder="Price"
                                                                                />
                                                                                <Button 
                                                                                    type="button" 
                                                                                    variant="ghost" 
                                                                                    size="icon" 
                                                                                    className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                                                                    onClick={() => {
                                                                                        const tiers = (editForm.promoPricing?.tiers || []).filter((_, i) => i !== idx);
                                                                                        setEditForm({ ...editForm, promoPricing: { tiers } });
                                                                                    }}
                                                                                >
                                                                                    <Trash2 className="h-3 w-3" />
                                                                                </Button>
                                                                            </div>
                                                                        ))}
                                                                        {(editForm.promoPricing?.tiers || []).length === 0 && (
                                                                            <div className="text-[9px] text-center text-muted-foreground italic py-1">No promo tiers defined</div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-1.5">
                                                                <span>${item.unitValue.toFixed(2)}</span>
                                                                {item.promoPricing?.tiers && item.promoPricing.tiers.length > 0 && (
                                                                    <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-blue-100 text-blue-700 border-blue-200">
                                                                        {item.promoPricing.tiers.length} promo
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {item.flexiblePrice && (
                                                                <div className="flex flex-col text-[10px] text-muted-foreground leading-tight mt-1">
                                                                    <span>Up to -{item.flexibilityPercent || 0}% discount</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing ? (
                                                        item.craftable ? (
                                                            <Input type="number" className="w-24 h-8" value={editForm.costOverride ?? ''} onChange={e => setEditForm({ ...editForm, costOverride: parseFloat(e.target.value) || undefined })} placeholder="Auto" />
                                                        ) : (
                                                            <Input type="number" className="w-24 h-8" value={editForm.originalCost ?? 0} onChange={e => setEditForm({ ...editForm, originalCost: parseFloat(e.target.value) })} />
                                                        )
                                                    ) : (
                                                        <div className="flex flex-col">
                                                            <span>${getCalculatedCost(item, items, recipes).toFixed(2)}</span>
                                                            {item.craftable && (
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {item.costOverride ? '(override)' : '(auto)'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing ? (
                                                        <div className="flex gap-1 items-center">
                                                            <Input type="number" min="0" step={editForm.unit === 'pcs' ? "1" : "0.1"} className="w-20 h-8" value={editForm.quantity} onChange={e => {
                                                                const val = e.target.value;
                                                                if (editForm.unit === 'pcs' && val.includes('.')) return;
                                                                setEditForm({ ...editForm, quantity: parseFloat(val) });
                                                            }} />
                                                            <Select value={editForm.unit} onValueChange={(val) => {
                                                                const newUnit = val as SupportedUnit;
                                                                const oldUnit = editForm.unit as SupportedUnit;
                                                                let newQty = editForm.quantity;
                                                                
                                                                // Immediately auto-convert quantity when unit changes in edit form
                                                                if (newQty !== undefined && oldUnit && newUnit && oldUnit !== newUnit) {
                                                                    newQty = convertQty(newQty, oldUnit, newUnit);
                                                                }
                                                                
                                                                setEditForm(prev => ({ ...prev, unit: newUnit, quantity: newQty }));
                                                            }}>
                                                                <SelectTrigger className="w-16 h-8 text-xs px-2"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="pcs">pcs</SelectItem>
                                                                    <SelectItem value="mg">mg</SelectItem>
                                                                    <SelectItem value="grams">g</SelectItem>
                                                                    <SelectItem value="kg">kg</SelectItem>
                                                                    <SelectItem value="oz">oz</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col">
                                                            <span>{formatQty(totalQty)} {item.unit}</span>
                                                            {shadowQty > 0 && (
                                                                <span className="text-[10px] text-blue-600 font-medium">
                                                                    (+{formatQty(shadowQty)} crafted)
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={availableQty === 0 ? 'text-muted-foreground italic text-sm' : ''}>
                                                        {formatQty(availableQty)} {item.unit}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    {(item.assignments ?? []).length === 0 && (shadowAssignments[item.id] ?? []).length === 0 ? (
                                                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 hover:bg-slate-200">Unassigned</Badge>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                {availableQty <= 0 ? (
                                                                    // Check if all assignments (master + shadow) are fully sold
                                                                    [...new Set([
                                                                        ...(item.assignments ?? []).map(a => a.employeeId),
                                                                        ...(shadowAssignments[item.id] ?? []).map(sa => sa.employeeId)
                                                                    ])].every(eid => {
                                                                        const masterA = (item.assignments ?? []).find(ma => ma.employeeId === eid);
                                                                        const shadowA = (shadowAssignments[item.id] ?? []).find(sa => sa.employeeId === eid);
                                                                        
                                                                        const currentQty = shadowA ? shadowA.quantity : (masterA ? masterA.quantity : 0);
                                                                        const soldKey = `${eid}_${item.id}`;
                                                                        const soldQty = soldMap[soldKey] || 0;
                                                                        
                                                                        return soldQty >= currentQty && currentQty >= 0;
                                                                    }) ? (
                                                                        <Badge className="!bg-amber-500 !text-amber-950 hover:!bg-amber-600 border-amber-600">Fully Sold</Badge>
                                                                    ) : (
                                                                        <Badge className="!bg-green-600 hover:!bg-green-700 !text-white">Fully Assigned</Badge>
                                                                    )
                                                                ) : (
                                                                    <Badge className="!bg-amber-500 hover:!bg-amber-600 !text-white">Partially Assigned</Badge>
                                                                )}
                                                            </div>
                                                            <div className="text-sm space-y-0.5 mt-1">
                                                                {(item.assignments ?? []).map(a => (
                                                                    <div key={a.employeeId} className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                                                                        <span>{a.employeeName}</span>
                                                                        <span className="font-medium">{formatQty(a.quantity)} {item.unit}</span>
                                                                    </div>
                                                                ))}
                                                                {(shadowAssignments[item.id] ?? [])
                                                                    .filter(sa => !(item.assignments ?? []).some(ma => ma.employeeId === sa.employeeId))
                                                                    .map(sa => (
                                                                        <div key={sa.employeeId} className="flex items-center justify-between text-xs text-muted-foreground bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">
                                                                            <span className="flex items-center gap-1">
                                                                                <span title="Crafted by staff">🔨</span> {sa.employeeName}
                                                                            </span>
                                                                            <span className="font-medium">{formatQty(sa.quantity)} {item.unit}</span>
                                                                        </div>
                                                                    ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {isEditing ? (
                                                        <div className="flex justify-end gap-1">
                                                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                                                            <Button size="sm" onClick={() => saveEdit(item)}><Check className="h-4 w-4" /></Button>
                                                        </div>
                                                    ) : (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                                    <span className="sr-only">Open menu</span>
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                <DropdownMenuItem onClick={() => startEdit(item)}>
                                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                                    Edit qty/value
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => openAssignDialog(item)}>
                                                                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                                                                    Assign to staff
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => setDeleteTarget(item)}>
                                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                                    Delete / Burn
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                            {item.craftable && expandedRecipeId === item.id && (
                                                <TableRow className="bg-muted/10">
                                                    <TableCell colSpan={8} className="p-0 border-b">
                                                        <div className="p-4 pl-8 border-l-4 border-l-primary/50">
                                                            {(() => {
                                                                const recipe = recipes.find(r => r.outputItemId === item.id);
                                                                if (!recipe) return <div className="text-sm text-muted-foreground">No recipe defined yet. Select this item in the Add Item Dialog &apos;Recipes&apos; tab to create one.</div>;
                                                                return (
                                                                    <div className="text-sm flex flex-col gap-2">
                                                                        <div className="font-medium">Recipe Description</div>
                                                                        <div className="flex items-center gap-2 text-muted-foreground bg-background rounded-md border p-2 w-max">
                                                                            Produces: <strong className="text-foreground">{recipe.outputQuantity} {item.unit}</strong>
                                                                        </div>
                                                                        <div className="font-medium mt-1">Ingredients Required:</div>
                                                                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground bg-background rounded-md p-3 border w-max">
                                                                            {recipe.ingredients.map((ing: any, i: number) => {
                                                                                const ingItem = items.find(it => it.id === ing.itemId);
                                                                                return <li key={i}><span className="text-foreground font-medium">{ing.quantity}</span> × {ingItem?.name || 'Unknown Item'}</li>;
                                                                            })}
                                                                        </ul>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card >

            {/* Assign Dialog */}
            < Dialog open={!!assignItem
            } onOpenChange={open => { if (!open) setAssignItem(null); }}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Assign Inventory</DialogTitle>
                        <DialogDescription>
                            {assignItem && (
                                <>
                                    <span className="font-medium">{assignItem.name}</span>
                                    {' — '}
                                    <span>
                                        {assignItem.quantity - getAssignedQty(assignItem)} {assignItem.unit} available
                                    </span>
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    {assignItem && (
                        <form onSubmit={handleAssign} className="space-y-4">
                            <div className="grid gap-2">
                                <Label>Action</Label>
                                <Select value={assignAction} onValueChange={(v: any) => setAssignAction(v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="assign">Assign to employee</SelectItem>
                                        <SelectItem value="unassign">Unassign from employee</SelectItem>
                                        <SelectItem value="burn_item">Burn unassigned stock</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {assignAction !== 'burn_item' && (
                                <div className="grid gap-2">
                                    <Label>Employee</Label>
                                    <Select value={assignEmployeeId} onValueChange={setAssignEmployeeId} required>
                                        <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                                        <SelectContent>
                                            {assignAction === 'unassign'
                                                ? (assignItem.assignments ?? []).map(a => (
                                                    <SelectItem key={a.employeeId} value={a.employeeId}>
                                                        {a.employeeName} (has {a.quantity} {assignItem.unit})
                                                    </SelectItem>
                                                ))
                                                : employees.map(emp => (
                                                    <SelectItem key={emp.id} value={emp.id}>
                                                        {emp.name}
                                                        {assignedEmployeeIds.has(emp.id) && ' (already assigned)'}
                                                    </SelectItem>
                                                ))
                                            }
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            <div className="grid gap-2">
                                <Label>
                                    Quantity ({assignItem.unit})
                                    {assignAction === 'assign' && (
                                        <span className="text-muted-foreground font-normal ml-1">
                                            max {assignItem.quantity - getAssignedQty(assignItem)}
                                        </span>
                                    )}
                                </Label>
                                <Input
                                    type="number"
                                    step={assignItem.unit === 'pcs' ? "1" : "0.1"}
                                    min={assignItem.unit === 'pcs' ? "1" : "0.1"}
                                    max={assignAction === 'assign' || assignAction === 'burn_item'
                                        ? assignItem.quantity - getAssignedQty(assignItem)
                                        : (assignItem.assignments ?? []).find(a => a.employeeId === assignEmployeeId)?.quantity
                                    }
                                    value={assignQuantity}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (assignItem.unit === 'pcs' && val.includes('.')) return;
                                        setAssignQuantity(val);
                                    }}
                                    required
                                />
                            </div>
                            <DialogFooter className="flex-col gap-2 sm:flex-row">
                                {/* Unassign All — only show if there are assignments */}
                                {(assignItem.assignments ?? []).length > 0 && (
                                    <Button
                                        variant="outline"
                                        type="button"
                                        className="text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                                        disabled={isUnassigningAll}
                                        onClick={() => handleUnassignAll(assignItem)}
                                    >
                                        {isUnassigningAll && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Unassign All
                                    </Button>
                                )}
                                <Button variant="outline" type="button" onClick={() => setAssignItem(null)}>Cancel</Button>
                                <Button
                                    type="submit"
                                    variant={assignAction === 'burn_item' ? 'destructive' : 'default'}
                                    disabled={isAssigning || (assignAction !== 'burn_item' && !assignEmployeeId) || !assignQuantity}
                                >
                                    {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {assignAction === 'assign' ? 'Assign' : assignAction === 'unassign' ? 'Unassign' : 'Burn Stock'}
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog >

            <DeleteItemDialog
                item={deleteTarget as any}
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                onDeleted={() => {
                    setDeleteTarget(null);
                    loadData();
                }}
                onPushRequired={handlePushToAffectedStaff}
                sessionToken={authSession?.token}
            />

        </div>
    );
}
