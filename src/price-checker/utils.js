/**
 * @typedef {'crypto' | 'fiat'} PairKind
 * @typedef {{ base: string, quote: string, kind: PairKind }} Pair
 */

/**
 * @description Canonical id of a pair, e.g. `SOL/USD`. Used as the key everywhere.
 * @param {Pair} pair
 * @returns {string}
 */
export const pairId = (pair) => `${pair.base}/${pair.quote}`;
