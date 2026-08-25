/**
 * @description Renders quotes as one `[kind]` block per pair kind. Sections follow
 * the order the kinds first appear in, so a new kind needs no change here.
 * @param {import('./price-checker/registry.js').ResolvedQuote[]} quotes
 * @returns {string}
 */
export const renderMessage = (quotes) => {
  /** @type {Map<string, import('./price-checker/registry.js').ResolvedQuote[]>} */
  const sections = new Map();

  for (const quote of quotes) {
    if (!sections.has(quote.kind)) sections.set(quote.kind, []);
    sections.get(quote.kind).push(quote);
  }

  return [...sections].map(([kind, items]) => `[${kind}]\n${items.map(fmtQuote).join('\n')}`).join('\n\n');
};

/**
 * @param {import('./price-checker/registry.js').ResolvedQuote} quote
 * @returns {string}
 */
const fmtQuote = (quote) => `<b>${quote.pair}</b>: <code>${quote.price}</code>`;
