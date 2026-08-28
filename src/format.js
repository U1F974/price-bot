import { pairId } from './price-checker/utils.js';

/**
 * @description Renders quotes as one `[kind]` block per pair kind. Sections follow
 * the order the kinds first appear in, so a new kind needs no change here.
 * @param {import('./price-checker/registry.js').ResolvedQuote[]} quotes
 * @returns {string}
 */
export const renderMessage = (quotes) => {
  /** @type {Map<string, import('./price-checker/registry.js').ResolvedQuote[]>} */
  const sections = new Map();

  quotes.forEach((quote) => {
    if (!sections.has(quote.kind)) sections.set(quote.kind, []);
    sections.get(quote.kind).push(quote);
  });

  return [...sections].map(([kind, items]) => `[${kind}]\n${items.map(fmtQuote).join('\n')}`).join('\n\n');
};

/**
 * @param {import('./price-checker/registry.js').ResolvedQuote} quote
 * @returns {string}
 */
const fmtQuote = (quote) => `<b>${quote.pair}</b>: <code>${quote.price}</code>`;

/**
 * @description Fewer decimals the bigger the number gets, so `8 041.9 RUB` and
 * `0.00012 ETH` both stay readable.
 * @param {number} value
 * @returns {string}
 */
const fmtNumber = (value) => {
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;

  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
};

/**
 * @description Renders one conversion, with the unit rate and the providers behind it
 * on a second line.
 * @param {import('./converter.js').Conversion} conversion
 * @returns {string}
 */
export const renderConversion = ({ amount, from, to, value, rate, sources }) => {
  const head = `<b>${fmtNumber(amount)} ${from}</b> = <code>${fmtNumber(value)} ${to}</code>`;
  if (!sources.length) return head;

  return `${head}\n<i>1 ${from} = ${fmtNumber(rate)} ${to} (${sources.join(' + ')})</i>`;
};

/**
 * @description The `/help` reply. Built from the same data the bot runs on - configured
 * pairs, registered strategies, accepted separators - so it cannot describe a bot that
 * no longer exists.
 * @param {{ pairs: import('./price-checker/utils.js').Pair[], strategies: string[], separators: string[], cronTime: string }} state
 * @returns {string}
 */
export const renderHelp = ({ pairs, strategies, separators, cronTime }) =>
  [
    '<b>Price bot</b>',
    '',
    `Posts a rate report on a schedule (<code>${cronTime}</code>) and converts on request.`,
    '',
    '<b>Conversion</b>',
    'Send a message that is nothing but the request:',
    '<code>100 rub to usd</code>',
    '<code>1,5 eth -> rub</code>',
    '<code>50 rub / eth</code>',
    '',
    `Separators: ${separators.map((separator) => `<code>${separator}</code>`).join(' ')}`,
    'Any pair works in either direction, crossed through other rates when nobody quotes it',
    'directly. Unknown currencies get no answer.',
    '',
    '<b>Reported pairs</b>',
    `<code>${pairs.map(pairId).join('  ')}</code>`,
    '',
    `<b>Sources</b>: ${strategies.join(', ')}`,
  ].join('\n');
