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
