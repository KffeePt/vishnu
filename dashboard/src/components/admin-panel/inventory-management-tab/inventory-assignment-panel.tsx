"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    DndContext,
    useSensor,
    useSensors,
    PointerSensor,
    TouchSensor,
    KeyboardSensor,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    useDraggable,
    useDroppable,
    closestCenter
} from '@dnd-kit/core';
import { UserAuth } from "@/context/auth-context";
import { useMasterPassword } from "@/hooks/use-master-password";
import { getAdminHeaders } from '@/lib/client-auth';
import { autoPushStaffInventory } from '@/lib/client-push';
import { db } from '@/config/firebase';
import { collection, onSnapshot, doc, deleteDoc, getDocs, getDoc, updateDoc } from 'firebase/firestore';
import { formatQty } from '@/lib/format-qty';
import { envelopeDecrypt, unwrapPrivateKey } from '@/lib/crypto-client';
import { buildStaffPayload, fetchAndDecryptStaffItems } from '@/lib/staff-payload';
import { InventoryItem, Employee } from '@/types/candyland';
import { getCategoryCardClass, getCategoryBadgeClass } from '@/lib/category-styles';
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Package, Search, ArrowRightLeft, ArrowUpLeft, FileSpreadsheet, GripVertical, ChevronDown, ChevronUp, Trash2, Edit2, HandCoins, ArrowDownToDot, Flame } from 'lucide-react';
import { haptics } from '@/lib/haptics';
import { DeleteItemDialog } from './delete-item-dialog';
import InventoryTab from './inventory-tab';
import RefundsPanel from './refunds-panel';
import { getCalculatedCost } from '@/lib/inventory-utils';

const shakeAnimation = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
`;


// Draggable Item Component
function DraggableItem({ item, items, recipes, onEdit, onBurn, onDelete }: { 
    item: InventoryItem, 
    items: InventoryItem[], 
    recipes: any[],
    onEdit?: (item: InventoryItem) => void, 
    onBurn?: (item: InventoryItem) => void, 
    onDelete?: (item: InventoryItem) => void 
}) {
    const assignedQty = (item.assignments ?? []).reduce((sum, a) => sum + a.quantity, 0);
    const availableQty = formatQty(item.quantity - assignedQty);

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `item-${item.id}`,
        data: { item }
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : undefined,
    } : undefined;

    if (availableQty <= 0) return null;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex flex-col gap-2 p-3 rounded-xl border relative overflow-hidden transition-all shadow-sm ${getCategoryCardClass(item.category, item.craftable)} ${isDragging ? 'opacity-50 ring-2 ring-primary scale-105 z-50' : ''}`}
        >
            <div className="absolute top-0 right-0 p-1 opacity-[0.03] rotate-12 scale-150 pointer-events-none">
                <Package className="h-16 w-16" />
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-1">
                <div {...listeners} {...attributes} className="cursor-grab hover:text-primary active:cursor-grabbing text-muted-foreground p-1 touch-none -ml-1 active:animate-pulse">
                    <GripVertical className="h-4 w-4" />
                    <span className="text-[8px] uppercase tracking-widest hidden touch-device:block text-muted-foreground/60 text-center mt-0.5">Hold</span>
                </div>
                <div className="flex items-center gap-1">
                    {onDelete && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                            className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer relative z-20"
                            title="Delete Item Type Completely"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {onEdit && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                            className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors cursor-pointer relative z-20"
                            title="Edit Item"
                        >
                            <Edit2 className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {onBurn && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onBurn(item); }}
                            className="p-1 rounded-md hover:bg-orange-500/10 text-muted-foreground hover:text-orange-600 transition-colors cursor-pointer relative z-20 mr-1"
                            title="Burn Stock (Reduce Master)"
                        >
                            <Flame className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <Badge variant="outline" className={`text-[10px] px-1.5 uppercase font-bold tracking-wider ${getCategoryBadgeClass(item.category, item.craftable)}`}>{item.category}</Badge>
                </div>
            </div>

            <div className="flex-1 min-w-0 pointer-events-none relative z-10">
                <p className="font-semibold text-sm truncate" title={item.name}>{item.name}</p>
                    <div className="flex justify-between items-end mt-2">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Avail</span>
                            <span className="text-2xl font-black text-primary leading-none tracking-tighter">{formatQty(availableQty)}</span>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Unit Cost</span>
                            <span className="text-sm font-bold text-muted-foreground leading-none">${getCalculatedCost(item, items, recipes).toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Unit</span>
                            <span className="text-sm font-bold text-muted-foreground leading-none">{item.unit}</span>
                        </div>
                    </div>
            </div>
        </div>
    );
}

// Droppable Employee Component
function DroppableEmployee({
    employee,
    items,
    onUnassign,
    onSync,
    soldMap,
    craftingMap = {},
    recoveredMap = {}
}: {
    employee: Employee,
    items: InventoryItem[],
    onUnassign: (itemId: string, employeeId: string, quantity: number, action: 'unassign' | 'delete_assignment' | 'undo_sale_unassign', soldQuantity?: number) => void,
    onSync: (employeeId: string) => Promise<any>,
    soldMap: Record<string, number>,
    craftingMap?: Record<string, number>,
    recoveredMap?: Record<string, number>
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [unassigningId, setUnassigningId] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [unassignItemContext, setUnassignItemContext] = useState<any | null>(null);
    const [unassignQty, setUnassignQty] = useState('');
    const [orphanedItems, setOrphanedItems] = useState<any[]>([]);

    const { isOver, setNodeRef } = useDroppable({
        id: `emp-${employee.id}`,
        data: { employee }
    });

    useEffect(() => {
        if (!isExpanded) return;
        
        const loadOrphans = async () => {
            try {
                const assignsRef = collection(db, 'employees', employee.id, 'assignments');
                const snap = await getDocs(assignsRef);
                const orphans: any[] = [];
                
                snap.forEach(doc => {
                    const data = doc.data();
                    const itemId = doc.id;
                    
                    // If it exists in master items AND the employee has a master assignment, it's already shown
                    const masterItem = items.find(i => i.id === itemId);
                    const hasMasterAssignment = masterItem?.assignments?.some(a => a.employeeId === employee.id);
                    if (masterItem && hasMasterAssignment) return;
                    
                    if (data.quantity > 0) {
                        orphans.push({
                            id: itemId,
                            name: data.itemName || (masterItem?.name) || 'Objeto Borrado',
                            category: data.category || (masterItem?.category) || 'unknown',
                            assignedQty: data.quantity,
                            unit: data.unit || (masterItem?.unit) || 'pcs',
                            sold: soldMap[`${employee.id}_${itemId}`] || data.sold || 0,
                            isOrphan: !masterItem
                        });
                    }
                });
                
                setOrphanedItems(orphans);
            } catch (e) {
                console.error("Failed to load orphaned assignments", e);
            }
        };
        
        loadOrphans();
    }, [employee.id, isExpanded, items, soldMap]);

    // Find all item assignments for this employee
    const assignedItems = items.map(itm => {
        const assignment = itm.assignments?.find(a => a.employeeId === employee.id);
        if (!assignment || assignment.quantity <= 0) return null;

        const soldKey = `${employee.id}_${itm.id}`;
        const soldQty = soldMap[soldKey] || assignment.sold || 0;
        const craftedQty = craftingMap[soldKey] || 0;
        const recQty = recoveredMap[soldKey] || 0;

        return {
            id: itm.id,
            name: itm.name,
            category: itm.category || 'unknown',
            assignedQty: assignment.quantity,
            unit: itm.unit || 'pcs',
            sold: soldQty,
            crafted: craftedQty,
            recovered: recQty,
            netDeduction: formatQty(soldQty + craftedQty - recQty),
            isCraftable: itm.craftable || (itm.category as string) === 'crafting',
            isOrphan: false
        };
    }).filter(Boolean) as any[];

    const mappedOrphans = orphanedItems.map(item => {
        const soldKey = `${employee.id}_${item.id}`;
        const soldQty = soldMap[soldKey] || item.sold || 0;
        const craftedQty = craftingMap[soldKey] || 0;
        const recQty = recoveredMap[soldKey] || 0;

        return {
            ...item,
            assignedQty: item.assignedQty, // Corrected from item.qty
            sold: soldQty,
            crafted: craftedQty,
            recovered: recQty,
            netDeduction: formatQty(soldQty + craftedQty - recQty),
            isCraftable: item.isOrphan ? false : (item.craftable || (item.category as string) === 'crafting')
        };
    });

    const allAssignedItems = [...assignedItems, ...mappedOrphans];

    const assignmentCount = allAssignedItems.length;
    const soldCount = allAssignedItems.filter(i => i.netDeduction >= i.assignedQty).length;
    const activeCount = assignmentCount - soldCount;

    const handleUnassign = async (e: React.MouseEvent, item: any, action: 'unassign' | 'delete_assignment' | 'undo_sale_unassign' = 'unassign') => {
        e.stopPropagation();
        setUnassigningId(item.id + action); // Use action in ID to show specific loader
        try {
            await onUnassign(item.id, employee.id, item.assignedQty, action, item.sold);
        } finally {
            setUnassigningId(null);
        }
    };

    return (
        <div
            ref={setNodeRef}
            className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${isOver ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-transparent bg-muted/40 hover:bg-muted/60'}`}
            style={{ animation: isOver ? 'shake 0.3s infinite' : 'none' }}
            onClick={() => setIsExpanded(!isExpanded)}
        >
            <div className="flex justify-between items-center pointer-events-none">
                <div>
                    <h4 className="font-medium">{employee.name}</h4>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{employee.role}</p>
                </div>
                <div className="flex items-center gap-3 pointer-events-auto">
                    {assignmentCount > 0 && (
                        <div className="flex items-center gap-2">
                            {activeCount > 0 && (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 shadow-sm border-emerald-200 dark:border-emerald-800">
                                    {activeCount} active
                                </Badge>
                            )}
                            {soldCount > 0 && (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 shadow-sm border-amber-200 dark:border-amber-800">
                                    {soldCount} sold
                                </Badge>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[10px] bg-background shadow-xs hover:bg-primary/10 hover:text-primary transition-colors border-primary/20"
                                disabled={isSyncing}
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    setIsSyncing(true);
                                    await onSync(employee.id);
                                    setIsSyncing(false);
                                }}
                            >
                                {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowRightLeft className="h-3 w-3 mr-1" />}
                                Sync Device
                            </Button>
                        </div>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="p-1 hover:bg-muted rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20">
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                </div>
            </div>

            {/* Expandable Grid View */}
            {isExpanded && (
                <div className="mt-4 pt-4 border-t border-border/50 cursor-default" onClick={(e) => e.stopPropagation()}>
                    {assignmentCount === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">No inventory assigned.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {allAssignedItems.map(item => (
                                <div key={item.id} className={`rounded-lg border p-3 flex flex-col justify-between shadow-sm relative overflow-hidden transition-all hover:scale-[1.02] group ${getCategoryCardClass(item.category, item.isCraftable)} ${item.netDeduction >= item.assignedQty ? 'opacity-60 border-amber-300 dark:border-amber-700' : ''} ${item.isOrphan ? 'border-dashed border-destructive/50' : ''}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col overflow-hidden pr-2">
                                            <p className="font-medium text-sm truncate" title={item.name}>{item.name}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">
                                                Assigned: {formatQty(item.assignedQty)} {item.unit}
                                                {item.sold > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400">| Sold: {formatQty(item.sold)} {item.unit}</span>}
                                                {item.crafted > 0 && <span className="ml-1 text-blue-600 dark:text-blue-400">| Crafted: {formatQty(item.crafted)} {item.unit}</span>}
                                                {item.recovered > 0 && <span className="ml-1 text-emerald-600 dark:text-emerald-400">| Recovered: {formatQty(item.recovered)} {item.unit}</span>}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {item.isOrphan ? (
                                                <Badge variant="destructive" className="text-[10px] px-1 opacity-80" title="This item was deleted from Master Inventory">Deleted Type</Badge>
                                            ) : (
                                                <Badge variant="outline" className={`text-[10px] px-1 ${getCategoryBadgeClass(item.category, item.isCraftable)}`}>{item.category}</Badge>
                                            )}

                                            {/* Burn Button (Small Flame) */}
                                            {!item.isOrphan && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Mirroring the master inventory burn action behavior
                                                        // Since we don't have a direct 'burnItem' setter passed in props,
                                                        // we rely on the component having access to the shared logic if possible.
                                                        // Actually, this component (DroppableEmployee) is inside InventoryAssignmentPanel
                                                        // but the states for burnDialogOpen are in the parent.
                                                        // We need to pass a callback or trigger an event.
                                                        window.dispatchEvent(new CustomEvent('trigger-assignment-burn', { 
                                                            detail: { item, employeeId: employee.id } 
                                                        }));
                                                    }}
                                                    className="p-1 rounded-md hover:bg-orange-500/10 text-muted-foreground hover:text-orange-600 transition-colors"
                                                    title="Burn stock (irreversible reduction)"
                                                >
                                                    <Flame className="h-3.5 w-3.5" />
                                                </button>
                                            )}

                                            {item.sold > 0 ? (
                                                <>
                                                    {/* Undo / Unsell Button */}
                                                    <button
                                                        onClick={(e) => handleUnassign(e, item, 'undo_sale_unassign')}
                                                        disabled={unassigningId === item.id + 'undo_sale_unassign'}
                                                        className={`p-1 rounded-md transition-colors hover:bg-primary/10 text-muted-foreground hover:text-primary disabled:opacity-50`}
                                                        title="Unsell / Refund (Refund master stock, trigger finance deletion)"
                                                    >
                                                        {unassigningId === item.id + 'undo_sale_unassign' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpLeft className="h-3.5 w-3.5" />}
                                                    </button>

                                                    {item.netDeduction < item.assignedQty && (
                                                        /* Standard Unassign Button (Disabled - fully unassign only when sold=0) */
                                                        <button
                                                            disabled={true}
                                                            className={`p-1 rounded-md transition-colors text-muted-foreground opacity-30 cursor-not-allowed`}
                                                            title="Cannot unassign item with active sales/crafting. Refund/recover first."
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}

                                                </>
                                            ) : (
                                                /* Standard Unassign Button */
                                                <>
                                                    {item.crafted > 0 && (
                                                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                                            🔨 {item.crafted} consumed
                                                        </Badge>
                                                    )}
                                                    {item.sold > 0 && (
                                                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                                            💰 {item.sold} sold
                                                        </Badge>
                                                    )}
                                                    {(item.assignedQty - item.netDeduction) <= 0 ? (
                                                        /* Sold Out / Fully Consumed */
                                                        <button
                                                            onClick={(e) => handleUnassign(e, item, 'delete_assignment')}
                                                            className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                                            title="Clear completed assignment"
                                                        >
                                                            {unassigningId === item.id + 'delete_assignment' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                        </button>
                                                    ) : (
                                                        /* Partial Unassign */
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setUnassignQty((item.assignedQty - item.netDeduction).toString());
                                                                setUnassignItemContext(item);
                                                            }}
                                                            className={`p-1 rounded-md transition-colors hover:bg-destructive/10 text-muted-foreground hover:text-destructive`}
                                                            title="Unassign item (returns to available stock)"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Partial Unassign Dialog */}
            {unassignItemContext && (
                <Dialog open={!!unassignItemContext} onOpenChange={(open) => !open && setUnassignItemContext(null)}>
                    <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-[400px]">
                        <DialogHeader>
                            <DialogTitle>Unassign Item</DialogTitle>
                            <DialogDescription>
                                Return {unassignItemContext.name} to the master inventory.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">Quantity</Label>
                                <div className="col-span-3 flex gap-2">
                                    <Input
                                        type="number"
                                        step={unassignItemContext.unit === 'pcs' ? "1" : "0.1"}
                                        max={unassignItemContext.assignedQty - unassignItemContext.netDeduction}
                                        value={unassignQty}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (unassignItemContext.unit === 'pcs' && val.includes('.')) return;
                                            setUnassignQty(val);
                                        }}
                                        autoFocus
                                    />
                                    <div className="flex items-center px-3 bg-muted rounded-md text-sm whitespace-nowrap">
                                        {unassignItemContext.unit}
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                                Max available to unassign: {formatQty(unassignItemContext.assignedQty - unassignItemContext.netDeduction)} {unassignItemContext.unit} (excluding sold/crafted).
                            </p>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setUnassignItemContext(null)}>Cancel</Button>
                            <Button
                                variant="destructive"
                                disabled={unassigningId === unassignItemContext.id + 'unassign' || parseFloat(unassignQty) <= 0 || parseFloat(unassignQty) > (unassignItemContext.assignedQty - unassignItemContext.netDeduction) || isNaN(parseFloat(unassignQty))}
                                onClick={async (e) => {
                                    const qty = parseFloat(unassignQty);
                                    if (qty > 0 && qty <= (unassignItemContext.assignedQty - unassignItemContext.netDeduction)) {
                                        await handleUnassign(e, { ...unassignItemContext, assignedQty: qty }, 'unassign');
                                        setUnassignItemContext(null);
                                    }
                                }}
                            >
                                {unassigningId === unassignItemContext.id + 'unassign' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Unassign
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

export default function InventoryAssignmentPanel({
    soldMap = {},
    craftingMap = {},
    recoveredMap = {}
}: {
    soldMap?: Record<string, number>,
    craftingMap?: Record<string, number>,
    recoveredMap?: Record<string, number>
}) {
    const [viewMode, setViewMode] = useState<'assign' | 'manage'>('assign');

    // Data State
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [recipes, setRecipes] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filtering
    const [itemSearch, setItemSearch] = useState('');
    const [empSearch, setEmpSearch] = useState('');

    // Dnd State
    const [activeItem, setActiveItem] = useState<InventoryItem | null>(null);

    // Assignment Dialog
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [targetEmployee, setTargetEmployee] = useState<Employee | null>(null);
    const [assignQuantity, setAssignQuantity] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);

    // Edit Dialog
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editItem, setEditItem] = useState<InventoryItem | null>(null);
    const [editForm, setEditForm] = useState<Partial<InventoryItem>>({});
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Burn Dialog
    const [burnDialogOpen, setBurnDialogOpen] = useState(false);
    const [burnItem, setBurnItem] = useState<InventoryItem | null>(null);
    const [burnQuantity, setBurnQuantity] = useState('');
    const [isBurning, setIsBurning] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);

    const handlePushToAffectedStaff = async (affectedIds: string[]) => {
        for (const id of affectedIds) {
            await handleSyncStaff(id);
        }
    };
    
    const { user, getIDToken } = UserAuth();
    const { authSession } = useMasterPassword();
    const { toast } = useToast();

    const handleSyncStaff = async (employeeId: string) => {
        try {
            const token = await getIDToken();
            if (!token) return;

            // Fetch target employee's selling rules to apply overrides
            let staffRules: Record<string, { unitValue: number }> = {};
            try {
                const rulesRes = await fetch(`/api/admin/staff/${employeeId}/selling-rules`, {
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
            const existingItems = await fetchAndDecryptStaffItems(employeeId, token, authSession?.masterPassword);

            const myPayload = buildStaffPayload(employeeId, items, staffRules, recipes, soldMap, `Force synced by admin`, existingItems);

            const result = await autoPushStaffInventory(employeeId, token, myPayload);
            if (result.success) {
                toast({ title: "Sync Successful", description: "Inventory securely pushed to staff device." });
                return true;
            } else {
                toast({
                    title: "Push Warning",
                    description: `Could not sync to staff device: ${result.reason}`,
                    variant: "destructive"
                });
                return false;
            }
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
            return false;
        }
    };

    // Sensors for better mobile support
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 10 } }),
        useSensor(KeyboardSensor)
    );

    // Data timestamps to prevent infinite reload loops on mount
    const [lastVolumeUpdate, setLastVolumeUpdate] = useState<string | null>(null);

    // Ref to always hold the latest force-push handler (avoids closure/hoisting bugs)
    const forcePushRef = useRef<() => void>(() => {});

    forcePushRef.current = async () => {
        const staffWithAssignments = employees.filter(emp => {
            return items.some(itm => itm.assignments?.some(a => a.employeeId === emp.id && a.quantity > 0));
        });

        if (staffWithAssignments.length === 0) {
            toast({ title: "No Assignments", description: "No staff members have active inventory assignments to push." });
            return;
        }

        toast({
            title: "Batch Sync Started",
            description: `Pushing inventory to ${staffWithAssignments.length} staff members...`
        });

        let successCount = 0;
        let failCount = 0;

        for (const emp of staffWithAssignments) {
            const success = await handleSyncStaff(emp.id);
            if (success) successCount++;
            else failCount++;
        }

        toast({
            title: "Batch Sync Complete",
            description: `Successfully pushed to ${successCount} staff members.${failCount > 0 ? ` Failed for ${failCount}.` : ''}`,
            variant: failCount > 0 ? "destructive" : "default"
        });
    };

    useEffect(() => {
        const handler = () => forcePushRef.current();
        window.addEventListener('trigger-force-push-all', handler);

        const burnHandler = (e: any) => {
            if (e.detail?.item) {
                setBurnItem(e.detail.item);
                // Default to 0 or 1 for quantity to burn
                setBurnQuantity('');
                setBurnDialogOpen(true);
            }
        };
        window.addEventListener('trigger-assignment-burn', burnHandler);

        return () => {
            window.removeEventListener('trigger-force-push-all', handler);
            window.removeEventListener('trigger-assignment-burn', burnHandler);
        };
    }, []); // Empty dependencies—safe due to ref indirection

    useEffect(() => {
        if (!authSession?.masterPassword) return;

        loadData(true);

        // Listen to assignment changes
        const unsubAssignments = onSnapshot(collection(db, 'inventory'), () => {
            loadData(false);
        });

        // Listen to staff-data changes (e.g. name changes, role changes)
        const unsubStaff = onSnapshot(collection(db, 'staff-data'), () => {
            loadData(false);
        });

        // Listen to encrypted volume metadata changes
        const unsubVolume = onSnapshot(doc(db, 'udhhmbtc', 'meta-data'), (snapshot) => {
            if (snapshot.exists()) {
                const updated = snapshot.data().updatedAt;
                const updatedStr = updated?.toDate ? updated.toDate().toISOString() : String(updated);

                setLastVolumeUpdate(prev => {
                    if (prev !== null && prev !== updatedStr) {
                        loadData(false);
                        // Also proactively dispatch event to siblings
                        window.dispatchEvent(new CustomEvent('inventory-updated'));
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

    const loadData = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const token = await getIDToken();
            if (!token) return;

            const [itemsRes, empRes, recipesRes] = await Promise.all([
                fetch('/api/admin/inventory', { headers: getAdminHeaders(token) }),
                fetch('/api/admin/staff', { headers: getAdminHeaders(token) }),
                fetch('/api/admin/recipes', {
                    headers: {
                        ...getAdminHeaders(token),
                        ...(authSession?.token ? { 'x-master-password-session': authSession.token } : {})
                    }
                })
            ]);

            if (itemsRes.ok) setItems(await itemsRes.json());
            if (empRes.ok) setEmployees(await empRes.json());
            if (recipesRes.ok) {
                const data = await recipesRes.json();
                const loadedRecipes = Array.isArray(data) ? data : (data.recipes || []);
                setRecipes(loadedRecipes);
                console.log(`[RecipesFetch] Loaded ${loadedRecipes.length} recipes`);
            } else {
                console.warn(`[RecipesFetch] Failed to fetch recipes: ${recipesRes.status} ${recipesRes.statusText}`);
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to load inventory data", variant: "destructive" });
        } finally {
            if (showLoading) setIsLoading(false);
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        haptics.drag();
        const { active } = event;
        setActiveItem(active.data.current?.item);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && over.data.current?.employee && activeItem) {
            haptics.success();
            const emp = over.data.current.employee;
            if (emp) {
                setTargetEmployee(emp);
                setAssignQuantity('');
                setAssignDialogOpen(true);
            }
        } else {
            setActiveItem(null);
        }
    };

    const handleBurnSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!burnItem || !burnQuantity) return;

        try {
            setIsBurning(true);
            const token = await getIDToken();
            const response = await fetch(`/api/admin/inventory/${burnItem.id}`, {
                method: 'PUT',
                headers: getAdminHeaders(token),
                body: JSON.stringify({
                    action: 'burn_item',
                    quantity: parseFloat(burnQuantity),
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to burn items');

            loadData(false);
            toast({ title: "Success", description: `Successfully burned ${burnQuantity} ${burnItem.unit}.` });
            setBurnDialogOpen(false);
            setBurnItem(null);
            setBurnQuantity('');
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsBurning(false);
        }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editItem) return;

        try {
            setIsSavingEdit(true);
            const token = await getIDToken();
            const response = await fetch(`/api/admin/inventory/${editItem.id}`, {
                method: 'PUT',
                headers: getAdminHeaders(token),
                body: JSON.stringify({
                    action: 'edit',
                    updates: {
                        name: editForm.name,
                        quantity: editForm.quantity,
                        unitValue: editForm.unitValue,
                        originalCost: editItem.craftable ? editItem.originalCost : editForm.originalCost,
                        costOverride: editItem.craftable ? editForm.originalCost : undefined,
                    }
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to edit item');

            loadData(false);
            toast({ title: "Success", description: "Item updated securely." });
            setEditDialogOpen(false);
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeItem || !targetEmployee || !assignQuantity) return;

        try {
            setIsAssigning(true);
            const token = await getIDToken();
            const response = await fetch(`/api/admin/inventory/${activeItem.id}`, {
                method: 'PUT',
                headers: getAdminHeaders(token),
                body: JSON.stringify({
                    action: 'assign',
                    employeeId: targetEmployee.id,
                    quantity: parseFloat(assignQuantity),
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Assignment failed');

            // Wait for onSnapshot to reload data, but also trigger a manual load for immediate feedback if needed
            loadData(false);

            // Fire and forget auto-push
            const assignEmployeeId = targetEmployee.id;

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

            const updatedItems = await fetch('/api/admin/inventory', { headers: getAdminHeaders(token) }).then(r => r.json());
            const myPayload = buildStaffPayload(assignEmployeeId, updatedItems, staffRules, recipes, soldMap, `Assigned via DND by admin`, existingItems);
            if (token) {
                autoPushStaffInventory(assignEmployeeId, token, myPayload).then(result => {
                    if (!result.success) {
                        toast({
                            title: "Push Warning",
                            description: `Could not sync to staff device: ${result.reason}`,
                            variant: "destructive"
                        });
                    }
                });
            }

            toast({ title: "Success", description: "Assignment recorded" });
            setAssignDialogOpen(false);
            setTargetEmployee(null);
            setActiveItem(null);
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsAssigning(false);
        }
    };

    const handleUnassignItem = async (itemId: string, employeeId: string, quantity: number, action: 'unassign' | 'delete_assignment' | 'undo_sale_unassign' = 'unassign', soldQuantity: number = 0) => {
        try {
            const token = await getIDToken();
            if (!token) return;

            // 1. Always call master API to handle Return-to-Stock (excess items)
            const response = await fetch(`/api/admin/inventory/${itemId}`, {
                method: 'PUT',
                headers: getAdminHeaders(token),
                body: JSON.stringify({
                    action,
                    employeeId,
                    quantity,
                    soldQuantity
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unassignment failed');

            // 2. Update shadow Firestore doc (Layer 3)
            try {
                const assignRef = doc(db, 'employees', employeeId, 'assignments', itemId);
                const shadowSnap = await getDoc(assignRef);
                
                if (shadowSnap.exists()) {
                    const currentQty = shadowSnap.data().quantity || 0;
                    const newQty = formatQty(Math.max(0, currentQty - quantity));
                    
                    if (newQty <= 0 || action === 'delete_assignment') {
                        await deleteDoc(assignRef);
                    } else {
                        await updateDoc(assignRef, { quantity: newQty });
                    }
                }
            } catch (e) {
                console.warn(`[UnassignShadow] Failed to update shadow doc:`, e);
            }

            loadData(false);

                if (!token) return;
                // Fetch target employee's selling rules to apply overrides
                let staffRules: Record<string, { unitValue: number }> = {};
                try {
                    const rulesRes = await fetch(`/api/admin/staff/${employeeId}/selling-rules`, {
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
                const existingItems = await fetchAndDecryptStaffItems(employeeId, token, authSession?.masterPassword);

                const updatedItems = await fetch('/api/admin/inventory', { headers: getAdminHeaders(token) }).then(r => r.json());
                const myPayload = buildStaffPayload(employeeId, updatedItems, staffRules, recipes, soldMap, `Updated by admin`, existingItems);
                autoPushStaffInventory(employeeId, token, myPayload).then(result => {
                    if (!result.success) {
                        toast({
                            title: "Push Warning",
                            description: `Could not sync to staff device: ${result.reason}`,
                            variant: "destructive"
                        });
                    }
                });

                toast({ title: "Success", description: action === 'unassign' ? "Item unassigned" : (action === 'delete_assignment' ? "Assignment force-deleted" : "Sale reverted — item remains assigned") });

            // If action was undo_sale_unassign, wipe the finance record immediately
            if (action === 'undo_sale_unassign') {
                try {
                    const keyRes = await fetch('/api/admin/keys', {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (keyRes.ok) {
                        const adminKeyData = await keyRes.json();
                        if (adminKeyData.encryptedPrivateKey && authSession?.masterPassword) {
                            const privateKey = await unwrapPrivateKey(adminKeyData.encryptedPrivateKey, authSession.masterPassword);
                            const recordsSnapshot = await getDocs(collection(db, `finances/${employeeId}/records`));
                            let deletedCount = 0;

                            for (const docSnap of recordsSnapshot.docs) {
                                const docData = docSnap.data();
                                if (!docData.encryptedData || !docData.adminWrappedDEK || !docData.iv) continue;

                                try {
                                    const decStr = await envelopeDecrypt({
                                        encryptedData: docData.encryptedData,
                                        staffWrappedDEK: docData.staffWrappedDEK || '',
                                        adminWrappedDEK: docData.adminWrappedDEK,
                                        iv: docData.iv,
                                        encryptionVersion: docData.encryptionVersion ?? 2
                                    }, docData.adminWrappedDEK, privateKey);

                                    const decData = JSON.parse(decStr);
                                    if (decData.type !== 'payment' && decData.type !== 'debt' && decData.itemId === itemId) {
                                        await deleteDoc(docSnap.ref);
                                        deletedCount++;
                                    }
                                } catch (e) { }
                            }
                            if (deletedCount > 0) {
                                toast({ title: 'Unsell Complete', description: `Refunded master stock and deleted ${deletedCount} finance record(s).` });
                            } else {
                                toast({ title: 'Unsell Warning', description: 'Item unassigned and stock refunded, but no matching finance records were found to delete.', variant: 'destructive' });
                            }
                        }
                    }
                } catch (apiErr) {
                    console.error("Failed to wipe sale records:", apiErr);
                }
            }
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    const filteredItems = items.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()));
    const filteredEmps = employees.filter(e => e.name.toLowerCase().includes(empSearch.toLowerCase()));

    const activeItemAvailable = activeItem ? activeItem.quantity - (activeItem.assignments ?? []).reduce((s, a) => s + a.quantity, 0) : 0;

    return (
        <div className="space-y-6">
            <style>{shakeAnimation}</style>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Staff Stock</h2>
                    <p className="text-muted-foreground">Manage master inventory, assignments, and refunds.</p>
                </div>
            </div>

            <Tabs defaultValue="inventory" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted/50 p-1">
                    <TabsTrigger value="inventory" className="text-xs sm:text-sm py-2 data-[state=active]:shadow-sm">
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Inventario Maestro</span>
                        <span className="sm:hidden">Inventario</span>
                    </TabsTrigger>
                    <TabsTrigger value="assignment" className="text-xs sm:text-sm py-2 data-[state=active]:shadow-sm">
                        <ArrowDownToDot className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Asignación de Stock</span>
                        <span className="sm:hidden">Asignación</span>
                    </TabsTrigger>
                    <TabsTrigger value="refunds" className="text-xs sm:text-sm py-2 data-[state=active]:shadow-sm">
                        <HandCoins className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Reembolsos</span>
                        <span className="sm:hidden">Reembolsos</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="inventory" className="mt-0 focus-visible:outline-none focus-visible:ring-0 space-y-4">
                    <InventoryTab soldMap={soldMap} />
                </TabsContent>

                <TabsContent value="assignment" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                    {isLoading ? (
                        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* LEFT PANE: EMPLOYEES (Drop Targets) */}
                                <Card className="flex flex-col h-[500px] lg:h-[700px]">
                                    <CardHeader className="pb-3 border-b">
                                        <CardTitle className="text-xl">Staff Members</CardTitle>
                                        <CardDescription>Drop items here</CardDescription>
                                        <div className="relative mt-2">
                                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input placeholder="Search staff..." className="pl-8" value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 scroll-fade-y">
                                        {filteredEmps.length === 0 ? (
                                            <div className="text-center py-10 text-muted-foreground">No staff found</div>
                                        ) : (
                                            filteredEmps.map(emp => (
                                          <DroppableEmployee
                                        key={emp.id}
                                        employee={emp}
                                        items={items}
                                        onUnassign={handleUnassignItem}
                                        onSync={handleSyncStaff}
                                        soldMap={soldMap}
                                        craftingMap={craftingMap}
                                        recoveredMap={recoveredMap}
                                    />

                                            ))
                                        )}
                                    </CardContent>
                                </Card>

                                {/* RIGHT PANE: INVENTORY (Draggables) */}
                                <Card className="flex flex-col h-[500px] lg:h-[700px] border-primary/20 bg-primary/5">
                                    <CardHeader className="pb-3 border-b bg-background">
                                        <CardTitle className="text-xl">Available Inventory</CardTitle>
                                        <CardDescription>Drag items from here</CardDescription>
                                        <div className="relative mt-2">
                                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input placeholder="Search items..." className="pl-8" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex-1 overflow-y-auto p-4 bg-background/50 scroll-fade-y">
                                        {filteredItems.length === 0 ? (
                                            <div className="text-center py-10 text-muted-foreground">No items available</div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {filteredItems.map(item => (
                                                    <DraggableItem 
                                                        key={item.id} 
                                                        item={item} 
                                                        items={items}
                                                        recipes={recipes}
                                                        onEdit={(itm) => {
                                                            setEditItem(itm);
                                                            setEditForm({ 
                                                                name: itm.name, 
                                                                quantity: itm.quantity, 
                                                                unitValue: itm.unitValue, 
                                                                originalCost: itm.craftable ? (itm.costOverride ?? 0) : (itm.originalCost ?? 0), 
                                                                unit: itm.unit 
                                                            });
                                                            setEditDialogOpen(true);
                                                        }} 
                                                        onBurn={(itm) => {
                                                            setBurnItem(itm);
                                                            setBurnQuantity('');
                                                            setBurnDialogOpen(true);
                                                        }}
                                                        onDelete={(itm) => {
                                                            setDeleteTarget(itm);
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            <DragOverlay zIndex={100}>
                                {activeItem ? (
                                    <div className="flex items-center gap-3 p-3 rounded-md border-2 border-primary bg-background shadow-xl w-[280px]">
                                        <Package className="h-5 w-5 text-primary" />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{activeItem.name}</p>
                                            <span className="text-xs text-muted-foreground">{activeItemAvailable} {activeItem.unit} available</span>
                                        </div>
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    )}
                </TabsContent>

                <TabsContent value="refunds" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                    <RefundsPanel />
                </TabsContent>
            </Tabs>

            {/* Assignment Dialog */}
            <Dialog open={assignDialogOpen} onOpenChange={(open) => {
                if (!open) { setActiveItem(null); setAssignDialogOpen(false); }
            }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Assign Item</DialogTitle>
                        <DialogDescription>
                            Assigning <strong>{activeItem?.name}</strong> to <strong>{targetEmployee?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAssignSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Quantity ({activeItem?.unit})</Label>
                            <div className="flex items-center gap-3">
                                <Input
                                    type="number"
                                    step={activeItem?.unit === 'pcs' ? "1" : "0.1"}
                                    min={activeItem?.unit === 'pcs' ? "1" : "0.1"}
                                    max={activeItemAvailable}
                                    value={assignQuantity}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (activeItem?.unit === 'pcs' && val.includes('.')) return;
                                        setAssignQuantity(val);
                                    }}
                                    required
                                    autoFocus
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 px-3 text-xs"
                                    onClick={() => setAssignQuantity(activeItemAvailable.toString())}
                                >
                                    Max: {activeItemAvailable}
                                </Button>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" type="button" onClick={() => { setActiveItem(null); setAssignDialogOpen(false); }}>Cancel</Button>
                            <Button type="submit" disabled={isAssigning || !assignQuantity}>
                                {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Confirm Assignment
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Burn Dialog */}
            <Dialog open={burnDialogOpen} onOpenChange={(open) => {
                if (!open) { setBurnItem(null); setBurnDialogOpen(false); }
            }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Burn Master Stock</DialogTitle>
                        <DialogDescription>
                            Discard unassigned quantities of <strong>{burnItem?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBurnSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Quantity to Burn ({burnItem?.unit})</Label>
                            <div className="flex items-center gap-3">
                                <Input
                                    type="number"
                                    step={burnItem?.unit === 'pcs' ? "1" : "0.1"}
                                    min={burnItem?.unit === 'pcs' ? "1" : "0.1"}
                                    max={burnItem ? burnItem.quantity - (burnItem.assignments ?? []).reduce((s, a) => s + a.quantity, 0) : undefined}
                                    value={burnQuantity}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (burnItem?.unit === 'pcs' && val.includes('.')) return;
                                        setBurnQuantity(val);
                                    }}
                                    required
                                    autoFocus
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 px-3 text-xs"
                                    onClick={() => burnItem && setBurnQuantity((burnItem.quantity - (burnItem.assignments ?? []).reduce((s, a) => s + a.quantity, 0)).toString())}
                                >
                                    Max
                                </Button>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" type="button" onClick={() => { setBurnItem(null); setBurnDialogOpen(false); }}>Cancel</Button>
                            <Button type="submit" variant="destructive" disabled={isBurning || !burnQuantity}>
                                {isBurning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Confirm Burn
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={(open) => {
                if (!open) setEditDialogOpen(false);
            }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Edit Unassigned Item</DialogTitle>
                        <DialogDescription>
                            Update the details for <strong>{editItem?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleEditSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                                value={editForm.name || ''}
                                onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Quantity ({editItem?.unit})</Label>
                                <Input
                                    type="number"
                                    step={editItem?.unit === 'pcs' ? "1" : "0.1"}
                                    min="0"
                                    value={editForm.quantity || ''}
                                    onChange={e => setEditForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) }))}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Value ($)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editForm.unitValue || ''}
                                    onChange={e => setEditForm(prev => ({ ...prev, unitValue: parseFloat(e.target.value) }))}
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>{editItem?.craftable ? 'Cost Override ($)' : 'Cost ($)'}</Label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editForm.originalCost || ''}
                                onChange={e => setEditForm(prev => ({ ...prev, originalCost: parseFloat(e.target.value) }))}
                                placeholder={editItem?.craftable ? "Auto (ingredients)" : "0.00"}
                            />
                            {editItem?.craftable && (
                                <p className="text-[10px] text-muted-foreground">
                                    Leave empty or 0 to use automatic calculation from ingredients.
                                </p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={isSavingEdit}>
                                {isSavingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <DeleteItemDialog
                item={deleteTarget as any}
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                onDeleted={() => {
                    setDeleteTarget(null);
                }}
                onPushRequired={handlePushToAffectedStaff}
                sessionToken={authSession?.token}
            />
        </div>
    );
}
