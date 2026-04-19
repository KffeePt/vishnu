"use client";

import React, { useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Flame } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { getAdminHeaders } from '@/lib/client-auth';
import { UserAuth } from "@/context/auth-context";
import { Switch } from "@/components/ui/switch";

interface DeleteItemDialogProps {
    item: {
        id: string;
        name: string;
        quantity: number;
        unit: string;
        assignments?: any[];
    } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDeleted: () => void;
    onPushRequired?: (affectedEmployeeIds: string[]) => void;
    sessionToken?: string;
}

export function DeleteItemDialog({ item, open, onOpenChange, onDeleted, onPushRequired, sessionToken }: DeleteItemDialogProps) {
    const [mode, setMode] = useState<'select' | 'burn' | 'delete'>('select');
    const [burnQuantity, setBurnQuantity] = useState('');
    const [burnStaffInventory, setBurnStaffInventory] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { getIDToken } = UserAuth();
    const { toast } = useToast();

    // Reset state when dialog opens
    React.useEffect(() => {
        if (open) {
            setMode('select');
            setBurnQuantity('');
            setBurnStaffInventory(false);
        }
    }, [open]);

    if (!item) return null;

    const hasAssignments = (item.assignments || []).length > 0;

    const handleBurn = async () => {
        if (!burnQuantity || parseFloat(burnQuantity) <= 0) return;
        setIsSubmitting(true);
        try {
            const token = await getIDToken();
            const res = await fetch(`/api/admin/inventory/${item.id}`, {
                method: 'PUT',
                headers: {
                    ...getAdminHeaders(token!),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                },
                body: JSON.stringify({ action: 'burn_item', quantity: parseFloat(burnQuantity) })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to burn item');
            }
            toast({ title: 'Success', description: `Burned ${burnQuantity} ${item.unit} of ${item.name}` });
            if (onPushRequired && item.assignments && item.assignments.length > 0) {
                onPushRequired(item.assignments.map(a => a.employeeId));
            }
            onDeleted();
            onOpenChange(false);
            window.dispatchEvent(new CustomEvent('inventory-updated'));
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        setIsSubmitting(true);
        try {
            const token = await getIDToken();
            const res = await fetch(`/api/admin/inventory/${item.id}`, {
                method: 'DELETE',
                headers: {
                    ...getAdminHeaders(token!),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                },
                body: JSON.stringify({ burnStaffInventory })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to delete item');
            }
            toast({ title: 'Success', description: `Deleted ${item.name} entirely.` });
            if (burnStaffInventory && onPushRequired && item.assignments && item.assignments.length > 0) {
                onPushRequired(item.assignments.map(a => a.employeeId));
            }
            onDeleted();
            onOpenChange(false);
            window.dispatchEvent(new CustomEvent('inventory-updated'));
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            onOpenChange(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={handleClose}>
            <AlertDialogContent className="sm:max-w-[425px]">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        {mode === 'select' && <Trash2 className="h-5 w-5 text-destructive" />}
                        {mode === 'burn' && <Flame className="h-5 w-5 text-amber-500" />}
                        {mode === 'delete' && <Trash2 className="h-5 w-5 text-destructive" />}
                        {mode === 'select' ? `Delete or Burn ${item.name}?` : mode === 'burn' ? `Burn ${item.name}` : `Delete ${item.name} Permanently`}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {mode === 'select' && `Choose how you want to handle this item.`}
                        {mode === 'burn' && `This will permanently reduce the master stock of ${item.name}. Staff assignments are unaffected. This action cannot be undone.`}
                        {mode === 'delete' && `This will completely remove the item type ${item.name} from the system. This action cannot be undone.`}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {mode === 'select' && (
                    <div className="flex flex-col gap-3 py-4">
                        <Button
                            variant="outline"
                            className="justify-start h-auto py-3 px-4 flex flex-col items-start gap-1"
                            onClick={() => setMode('burn')}
                        >
                            <div className="flex items-center gap-2 font-semibold">
                                <Flame className="h-4 w-4 shrink-0 text-amber-500" />
                                <span className="truncate">Burn Quantity Only</span>
                            </div>
                            <div className="text-xs text-muted-foreground text-left font-normal break-words whitespace-normal">
                                Reduce master inventory stock but keep the item type and all configuration.
                            </div>
                        </Button>
                        <Button
                            variant="outline"
                            className="justify-start h-auto py-3 px-4 flex flex-col items-start gap-1 border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setMode('delete')}
                        >
                            <div className="flex items-center gap-2 font-semibold text-destructive">
                                <Trash2 className="h-4 w-4 shrink-0" />
                                <span className="truncate whitespace-normal text-left">Delete Item Type Completely</span>
                            </div>
                            <div className="text-xs text-muted-foreground text-left font-normal break-words whitespace-normal">
                                Remove this item type entirely from the system.
                            </div>
                        </Button>
                    </div>
                )}

                {mode === 'burn' && (
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Quantity</Label>
                            <div className="col-span-3 flex gap-2">
                                <Input
                                    type="number"
                                    step={item.unit === 'pcs' ? "1" : "0.1"}
                                    value={burnQuantity}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (item.unit === 'pcs' && val.includes('.')) return;
                                        setBurnQuantity(val);
                                    }}
                                    placeholder="0"
                                    min="0"
                                    max={item.quantity}
                                    autoFocus
                                />
                                <div className="flex items-center px-3 bg-muted rounded-md text-sm whitespace-nowrap">
                                    {item.unit}
                                </div>
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground text-right mr-1">
                            Available in master: {item.quantity} {item.unit}
                        </div>
                    </div>
                )}

                {mode === 'delete' && hasAssignments && (
                    <div className="py-4 space-y-4">
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                            <h4 className="font-semibold text-amber-600 dark:text-amber-500 text-sm mb-1">Active Assignments Exist</h4>
                            <p className="text-xs text-muted-foreground">
                                There are currently {item.assignments?.length} staff members with this item.
                            </p>
                        </div>
                        <div className="flex items-center justify-between border rounded-md p-3 bg-card shadow-sm">
                            <div className="flex flex-col gap-0.5">
                                <Label className="text-sm cursor-pointer" htmlFor="burn-staff">Burn staff inventory</Label>
                                <span className="text-[10px] text-muted-foreground">Force-delete remaining staff stock</span>
                            </div>
                            <Switch checked={burnStaffInventory} onCheckedChange={setBurnStaffInventory} id="burn-staff" />
                        </div>
                        {!burnStaffInventory && (
                            <p className="text-xs text-destructive animate-in fade-in zoom-in slide-in-from-top-1">
                                You must enable this to forcefully delete an item with active assignments.
                            </p>
                        )}
                    </div>
                )}

                <AlertDialogFooter>
                    {mode !== 'select' && (
                        <div className="flex w-full justify-between items-center sm:hidden mb-2">
                            <Button variant="ghost" size="sm" onClick={() => setMode('select')} disabled={isSubmitting}>Back</Button>
                        </div>
                    )}
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-between w-full">
                        {mode !== 'select' ? (
                            <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => setMode('select')} disabled={isSubmitting}>Back</Button>
                        ) : <div />}
                        <div className="flex flex-col-reverse sm:flex-row gap-2">
                            <AlertDialogCancel disabled={isSubmitting} onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
                            {mode === 'burn' && (
                                <Button
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                    disabled={isSubmitting || !burnQuantity || parseFloat(burnQuantity) <= 0}
                                    onClick={(e) => { e.preventDefault(); handleBurn(); }}
                                >
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Flame className="w-4 h-4 mr-1" /> Burn Quantity
                                </Button>
                            )}
                            {mode === 'delete' && (
                                <Button
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    disabled={isSubmitting || (hasAssignments && !burnStaffInventory)}
                                    onClick={(e) => { e.preventDefault(); handleDelete(); }}
                                >
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Permanently Delete
                                </Button>
                            )}
                        </div>
                    </div>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
