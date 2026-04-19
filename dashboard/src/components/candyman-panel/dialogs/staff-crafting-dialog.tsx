import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, RefreshCw } from 'lucide-react';
import { CraftingRecipe } from '@/types/candyland';
import { DecryptedItem } from '@/components/candyman-panel/decrypt-inventory';

interface StaffCraftingDialogProps {
    items: DecryptedItem[];
    recipes: CraftingRecipe[];
    isCrafting: string | null;
    onCraft: (recipe: CraftingRecipe, quantity: number) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function StaffCraftingDialog({ items, recipes, isCrafting, onCraft, open, onOpenChange }: StaffCraftingDialogProps) {
    const [craftQuantity, setCraftQuantity] = useState<Record<string, number>>({});

    const availableRecipes = recipes.filter(r => {
        let isAvailable = true;
        r.ingredients.forEach(ing => {
            // First try strict ID match, then fallback to name match (helps with E2E mapping mismatches)
            const stockItem = items.find(i => i.id === ing.itemId)
                || items.find(i => i.name && ing.ingredientName && i.name.toLowerCase() === ing.ingredientName.toLowerCase());
                
            const reqQty = parseFloat(ing.quantity.toString());
            const hasQty = stockItem ? parseFloat(stockItem.qty.toString()) : 0;
            
            if (!stockItem || hasQty < reqQty) {
                if (open) { // Only log when dialog is open so we don't spam the render loop
                    console.log(`[CraftingDebug] Recipe '${r.outputItemName || r.id}' missing ingredient: ${ing.ingredientName || ing.itemId}. Required: ${reqQty}, Have: ${hasQty} (Found in stock: ${!!stockItem})`);
                }
                isAvailable = false;
            }
        });
        
        if (open && isAvailable) {
            console.log(`[CraftingDebug] Recipe '${r.outputItemName || r.id}' IS AVAILABLE!`);
        }
        
        return isAvailable;
    });

    useEffect(() => {
        if (open) {
            console.log(`[CraftingDebug] Dialog opened. Total items: ${items.length}, Total recipes: ${recipes.length}, Available recipes: ${availableRecipes.length}`);
            if (recipes.length > 0 && availableRecipes.length === 0) {
                console.log(`[CraftingDebug] Expected IDs in inventory:`, items.map(i => ({ id: i.id, name: i.name })));
                console.log(`[CraftingDebug] IDs required by recipes:`, recipes.map(r => r.ingredients.map(ing => ({ id: ing.itemId, name: ing.ingredientName }))).flat());
            }
        }
    }, [open, items.length, recipes.length, availableRecipes.length]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary text-xl">
                        <RefreshCw className="h-5 w-5" />
                        Mesa de Crafteo
                    </DialogTitle>
                    <DialogDescription>
                        Fabrica nuevos artículos combinando tu inventario actual.
                    </DialogDescription>
                </DialogHeader>

                {availableRecipes.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                        No hay recetas disponibles o no tienes suficientes ingredientes.
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 mt-4">
                        {availableRecipes.map(recipe => {
                            const outItem = items.find(i => i.id === recipe.outputItemId) || { name: recipe.outputItemName || 'Unknown Item', unit: recipe.outputItemUnit || 'pcs' };

                            let missingIngredients = false;
                            let maxCraftable = Infinity;
                            for (const ing of recipe.ingredients) {
                                const stockItem = items.find(i => i.id === ing.itemId) || items.find(i => i.name && ing.ingredientName && i.name.toLowerCase() === ing.ingredientName.toLowerCase());
                                if (!stockItem) {
                                    missingIngredients = true;
                                    maxCraftable = 0;
                                    break;
                                }
                                
                                const stockQty = parseFloat(stockItem.qty.toString());
                                const reqQty = parseFloat(ing.quantity.toString());
                                
                                const possibleFromIng = Math.floor(stockQty / reqQty);
                                if (possibleFromIng < maxCraftable) maxCraftable = possibleFromIng;
                                
                                if (stockQty < reqQty) {
                                    missingIngredients = true;
                                }
                            }
                            if (maxCraftable === Infinity) maxCraftable = 0;

                            return (
                                <Card key={recipe.id} className={`bg-background shadow-sm border-primary/10 ${missingIngredients ? 'opacity-80' : ''} flex flex-col`}>
                                    <CardContent className="p-4 flex flex-col justify-between h-full flex-1">
                                        <div>
                                            <div className="font-semibold text-lg drop-shadow-[0_0_1px_rgba(0,0,0,0.8)]">{outItem.name}</div>
                                            <div className="text-sm text-muted-foreground mt-1 mb-3">
                                                Produce: <strong className="text-primary">{recipe.outputQuantity} {outItem.unit}</strong>
                                            </div>
                                            <div className="text-xs space-y-1 mb-4 border-l-2 border-primary/30 pl-2">
                                                <div className="font-medium text-muted-foreground mb-1">Requiere:</div>
                                                {recipe.ingredients.map((ing: any, i: number) => {
                                                    const ingItem = items.find(it => it.id === ing.itemId) || items.find(it => it.name && ing.ingredientName && it.name.toLowerCase() === ing.ingredientName.toLowerCase());
                                                    const stockQty = ingItem ? parseFloat(ingItem.qty.toString()) : 0;
                                                    const reqQty = parseFloat(ing.quantity.toString());
                                                    const isMissing = stockQty < reqQty;
                                                    return (
                                                        <div key={i} className={isMissing ? 'text-destructive' : ''}>
                                                            <strong className={isMissing ? 'text-destructive font-bold' : 'text-foreground'}>{ing.quantity}</strong> × {ingItem?.name || ing.ingredientName || `Item ${ing.itemId.substring(0, 6)}...`}
                                                            {isMissing && <span className="ml-1 text-[10px] opacity-80">(tienes {stockQty})</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="mt-auto space-y-2">
                                            {!missingIngredients && (
                                                <div className="flex items-center gap-2 w-full mt-2 border-t pt-2">
                                                    <span className="text-sm text-foreground/50 mr-1">Cant:</span>
                                                    <input 
                                                        type="number" 
                                                        min="1" 
                                                        max={maxCraftable}
                                                        value={craftQuantity[recipe.id] || 1} 
                                                        onChange={(e) => setCraftQuantity({...craftQuantity, [recipe.id]: Math.min(maxCraftable, Math.max(1, parseInt(e.target.value) || 1))})} 
                                                        className="w-16 h-8 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                                                    />
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="h-8 py-0 shrink-0" 
                                                        onClick={() => setCraftQuantity({...craftQuantity, [recipe.id]: maxCraftable})}
                                                    >
                                                        Max ({maxCraftable})
                                                    </Button>
                                                </div>
                                            )}
                                            <Button
                                                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                                                disabled={isCrafting === recipe.id || missingIngredients}
                                                onClick={() => onCraft(recipe, craftQuantity[recipe.id] || 1)}
                                            >
                                                {isCrafting === recipe.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                {missingIngredients ? 'Faltan Ingredientes' : `Fabricar (${(craftQuantity[recipe.id] || 1) * recipe.outputQuantity} ${outItem.unit})`}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
