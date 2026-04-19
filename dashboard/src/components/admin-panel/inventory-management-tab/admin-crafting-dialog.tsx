"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserAuth } from "@/context/auth-context";
import { getAdminHeaders } from '@/lib/client-auth';
import { Loader2, RefreshCw, Package, Trash2 } from 'lucide-react';
import { InventoryItem } from '@/types/candyland';
import { formatQty } from '@/lib/format-qty';

const getAssignedQty = (item: InventoryItem) => (item.assignments ?? []).reduce((sum, a) => sum + (a.quantity || 0), 0);

export function AdminCraftingDialog() {
    const [isOpen, setIsOpen] = useState(false);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [recipes, setRecipes] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAdminCrafting, setIsAdminCrafting] = useState<string | null>(null);
    const [craftQuantity, setCraftQuantity] = useState<Record<string, number>>({});

    const { getIDToken } = UserAuth();
    const { toast } = useToast();

    const handleDeleteRecipe = async (recipeId: string) => {
        setIsLoading(true);
        try {
            const token = await getIDToken();
            const res = await fetch(`/api/admin/recipes?id=${recipeId}`, {
                method: 'DELETE',
                headers: getAdminHeaders(token!)
            });
            if (!res.ok) throw new Error("Failed to delete recipe");
            toast({ title: "Recipe Erased" });
            loadData();
            window.dispatchEvent(new CustomEvent('inventory-updated'));
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const handleOpen = () => {
            setIsOpen(true);
            loadData();
        };
        window.addEventListener('open-admin-crafting-dialog', handleOpen);
        return () => window.removeEventListener('open-admin-crafting-dialog', handleOpen);
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const token = await getIDToken();
            if (!token) return;

            const [itemsRes, recipesRes] = await Promise.all([
                fetch('/api/admin/inventory', { headers: getAdminHeaders(token) }),
                fetch('/api/admin/recipes', { headers: getAdminHeaders(token) })
            ]);

            if (itemsRes.ok) setItems(await itemsRes.json());
            if (recipesRes.ok) {
                const rData = await recipesRes.json();
                if (Array.isArray(rData)) setRecipes(rData);
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to load crafting data", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleAdminCraftSubmit = async (recipe: any, action: 'craft' | 'reverse' = 'craft') => {
        setIsAdminCrafting(`${recipe.id}-${action}`);
        try {
            const token = await getIDToken();
            if (!token) throw new Error("Fallo de autenticación");

            const payload = {
                recipeId: recipe.id,
                action: action,
                multiplier: craftQuantity[recipe.id] || 1
            };

            const invRes = await fetch(`/api/admin/inventory/craft`, {
                method: 'POST',
                headers: getAdminHeaders(token),
                body: JSON.stringify(payload)
            });

            if (!invRes.ok) {
                const err = await invRes.json();
                throw new Error(err.error || "Error al actualizar inventario");
            }

            toast({ title: 'Fabricación Exitosa', description: `Se ha fabricado el artículo exitosamente.` });
            loadData();
            window.dispatchEvent(new CustomEvent('inventory-updated'));
        } catch (error: any) {
            console.error("[CraftFlow] Error:", error);
            toast({ title: 'Error', description: error.message || 'Error durante la fabricación', variant: 'destructive' });
        } finally {
            setIsAdminCrafting(null);
        }
    };

    const craftableItems = items.filter(i => i.craftable);
    const orphanRecipes = recipes.filter(r => !items.some(i => i.id === r.outputItemId));

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
                        <RefreshCw className="h-6 w-6" />
                        Admin Crafting Hub
                    </DialogTitle>
                    <DialogDescription>
                        Manage bulk production. Stock goes directly to master inventory.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : craftableItems.length === 0 ? (
                    <Card>
                        <CardContent className="p-10 text-center flex flex-col items-center gap-3">
                            <Package className="h-10 w-10 text-muted-foreground/30" />
                            <div className="text-lg font-medium text-muted-foreground text-balance">
                                No craftable items exist yet. Define them via "Add Item".
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {craftableItems.map(item => {
                            const recipe = recipes.find(r => r.outputItemId === item.id);
                            if (!recipe) {
                                return (
                                    <Card key={item.id} className="opacity-60 border-dashed">
                                        <CardContent className="p-4 flex flex-col justify-center items-center h-full text-center">
                                            <div className="font-semibold">{item.name}</div>
                                            <div className="text-xs text-muted-foreground mt-2">Recipe completely missing.</div>
                                        </CardContent>
                                    </Card>
                                )
                            }

                            // Check ingredient availability
                            let canCraft = true;
                            const missingList: string[] = [];
                            let maxCraftable = Infinity;
                            let deletedIngredientsCount = 0;

                            for (const ing of recipe.ingredients) {
                                const stockItem = items.find(i => i.id === ing.itemId);
                                if (!stockItem) {
                                    canCraft = false;
                                    maxCraftable = 0;
                                    deletedIngredientsCount++;
                                    missingList.push('Deleted Item');
                                } else {
                                    const available = stockItem.quantity - getAssignedQty(stockItem);
                                    const possibleFromIng = Math.floor(available / ing.quantity);
                                    if (possibleFromIng < maxCraftable) maxCraftable = possibleFromIng;
                                    
                                    if (available < ing.quantity) {
                                        canCraft = false;
                                        missingList.push(stockItem.name);
                                    }
                                }
                            }
                            if (maxCraftable === Infinity) maxCraftable = 0;

                            return (
                                <Card key={recipe.id} className="bg-card shadow-sm border-primary/10 flex flex-col">
                                    <CardContent className="p-4 flex flex-col flex-1">
                                        <div className="mb-4">
                                            <div className="font-semibold text-lg leading-tight">{item.name}</div>
                                            <div className="text-sm font-medium text-primary mt-1 flex flex-wrap items-center gap-2">
                                                <div className="flex items-center gap-1">
                                                    <span>Produces:</span>
                                                    <Badge variant="outline" className="border-primary/30 text-primary">{recipe.outputQuantity} {item.unit}</Badge>
                                                </div>
                                                {deletedIngredientsCount > 0 && (
                                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 uppercase">Missing Data</Badge>
                                                )}
                                            </div>

                                            <div className="text-xs space-y-1 mt-4 p-3 bg-muted/50 rounded-md border">
                                                <div className="font-semibold text-muted-foreground mb-2 flex justify-between items-center gap-2">
                                                    <span>Recipe Costs:</span>
                                                    <span className="text-[10px] bg-background px-1.5 py-0.5 rounded border whitespace-nowrap shrink-0">Master Stock</span>
                                                </div>
                                                {recipe.ingredients.map((ing: any, i: number) => {
                                                    const ingItem = items.find(it => it.id === ing.itemId);
                                                    const available = ingItem ? ingItem.quantity - getAssignedQty(ingItem) : 0;
                                                    const isMissing = !ingItem || available < ing.quantity;
                                                    return (
                                                        <div key={i} className={`flex justify-between items-center ${isMissing ? 'text-destructive font-medium' : ''}`}>
                                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                                <span className="shrink-0">{ing.quantity}</span>
                                                                <span className="truncate" title={ingItem?.name || 'Deleted Component'}>× {ingItem?.name || 'Deleted Component'}</span>
                                                            </div>
                                                            <span className="text-[10px] shrink-0 opacity-70">
                                                                {ingItem ? `(Have ${formatQty(available)})` : '(Deleted)'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="mt-auto space-y-2">
                                            {!canCraft && (
                                                <div className="text-[10px] text-destructive text-center mb-1 bg-destructive/10 py-1 px-2 rounded">
                                                    Missing ingredients for batch.
                                                </div>
                                            )}

                                            <div className="flex flex-col gap-2 w-full">
                                                {canCraft && (
                                                    <div className="flex flex-wrap items-center gap-2 mb-1 w-full">
                                                        <span className="text-sm text-foreground/50 mr-1">Qty:</span>
                                                        <Input 
                                                            type="number" 
                                                            min="1" 
                                                            max={maxCraftable}
                                                            value={craftQuantity[recipe.id] || 1} 
                                                            onChange={(e) => setCraftQuantity({...craftQuantity, [recipe.id]: Math.min(maxCraftable, Math.max(1, parseInt(e.target.value) || 1))})} 
                                                            className="w-20 h-8" 
                                                        />
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-8 py-0" 
                                                            onClick={() => setCraftQuantity({...craftQuantity, [recipe.id]: maxCraftable})}
                                                        >
                                                            Max ({maxCraftable})
                                                        </Button>
                                                    </div>
                                                )}
                                                <div className="flex flex-wrap gap-2 w-full">
                                                    <Button
                                                        className="flex-1 min-w-0 bg-primary text-primary-foreground hover:bg-primary/90 px-2"
                                                        disabled={isAdminCrafting === `${recipe.id}-craft` || !canCraft}
                                                        onClick={() => handleAdminCraftSubmit(recipe, 'craft')}
                                                    >
                                                        {isAdminCrafting === `${recipe.id}-craft` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4 shrink-0" />}
                                                        <span className="truncate text-xs">Craft {(craftQuantity[recipe.id] || 1) * recipe.outputQuantity}x</span>
                                                    </Button>

                                                    {recipe.reversible && (
                                                        <Button
                                                            variant="outline"
                                                            className="flex-[0.5] min-w-0 border-primary/20 hover:bg-primary/5 text-primary px-2"
                                                            disabled={isAdminCrafting === `${recipe.id}-reverse` || (item.quantity - getAssignedQty(item)) < recipe.outputQuantity}
                                                            onClick={() => handleAdminCraftSubmit(recipe, 'reverse')}
                                                            title="Break down crafted items to recover ingredients"
                                                        >
                                                            {isAdminCrafting === `${recipe.id}-reverse` ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="truncate text-xs">Salvage {(craftQuantity[recipe.id] || 1) * recipe.outputQuantity}x</span>}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>

                                            {recipe.reversible && (item.quantity - getAssignedQty(item)) < recipe.outputQuantity && (
                                                <div className="text-[10px] text-muted-foreground text-center mt-1">
                                                    Need {recipe.outputQuantity} unassigned stock to salvage.
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}

                        {orphanRecipes.map(recipe => (
                            <Card key={recipe.id} className="bg-destructive/5 border-destructive flex flex-col">
                                <CardContent className="p-4 flex flex-col flex-1 pb-4">
                                    <div className="mb-4">
                                        <div className="font-semibold text-lg leading-tight text-destructive">Orphaned Recipe</div>
                                        <div className="text-sm font-medium mt-1">Output item was deleted.</div>
                                    </div>
                                    <div className="mt-auto flex gap-2 w-full pt-4">
                                        <Button variant="destructive" className="flex-1" onClick={() => handleDeleteRecipe(recipe.id)}>
                                            <Trash2 className="mr-2 h-4 w-4" /> Erase
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
