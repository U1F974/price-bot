/**
 * @description Every pair the bot reports. Adding a pair here is enough - strategies
 * decide on their own whether they can quote it via `supports()`.
 * @type {import('../price-checker/utils.js').Pair[]}
 */
export const PAIRS = [
  { base: 'SOL', quote: 'USD', kind: 'crypto' },
  { base: 'ETH', quote: 'USD', kind: 'crypto' },
  { base: 'BNB', quote: 'USD', kind: 'crypto' },
  { base: 'XMR', quote: 'USD', kind: 'crypto' },
  { base: 'TON', quote: 'USD', kind: 'crypto' },
  { base: 'USD', quote: 'ARS', kind: 'fiat' },
  { base: 'USD', quote: 'RUB', kind: 'fiat' },
];
