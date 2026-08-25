/**
 * @typedef {import('./utils.js').Pair} Pair
 * @typedef {{ pair: string, price: number }} Quote
 *
 * A strategy only reports `pair` + `price`; the registry stamps `source`, `kind`
 * and `priority` onto the result, so providers cannot forget or misreport them.
 */

/**
 * @description Contract every price source implements.
 * @abstract
 */
export class PriceCheckerStrategy {
  /**
   * @description Unique id, used for logging and the PRICE_PROVIDERS allowlist
   * @type {string}
   */
  name;
  /**
   * @description Wins over lower-priority strategies when both quote the same pair
   * @type {number}
   */
  priority = 0;

  /**
   * @description Whether this source can quote the given pair
   * @param {Pair} pair
   * @returns {boolean}
   */
  supports(pair) {
    return false;
  }

  /**
   * @description Fetch quotes for the pairs this strategy claimed via `supports()`.
   * Throwing is fine - the registry isolates failures per strategy.
   * @param {Pair[]} pairs
   * @param {{ signal: AbortSignal }} options abort signal carrying the configured timeout
   * @returns {Promise<Quote[]>}
   */
  async fetchQuotes(pairs, options) {
    throw new Error(`${this.name}: fetchQuotes() is not implemented`);
  }
}
