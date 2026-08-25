import { fetch } from 'undici';

import { pairId } from '../utils.js';
import { PriceCheckerStrategy } from '../strategy.js';

const API_URL = 'https://api.coingecko.com/api/v3/simple/price';

/**
 * @description Canonical pair -> CoinGecko coin id. `invert` turns a COIN/USD quote
 * into USD/COIN, which is how the fiat pairs are expressed here.
 * @type {Record<string, { id: string, invert?: boolean, round?: boolean }>}
 */
const COINS = {
  'SOL/USD': { id: 'solana' },
  'ETH/USD': { id: 'ethereum' },
  'BNB/USD': { id: 'binancecoin' },
  'XMR/USD': { id: 'monero' },
  'TON/USD': { id: 'the-open-network' },
  'USD/ARS': { id: 'argentine-peso', invert: true, round: true },
};

export default class CoingeckoPriceCheckerStrategy extends PriceCheckerStrategy {
  name = 'coingecko';
  priority = 0;

  /**
   * @param {import('../utils.js').Pair} pair
   * @returns {boolean}
   */
  supports(pair) {
    return pairId(pair) in COINS;
  }

  /**
   * @param {import('../utils.js').Pair[]} pairs
   * @param {{ signal: AbortSignal }} options
   * @returns {Promise<import('../strategy.js').Quote[]>}
   */
  async fetchQuotes(pairs, { signal }) {
    const wanted = pairs.map((pair) => ({ id: pairId(pair), coin: COINS[pairId(pair)] })).filter(({ coin }) => coin);
    if (!wanted.length) return [];

    // https://docs.coingecko.com/v3.0.1/reference/simple-price
    const url = new URL(API_URL);
    url.searchParams.set('ids', [...new Set(wanted.map(({ coin }) => coin.id))].join(','));
    url.searchParams.set('vs_currencies', 'usd');
    url.searchParams.set('precision', '9');

    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`coingecko responded with ${response.status}`);

    const data = await response.json();
    if (!data || !Object.keys(data).length) throw new Error('coingecko returned an empty payload');

    const quotes = [];
    for (const { id, coin } of wanted) {
      const usd = data[coin.id]?.usd;
      if (!Number.isFinite(usd) || usd <= 0) continue;

      const price = coin.invert ? 1 / usd : usd;
      quotes.push({ pair: id, price: coin.round ? Math.floor(price) : price });
    }

    return quotes;
  }
}
