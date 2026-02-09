/**
 * @param {Record<string, number>} prices
 * @returns {string}
 */
export const fmtPrices = (prices) =>
  Object.entries(prices)
    .map(([pair, price]) => `<b>${pair}</b>: <code>${price}</code>`)
    .join('\n');

/**
 * Merges results from multiple price checkers. Later results override same keys.
 *
 * @param {Array<{ crypto: Record<string, number>; fiat: Record<string, number> } | null>} results
 * @returns {{ crypto: Record<string, number>; fiat: Record<string, number> }}
 */
export const mergePrices = (results) =>
  results.reduce(
    (acc, result) => {
      if (!result) return acc;
      return {
        crypto: { ...acc.crypto, ...result.crypto },
        fiat: { ...acc.fiat, ...result.fiat },
      };
    },
    { crypto: {}, fiat: {} },
  );
