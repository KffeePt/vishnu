"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Loader2, Trash2, ArrowRightLeft, Target, Settings, Info, ShoppingCart, Clock, CheckCircle2, ChevronDown, ChevronUp, History, Database, ArrowRight, UserCog, Mail, Key as KeyIcon, Package, Search, Plus, X, Flame, Beaker, Users, Check, RefreshCw } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { UserAuth } from "@/context/auth-context";
import { getAdminHeaders } from '@/lib/client-auth';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { convertQty, SupportedUnit } from '@/lib/unit-conversion';
import { Badge } from "@/components/ui/badge";
import { formatQty } from '@/lib/format-qty';
import { DeleteItemDialog } from './delete-item-dialog';
import { UpdateWhitelistDialog } from './update-whitelist-dialog';

interface ExistingItem {
    id: string;
    name: string;
    category: string;
    quantity: number;
    unit: string;
    unitValue: number;
    originalCost: number;
    craftable?: boolean;
    costOverride?: number;
    promoPricing?: { tiers: { qty: number; price: number }[] };
}

export function AddItemDialog({ sessionToken }: { sessionToken?: string }) {
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const [newItem, setNewItem] = useState({
        name: '',
        category: 'equipment',
        quantity: '',
        unit: 'pcs',
        unitValue: '',
        originalCost: '',
        costOverride: '',
        flexiblePrice: false,
        flexibilityPercent: '',
        maxPriceCap: '',
        craftable: false,
        promoPricing: { tiers: [] as { qty: number; price: number }[] },
        pricingMode: 'batch',
        fractionQty: '1',
        fractionUnit: 'grams',
        fractionValue: '',
        fractionCost: ''
    });

    // Append To Existing State
    const [mode, setMode] = useState<'new' | 'append' | 'recipe'>('new');
    const [existingItems, setExistingItems] = useState<ExistingItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItem, setSelectedItem] = useState<ExistingItem | null>(null);
    const [appendQuantity, setAppendQuantity] = useState('');
    const [burnQuantity, setBurnQuantity] = useState('');
    const [isBurning, setIsBurning] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showWhitelistDialog, setShowWhitelistDialog] = useState(false);
    const [categories, setCategories] = useState<string[]>(['equipment', 'candy', 'supplies']);
    const [customCategory, setCustomCategory] = useState('');
    const [recipes, setRecipes] = useState<any[]>([]);
    const [recipeIngredients, setRecipeIngredients] = useState<{ itemId: string, quantity: string, salvageQuantity?: string }[]>([]);
    const [recipeOutputQty, setRecipeOutputQty] = useState('1');
    const [recipeReversible, setRecipeReversible] = useState(true);
    const [visibility, setVisibility] = useState<'public' | 'private'>('public');
    const [allowedStaffIds, setAllowedStaffIds] = useState<string[]>([]);
    const [staffList, setStaffList] = useState<{ id: string, name: string, role: string }[]>([]);
    const [staffSearchQuery, setStaffSearchQuery] = useState('');

    const [craftQuantity, setCraftQuantity] = useState('');
    const [isCraftingFromRestock, setIsCraftingFromRestock] = useState(false);
    const [uncraftLosses, setUncraftLosses] = useState<Record<string, string>>({});

    const { getIDToken } = UserAuth();
    const { toast } = useToast();

    useEffect(() => {
        const handleOpenAddForm = () => {
            setIsAddOpen(true);
            fetchExistingItems();
        };
        window.addEventListener('open-add-item-dialog', handleOpenAddForm);
        return () => window.removeEventListener('open-add-item-dialog', handleOpenAddForm);
    }, []);

    const fetchExistingItems = async () => {
        try {
            const token = await getIDToken();
            if (!token) return;
            const res = await fetch('/api/admin/inventory', {
                headers: {
                    ...getAdminHeaders(token),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                }
            });

            // Also fetch dynamic categories
            fetch('/api/admin/inventory/categories', {
                headers: {
                    ...getAdminHeaders(token),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                }
            })
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) setCategories(data);
                })
                .catch(e => console.error("Could not fetch categories", e));

            fetch('/api/admin/recipes', {
                headers: {
                    ...getAdminHeaders(token),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                }
            })
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) setRecipes(data);
                })
                .catch(e => console.error("Could not fetch recipes", e));

            // Fetch staff list for recipe whitelisting
            fetch('/api/admin/staff', {
                headers: {
                    ...getAdminHeaders(token),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                }
            })
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setStaffList(data.map((s: any) => ({ id: s.id, name: s.name, role: s.role })));
                    }
                })
                .catch(e => console.error("Could not fetch staff list", e));

            if (res.ok) {
                const data = await res.json();
                // Deduplicate items based on strict identity type checking
                const uniqueMap = new Map();
                data.forEach((item: ExistingItem) => {
                    const key = `${item.name}-${item.category}-${item.unit}-${item.unitValue}-${item.originalCost}-${item.craftable}-${item.costOverride}`;
                    // If duplicates exist, we keep the first one found as representative base
                    if (!uniqueMap.has(key)) {
                        uniqueMap.set(key, item);
                    }
                });
                setExistingItems(Array.from(uniqueMap.values()));
            }
        } catch (e) { console.error("Could not fetch items for appending", e); }
    }

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const token = await getIDToken();
            if (!token) throw new Error("Not authenticated");
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }

            let payload = {};
            if (mode === 'append' && selectedItem) {
                payload = { appendToItemId: selectedItem.id, quantity: parseFloat(appendQuantity) };
            } else {
                let finalUnitValue = parseFloat(newItem.unitValue) || 0;
                let finalOriginalCost = parseFloat(newItem.originalCost) || 0;
                let finalCostOverride = newItem.costOverride ? parseFloat(newItem.costOverride) : undefined;

                if (newItem.unit !== 'pcs' && newItem.pricingMode === 'fraction' && newItem.category !== 'equipment') {
                    const batchTotalGrams = convertQty(parseFloat(newItem.quantity) || 0, newItem.unit as SupportedUnit, 'grams');
                    const fractionTotalGrams = convertQty(parseFloat(newItem.fractionQty) || 1, newItem.fractionUnit as SupportedUnit, 'grams');
                    
                    if (fractionTotalGrams > 0) {
                        const numFractions = batchTotalGrams / fractionTotalGrams;
                        finalUnitValue = (parseFloat(newItem.fractionValue) || 0) * numFractions;
                        if (newItem.craftable) {
                            if (newItem.fractionCost) {
                                finalCostOverride = (parseFloat(newItem.fractionCost) || 0) * numFractions;
                            }
                        } else {
                            finalOriginalCost = (parseFloat(newItem.fractionCost) || 0) * numFractions;
                        }
                    }
                }

                payload = {
                    name: newItem.name,
                    category: newItem.category,
                    quantity: parseFloat(newItem.quantity) || 0,
                    unit: newItem.unit,
                    unitValue: finalUnitValue,
                    originalCost: finalOriginalCost,
                    costOverride: finalCostOverride,
                    flexiblePrice: newItem.flexiblePrice,
                    flexibilityPercent: newItem.flexiblePrice ? (parseFloat(newItem.flexibilityPercent) || 0) : undefined,
                    maxPriceCap: (newItem.flexiblePrice && parseFloat(newItem.maxPriceCap) > 0) ? parseFloat(newItem.maxPriceCap) : undefined,
                    craftable: newItem.craftable,
                };
            }

            const res = await fetch('/api/admin/inventory', {
                method: 'POST',
                headers: {
                    ...getAdminHeaders(token),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const err = await res.json();
                const errorMessage = typeof err.error === 'string' ? err.error : JSON.stringify(err.error);
                throw new Error(errorMessage || 'Failed to add item');
            }

            const savedItem = await res.json();

            // Dual-save custom category if it's new
            if (customCategory && mode === 'new') {
                const newCatList = [...new Set([...categories, customCategory.toLowerCase()])];
                try {
                    // We need to fetch Admin Keys to encrypt the categories doc
                    const adminKeyRes = await fetch('/api/staff/admin-key', {
                        headers: {
                            ...getAdminHeaders(token),
                            ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                        }
                    });
                    const adminKeyData = await adminKeyRes.json();

                    if (adminKeyData.publicKey) {
                        const { envelopeEncrypt } = await import('@/lib/crypto-client');
                        // Envelope encrypt with admin key as both sender and receiver
                        const encryptedPayload = await envelopeEncrypt(
                            JSON.stringify({ categories: newCatList }),
                            adminKeyData.publicKey,
                            adminKeyData.publicKey
                        );

                        await fetch('/api/admin/inventory/categories', {
                            method: 'POST',
                            headers: {
                                ...getAdminHeaders(token),
                                ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                            },
                            body: JSON.stringify(encryptedPayload)
                        });
                        setCategories(newCatList);
                    }
                } catch (e) {
                    console.error("Failed to save custom category", e);
                }
            }

            toast({ title: 'Success', description: mode === 'append' ? 'Quantity appended successfully' : 'Item added successfully' });

            fetchExistingItems(); // update existing items list immediately

            if (mode === 'new' && newItem.craftable) {
                setNewItem({ name: '', category: 'equipment', quantity: '', unit: 'pcs', unitValue: '', originalCost: '', costOverride: '', flexiblePrice: false, flexibilityPercent: '', maxPriceCap: '', craftable: false, promoPricing: { tiers: [] }, pricingMode: 'batch', fractionQty: '1', fractionUnit: 'grams', fractionValue: '', fractionCost: '' });
                setCustomCategory('');
                setSelectedItem(savedItem); // set this so recipes tab knows which one is selected
                setSearchQuery(savedItem.name);
                setMode('recipe');
            } else {
                setNewItem({ name: '', category: 'equipment', quantity: '', unit: 'pcs', unitValue: '', originalCost: '', costOverride: '', flexiblePrice: false, flexibilityPercent: '', maxPriceCap: '', craftable: false, promoPricing: { tiers: [] }, pricingMode: 'batch', fractionQty: '1', fractionUnit: 'grams', fractionValue: '', fractionCost: '' });
                setAppendQuantity('');
                setCustomCategory('');
                setSelectedItem(null);
                setSearchQuery('');

                // Auto-focus the name input for the next item
                if (mode === 'new') {
                    setTimeout(() => nameInputRef.current?.focus(), 0);
                }
            }

            // Dispatch event to force refresh of inventory lists
            window.dispatchEvent(new CustomEvent('inventory-updated'));
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBurnItem = async () => {
        if (!selectedItem || !burnQuantity) return;
        setIsBurning(true);
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        try {
            const token = await getIDToken();
            const res = await fetch(`/api/admin/inventory/${selectedItem.id}`, {
                method: 'PUT',
                headers: {
                    ...getAdminHeaders(token),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                },
                body: JSON.stringify({ action: 'burn_item', quantity: parseFloat(burnQuantity) })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to burn item');
            }
            toast({ title: 'Success', description: `Burned ${burnQuantity} ${selectedItem.unit} of ${selectedItem.name}` });
            setBurnQuantity('');
            fetchExistingItems(); // update list
            window.dispatchEvent(new CustomEvent('inventory-updated'));
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsBurning(false);
        }
    };

    const handleDeleteRecipe = async (recipeId: string) => {
        if (!confirm('Are you sure you want to delete this recipe?')) return;
        setIsSubmitting(true);
        try {
            const token = await getIDToken();
            const res = await fetch(`/api/admin/recipes?id=${recipeId}`, {
                method: 'DELETE',
                headers: {
                    ...getAdminHeaders(token!),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                }
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to delete recipe');
            }
            toast({ title: 'Success', description: 'Recipe deleted successfully' });

            fetchExistingItems();
            window.dispatchEvent(new CustomEvent('inventory-updated'));
            setSelectedItem(null);

        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveRecipe = async () => {
        if (!selectedItem || recipeIngredients.length === 0) return;
        setIsSubmitting(true);
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        try {
            const token = await getIDToken();
            const existingRecipe = recipes.find(r => r.outputItemId === selectedItem.id);
            const payload = {
                id: existingRecipe ? existingRecipe.id : undefined,
                outputItemId: selectedItem.id,
                outputItemName: selectedItem.name,
                outputItemUnit: selectedItem.unit,
                outputQuantity: parseFloat(recipeOutputQty) || 1,
                reversible: recipeReversible,
                visibility,
                allowedStaffIds: visibility === 'private' ? allowedStaffIds : undefined,
                ingredients: recipeIngredients.map(i => {
                    const reqItem = existingItems.find(it => it.id === i.itemId);
                    return {
                        itemId: i.itemId,
                        ingredientName: reqItem?.name || 'Unknown',
                        ingredientUnit: reqItem?.unit || 'pcs',
                        quantity: parseFloat(i.quantity) || 1,
                        salvageQuantity: recipeReversible ? (parseFloat(i.salvageQuantity || i.quantity) || 0) : undefined
                    };
                })
            };

            const res = await fetch('/api/admin/recipes', {
                method: 'POST',
                headers: {
                    ...getAdminHeaders(token!),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save recipe');
            }

            toast({ title: 'Success', description: 'Recipe saved successfully' });
            fetchExistingItems();
            window.dispatchEvent(new CustomEvent('inventory-updated'));

            // Return to item creation tab
            setSelectedItem(null);
            setSearchQuery('');
            setMode('new');
            setTimeout(() => nameInputRef.current?.focus(), 0);
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRestockCraftSubmit = async (recipe: any, action: 'craft' | 'reverse', quantityMultiplier: number) => {
        setIsCraftingFromRestock(true);
        try {
            const token = await getIDToken();
            if (!token) throw new Error("Fallo de autenticación");

            let mappedLosses: Record<string, number> | undefined = undefined;
            if (action === 'reverse' && Object.keys(uncraftLosses).length > 0) {
                mappedLosses = {};
                for (const [itemId, lossStr] of Object.entries(uncraftLosses)) {
                    const parsed = parseFloat(lossStr);
                    if (parsed > 0) {
                        mappedLosses[itemId] = parsed;
                    }
                }
                if (Object.keys(mappedLosses).length === 0) mappedLosses = undefined;
            }

            const payload = {
                recipeId: recipe.id,
                action: action,
                multiplier: quantityMultiplier,
                losses: mappedLosses
            };

            const invRes = await fetch(`/api/admin/inventory/craft`, {
                method: 'POST',
                headers: {
                    ...getAdminHeaders(token),
                    ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
                },
                body: JSON.stringify(payload)
            });

            if (!invRes.ok) {
                const err = await invRes.json();
                throw new Error(err.error || "Error al actualizar inventario");
            }

            toast({ title: 'Success', description: action === 'craft' ? `Crafted ${quantityMultiplier} batches.` : `Uncrafted ${quantityMultiplier} batches.` });
            setCraftQuantity('');
            setUncraftLosses({});
            fetchExistingItems();
            window.dispatchEvent(new CustomEvent('inventory-updated'));
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Error during crafting', variant: 'destructive' });
        } finally {
            setIsCraftingFromRestock(false);
        }
    };

    const handleIngredientAdd = () => {
        setRecipeIngredients([...recipeIngredients, { itemId: existingItems[0]?.id || '', quantity: '1', salvageQuantity: '1' }]);
    };

    const handleIngredientRemove = (index: number) => {
        setRecipeIngredients(recipeIngredients.filter((_, i) => i !== index));
    };

    const handleIngredientChange = (index: number, field: 'itemId' | 'quantity' | 'salvageQuantity', value: string) => {
        const newIngs = [...recipeIngredients];
        newIngs[index][field] = value;
        setRecipeIngredients(newIngs);
    };

    return (
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Items and Recipes</DialogTitle>
                </DialogHeader>
                <form onSubmit={mode === 'recipe' ? (e) => { e.preventDefault(); handleSaveRecipe(); } : handleAddItem} className="grid gap-4 py-4">
                    <Tabs value={mode} onValueChange={(v) => {
                        setMode(v as 'new' | 'append' | 'recipe');
                        setSelectedItem(null);
                        setSearchQuery('');
                    }} className="w-full mt-2">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="new" className="flex items-center justify-center gap-2">
                                <Package className="w-4 h-4" />
                                <span className="hidden sm:inline">Item Type</span>
                            </TabsTrigger>
                            <TabsTrigger value="append" className="flex items-center justify-center gap-2">
                                <Database className="w-4 h-4" />
                                <span className="hidden sm:inline">Add Quantity</span>
                            </TabsTrigger>
                            <TabsTrigger value="recipe" className="flex items-center justify-center gap-2">
                                <Beaker className="w-4 h-4" />
                                <span className="hidden sm:inline">Recipes</span>
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="append">
                            <div className="space-y-4 py-4">
                                <div className="flex gap-2 relative">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                        <Search className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <Input
                                        placeholder="Search inventory items to append to..."
                                        className="pl-9 w-full"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                <div className="border rounded-md max-h-[250px] overflow-y-auto w-full max-w-[450px]">
                                    {existingItems.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-muted-foreground">
                                            No existing types found. Use Create Item Type instead.
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1 p-2">
                                            {existingItems
                                                .filter(item =>
                                                    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                    item.category.toLowerCase().includes(searchQuery.toLowerCase())
                                                )
                                                .map(item => (
                                                    <div
                                                        key={`select-${item.id}`}
                                                        onClick={() => setSelectedItem(item)}
                                                        className={`p-2 rounded-md cursor-pointer border ${selectedItem?.id === item.id ? 'bg-primary/10 border-primary' : 'bg-background hover:bg-muted/50 border-transparent'}`}
                                                    >
                                                        <div className="font-medium text-sm">{item.name}</div>
                                                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                            <span>{item.category}</span>
                                                            <span className="font-mono">${item.unitValue.toFixed(2)} / {item.unit}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>

                                {selectedItem && (
                                    <div className="grid grid-cols-4 items-center gap-4 mt-4 bg-muted/30 p-4 rounded-lg">
                                        <div className="col-span-4 flex justify-between items-center mb-2">
                                            <div className="flex flex-col">
                                                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Base item</Label>
                                                <div className="text-base font-semibold text-primary">{selectedItem.name}</div>
                                                <div className="text-xs text-muted-foreground mt-0.5">Current Stock: {formatQty(selectedItem.quantity)} {selectedItem.unit}</div>
                                            </div>
                                            {selectedItem.craftable && recipes.some(r => r.outputItemId === selectedItem.id) && (
                                                <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5">Craftable Item</Badge>
                                            )}
                                        </div>

                                        {selectedItem.craftable && recipes.some(r => r.outputItemId === selectedItem.id) ? (
                                            (() => {
                                                const recipe = recipes.find(r => r.outputItemId === selectedItem.id);
                                                return (
                                                    <div className="col-span-4 space-y-5 border-t pt-4">
                                                        {/* Crafting Section */}
                                                        <div className="flex flex-col gap-4">
                                                            <div className="border rounded-xl p-4 bg-background">
                                                                <Label className="text-sm font-semibold mb-1 flex items-center gap-1.5 text-primary">
                                                                    <RefreshCw className="w-4 h-4" />
                                                                    Craft Batches
                                                                </Label>
                                                                <div className="text-xs text-muted-foreground mb-4">1 Batch = {recipe.outputQuantity} {selectedItem.unit}</div>

                                                                <div className="space-y-3">
                                                                    <div className="flex gap-2">
                                                                        <Input
                                                                            type="number"
                                                                            step="1"
                                                                            min="1"
                                                                            value={craftQuantity}
                                                                            onChange={e => setCraftQuantity(e.target.value)}
                                                                            placeholder="Qty to craft"
                                                                            className="flex-1"
                                                                        />
                                                                        <Button
                                                                            type="button"
                                                                            className="bg-primary hover:bg-primary/90 shrink-0 shadow-sm"
                                                                            disabled={isCraftingFromRestock || !craftQuantity || parseFloat(craftQuantity) <= 0}
                                                                            onClick={() => handleRestockCraftSubmit(recipe, 'craft', parseFloat(craftQuantity))}
                                                                        >
                                                                            {isCraftingFromRestock ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                                            Craft Item
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Uncrafting Section */}
                                                            {recipe.reversible && (
                                                                <div className="border border-amber-500/30 rounded-xl p-4 bg-amber-500/5">
                                                                    <Label className="text-sm font-semibold mb-1 flex items-center gap-1.5 text-amber-600 dark:text-amber-500">
                                                                        <Flame className="w-4 h-4" />
                                                                        Desmantelar (Salvage)
                                                                    </Label>
                                                                    <div className="text-xs text-amber-600/70 dark:text-amber-500/70 mb-4">Returns ingredients safely</div>

                                                                    <div className="space-y-3">
                                                                        <div className="flex gap-2">
                                                                            <Input
                                                                                type="number"
                                                                                step="1"
                                                                                min="1"
                                                                                value={burnQuantity}
                                                                                onChange={e => setBurnQuantity(e.target.value)}
                                                                                placeholder="Qty to salvage"
                                                                                className="flex-1 bg-background"
                                                                            />
                                                                            <Button
                                                                                type="button"
                                                                                className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 shadow-md"
                                                                                disabled={isCraftingFromRestock || !burnQuantity || parseFloat(burnQuantity) <= 0}
                                                                                onClick={() => handleRestockCraftSubmit(recipe, 'reverse', parseFloat(burnQuantity))}
                                                                            >
                                                                                {isCraftingFromRestock ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                                                Desmantelar
                                                                            </Button>
                                                                        </div>

                                                                        {/* Custom Losses UI */}
                                                                        <div className="bg-background/80 rounded-md border border-amber-500/20 p-3 mt-3">
                                                                            <Label className="text-[11px] font-semibold mb-1.5 block text-muted-foreground uppercase tracking-wider">Dynamic Losses (Optional)</Label>
                                                                            <div className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                                                                                Specify ingredients lost/destroyed per batch during salvage. Leave empty for perfect return.
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                {recipe.ingredients.map((ing: any) => {
                                                                                    const ingItem = existingItems.find(i => i.id === ing.itemId);
                                                                                    if (!ingItem) return null;
                                                                                    const maxReturn = ing.salvageQuantity !== undefined ? ing.salvageQuantity : ing.quantity;
                                                                                    return (
                                                                                        <div key={ing.itemId} className="flex items-center gap-2 min-w-0">
                                                                                            <div className="flex-1 text-xs truncate" title={ingItem.name}>{ingItem.name}</div>
                                                                                            <div className="text-[10px] text-muted-foreground w-16 text-right">Max: {maxReturn}</div>
                                                                                            <Input
                                                                                                type="number"
                                                                                                className="w-20 h-7 text-xs"
                                                                                                placeholder="Lost qty"
                                                                                                step={ingItem.unit === 'pcs' ? "1" : "0.01"}
                                                                                                min="0"
                                                                                                max={maxReturn}
                                                                                                value={uncraftLosses[ing.itemId] || ''}
                                                                                                onChange={e => setUncraftLosses({ ...uncraftLosses, [ing.itemId]: e.target.value })}
                                                                                            />
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })()
                                        ) : (
                                            <>
                                                <Label className="text-right mt-2">Add quantity</Label>
                                                <div className="col-span-3 flex gap-2 mt-2">
                                                    <Input
                                                        type="number"
                                                        step={selectedItem.unit === 'pcs' ? "1" : "0.1"}
                                                        value={appendQuantity}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            if (selectedItem.unit === 'pcs' && val.includes('.')) return;
                                                            setAppendQuantity(val);
                                                        }}
                                                        placeholder="0"
                                                    />
                                                    <div className="flex items-center px-3 bg-muted rounded-md text-sm whitespace-nowrap">
                                                        {selectedItem.unit}
                                                    </div>
                                                </div>

                                                <Label className="text-right text-destructive">Burn quantity</Label>
                                                <div className="col-span-3 flex gap-2">
                                                    <Input
                                                        type="number"
                                                        step={selectedItem.unit === 'pcs' ? "1" : "0.1"}
                                                        value={burnQuantity}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            if (selectedItem.unit === 'pcs' && val.includes('.')) return;
                                                            setBurnQuantity(val);
                                                        }}
                                                        placeholder="0"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        disabled={isBurning || !burnQuantity}
                                                        onClick={handleBurnItem}
                                                    >
                                                        {isBurning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                        <Flame className="w-4 h-4 mr-1" /> Burn
                                                    </Button>
                                                </div>
                                            </>
                                        )}

                                        <div className="col-span-4 border-t pt-4 mt-2">
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                className="w-full"
                                                onClick={() => setShowDeleteConfirm(true)}
                                            >
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                Delete Item Type Completely
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="recipe">
                            <div className="space-y-4 py-4">
                                <div className="flex gap-2 relative">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                        <Search className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <Input
                                        placeholder="Search craftable items to build recipes..."
                                        className="pl-9 w-full"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                <div className="border rounded-md max-h-[200px] overflow-y-auto w-full max-w-[450px]">
                                    {existingItems.filter(i => i.craftable).length === 0 ? (
                                        <div className="p-8 text-center flex flex-col items-center justify-center">
                                            <Flame className="h-8 w-8 text-muted-foreground/50 mb-3" />
                                            <p className="text-sm font-medium text-muted-foreground">No craftable items found</p>
                                            <p className="text-xs text-muted-foreground mt-1">Create a craftable item type first to build a recipe.</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1 p-2">
                                            {existingItems
                                                .filter(item => item.craftable && (item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.category.toLowerCase().includes(searchQuery.toLowerCase())))
                                                .map(item => (
                                                    <div
                                                        key={`select-recipe-${item.id}`}
                                                        onClick={() => {
                                                            setSelectedItem(item);
                                                            const existingRecipe = recipes.find(r => r.outputItemId === item.id);
                                                            if (existingRecipe) {
                                                                setRecipeOutputQty(existingRecipe.outputQuantity.toString());
                                                                setRecipeReversible(!!existingRecipe.reversible);
                                                                setVisibility(existingRecipe.visibility || 'public');
                                                                setAllowedStaffIds(existingRecipe.allowedStaffIds || []);
                                                                setRecipeIngredients(existingRecipe.ingredients.map((ing: any) => ({
                                                                    itemId: ing.itemId,
                                                                    quantity: ing.quantity.toString(),
                                                                    salvageQuantity: ing.salvageQuantity !== undefined ? ing.salvageQuantity.toString() : ing.quantity.toString()
                                                                })));
                                                            } else {
                                                                setRecipeOutputQty('1');
                                                                setRecipeReversible(true);
                                                                setVisibility('public');
                                                                setAllowedStaffIds([]);
                                                                setRecipeIngredients([]);
                                                            }
                                                        }}
                                                        className={`p-2 rounded-md cursor-pointer border transition-colors ${selectedItem?.id === item.id ? 'bg-primary/5 text-primary border-primary/30 shadow-sm' : 'bg-background hover:bg-muted/50 border-transparent'}`}
                                                    >
                                                        <div className="font-medium text-sm flex items-center gap-2">
                                                            {item.name}
                                                            {recipes.find(r => r.outputItemId === item.id) && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full border border-green-200">Recipe Exists</span>}
                                                        </div>
                                                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                            <span className="capitalize">{item.category}</span>
                                                            <span className="font-mono">${item.unitValue.toFixed(2)} / {item.unit}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>

                                {selectedItem && (
                                    <div className="mt-4 border rounded-xl overflow-hidden bg-card shadow-sm animation-in slide-in-from-top-2">
                                        <div className="bg-muted/50 p-4 border-b flex justify-between items-center">
                                            <div>
                                                <h4 className="font-semibold">{selectedItem.name}</h4>
                                                <p className="text-xs text-muted-foreground mt-0.5">Define ingredients required to craft this item</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {recipes.find(r => r.outputItemId === selectedItem.id) && (
                                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteRecipe(recipes.find(r => r.outputItemId === selectedItem.id).id)}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                <div className="bg-background shadow-sm border rounded-md px-3 py-1.5 flex items-center gap-2">
                                                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Output Qty:</Label>
                                                    <Input type="number" className="w-16 h-7 text-sm font-medium" value={recipeOutputQty} onChange={e => setRecipeOutputQty(e.target.value)} required />
                                                    <span className="text-xs text-muted-foreground font-medium">{selectedItem.unit}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-4 space-y-4 relative">
                                            {/* Flow lines decoration */}
                                            {recipeIngredients.length > 0 && (
                                                <div className="absolute left-6 top-10 bottom-16 w-px bg-border z-0 hidden sm:block"></div>
                                            )}

                                            <div className="space-y-3 z-10 relative">
                                                {recipeIngredients.map((ing, i) => {
                                                    const ingDetails = existingItems.find(item => item.id === ing.itemId);
                                                    const baseCost = ingDetails ? (ingDetails.costOverride ?? ingDetails.originalCost ?? 0) : 0;
                                                    const parsedQty = parseFloat(ing.quantity) || 0;

                                                    let subtotal = 0;
                                                    if (ingDetails && ingDetails.unit !== 'pcs') {
                                                        // Price is total for the batch. Find cost-per-gram first.
                                                        const totalGrams = convertQty(ingDetails.quantity, ingDetails.unit as SupportedUnit, 'grams');
                                                        const costPerGram = totalGrams > 0 ? baseCost / totalGrams : 0;
                                                        // Convert required ingredient qty to grams to find actual cost
                                                        const requiredGrams = convertQty(parsedQty, ingDetails.unit as SupportedUnit, 'grams');
                                                        subtotal = costPerGram * requiredGrams;
                                                    } else {
                                                        subtotal = baseCost * parsedQty;
                                                    }

                                                    return (
                                                        <div key={i} className="flex gap-3 items-start sm:items-center bg-background border rounded-lg p-3 shadow-sm relative ml-0 sm:ml-8 transition-all hover:border-primary/30">
                                                            {/* Connection dot */}
                                                            <div className="absolute -left-[37px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-muted-foreground border-2 border-background hidden sm:block"></div>
                                                            <div className="absolute -left-[30px] top-1/2 -translate-y-1/2 w-8 h-px bg-border hidden sm:block"></div>

                                                            <div className="flex-1 grid gap-2 sm:gap-4 sm:grid-cols-[1fr_auto] w-full">
                                                                <Select value={ing.itemId} onValueChange={(val) => handleIngredientChange(i, 'itemId', val)}>
                                                                    <SelectTrigger className="h-9"><SelectValue placeholder="Select ingredient..." /></SelectTrigger>
                                                                    <SelectContent>
                                                                        {existingItems
                                                                            .filter(item =>
                                                                                // Prevent self-reference
                                                                                item.id !== selectedItem.id &&
                                                                                // Prevent duplicates (unless it's the currently selected one for this row)
                                                                                (!recipeIngredients.some(ri => ri.itemId === item.id) || item.id === ing.itemId)
                                                                            )
                                                                            .map(item => (
                                                                                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                                                                            ))}
                                                                    </SelectContent>
                                                                </Select>

                                                                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 mt-2 sm:mt-0">
                                                                    <Input type="number" step="0.01" className="w-16 sm:w-20 h-9 font-medium" placeholder="Qty" value={ing.quantity} onChange={e => handleIngredientChange(i, 'quantity', e.target.value)} required />
                                                                    <span className="text-xs text-muted-foreground w-10 truncate">{ingDetails?.unit || ''}</span>

                                                                    <div className="flex items-center justify-end w-auto sm:w-[80px] ml-auto sm:ml-0">
                                                                        <span className="text-xs font-mono font-medium text-muted-foreground">
                                                                            ${subtotal.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0" onClick={() => handleIngredientRemove(i)}>
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </div>

                                                                {/* Removed Salvage Return inputs as per user request to let refunds handle it. */}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="flex flex-col gap-2 mt-2 pt-2 border-t sm:border-t-0 sm:mt-0 sm:pt-0">
                                                <div className="flex justify-between items-center sm:ml-8">
                                                    <Button type="button" variant="outline" size="sm" className="bg-background border-dashed hover:border-primary hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-colors" onClick={handleIngredientAdd}>
                                                        <Plus className="w-3 h-3 mr-1" /> Add Ingredient
                                                    </Button>

                                                    {recipeIngredients.length > 0 && (
                                                        <div className="flex flex-col gap-1 items-end">
                                                            <div className="flex items-center gap-3 bg-muted/40 px-3 py-1.5 rounded-md border text-muted-foreground w-full justify-between">
                                                                <span className="text-xs font-medium uppercase tracking-wider">Total Batch Cost</span>
                                                                <span className="text-sm font-bold font-mono">
                                                                    ${recipeIngredients.reduce((total, ing) => {
                                                                        const it = existingItems.find(x => x.id === ing.itemId);
                                                                        if (!it) return total;
                                                                        const baseCost = it.costOverride ?? it.originalCost ?? 0;
                                                                        const parsedQty = parseFloat(ing.quantity) || 0;
                                                                        if (it.unit !== 'pcs') {
                                                                            const totalGrams = convertQty(it.quantity, it.unit as SupportedUnit, 'grams');
                                                                            const costPerGram = totalGrams > 0 ? baseCost / totalGrams : 0;
                                                                            const requiredGrams = convertQty(parsedQty, it.unit as SupportedUnit, 'grams');
                                                                            return total + (costPerGram * requiredGrams);
                                                                        }
                                                                        return total + (baseCost * parsedQty);
                                                                    }, 0).toFixed(2)}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-3 bg-primary/10 px-3 py-1.5 rounded-md border border-primary/20 text-primary w-full justify-between shadow-sm">
                                                                <span className="text-xs font-bold uppercase tracking-wider">Est. Cost Per Unit</span>
                                                                <span className="text-sm font-black font-mono">
                                                                    ${(recipeIngredients.reduce((total, ing) => {
                                                                        const it = existingItems.find(x => x.id === ing.itemId);
                                                                        if (!it) return total;
                                                                        const baseCost = it.costOverride ?? it.originalCost ?? 0;
                                                                        const parsedQty = parseFloat(ing.quantity) || 0;
                                                                        if (it.unit !== 'pcs') {
                                                                            const totalGrams = convertQty(it.quantity, it.unit as SupportedUnit, 'grams');
                                                                            const costPerGram = totalGrams > 0 ? baseCost / totalGrams : 0;
                                                                            const requiredGrams = convertQty(parsedQty, it.unit as SupportedUnit, 'grams');
                                                                            return total + (costPerGram * requiredGrams);
                                                                        }
                                                                        return total + (baseCost * parsedQty);
                                                                    }, 0) / (parseFloat(recipeOutputQty) || 1)).toFixed(2)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {recipeIngredients.length > 0 && (
                                                    <div className="sm:ml-8 mt-4 space-y-4 pt-4 border-t border-border/50">
                                                        <div className="flex items-center gap-3 bg-card border rounded-md p-3 shadow-sm">
                                                            <Switch checked={recipeReversible} onCheckedChange={setRecipeReversible} id="reversible-toggle" />
                                                            <div className="flex flex-col">
                                                                <Label htmlFor="reversible-toggle" className="text-sm font-medium cursor-pointer">Reversible Crafting (Salvage)</Label>
                                                                <span className="text-xs text-muted-foreground">Allows breaking down crafted item to recover ingredients.</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-3 bg-card border rounded-md p-3 shadow-sm">
                                                            <div className="flex-1">
                                                                <Label className="text-sm font-medium">Recipe Visibility</Label>
                                                                <p className="text-xs text-muted-foreground mt-0.5">Determine who can see and craft this recipe.</p>
                                                            </div>
                                                            <div className="flex bg-muted p-1 rounded-md">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setVisibility('public')}
                                                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${visibility === 'public' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                                                >
                                                                    Public
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setVisibility('private')}
                                                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors flex items-center gap-1.5 ${visibility === 'private' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                                                >
                                                                    <Users className="w-3 h-3" /> Private
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {visibility === 'private' && (
                                                            <div className="bg-card border rounded-md p-4 shadow-sm animate-in fade-in slide-in-from-top-1">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div>
                                                                        <Label className="text-sm font-medium block">Allowed Staff Members</Label>
                                                                        <p className="text-xs text-muted-foreground mt-0.5">{allowedStaffIds.length} staff selected.</p>
                                                                    </div>
                                                                    {recipes.find(r => r.outputItemId === selectedItem.id) && (
                                                                        <Button type="button" variant="outline" size="sm" onClick={() => setShowWhitelistDialog(true)} className="h-8 text-xs shrink-0">
                                                                            <Users className="w-3 h-3 mr-1" />
                                                                            Manage Access
                                                                        </Button>
                                                                    )}
                                                                </div>

                                                                {!recipes.find(r => r.outputItemId === selectedItem.id) && (
                                                                    <>
                                                                        <Input
                                                                            placeholder="Search staff by name or role..."
                                                                            value={staffSearchQuery}
                                                                            onChange={(e) => setStaffSearchQuery(e.target.value)}
                                                                            className="h-8 text-xs mb-3"
                                                                        />
                                                                        <div className="max-h-40 overflow-y-auto pr-2 space-y-1.5">
                                                                            {staffList.filter(s => s.name.toLowerCase().includes(staffSearchQuery.toLowerCase()) || s.role.toLowerCase().includes(staffSearchQuery.toLowerCase())).map(staff => {
                                                                                const isSelected = allowedStaffIds.includes(staff.id);
                                                                                return (
                                                                                    <div
                                                                                        key={staff.id}
                                                                                        onClick={() => {
                                                                                            setAllowedStaffIds(prev => isSelected ? prev.filter(id => id !== staff.id) : [...prev, staff.id]);
                                                                                        }}
                                                                                        className={`flex items-center justify-between p-2 rounded-md border text-sm cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800' : 'bg-background hover:bg-muted/50'}`}
                                                                                    >
                                                                                        <div>
                                                                                            <div className="font-medium">{staff.name}</div>
                                                                                            <div className="text-xs text-muted-foreground capitalize">{staff.role}</div>
                                                                                        </div>
                                                                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-muted-foreground/30'}`}>
                                                                                            {isSelected && <Check className="w-3 h-3 text-white stroke-[3px]" />}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                            {staffList.length === 0 && (
                                                                                <div className="text-center text-xs text-muted-foreground py-4">No staff members found.</div>
                                                                            )}
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Margin Warning */}
                                                {recipeIngredients.length > 0 && (
                                                    (() => {
                                                        const totalCost = recipeIngredients.reduce((total, ing) => {
                                                            const it = existingItems.find(x => x.id === ing.itemId);
                                                            if (!it) return total;
                                                            const baseCost = it.costOverride ?? it.originalCost ?? 0;
                                                            const parsedQty = parseFloat(ing.quantity) || 0;
                                                            if (it.unit !== 'pcs') {
                                                                const totalGrams = convertQty(it.quantity, it.unit as SupportedUnit, 'grams');
                                                                const costPerGram = totalGrams > 0 ? baseCost / totalGrams : 0;
                                                                const requiredGrams = convertQty(parsedQty, it.unit as SupportedUnit, 'grams');
                                                                return total + (costPerGram * requiredGrams);
                                                            }
                                                            return total + (baseCost * parsedQty);
                                                        }, 0);
                                                        const sellPrice = selectedItem.unitValue * (parseFloat(recipeOutputQty) || 1);

                                                        if (totalCost > sellPrice) {
                                                            return (
                                                                <div className="sm:ml-8 mt-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-start gap-2 text-amber-600 dark:text-amber-500">
                                                                    <Flame className="w-4 h-4 mt-0.5 shrink-0" />
                                                                    <div className="text-xs leading-relaxed">
                                                                        <strong>Margin Warning:</strong> The estimated cost of these ingredients (${totalCost.toFixed(2)}) is higher than the output value of the crafted items (${sellPrice.toFixed(2)}). You are crafting at a loss.
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="new">
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">Name</Label>
                                    <Input
                                        ref={nameInputRef}
                                        className="col-span-3 w-full"
                                        value={newItem.name}
                                        onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                                        placeholder="e.g. Cash Register 1"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">Category</Label>
                                    <div className="col-span-3 space-y-2">
                                        <Select value={categories.includes(newItem.category) ? newItem.category : '__custom__'} onValueChange={v => {
                                            if (v === '__custom__') return;
                                            setNewItem({ ...newItem, category: v });
                                            setCustomCategory('');
                                        }}>
                                            <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                                            <SelectContent>
                                                {categories.map(c => (
                                                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                                                ))}
                                                <SelectItem value="__custom__">+ New Category</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {(!categories.includes(newItem.category) || customCategory || newItem.category === '') && (
                                            <Input
                                                placeholder="Enter new category name..."
                                                value={customCategory || newItem.category}
                                                onChange={e => {
                                                    setCustomCategory(e.target.value);
                                                    setNewItem({ ...newItem, category: e.target.value.toLowerCase() });
                                                }}
                                                required
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">Craftable Item</Label>
                                    <div className="col-span-3 flex items-center gap-4">
                                        <Switch
                                            checked={newItem.craftable}
                                            onCheckedChange={c => setNewItem({ ...newItem, craftable: c as boolean })}
                                        />
                                        <span className="text-sm text-muted-foreground">Item is crafted from ingredients</span>
                                    </div>
                                </div>
                                {newItem.category !== 'equipment' && (
                                    <>
                                        {newItem.unit !== 'pcs' && (
                                            <div className="grid grid-cols-4 items-center gap-4">
                                                <Label className="text-right">Pricing Mode</Label>
                                                <div className="col-span-3 flex items-center gap-4">
                                                    <Switch
                                                        checked={newItem.pricingMode === 'fraction'}
                                                        onCheckedChange={c => setNewItem({ ...newItem, pricingMode: c ? 'fraction' : 'batch' })}
                                                    />
                                                    <span className="text-sm text-muted-foreground">Define value/cost per fraction of batch</span>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {newItem.unit !== 'pcs' && newItem.pricingMode === 'fraction' ? (
                                            <>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label className="text-right">Per Fraction</Label>
                                                    <div className="col-span-3 flex gap-2">
                                                        <Input type="number" step="0.1" value={newItem.fractionQty} onChange={e => setNewItem({ ...newItem, fractionQty: e.target.value })} placeholder="Qty" className="w-[100px]" />
                                                        <Select value={newItem.fractionUnit} onValueChange={v => setNewItem({ ...newItem, fractionUnit: v })}>
                                                            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="grams">grams</SelectItem>
                                                                <SelectItem value="kg">kg</SelectItem>
                                                                <SelectItem value="oz">oz</SelectItem>
                                                                <SelectItem value="mg">mg</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label className="text-right">Value per {newItem.fractionQty} {newItem.fractionUnit} ($)</Label>
                                                    <div className="col-span-3 w-full">
                                                        <Input type="number" step="0.01" value={newItem.fractionValue} onChange={e => setNewItem({ ...newItem, fractionValue: e.target.value })} placeholder="Sell price per fraction" required={!newItem.craftable} />
                                                        {newItem.quantity && newItem.fractionValue && (
                                                            <span className="text-xs text-muted-foreground mt-1 block">
                                                                Total batch value preview: ${(() => {
                                                                    const bG = convertQty(parseFloat(newItem.quantity) || 0, newItem.unit as SupportedUnit, 'grams');
                                                                    const fG = convertQty(parseFloat(newItem.fractionQty) || 1, newItem.fractionUnit as SupportedUnit, 'grams');
                                                                    return fG > 0 ? ((parseFloat(newItem.fractionValue) || 0) * (bG / fG)).toFixed(2) : '0.00';
                                                                })()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="grid grid-cols-4 items-center gap-4">
                                                <Label className="text-right">Value ($)</Label>
                                                <Input className="col-span-3 w-full" type="number" step="0.01" value={newItem.unitValue} onChange={e => setNewItem({ ...newItem, unitValue: e.target.value })} placeholder={newItem.unit === 'pcs' ? "Sell price per unit" : "Total sell value for batch"} required={!newItem.craftable} />
                                            </div>
                                        )}
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label className="text-right">Flexible Price</Label>
                                            <div className="col-span-3 flex items-center gap-4">
                                                <Switch
                                                    checked={newItem.flexiblePrice}
                                                    onCheckedChange={c => setNewItem({ ...newItem, flexiblePrice: c as boolean })}
                                                />
                                                <span className="text-sm text-muted-foreground">Allow price variation at sale</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                                {newItem.category !== 'equipment' && newItem.flexiblePrice && (
                                    <div className="grid grid-cols-4 items-center gap-4 animation-in slide-in-from-top-2">
                                        <Label className="text-right">Flexibility (%)</Label>
                                        <div className="col-span-3 space-y-2">
                                            <div className="flex gap-2">
                                                <Input
                                                    className="w-24"
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="1"
                                                    value={newItem.flexibilityPercent}
                                                    onChange={e => setNewItem({ ...newItem, flexibilityPercent: e.target.value })}
                                                    placeholder="20"
                                                    required={newItem.flexiblePrice}
                                                />
                                                <div className="flex items-center text-sm font-medium">
                                                    %
                                                </div>
                                            </div>
                                            {newItem.unitValue && newItem.flexibilityPercent && (
                                                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md mt-2">
                                                    Max Sale Price: <span className="font-mono font-medium">${parseFloat(newItem.unitValue).toFixed(2)}</span><br />
                                                    Min Sale Price: <span className="font-mono font-medium">${(parseFloat(newItem.unitValue) * (1 - parseFloat(newItem.flexibilityPercent) / 100)).toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-4 items-start gap-4">
                                    <Label className="text-right mt-2">Promo Tiers</Label>
                                    <div className="col-span-3 space-y-2 border rounded-md p-3 bg-muted/20">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Quantity Tiers</span>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs"
                                                onClick={() => {
                                                    const tiers = [...newItem.promoPricing.tiers];
                                                    tiers.push({ qty: 1, price: parseFloat(newItem.unitValue) || 0 });
                                                    setNewItem({ ...newItem, promoPricing: { tiers } });
                                                }}
                                            >
                                                <Plus className="h-3 w-3 mr-1" /> Add Tier
                                            </Button>
                                        </div>
                                        <div className="space-y-2">
                                            {newItem.promoPricing?.tiers?.map((tier, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <div className="flex-1 flex items-center gap-2">
                                                        <Input
                                                            type="number"
                                                            className="h-8 text-sm"
                                                            placeholder="Qty"
                                                            value={tier.qty}
                                                            onChange={e => {
                                                                const tiers = [...newItem.promoPricing.tiers];
                                                                tiers[idx].qty = parseFloat(e.target.value) || 0;
                                                                setNewItem({ ...newItem, promoPricing: { tiers } });
                                                            }}
                                                        />
                                                        <span className="text-xs text-muted-foreground">items for</span>
                                                        <Input
                                                            type="number"
                                                            className="h-8 text-sm"
                                                            placeholder="Price"
                                                            value={tier.price}
                                                            onChange={e => {
                                                                const tiers = [...newItem.promoPricing.tiers];
                                                                tiers[idx].price = parseFloat(e.target.value) || 0;
                                                                setNewItem({ ...newItem, promoPricing: { tiers } });
                                                            }}
                                                        />
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                        onClick={() => {
                                                            const tiers = newItem.promoPricing.tiers.filter((_, i) => i !== idx);
                                                            setNewItem({ ...newItem, promoPricing: { tiers } });
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            {newItem.promoPricing.tiers.length === 0 && (
                                                <div className="text-xs text-center text-muted-foreground italic py-2">No promotional tiers defined</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">{newItem.craftable ? "Cost Override ($)" : "Cost ($)"}</Label>
                                    <div className="col-span-3 w-full">
                                        {newItem.unit !== 'pcs' && newItem.pricingMode === 'fraction' && newItem.category !== 'equipment' ? (
                                            <>
                                                <Input type="number" step="0.01" value={newItem.fractionCost} onChange={e => setNewItem({ ...newItem, fractionCost: e.target.value })} placeholder={newItem.craftable ? "Leave blank to auto-calculate from recipe" : `Cost per ${newItem.fractionQty} ${newItem.fractionUnit}`} required={!newItem.craftable} />
                                                {newItem.craftable && <span className="text-xs text-muted-foreground mt-1 block">Leave blank to inherit cost from recipe ingredients</span>}
                                                {newItem.quantity && newItem.fractionCost && (
                                                    <span className="text-xs text-muted-foreground mt-1 block">
                                                        Total batch cost preview: ${(() => {
                                                            const bG = convertQty(parseFloat(newItem.quantity) || 0, newItem.unit as SupportedUnit, 'grams');
                                                            const fG = convertQty(parseFloat(newItem.fractionQty) || 1, newItem.fractionUnit as SupportedUnit, 'grams');
                                                            return fG > 0 ? ((parseFloat(newItem.fractionCost) || 0) * (bG / fG)).toFixed(2) : '0.00';
                                                        })()}
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <Input type="number" step="0.01" value={newItem.craftable ? newItem.costOverride : newItem.originalCost} onChange={e => newItem.craftable ? setNewItem({ ...newItem, costOverride: e.target.value }) : setNewItem({ ...newItem, originalCost: e.target.value })} placeholder={newItem.craftable ? "Leave blank to auto-calculate from recipe" : (newItem.unit === 'pcs' ? "Your cost per unit" : "Your cost per batch")} required={!newItem.craftable} />
                                                {newItem.craftable && <span className="text-xs text-muted-foreground mt-1 block">Leave blank to inherit cost from recipe ingredients</span>}
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">Quantity</Label>
                                    <div className="col-span-3 flex gap-2">
                                        <Input type="number" className="w-[140px]" step={newItem.unit === 'pcs' ? "1" : "0.1"} value={newItem.quantity} onChange={e => {
                                            const val = e.target.value;
                                            if (newItem.unit === 'pcs' && val.includes('.')) return;
                                            setNewItem({ ...newItem, quantity: val });
                                        }} placeholder="0" required={!newItem.craftable} />
                                        <Select value={newItem.unit} onValueChange={v => setNewItem({ ...newItem, unit: v })}>
                                            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="pcs">pcs</SelectItem>
                                                <SelectItem value="grams">grams</SelectItem>
                                                <SelectItem value="kg">kg</SelectItem>
                                                <SelectItem value="oz">oz</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                    <DialogFooter>
                        <Button type="submit" disabled={isSubmitting || (mode === 'append' && !selectedItem && !appendQuantity) || (mode === 'recipe' && (!selectedItem || recipeIngredients.length === 0))}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {mode === 'append' ? 'Append Quantity' : mode === 'recipe' ? 'Save Recipe' : 'Add Item Type'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>

            <DeleteItemDialog
                item={selectedItem as any}
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                onDeleted={() => {
                    setSelectedItem(null);
                    fetchExistingItems();
                }}
                sessionToken={sessionToken}
            />

            {selectedItem && recipes.find(r => r.outputItemId === selectedItem.id) && (
                <UpdateWhitelistDialog
                    open={showWhitelistDialog}
                    onOpenChange={setShowWhitelistDialog}
                    recipe={{
                        id: recipes.find(r => r.outputItemId === selectedItem.id)?.id,
                        outputItemName: selectedItem.name,
                        allowedStaffIds: recipes.find(r => r.outputItemId === selectedItem.id)?.allowedStaffIds || []
                    }}
                    staffList={staffList}
                    onUpdated={() => {
                        fetchExistingItems();
                    }}
                />
            )}
        </Dialog>
    );
}

