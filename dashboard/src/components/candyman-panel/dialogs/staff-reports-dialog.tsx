import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flame, Loader2, Plus, Trash2 } from 'lucide-react';
import { DecryptedItem } from '@/components/candyman-panel/decrypt-inventory';
import { UserAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { RefundReason, ReportItem } from '@/types/candyland';

interface StaffReportsDialogProps {
    items: DecryptedItem[];
    recipes?: any[];
    onDesmantelar?: (recipe: any, multiplier: number, losses: Record<string, number>) => Promise<void>;
    isSubmitting?: boolean;
}

export function StaffReportsDialog({ items, recipes = [], onDesmantelar, isSubmitting: isExternalSubmitting }: StaffReportsDialogProps) {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [reason, setReason] = useState<RefundReason>('inventory_loss'); // defaults to loss
    const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);
    const isSubmitting = isLocalSubmitting || !!isExternalSubmitting;
    const [saleRecordId, setSaleRecordId] = useState<string>(''); // if tied to a sale
    const [saleRecordValue, setSaleRecordValue] = useState<number>(0);
    
    // Multi-item state
    type ExtendedReportItem = Partial<ReportItem> & { dynamicLosses?: Record<string, number> };
    const [reportItems, setReportItems] = useState<ExtendedReportItem[]>([{}]);

    const { getIDToken, user } = UserAuth();
    const { toast } = useToast();

    useEffect(() => {
        const handleOpen = (e: Event | CustomEvent) => {
            setOpen(true);
            if ('detail' in e && e.detail) {
                if (e.detail.itemId) {
                    setReportItems([{ itemId: e.detail.itemId, lossType: 'partial' }]);
                    setReason('inventory_loss');
                } else if (e.detail.saleRecords) {
                    const sale = e.detail.saleRecords;
                    setSaleRecordId(sale.id);
                    setReportItems([{ itemId: sale.itemId, quantity: sale.qtySold || 1 }]);
                    setSaleRecordValue(sale.value || 0);
                    setReason('calidad');
                } else {
                    setReportItems([{ lossType: 'partial' }]);
                }
            } else {
                setReportItems([{ lossType: 'partial' }]);
            }
        };
        window.addEventListener('open-staff-reports', handleOpen);
        return () => window.removeEventListener('open-staff-reports', handleOpen);
    }, []);

    const resetForm = () => {
        setReportItems([{ lossType: 'partial' }]);
        setNote('');
        setReason('inventory_loss');
        setSaleRecordId('');
        setSaleRecordValue(0);
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen && !isSubmitting) {
            setOpen(false);
            resetForm();
        }
    };

    const addReportItem = () => {
        setReportItems([...reportItems, { lossType: 'partial' }]);
    };

    const removeReportItem = (index: number) => {
        setReportItems(reportItems.filter((_, i) => i !== index));
    };

    const updateReportItem = (index: number, updates: Partial<ExtendedReportItem>) => {
        const newItems = [...reportItems];
        newItems[index] = { ...newItems[index], ...updates };
        setReportItems(newItems);
    };

    const isFormValid = () => {
        const isDesmantelarOnly = reportItems.length > 0 && reportItems.every(r => r.lossType === 'desmantelar');
        if (!isDesmantelarOnly && !note) return false;
        if (reportItems.length === 0) return false;
        
        for (const item of reportItems) {
            if (!item.itemId) return false;
            
            // Full loss doesn't require explicit quantity input in UI (it uses max available)
            const isFullLoss = !saleRecordId && reason === 'inventory_loss' && item.lossType === 'full';
            if (!isFullLoss && (!item.quantity || isNaN(Number(item.quantity)) || Number(item.quantity) <= 0)) {
                return false;
            }
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isFormValid() || !user) return;

        // Validation loop
        const validatedItems: ReportItem[] = [];
        for (const rItem of reportItems) {
            const targetItem = items.find(i => i.id === rItem.itemId);
            if (!targetItem) {
                toast({ title: 'Error', description: 'Uno de los artículos no fue encontrado.', variant: 'destructive' });
                return;
            }

            const isFullLoss = !saleRecordId && reason === 'inventory_loss' && rItem.lossType === 'full';
            const parsedQty = isFullLoss ? targetItem.qty : Number(rItem.quantity);
            
            if (isNaN(parsedQty) || parsedQty <= 0) {
                toast({ title: 'Error', description: 'Cantidad inválida para ' + targetItem.name, variant: 'destructive' });
                return;
            }

            if (parsedQty > targetItem.qty) {
                toast({ title: 'Error', description: `No puedes reportar más stock del que tienes asignado de ${targetItem.name}.`, variant: 'destructive' });
                return;
            }

            validatedItems.push({
                itemId: targetItem.id,
                itemName: targetItem.name || 'Unknown Item',
                quantity: parsedQty,
                unit: targetItem.unit || 'pcs',
                originalCost: targetItem.originalCost || 0,
                value: saleRecordId ? saleRecordValue : (targetItem.value || 0),
                lossType: (!saleRecordId && reason === 'inventory_loss') ? (rItem.lossType as any) : undefined
            });
        }

        setIsLocalSubmitting(true);
        try {
            // First handle Desmantelar actions
            const desmantelarItems = reportItems.filter(r => r.lossType === 'desmantelar');
            for (const rItem of desmantelarItems) {
                const recipe = recipes.find(r => r.outputItemId === rItem.itemId);
                if (recipe && onDesmantelar) {
                    await onDesmantelar(recipe, Number(rItem.quantity), rItem.dynamicLosses || {});
                }
            }

            // If there are standard refund items, submit them to the server
            if (validatedItems.length > 0) {
                const token = await getIDToken();
                if (!token) throw new Error("No hay token de sesión");

                // Fetch fresh keys
                const publicDoc = await getDoc(doc(db, 'public', user.uid));
                const freshStaffPubKey = publicDoc.exists() && publicDoc.data().publicKey;
                
                const adminKeyRes = await fetch(`/api/staff/admin-key?t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!adminKeyRes.ok) throw new Error("No se pudo obtener la llave del administrador");
                const freshAdminPubKey = (await adminKeyRes.json()).publicKey;

                if (!freshStaffPubKey || !freshAdminPubKey) {
                    throw new Error("Llaves de encriptación no disponibles");
                }

                let finalSaleRecordHash = undefined;
                if (saleRecordId) {
                    const { sha256Hash } = await import('@/lib/encryption');
                    finalSaleRecordHash = sha256Hash(saleRecordId);
                }

                const payload = {
                    reason: reason,
                    note: note,
                    items: validatedItems, // The new standard
                    
                    // --- Backward compatibility flat fields (use first item) ---
                    itemId: validatedItems[0].itemId,
                    itemName: validatedItems[0].itemName,
                    quantity: validatedItems[0].quantity,
                    refundQty: validatedItems[0].quantity,
                    lossType: validatedItems[0].lossType,
                    unit: validatedItems[0].unit,
                    originalCost: validatedItems[0].originalCost,
                    saleValue: validatedItems[0].value,
                    // -------------------------------------------------------------
                    
                    saleRecordId: saleRecordId || undefined,
                    reportedAt: new Date().toISOString()
                };

                const { envelopeEncrypt } = await import('@/lib/crypto-client');
                const payloadJSON = JSON.stringify(payload);
                const encryptedDoc = await envelopeEncrypt(payloadJSON, freshStaffPubKey, freshAdminPubKey);

                const res = await fetch('/api/staff/refunds/request', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ...encryptedDoc,
                        saleRecordHash: finalSaleRecordHash
                    })
                });

                if (!res.ok) {
                    throw new Error("Failed to submit request");
                }

                toast({ title: 'Reporte Enviado', description: 'Tu reporte ha sido enviado al administrador de forma encriptada.' });
            }

            setOpen(false);
            resetForm();
        } catch (error: any) {
            console.error(error);
            toast({ title: 'Error', description: error.message || 'Hubo un error al enviar el reporte', variant: 'destructive' });
        } finally {
            setIsLocalSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                <DialogHeader className="mb-2 border-b pb-4 shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-amber-500 text-xl">
                        <Flame className="h-5 w-5" />
                        Reporte de Pérdidas y Reembolsos
                    </DialogTitle>
                    <DialogDescription>
                        Declara mermas, pérdidas, o solicita reembolsos por ventas. Transmitido mediante encriptación E2E.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Motivo del Reporte</Label>
                        <Select
                            value={reason}
                            onValueChange={(val) => setReason(val as RefundReason)}
                            disabled={isSubmitting || !!saleRecordId}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecciona el motivo..." />
                            </SelectTrigger>
                            <SelectContent>
                                {!saleRecordId && <SelectItem value="inventory_loss">Pérdida de Inventario</SelectItem>}
                                <SelectItem value="calidad">Problema de Calidad</SelectItem>
                                <SelectItem value="venta_por_error">Venta por Error</SelectItem>
                                <SelectItem value="venta_cancelada">Venta Cancelada</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 rounded-md border p-3 bg-muted/10">
                        {reportItems.map((rItem, index) => {
                            const selectedItemDef = items.find(i => i.id === rItem.itemId);
                            const recipe = recipes.find(r => r.outputItemId === selectedItemDef?.id);
                            const isDecimal = selectedItemDef?.unit === 'grams' || selectedItemDef?.unit === 'kg' || selectedItemDef?.unit === 'oz';
                            const isFullLoss = !saleRecordId && reason === 'inventory_loss' && rItem.lossType === 'full';
                            const isDesmantelar = rItem.lossType === 'desmantelar';

                            return (
                                <div key={index} className="space-y-3 p-3 border rounded-md bg-card relative">
                                    {/* Delete button only shown if not a sale refund and more than 1 item exists */}
                                    {!saleRecordId && reportItems.length > 1 && (
                                        <button 
                                            type="button" 
                                            onClick={() => removeReportItem(index)}
                                            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-sm hover:scale-110 transition-transform"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}

                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">{saleRecordId ? "Artículo a Reembolsar" : `Artículo #${index + 1}`}</Label>
                                        <Select
                                            value={rItem.itemId || ''}
                                            onValueChange={(val) => updateReportItem(index, { itemId: val })}
                                            disabled={isSubmitting || !!saleRecordId}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecciona un artículo..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {items.filter(i => i.qty > 0 || saleRecordId).map(item => (
                                                    <SelectItem key={item.id} value={item.id}>
                                                        {item.name} (Disp: {item.qty} {item.unit})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {!saleRecordId && reason === 'inventory_loss' && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground">Acción</Label>
                                                <Select
                                                    value={rItem.lossType || 'partial'}
                                                    onValueChange={(val) => updateReportItem(index, { lossType: val as 'return_to_master' | 'full' | 'partial' | 'desmantelar' })}
                                                    disabled={isSubmitting}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Acción..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="partial">Pérdida Parcial</SelectItem>
                                                        <SelectItem value="full">Pérdida Total</SelectItem>
                                                        <SelectItem value="return_to_master">Devolver al Master</SelectItem>
                                                        {recipe && recipe.reversible && <SelectItem value="desmantelar" className="text-amber-600 focus:text-amber-700">Desmantelar (Salvage)</SelectItem>}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {selectedItemDef && !isFullLoss && !isDesmantelar && (
                                                <div className="space-y-2">
                                                    <Label className="text-xs text-muted-foreground">{rItem.lossType === 'return_to_master' ? "A Devolver" : "A Reportar"}</Label>
                                                    <div className="flex gap-2 items-center">
                                                        <Input
                                                            type="number"
                                                            min={isDecimal ? "0.1" : "1"}
                                                            max={saleRecordId ? undefined : selectedItemDef.qty}
                                                            step={isDecimal ? "any" : "1"}
                                                            value={rItem.quantity || ''}
                                                            onChange={(e) => updateReportItem(index, { quantity: Number(e.target.value) })}
                                                            placeholder="Ej. 1"
                                                            required
                                                            disabled={isSubmitting}
                                                            className="flex-1"
                                                        />
                                                        <span className="text-muted-foreground w-12 text-sm">{selectedItemDef.unit}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Desmantelar Details Block */}
                                    {isDesmantelar && recipe && selectedItemDef && (
                                        <div className="col-span-2 mt-2 space-y-3 bg-muted/30 border border-amber-500/30 rounded-lg p-4 animate-in slide-in-from-top-2">
                                            <Label className="text-xs text-amber-600 dark:text-amber-500 font-semibold flex items-center gap-1.5"><Flame className="w-4 h-4" /> Desmantelar Artículo</Label>
                                            
                                            <div className="space-y-2 mb-4 max-w-[200px]">
                                                <Label className="text-xs text-muted-foreground">Cantidad a Desmantelar</Label>
                                                <div className="flex gap-2 items-center">
                                                    <Input
                                                        type="number"
                                                        min={isDecimal ? "0.1" : "1"}
                                                        max={selectedItemDef.qty}
                                                        step={isDecimal ? "any" : "1"}
                                                        value={rItem.quantity || ''}
                                                        onChange={(e) => updateReportItem(index, { quantity: Number(e.target.value) })}
                                                        placeholder="Ej. 1"
                                                        required
                                                        disabled={isSubmitting}
                                                        className="flex-1 bg-background"
                                                    />
                                                    <span className="text-muted-foreground text-sm">{selectedItemDef.unit}</span>
                                                </div>
                                            </div>

                                            <div className="pt-3 border-t">
                                                <div className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                                                    Si algún componente se dañó durante el proceso y no retornará a tu inventario, declara la cantidad perdida (por lote).
                                                </div>
                                                <div className="space-y-2">
                                                    {recipe.ingredients.map((ing: any) => {
                                                        const ingItem = items.find(i => i.id === ing.itemId);
                                                        const maxReturn = ing.salvageQuantity !== undefined ? ing.salvageQuantity : ing.quantity;
                                                        const isIngDecimal = ingItem?.unit === 'grams' || ingItem?.unit === 'kg' || ingItem?.unit === 'oz';
                                                        
                                                        return (
                                                            <div key={ing.itemId} className="flex items-center gap-2 bg-background p-2 rounded-md border text-sm">
                                                                <div className="flex-1 text-xs truncate" title={ingItem?.name || ing.ingredientName}>{ingItem?.name || ing.ingredientName}</div>
                                                                <div className="text-[10px] text-muted-foreground w-16 text-right">Max Vuelve: {maxReturn}</div>
                                                                <Input
                                                                    type="number"
                                                                    className="w-20 h-7 text-xs"
                                                                    placeholder="Pérdida"
                                                                    step={isIngDecimal ? "0.01" : "1"}
                                                                    min="0"
                                                                    max={maxReturn}
                                                                    value={rItem.dynamicLosses?.[ing.itemId] || ''}
                                                                    onChange={(e) => {
                                                                        const val = Number(e.target.value);
                                                                        const newLosses = { ...(rItem.dynamicLosses || {}) };
                                                                        if (val > 0) newLosses[ing.itemId] = val;
                                                                        else delete newLosses[ing.itemId];
                                                                        updateReportItem(index, { dynamicLosses: newLosses });
                                                                    }}
                                                                    disabled={isSubmitting}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Sale Record Quantity Override */}
                                    {saleRecordId && selectedItemDef && (
                                        <div className="space-y-2">
                                            <Label className="text-xs text-muted-foreground">Cantidad a Reembolsar</Label>
                                            <div className="flex gap-2 items-center">
                                                <Input
                                                    type="number"
                                                    min={isDecimal ? "0.1" : "1"}
                                                    step={isDecimal ? "any" : "1"}
                                                    value={rItem.quantity || ''}
                                                    onChange={(e) => updateReportItem(index, { quantity: Number(e.target.value) })}
                                                    placeholder="Ej. 1"
                                                    required
                                                    disabled={isSubmitting}
                                                    className="flex-1"
                                                />
                                                <span className="text-muted-foreground w-12 text-sm">{selectedItemDef.unit}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        
                        {!saleRecordId && (!reportItems[0].itemId ? null : (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addReportItem}
                                disabled={isSubmitting}
                                className="w-full border-dashed text-muted-foreground hover:bg-muted/50"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Agregar Artículo
                            </Button>
                        ))}
                    </div>

                    <div className="space-y-2 pt-2 border-t">
                        <Label>Motivo Detallado <span className="text-destructive">{reportItems.some(r => r.lossType === 'desmantelar') ? '' : '*'}</span></Label>
                        <Textarea
                            required={!reportItems.some(r => r.lossType === 'desmantelar')}
                            placeholder={reportItems.some(r => r.lossType === 'desmantelar') ? "Opcional: Detalles del desmantelado..." : "Explica qué pasó con este inventario o por qué se devuelve..."}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            disabled={isSubmitting}
                            className="h-20"
                        />
                    </div>

                    <DialogFooter className="mt-6 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" variant="default" disabled={isSubmitting || !isFormValid()} className="!bg-amber-600 hover:!bg-amber-700 !text-white">
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Enviar Reporte
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
