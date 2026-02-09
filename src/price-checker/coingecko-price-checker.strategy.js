import { fetch } from 'undici';

import { logger } from '../logger.js';
import { PriceCheckerStrategy } from './price-checker.strategy.js';

export class CoingeckoPriceCheckerStrategy extends PriceCheckerStrategy {
  name = 'coingecko';

  async handle() {
    // https://docs.coingecko.com/v3.0.1/reference/simple-price
    const url = new URL(
      `https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum,binancecoin,argentine-peso&vs_currencies=usd&precision=9`,
    );

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) {
        logger.error({ data, msg: `failed to fetch prices: ${response.status}` });
        return null;
      }

      if (!data || !Object.keys(data).length) {
        logger.error('prices not found in response');
        return null;
      }

      const result = { fiat: {}, crypto: {} };
      for (const [coin, price] of Object.entries(data)) {
        if (!price?.usd) continue;

        const pair = this.mapper(coin);

        if (pair === 'USD/ARS') result.fiat[pair] = Math.floor(1 / price.usd);
        else result.crypto[pair] = price.usd;
      }

      return result;
    } catch (err) {
      logger.error({ err, data: { href: url.href }, msg: 'error fetching prices' });
      return null;
    }
  }

  /**
   * @private
   * @param {string} coin
   * @returns {string}
   */
  mapper(coin) {
    return {
      solana: 'SOL/USD',
      ethereum: 'ETH/USD',
      binancecoin: 'BNB/USD',
      'argentine-peso': 'USD/ARS',
    }[coin];
  }
}
