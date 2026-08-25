import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { env } from '../environment.js';
import { logger } from '../logger.js';
import { pairId } from './utils.js';
import { PriceCheckerStrategy } from './strategy.js';

/**
 * @typedef {import('./utils.js').Pair} Pair
 * @typedef {import('./strategy.js').Quote & { kind: import('./utils.js').PairKind, source: string, priority: number }} ResolvedQuote
 */

const STRATEGIES_DIR = path.join(import.meta.dirname, 'strategies');
const STRATEGY_SUFFIX = '.strategy.js';

export class PriceCheckerRegistry {
  /** @type {Map<string, PriceCheckerStrategy>} */
  strategies = new Map();
  /** @type {Promise<this> | null} */
  #discovery = null;

  /** @returns {string[]} names of the registered strategies */
  get names() {
    return [...this.strategies.keys()];
  }

  /**
   * @description Discovers strategies once per process, no matter how often it is called.
   * @returns {Promise<this>}
   */
  async ready() {
    this.#discovery ??= this.discover();

    return this.#discovery;
  }

  /**
   * @param {PriceCheckerStrategy} strategy
   * @returns {this}
   */
  add(strategy) {
    if (!(strategy instanceof PriceCheckerStrategy)) {
      throw new TypeError('strategy must extend PriceCheckerStrategy');
    }
    if (!strategy.name) throw new TypeError('strategy must have a non-empty name');

    this.strategies.set(strategy.name, strategy);
    return this;
  }

  /**
   * @param {string} name
   * @returns {PriceCheckerStrategy | undefined}
   */
  get(name) {
    return this.strategies.get(name);
  }

  /**
   * @description Constructs the default export of every `*.strategy.js` in ./strategies.
   * A file that fails to load is logged and skipped, so one broken provider cannot
   * keep the bot from starting.
   * @param {{ dir?: string, allowlist?: string[] }} [options]
   * @returns {Promise<this>}
   */
  async discover({ dir = STRATEGIES_DIR, allowlist = env.priceChecker.providers } = {}) {
    const files = (await readdir(dir)).filter((file) => file.endsWith(STRATEGY_SUFFIX)).sort();

    for (const file of files) {
      try {
        const module = await import(pathToFileURL(path.join(dir, file)).href);
        const Strategy = module.default;

        if (typeof Strategy !== 'function' || !(Strategy.prototype instanceof PriceCheckerStrategy)) {
          logger.warn({ data: { file }, msg: 'skipped: default export is not a PriceCheckerStrategy class' });
          continue;
        }

        const strategy = new Strategy();

        if (allowlist.length && !allowlist.includes(strategy.name)) {
          logger.info({ data: { strategy: strategy.name }, msg: 'strategy disabled via PRICE_PROVIDERS' });
          continue;
        }

        this.add(strategy);
        logger.debug({ data: { strategy: strategy.name, file }, msg: 'strategy registered' });
      } catch (err) {
        logger.error({ err, data: { file }, msg: 'failed to load price checker strategy' });
      }
    }

    return this;
  }

  /**
   * @description Asks every strategy for the pairs it claims, then merges the results.
   * Returns quotes in the order the pairs were given, so output stays stable
   * regardless of which provider answered first.
   *
   * Collects from whatever is registered - call `ready()` first, or `add()` by hand.
   * @param {Pair[]} pairs
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<ResolvedQuote[]>}
   */
  async collect(pairs, { timeoutMs = env.priceChecker.timeoutMs } = {}) {
    const byId = new Map(pairs.map((pair) => [pairId(pair), pair]));

    const assignments = [];
    for (const strategy of this.strategies.values()) {
      const claimed = pairs.filter((pair) => strategy.supports(pair));
      if (claimed.length) assignments.push({ strategy, claimed });
    }

    if (!assignments.length) {
      logger.warn({ data: { pairs: [...byId.keys()] }, msg: 'no strategy supports the configured pairs' });
      return [];
    }

    // `async` wrapper turns a synchronous throw inside fetchQuotes into a rejection
    const settled = await Promise.allSettled(
      assignments.map(async ({ strategy, claimed }) =>
        strategy.fetchQuotes(claimed, { signal: AbortSignal.timeout(timeoutMs) }),
      ),
    );

    /** @type {Map<string, ResolvedQuote>} */
    const merged = new Map();

    for (const [index, outcome] of settled.entries()) {
      const { strategy } = assignments[index];

      if (outcome.status === 'rejected') {
        logger.error({ err: outcome.reason, data: { strategy: strategy.name }, msg: 'price checker failed' });
        continue;
      }

      for (const quote of outcome.value ?? []) {
        const pair = byId.get(quote?.pair);
        const data = { strategy: strategy.name, quote };

        if (!pair) {
          logger.warn({ data, msg: 'strategy returned a pair that was not requested' });
          continue;
        }
        if (!Number.isFinite(quote.price) || quote.price <= 0) {
          logger.warn({ data, msg: 'strategy returned an invalid price' });
          continue;
        }

        const current = merged.get(quote.pair);
        if (current && current.priority >= strategy.priority) {
          logger.debug({ data: { ...data, keptFrom: current.source }, msg: 'lower-priority quote ignored' });
          continue;
        }

        merged.set(quote.pair, {
          pair: quote.pair,
          price: quote.price,
          kind: pair.kind,
          source: strategy.name,
          priority: strategy.priority,
        });
      }
    }

    return pairs.map((pair) => merged.get(pairId(pair))).filter(Boolean);
  }
}
