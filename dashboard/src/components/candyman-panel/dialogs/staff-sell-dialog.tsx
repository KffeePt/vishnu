import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, PackageOpen, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CraftingRecipe } from '@/types/candyland';
import { DecryptedItem } from '@/components/candyman-panel/decrypt-inventory';

interface StaffSellDialogProps {
    items: DecryptedItem[];
    recipes: CraftingRecipe[];
    isSelling: string | null;
    onConfirmSell: (itemId: string, qtySold: string, customPrice: string) => void;
}

export function StaffSellDialog({ items, recipes, isSelling, onConfirmSell }: StaffSellDialogProps) {
    const [open, setOpen] = useState(false);

    // Internal Form State
    const [selectedItemId, setSelectedItemId] = useState<string>('');
    const [sellQty, setSellQty] = useState('');
    const [sellPrice, setSellPrice] = useState('');

    useEffect(() => {
        const handleOpen = () => setOpen(true);
        window.addEventListener('open-staff-sell', handleOpen);
        return () => window.removeEventListener('open-staff-sell', handleOpen);
    }, []);

    // Reset when dialog closes or opens
    useEffect(() => {
        if (!open) {
            setSelectedItemId('');
            setSellQty('');
            setSellPrice('');
        }
    }, [open]);

    // Derived state
    const selectedItem = items.find(i => i.id === selectedItemId) || null;
    const isCraftable = selectedItem ? recipes.some(r => r.outputItemId === selectedItem.id) : false;

    // Set default price or apply promo pricing when item or quantity changes
    useEffect(() => {
        if (!selectedItem) {
            setSellPrice('');
            return;
        }

        const qty = parseFloat(sellQty) || 0;
        let price = selectedItem.value || 0;

        // Apply Promo Tiers if they exist
        if (selectedItem.promoPricing?.tiers && selectedItem.promoPricing.tiers.length > 0) {
            // Find the highest qty tier that is <= current sellQty
            const sortedTiers = [...selectedItem.promoPricing.tiers].sort((a, b) => b.qty - a.qty);
            const activeTier = sortedTiers.find(t => qty >= t.qty);
            if (activeTier) {
                price = activeTier.price;
            }
        }

        if (!isCraftable || price > 0) {
            setSellPrice(price.toString());
        } else if (isCraftable && price === 0) {
            setSellPrice(''); // Fallback if no price defined for craftable
        }
    }, [selectedItemId, selectedItem, isCraftable, sellQty]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItemId || !sellQty) return;
        onConfirmSell(selectedItemId, sellQty, sellPrice);
    };

    // Auto-close dialog after successful sell if not selling anymore
    // (This works because isSelling goes 'item-id' -> null on success)
    const prevIsSelling = React.useRef(isSelling);
    useEffect(() => {
        if (prevIsSelling.current && !isSelling && open) {
            setOpen(false); // Close the dialog
        }
        prevIsSelling.current = isSelling;
    }, [isSelling, open]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <PackageOpen className="h-5 w-5 text-blue-500" />
                        Vender Artículo Manualmente
                    </DialogTitle>
                    <DialogDescription>
                        Registra una nueva venta de tu inventario.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Seleccionar Artículo</Label>
                        <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Elige un artículo..." />
                            </SelectTrigger>
                            <SelectContent>
                                {items.filter(i => i.qty > 0).map(item => (
                                    <SelectItem key={item.id} value={item.id}>
                                        {item.name} ({item.qty} {item.unit} disp.)
                                    </SelectItem>
                                ))}
                                {items.filter(i => i.qty > 0).length === 0 && (
                                    <SelectItem value="empty" disabled>Inventario vacío</SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedItem && (
                        <>
                            <div className="space-y-2 relative z-50">
                                <Label className="flex items-center justify-between">
                                    <span>Cantidad a descontar</span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => setSellQty(selectedItem.qty.toString())}
                                    >
                                        Max: {selectedItem.qty}
                                    </Button>
                                </Label>
                                <Input
                                    type="number"
                                    step={(selectedItem.unit === 'grams' || selectedItem.unit === 'kg' || selectedItem.unit === 'oz') ? "any" : "1"}
                                    min={(selectedItem.unit === 'grams' || selectedItem.unit === 'kg' || selectedItem.unit === 'oz') ? "0.1" : "1"}
                                    max={selectedItem.qty.toString()}
                                    value={sellQty}
                                    onChange={e => setSellQty(e.target.value)}
                                    autoFocus
                                    required
                                    className="font-mono"
                                />
                            </div>

                            {!isCraftable && (
                                <div className="space-y-2">
                                    {(() => {
                                        let basePrice = parseFloat(sellPrice) || selectedItem.value || 0;
                                        if (basePrice === 0) basePrice = 0.01;

                                        // Apply promo pricing context to info display
                                        const qty = parseFloat(sellQty) || 0;
                                        const tiers = selectedItem.promoPricing?.tiers || [];
                                        const sortedTiers = [...tiers].sort((a, b) => b.qty - a.qty);
                                        const activeTier = sortedTiers.find(t => qty >= t.qty);

                                        let minPrice = selectedItem.originalCost || 0; // Don't sell below cost
                                        if (minPrice === 0) minPrice = basePrice * 0.5;

                                        let maxPrice = basePrice * 1.5; // Allow minor upsell if not craftable
                                        if (selectedItem.maxPriceCap) maxPrice = selectedItem.maxPriceCap;

                                        return (
                                            <>
                                                <Label className="flex justify-between items-center text-emerald-600 dark:text-emerald-500">
                                                    <span>Precio de Venta ($)</span>
                                                    <span className="text-xs font-normal">Sueldo: {selectedItem.value?.toFixed(2)}</span>
                                                </Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={sellPrice}
                                                    onChange={e => setSellPrice(e.target.value)}
                                                    min={minPrice}
                                                    max={maxPrice}
                                                    required
                                                    className="font-mono text-emerald-700 dark:text-emerald-400 border-emerald-200 focus-visible:ring-emerald-500"
                                                />
                                                <div className="flex justify-between text-[10px] text-muted-foreground pt-1 px-1 font-mono">
                                                    <span>Min: ${minPrice.toFixed(2)}</span>
                                                    <span>Max: ${maxPrice.toFixed(2)}</span>
                                                </div>

                                                {tiers.length > 0 && (
                                                    <div className="mt-3 p-2 bg-blue-500/5 border border-blue-500/20 rounded-md">
                                                        <Label className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 mb-1 block">Tiers de Promoción</Label>
                                                        <div className="grid grid-cols-2 gap-1">
                                                            {tiers.sort((a,b) => a.qty - b.qty).map((t, i) => (
                                                                <div key={i} className={`text-[10px] px-1.5 py-0.5 rounded flex justify-between ${activeTier?.qty === t.qty ? 'bg-blue-500 text-white font-bold' : 'bg-muted text-muted-foreground'}`}>
                                                                    <span>{t.qty}+ {selectedItem.unit}</span>
                                                                    <span>${t.price.toFixed(2)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {isCraftable && (
                                <div className="mt-4 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                                    <div className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
                                        Este artículo es fabricable. Su precio está bloqueado por el valor de sus ingredientes y no puede modificarse manualmente en el punto de venta.
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                        <Button
                            type="submit"
                            disabled={!selectedItem || !sellQty || !!isSelling}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground dark:text-primary-foreground"
                        >
                            {isSelling && isSelling === selectedItemId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Confirmar Venta
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
