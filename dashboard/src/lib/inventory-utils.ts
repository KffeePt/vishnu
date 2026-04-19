import { convertQty, SupportedUnit } from './unit-conversion';

export const getCalculatedCost = (
    item: any, 
    allItems: any[], 
    allRecipes: any[], 
    visited = new Set<string>()
): number => {
    // If not craftable, use originalCost
    if (!item.craftable) return item.originalCost ?? 0;
    
    // If cost is explicitly overridden, use that
    if (item.costOverride !== undefined && item.costOverride !== null && item.costOverride > 0) {
        return item.costOverride;
    }

    // Prevent infinite recursion (circular crafting)
    if (visited.has(item.id)) return item.originalCost ?? 0;
    const newVisited = new Set(visited);
    newVisited.add(item.id);

    // Find recipe for this item
    const recipe = allRecipes.find(r => r.outputItemId === item.id);
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
        return item.originalCost ?? 0;
    }

    let totalCost = 0;
    for (const ing of recipe.ingredients) {
        const ingItem = allItems.find(i => i.id === ing.itemId);
        if (ingItem) {
            // Recursively calculate cost for ingredients (if they are craftable)
            const ingUnitCost = getCalculatedCost(ingItem, allItems, allRecipes, newVisited);
            
            if (ingItem.unit !== 'pcs') {
                // For non-pcs, calculate cost per gram then multiply by ingredient volume in grams
                try {
                    const gramsPerUnit = convertQty(1, ingItem.unit as SupportedUnit, 'grams');
                    const costPerGram = ingUnitCost / (gramsPerUnit || 1);
                    const requiredGrams = convertQty(ing.quantity, ingItem.unit as SupportedUnit, 'grams');
                    totalCost += costPerGram * requiredGrams;
                } catch (e) {
                    // Fallback if conversion fails
                    totalCost += (ingUnitCost * ing.quantity);
                }
            } else {
                // For pcs, simple multiplication
                totalCost += ingUnitCost * ing.quantity;
            }
        }
    }
    
    // Cost per single unit of output
    return totalCost / (recipe.outputQuantity || 1);
};
