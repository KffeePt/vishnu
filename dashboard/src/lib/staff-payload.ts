import { InventoryItem } from '@/types/candyland';
import { formatQty } from '@/lib/format-qty';
import { envelopeDecrypt, unwrapPrivateKey } from '@/lib/crypto-client';

export async function fetchAndDecryptStaffItems(employeeId: string, token: string, masterPassword?: string) {
    if (!masterPassword) return [];
    try {
        // Get admin key to unwrap DEK
        const keyRes = await fetch('/api/admin/keys', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!keyRes.ok) return [];
        const adminKeyData = await keyRes.json();
        if (!adminKeyData.encryptedPrivateKey) return [];

        const privateKey = await unwrapPrivateKey(adminKeyData.encryptedPrivateKey, masterPassword);

        // Fetch staff inventory
        const invRes = await fetch(`/api/admin/staff/${employeeId}/inventory`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!invRes.ok) return [];
        const invData = await invRes.json();

        if (!invData.inventory || !invData.inventory.encryptedData || !invData.inventory.adminWrappedDEK) return [];

        // Decrypt
        const decStr = await envelopeDecrypt({
            encryptedData: invData.inventory.encryptedData,
            staffWrappedDEK: invData.inventory.staffWrappedDEK || '',
            adminWrappedDEK: invData.inventory.adminWrappedDEK,
            iv: invData.inventory.iv,
            encryptionVersion: invData.inventory.encryptionVersion ?? 2
        }, invData.inventory.adminWrappedDEK, privateKey);

        const decData = JSON.parse(decStr);
        return decData.items || [];
    } catch (e) {
        console.error("Failed to decrypt existing staff payload:", e);
        return [];
    }
}

export function buildStaffPayload(
    employeeId: string, 
    currentItems: InventoryItem[], 
    staffRules: Record<string, { unitValue: number }>, 
    currentRecipes: any[], 
    soldMap: Record<string, number>, 
    note: string,
    existingStaffItems: any[] = [] // Preserves crafted items
) {
    const newItemsList = currentItems.map((i: any) => {
        const assign = (i.assignments ?? []).find((a: any) => a.employeeId === employeeId);
        if (!assign) return null;

        const soldKey = `${employeeId}_${i.id}`;
        const soldQty = soldMap[soldKey] || assign.sold || 0;
        const remainingQty = formatQty(assign.quantity - soldQty);

        if (remainingQty <= 0) return null;

        const isBatch = i.unit === 'grams' || i.unit === 'kg' || i.unit === 'oz';
        const ratio = formatQty(isBatch ? (remainingQty / i.quantity) : 1);

        const baseValue = (i.flexiblePrice && staffRules[i.id])
            ? staffRules[i.id].unitValue
            : i.unitValue;
            
        // Use existing cost override logic if necessary, or default to originalCost * ratio
        // Note: We might need to pass `getCalculatedCost` or just use what we have in the map
        // for `i.originalCost` if we don't have the recipe list handy for deeper calc.
        let calculatedOriginalCost = i.originalCost ?? 0;
        if (i.craftable && !i.costOverride && currentRecipes) {
             const cr = currentRecipes.find(r => r.outputItemId === i.id);
             // Basic cost calc fallback for buildPayload if getCalculatedCost isn't provided
             if (cr && cr.ingredients) {
                 calculatedOriginalCost = cr.ingredients.reduce((acc: number, ing: any) => {
                     const idx = currentItems.find(mi => mi.id === ing.itemId);
                     if (idx) {
                          if (idx.unit !== 'pcs') {
                              return acc + (((idx.costOverride || idx.originalCost || 0) / (idx.unit === 'kg' ? 1000 : idx.unit === 'oz' ? 28.3495 : 1)) * (ing.unit === 'kg' ? ing.quantity * 1000 : ing.unit === 'oz' ? ing.quantity * 28.3495 : ing.quantity));
                          }
                          return acc + ((idx.costOverride || idx.originalCost || 0) * ing.quantity);
                     }
                     return acc;
                 }, 0) / (cr.outputQuantity || 1);
             }
        }
        if (i.costOverride) calculatedOriginalCost = i.costOverride;

        return {
            id: i.id,
            name: i.name,
            qty: remainingQty,
            value: formatQty(isBatch ? (baseValue * ratio) : baseValue),
            originalCost: formatQty(calculatedOriginalCost * ratio),
            unit: i.unit,
            category: i.category,
            flexiblePrice: i.flexiblePrice,
            flexibilityPercent: i.flexibilityPercent,
            maxPriceCap: i.maxPriceCap,
            promoPricing: i.promoPricing,
            baseValue: i.baseValue || baseValue,
            masterQty: i.quantity, // Preserve masterQty for ratio calcs
            baseOriginalCost: i.originalCost,
            assignedQty: assign.quantity, 
            soldQty: soldQty,             
            note: note,
            pushedAt: new Date().toISOString(),
        };
    }).filter(Boolean);

    // Merge master inventory push with existing staff-only state (crafted items, consumed ingredients)
    existingStaffItems.forEach(existingItem => {
        const newItem = newItemsList.find((ni: any) => ni.id === existingItem.id);
        
        if (!newItem) {
            // It's a purely crafted item, or an item no longer in master assignments.
            if ((parseFloat(existingItem.qty) || 0) > 0) {
                newItemsList.push(existingItem);
            }
        } else {
            // It exists in BOTH. We need to preserve local deductions (crafting).
            // Logic: NewQty = LocalQty + (NewCalculatedQty - OldCalculatedQty)
            // If OldCalculatedQty is missing (older payload), we fallback to min() to be safe.
            
            const localQty = Number(existingItem.qty) || 0;
            const newCalcQty = Number(newItem.qty) || 0;
            
            if (existingItem.assignedQty !== undefined && existingItem.soldQty !== undefined) {
                const oldCalcQty = Number(existingItem.assignedQty) - Number(existingItem.soldQty);
                const delta = newCalcQty - oldCalcQty;
                
                newItem.qty = formatQty(Math.max(0, localQty + delta));
            } else {
                if (localQty < newCalcQty) {
                    newItem.qty = formatQty(localQty);
                }
            }
            
            const isBatch = newItem.unit === 'grams' || newItem.unit === 'kg' || newItem.unit === 'oz';
            if (isBatch && newItem.masterQty) {
                 const ratio = (Number(newItem.qty) || 0) / newItem.masterQty;
                 newItem.value = formatQty((newItem.baseValue || 0) * ratio);
                 newItem.originalCost = formatQty((newItem.baseOriginalCost || 0) * ratio);
            }
        }
    });

    const publicOrAllowedRecipes = currentRecipes.filter((r: any) => 
        r.visibility === 'public' || 
        !r.visibility || 
        (r.visibility === 'private' && (r.allowedStaffIds || []).includes(employeeId))
    );

    return {
        items: newItemsList,
        recipes: publicOrAllowedRecipes.map((r: any) => {
            const outItm = currentItems.find((ci: any) => ci.id === r.outputItemId);
            const enrichedIngredients = (r.ingredients || []).map((ing: any) => {
                 const ingItm = currentItems.find((ci: any) => ci.id === ing.itemId);
                 return { ...ing, ingredientName: ingItm?.name || 'Unknown' };
            });
            return { 
                ...r, 
                outputItemName: outItm?.name || 'Unknown', 
                outputItemUnit: outItm?.unit || 'pcs', 
                ingredients: enrichedIngredients 
            };
        })
    };
}
