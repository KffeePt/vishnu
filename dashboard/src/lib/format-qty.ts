/**
 * Round a quantity to 4 decimal places, stripping any trailing zeros.
 * e.g. 0.7999999999 → 0.8, 1.23456 → 1.2346
 */
export function formatQty(n: number): number {
    return Math.round(n * 10000) / 10000;
}
