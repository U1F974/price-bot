import { fetch } from 'undici';

import { pairId } from '../utils.js';
import { PriceCheckerStrategy } from '../strategy.js';

// Machine-readable form of https://cbr.ru/currency_base/daily - XML, windows-1251, decimal comma
const API_URL = 'https://www.cbr.ru/scripts/XML_daily.asp';

const VALUTE_RE = /<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g;

/**
 * @param {string} block
 * @param {string} name
 * @returns {string | undefined}
 */
const tag = (block, name) => block.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];

/**
 * @description Parses a CBR decimal, which uses a comma as the separator.
 * @param {string | undefined} raw
 * @returns {number | null}
 */
const decimal = (raw) => {
  if (!raw) return null;

  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * @description CBR publishes `Value` per `Nominal` units and `VunitRate` per single unit.
 * The latter is preferred: already normalised, and free of float division noise.
 * @param {string} block
 * @returns {number | null}
 */
const unitRate = (block) => {
  const vunit = decimal(tag(block, 'VunitRate'));
  if (vunit !== null) return vunit;

  const value = decimal(tag(block, 'Value'));
  const nominal = decimal(tag(block, 'Nominal'));
  if (value === null || nominal === null) return null;

  return Number((value / nominal).toFixed(6));
};

export default class CbrPriceCheckerStrategy extends PriceCheckerStrategy {
  name = 'cbr';
  // Official rates outrank market proxies for the pairs they cover
  priority = 20;

  /**
   * @description Every currency the CBR publishes is quoted against RUB, so any
   * `X/RUB` fiat pair is claimed and resolved from a single response.
   * @param {import('../utils.js').Pair} pair
   * @returns {boolean}
   */
  supports(pair) {
    return pair.kind === 'fiat' && pair.quote === 'RUB' && pair.base !== 'RUB';
  }

  /**
   * @param {import('../utils.js').Pair[]} pairs
   * @param {{ signal: AbortSignal }} options
   * @returns {Promise<import('../strategy.js').Quote[]>}
   */
  async fetchQuotes(pairs, { signal }) {
    const wanted = pairs.filter((pair) => this.supports(pair));
    if (!wanted.length) return [];

    const response = await fetch(API_URL, { signal });
    if (!response.ok) throw new Error(`cbr responded with ${response.status}`);

    // `response.text()` would force UTF-8 and mangle the Cyrillic currency names
    const xml = new TextDecoder('windows-1251').decode(await response.arrayBuffer());

    /** @type {Map<string, string>} */
    const blocks = new Map();
    for (const [, block] of xml.matchAll(VALUTE_RE)) {
      const charCode = tag(block, 'CharCode');
      if (charCode) blocks.set(charCode, block);
    }

    if (!blocks.size) throw new Error('cbr returned an unexpected payload');

    const quotes = [];
    for (const pair of wanted) {
      const block = blocks.get(pair.base);
      if (!block) continue;

      const price = unitRate(block);
      if (price === null) continue;

      quotes.push({ pair: pairId(pair), price });
    }

    return quotes;
  }
}
