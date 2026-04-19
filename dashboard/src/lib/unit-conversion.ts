import { formatQty } from './format-qty';

export type SupportedUnit = 'mg' | 'grams' | 'kg' | 'oz' | 'pcs';

// Base conversions to grams
const TO_GRAMS: Record<Exclude<SupportedUnit, 'pcs'>, number> = {
    'mg': 0.001,
    'grams': 1,
    'kg': 1000,
    'oz': 28.3495,
};

/**
 * Converts a quantity from one unit structure to another.
 * Pieces ('pcs') are treated as their own immutable category unless scaling a recipe specifically.
 * 
 * @param qty The quantity to convert (e.g. 5)
 * @param fromUnit The unit of the quantity (e.g. 'kg')
 * @param toUnit The target unit (e.g. 'grams')
 * @returns The successfully converted and rounded quantity
 */
export function convertQty(qty: number, fromUnit: SupportedUnit, toUnit: SupportedUnit): number {
    if (fromUnit === toUnit) return formatQty(qty);

    // If either side is pcs, we cannot natively convert weight without a distinct translation map.
    // In Candyland, 'pcs' acts as a standalone unit. We just return the original qty if mismatched, 
    // or you could throw an error depending on strictness.
    if (fromUnit === 'pcs' || toUnit === 'pcs') {
        console.warn(`Attempted invalid unit conversion: ${fromUnit} -> ${toUnit}. Returning original qty.`);
        return formatQty(qty);
    }

    // Convert to grams as a base
    const baseGrams = qty * TO_GRAMS[fromUnit as Exclude<SupportedUnit, 'pcs'>];

    // Convert from grams to target
    const targetQty = baseGrams / TO_GRAMS[toUnit as Exclude<SupportedUnit, 'pcs'>];

    return formatQty(targetQty);
}
