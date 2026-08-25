import { fetch } from 'undici';

import { logger } from '../../logger.js';
import { pairId } from '../utils.js';
import { PriceCheckerStrategy } from '../strategy.js';

const API_URL = 'https://api.binance.com/api/v3/ticker/24hr';

/**
 * @description A halted symbol keeps answering with the price of its very last trade,
 * frozen at the moment trading stopped, and nothing in the payload flags it. Quotes
 * older than this are dropped so a stale price cannot outrank a live one.
 */
const MAX_QUOTE_AGE_MS = 60 * 60 * 1000;

/**
 * @description Canonical pair -> Binance symbol. USDT stands in for USD, which is
 * close enough for a rate report and is what Binance actually lists.
 * @type {Record<string, string>}
 */
const SYMBOLS = {
  'SOL/USD': 'SOLUSDT',
  'ETH/USD': 'ETHUSDT',
  'BNB/USD': 'BNBUSDT',
  'XMR/USD': 'XMRUSDT',
  'TON/USD': 'TONUSDT',
};

export default class BinancePriceCheckerStrategy extends PriceCheckerStrategy {
  name = 'binance';
  // Wins over CoinGecko: exchange data is fresher and not rate limited as aggressively
  priority = 10;

  /**
   * @param {import('../utils.js').Pair} pair
   * @returns {boolean}
   */
  supports(pair) {
    return pairId(pair) in SYMBOLS;
  }

  /**
   * @param {import('../utils.js').Pair[]} pairs
   * @param {{ signal: AbortSignal }} options
   * @returns {Promise<import('../strategy.js').Quote[]>}
   */
  async fetchQuotes(pairs, { signal }) {
    const wanted = pairs.map((pair) => ({ id: pairId(pair), symbol: SYMBOLS[pairId(pair)] })).filter((w) => w.symbol);
    if (!wanted.length) return [];

    // https://developers.binance.com/docs/binance-spot-api-docs/rest-api#24hr-ticker-price-change-statistics
    const url = new URL(API_URL);
    url.searchParams.set('symbols', JSON.stringify(wanted.map(({ symbol }) => symbol)));

    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`binance responded with ${response.status}`);

    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('binance returned an unexpected payload');

    const tickers = new Map(data.map((ticker) => [ticker?.symbol, ticker]));
    const now = Date.now();

    const quotes = [];
    for (const { id, symbol } of wanted) {
      const ticker = tickers.get(symbol);
      if (!ticker) continue;

      const price = Number(ticker.lastPrice);
      if (!Number.isFinite(price) || price <= 0) continue;

      const age = now - Number(ticker.closeTime);
      if (!Number.isFinite(age) || age > MAX_QUOTE_AGE_MS) {
        logger.debug({ data: { symbol, closeTime: ticker.closeTime }, msg: 'dropped a stale binance quote' });
        continue;
      }

      quotes.push({ pair: id, price });
    }

    return quotes;
  }
}
