/**
 * @description Price checker strategy
 * @abstract
 */
export class PriceCheckerStrategy {
  /**
   * @description Name of the price checker strategy
   * @readonly
   * @type {string}
   */
  name;
  /**
   * @description Handle the price checking logic
   * @returns {Promise<{fiat:Record<string,number>;crypto:Record<string,number>}>}
   */
  async handle() {
    throw new Error('Not implemented');
  }
}
