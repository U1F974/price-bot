import { PAIRS } from './config/pairs.js';
import { logger } from './logger.js';
import { pairId } from './price-checker/utils.js';

/**
 * @typedef {{ amount: number, from: string, to: string }} ConversionRequest
 * @typedef {ConversionRequest & { value: number, rate: number, sources: string[] }} Conversion
 * @typedef {{ rate: number, source: string }} Edge one quoted direction and who quoted it
 * @typedef {{ rate: number, sources: string[] }} Rate
 */

/**
 * @description `100 rub to usd`, `1,5 ETH -> RUB`, `20 usd в rub`, `50 rub / eth`.
 * Anchored on purpose: only a message that is nothing but a conversion request is
 * treated as one.
 */
const REQUEST_RE = /^\s*(\d+(?:[.,]\d+)?)\s*([a-z]{2,10})\s*(?:to|in|into|в|->|=>|→|>|=|\/)\s*([a-z]{2,10})\s*$/iu;

/**
 * @description Which side of a pair makes it `crypto`. Derived from the reported pairs,
 * so a new coin in `config/pairs.js` becomes convertible without touching this file.
 * @type {Set<string>}
 */
const CRYPTO = new Set(PAIRS.filter((pair) => pair.kind === 'crypto').map((pair) => pair.base));

/**
 * @description Intermediate currencies a route may pass through - not a limit on what
 * can be asked for. CBR prices every fiat it knows in RUB and the exchanges price every
 * coin in USD, so those two hops connect every currency the bundled strategies can
 * answer: `EUR -> ETH` runs EUR/RUB -> RUB/USD -> USD/ETH.
 */
const BRIDGES = ['USD', 'RUB'];

/** @description Chat traffic is bursty and providers rate limit, so rates are reused briefly. */
const RATE_TTL_MS = 60 * 1000 * 15;

/**
 * @description Turns a chat request into an amount, on top of the same registry the
 * scheduled report uses. One instance per bot: the rate cache lives on it.
 */
export class Converter {
  /** @type {string[]} */
  bridges;
  /** @type {number} in ms */
  ttl;

  /** @type {import('./price-checker/registry.js').PriceCheckerRegistry} */
  #registry;
  /** @type {Map<string, { expiresAt: number, rate: Rate | null }>} */
  #cache = new Map();

  /**
   * @param {import('./price-checker/registry.js').PriceCheckerRegistry} registry
   * @param {{ bridges?: string[], ttlMs?: number }} [options]
   */
  constructor(registry, { bridges = BRIDGES, ttlMs = RATE_TTL_MS } = {}) {
    this.#registry = registry;
    this.bridges = bridges;
    this.ttl = ttlMs;
  }

  /**
   * @description Extracts a conversion request, or `null` when the text is not one.
   * Static: reading a message needs no registry and no instance.
   * @param {string | undefined} text
   * @returns {ConversionRequest | null}
   */
  static parse(text) {
    const match = REQUEST_RE.exec(text ?? '');
    if (!match) return null;

    const [, rawAmount, from, to] = match;
    const amount = Number(rawAmount.replace(',', '.'));
    if (!Number.isFinite(amount)) return null;

    return { amount, from: from.toUpperCase(), to: to.toUpperCase() };
  }

  /**
   * @description Converts a parsed request. `null` when no strategy can price the pair,
   * so the caller can stay silent instead of answering nonsense.
   * @param {ConversionRequest} request
   * @returns {Promise<Conversion | null>}
   */
  async convert({ amount, from, to }) {
    const resolved = await this.rate(from, to);
    if (!resolved || !Number.isFinite(resolved.rate) || resolved.rate <= 0) return null;

    return { amount, from, to, value: amount * resolved.rate, rate: resolved.rate, sources: resolved.sources };
  }

  /**
   * @description Rate for one unit of `from` in `to`, reused for `ttlMs` - a burst of
   * messages must not turn into a burst of provider requests. A miss is cached too:
   * an unknown code is exactly what a spamming chat retries.
   * @param {string} from
   * @param {string} to
   * @returns {Promise<Rate | null>}
   */
  async rate(from, to) {
    const key = `${from}/${to}`;
    const hit = this.#cache.get(key);
    const now = Date.now();

    if (hit && hit.expiresAt > now) {
      logger.debug({ data: { pair: key }, msg: 'conversion rate served from cache' });
      return hit.rate;
    }

    const rate = await this.#resolve(from, to);
    this.#cache.set(key, { rate, expiresAt: now + this.ttl });

    return rate;
  }

  /**
   * @description Asks the registry for every pair a route could need and folds the answers
   * into a `from -> to` rate. `null` when the two are not connected by anything quoted.
   * @param {string} from
   * @param {string} to
   * @returns {Promise<Rate | null>}
   */
  async #resolve(from, to) {
    if (from === to) return { rate: 1, sources: [] };

    const nodes = [...new Set([from, to, ...this.bridges])];
    const quotes = await this.#registry.collect(this.#candidates(nodes));

    return this.#route(this.#graph(quotes), nodes, from, to);
  }

  /**
   * @param {string} base
   * @param {string} quote
   * @returns {import('./price-checker/utils.js').Pair}
   */
  #pair(base, quote) {
    return { base, quote, kind: CRYPTO.has(base) || CRYPTO.has(quote) ? 'crypto' : 'fiat' };
  }

  /**
   * @description Every pair that could take part in a route, in both directions. Strategies
   * pick what they support out of the list, and each of them still makes a single request.
   * @param {string[]} nodes
   * @returns {import('./price-checker/utils.js').Pair[]}
   */
  #candidates(nodes) {
    const pairs = [];

    nodes.forEach((base) => {
      nodes.forEach((quote) => {
        if (base !== quote) pairs.push(this.#pair(base, quote));
      });
    });

    return pairs;
  }

  /**
   * @description Every rate the providers answered with, keyed by pair id. A direction
   * nothing quotes is filled from its inverse, which therefore never overrides a real quote.
   * @param {import('./price-checker/registry.js').ResolvedQuote[]} quotes
   * @returns {Map<string, Edge>}
   */
  #graph(quotes) {
    /** @type {Map<string, Edge>} */
    const rates = new Map();

    quotes.forEach((quote) => {
      rates.set(quote.pair, { rate: quote.price, source: quote.source });
    });

    quotes.forEach((quote) => {
      const [base, target] = quote.pair.split('/');
      const inverse = pairId({ base: target, quote: base });
      if (!rates.has(inverse)) rates.set(inverse, { rate: 1 / quote.price, source: quote.source });
    });

    return rates;
  }

  /**
   * @description Shortest chain of quotes leading from one currency to the other, multiplied
   * into a single rate. Breadth first, so the route with the fewest hops - and the least
   * accumulated rounding - wins, and a direct quote always beats a crossed one. `nodes`
   * lists `to` before the bridges, so equal-length routes resolve in that order too.
   * @param {Map<string, Edge>} rates
   * @param {string[]} nodes
   * @param {string} from
   * @param {string} to
   * @returns {Rate | null}
   */
  #route(rates, nodes, from, to) {
    /** @type {Map<string, { previous: string, edge: Edge } | null>} */
    const visited = new Map([[from, null]]);
    const queue = [from];

    while (queue.length) {
      const current = queue.shift();
      if (current === to) break;

      nodes.forEach((next) => {
        if (visited.has(next)) return;

        const edge = rates.get(`${current}/${next}`);
        if (!edge) return;

        visited.set(next, { previous: current, edge });
        queue.push(next);
      });
    }

    if (!visited.has(to)) return null;

    let rate = 1;
    /** @type {string[]} */
    const sources = [];

    for (let step = visited.get(to); step; step = visited.get(step.previous)) {
      rate *= step.edge.rate;
      sources.unshift(step.edge.source);
    }

    return { rate, sources: [...new Set(sources)] };
  }
}
