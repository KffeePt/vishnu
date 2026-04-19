"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { getAdminHeaders } from '@/lib/client-auth';
import { UserAuth } from "@/context/auth-context";

interface SellingRulesDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    employeeId: string;
    employeeName: string;
}

interface ItemCategory {
    id: string;
    name: string;
    category: string;
    unitValue: number;
    flexiblePrice: boolean;
    flexibilityPercent: number;
}

export function SellingRulesDialog({ isOpen, onOpenChange, employeeId, employeeName }: SellingRulesDialogProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [categories, setCategories] = useState<ItemCategory[]>([]);
    const [rules, setRules] = useState<Record<string, { unitValue: number }>>({});
    const { getIDToken } = UserAuth();
    const { toast } = useToast();

    useEffect(() => {
        if (!isOpen) return;

        const loadRulesAndInventory = async () => {
            setIsLoading(true);
            try {
                const token = await getIDToken();
                if (!token) return;

                // 1. Fetch all flexible inventory items to build the category list
                const invRes = await fetch('/api/admin/inventory', { headers: getAdminHeaders(token) });
                if (!invRes.ok) throw new Error('Failed to load inventory');
                const invData = await invRes.json();

                // Group by item idea instead of category
                const itemMap = new Map<string, ItemCategory>();
                invData.forEach((item: any) => {
                    if (item.flexiblePrice && !itemMap.has(item.id)) {
                        itemMap.set(item.id, {
                            id: item.id,
                            name: item.name,
                            category: item.category,
                            unitValue: item.unitValue,
                            flexiblePrice: item.flexiblePrice,
                            flexibilityPercent: item.flexibilityPercent || 0,
                        });
                    }
                });
                setCategories(Array.from(itemMap.values()));

                // 2. Fetch the staff's current rules
                const rulesRes = await fetch(`/api/admin/staff/${employeeId}/selling-rules`, { headers: getAdminHeaders(token) });
                if (rulesRes.ok) {
                    const rulesData = await rulesRes.json();
                    setRules(rulesData.sellingRules || {});
                } else if (rulesRes.status !== 404) {
                    // 404 just means no rules yet, which is fine
                    throw new Error('Failed to load rules');
                }
            } catch (error: any) {
                toast({ title: "Error", description: error.message, variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };

        loadRulesAndInventory();
    }, [isOpen, employeeId, getIDToken, toast]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const token = await getIDToken();
            if (!token) throw new Error("Not authenticated");

            // Clean up empty rules before saving
            const cleanRules: Record<string, { unitValue: number }> = {};
            Object.entries(rules).forEach(([cat, data]) => {
                if (data && !isNaN(data.unitValue) && data.unitValue > 0) {
                    cleanRules[cat] = data;
                }
            });

            const res = await fetch(`/api/admin/staff/${employeeId}/selling-rules`, {
                method: 'PUT',
                headers: getAdminHeaders(token),
                body: JSON.stringify({ sellingRules: cleanRules })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save rules');
            }

            toast({ title: "Success", description: `Selling rules saved for ${employeeName}` });
            onOpenChange(false);
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handlePriceChange = (itemId: string, value: string) => {
        const numValue = parseFloat(value);
        if (value === '' || isNaN(numValue)) {
            const newRules = { ...rules };
            delete newRules[itemId];
            setRules(newRules);
        } else {
            setRules({
                ...rules,
                [itemId]: { unitValue: numValue }
            });
        }
    };

    const renderPreview = (cat: ItemCategory) => {
        const base = rules[cat.id]?.unitValue || cat.unitValue;
        const flex = cat.flexibilityPercent / 100;
        const min = base * (1 - flex);
        const max = base;
        return `$${min.toFixed(2)} - $${max.toFixed(2)}`;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Manage Selling Rules</DialogTitle>
                    <DialogDescription>
                        Set overriding base prices for <strong>{employeeName}</strong>.
                        Flexible ranges will be calculated dynamically from these overrides.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : categories.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">
                            No flexible-pricing item categories found in inventory.
                        </div>
                    ) : (
                        <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Global Default</TableHead>
                                        <TableHead>Override ($)</TableHead>
                                        <TableHead className="text-right">Sale Range</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {categories.map((cat) => (
                                        <TableRow key={cat.id}>
                                            <TableCell className="font-medium">{cat.name}</TableCell>
                                            <TableCell className="capitalize text-muted-foreground">{cat.category}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>${cat.unitValue.toFixed(2)}</span>
                                                    <span className="text-[10px] text-muted-foreground">±{cat.flexibilityPercent}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    placeholder="Global"
                                                    className={`w-24 h-8 ${rules[cat.id] ? 'border-primary' : ''}`}
                                                    value={rules[cat.id]?.unitValue ?? ''}
                                                    onChange={(e) => handlePriceChange(cat.id, e.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {renderPreview(cat)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isLoading || isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Rules
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
