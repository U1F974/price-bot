import { mergePrices } from '../utils.js';
import { CoingeckoPriceCheckerStrategy } from './coingecko-price-checker.strategy.js';

export class PriceCheckers {
  /**
   * @description Map of price checker strategies
   * @type {Map<string, import('./price-checker.strategy.js').PriceCheckerStrategy>}
   */
  static strategies = new Map();
  /**
   * @description Add a price checker strategy
   * @param {import('./price-checker.strategy.js').PriceCheckerStrategy} strategy
   */
  static addStrategy(strategy) {
    this.strategies.set(strategy.name, strategy);
  }
  /**
   * @description Get a price checker strategy by name
   * @param {string} name
   * @returns {import('./price-checker.strategy.js').PriceCheckerStrategy}
   */
  static getStrategy(name) {
    return this.strategies.get(name);
  }
  /**
   * @description Handle all price checker strategies
   * @returns {Promise<{fiat:Record<string,number>;crypto:Record<string,number>}>}
   */
  static async handleAll() {
    const results = await Promise.all(Array.from(this.strategies.values()).map((checker) => checker.handle()));
    return mergePrices(results);
  }
}

PriceCheckers.addStrategy(new CoingeckoPriceCheckerStrategy());
