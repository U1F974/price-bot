# Price Bot

A small Telegram bot that fetches fiat and crypto exchange rates on a schedule and posts them to a chat.

## Stack

- Node.js (ESM)
- [GrammY](https://grammy.dev/) - Telegram Bot API
- [cron](https://www.npmjs.com/package/cron) - job scheduling
- [pino](https://getpino.io/) - logging (optional `pino-pretty` for dev)
- [@dotenvx/dotenvx](https://github.com/dotenvx/dotenvx) - env loading
- [env-var](https://github.com/evanshortiss/env-var) - env parsing and validation
- [undici](https://undici.nodejs.org/) - HTTP (used by the price checkers)
- [Biome](https://biomejs.dev/) - linting and formatting
- `node:test` - tests, no runner dependency

## Architecture

The bot knows nothing about price sources, and price sources know nothing about the
message. Everything in between goes through a canonical pair id such as `SOL/USD`.

```
cron tick -> registry.collect(PAIRS) -> [ strategies ] -> merge by priority -> renderMessage() -> Telegram
```

| Piece                        | Responsibility                                                          |
| ---------------------------- | ----------------------------------------------------------------------- |
| `config/pairs.js`            | which pairs are reported and whether each is `crypto` or `fiat`         |
| `price-checker/strategy.js`  | the contract: `name`, `priority`, `supports(pair)`, `fetchQuotes(pairs)` |
| `price-checker/registry.js`  | discovery, timeouts, failure isolation, merging                         |
| `price-checker/strategies/`  | one file per provider                                                   |
| `format.js`                  | groups quotes into `[crypto]` / `[fiat]` blocks                         |

The registry auto-discovers every `*.strategy.js` in `price-checker/strategies/`,
constructs the class it default-exports, and asks each one which of the configured pairs
it can quote. Strategies run concurrently and are
isolated from each other: a provider that throws, times out, or returns garbage is logged
and skipped while the rest of the report still goes out. When two providers quote the same
pair, the higher `priority` wins.

A strategy returns only `{ pair, price }`. The registry stamps `source`, `kind` and
`priority` onto the result, so a provider cannot forget or misreport them.

Bundled sources: **CBR** (official `X/RUB` rates, `priority: 20`), **Binance** (crypto,
`priority: 10`) and **CoinGecko** (crypto + `USD/ARS`, `priority: 0`). Disable any of them
with `PRICE_PROVIDERS` - no code change needed.

Binance keeps serving the last traded price for halted symbols, frozen at the moment
trading stopped, so its strategy drops quotes older than an hour. A stale price can
therefore never outrank a live one from a lower-priority source.

### Adding a price source

Drop one file into `src/price-checker/strategies/`. Nothing else changes:

```js
// src/price-checker/strategies/kraken.strategy.js
import { pairId } from '../utils.js';
import { PriceCheckerStrategy } from '../strategy.js';

export default class KrakenPriceCheckerStrategy extends PriceCheckerStrategy {
  name = 'kraken';
  priority = 5;

  supports(pair) {
    return pair.kind === 'crypto' && pair.quote === 'USD';
  }

  async fetchQuotes(pairs, { signal }) {
    // throwing is fine, the registry isolates it
    return [{ pair: pairId(pairs[0]), price: 1 }];
  }
}
```

Export the class, not an instance - the registry does the constructing, and `main.js` stays
the only place that assembles the application.

Then get contract coverage in three lines:

```js
import KrakenPriceCheckerStrategy from '../src/price-checker/strategies/kraken.strategy.js';
import { assertStrategyContract } from './strategy-contract.js';

assertStrategyContract(new KrakenPriceCheckerStrategy(), {
  supported: [{ base: 'SOL', quote: 'USD', kind: 'crypto' }],
});
```

Adding a **pair** is a one-line edit in `config/pairs.js`. Adding a **kind** (say `metals`)
needs no change in `format.js` - sections are derived from the data.

## Environment

| Variable                  | Required | Description                                                                                 |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | yes      | Telegram bot token from [@BotFather](https://t.me/BotFather)                                |
| `TELEGRAM_CHAT_ID`        | yes      | Chat ID to send messages to (non-zero integer)                                              |
| `TELEGRAM_TOPIC_ID`       | no       | Topic (thread) ID in a forum chat; omitted from the request when unset                      |
| `CRON_JOB_TIME`           | no       | Cron expression (default: `0 0-23/8 * * *` - every 8 hours)                                 |
| `PRICE_PROVIDERS`         | no       | Comma separated strategy allowlist, e.g. `coingecko`. Empty means all discovered strategies |
| `PRICE_FETCH_TIMEOUT_MS`  | no       | Per-strategy request timeout (default: `10000`)                                             |
| `LOG_LEVEL`               | no       | Pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` (default: `debug`) |
| `LOG_PRETTY`              | no       | Use `pino-pretty` for readable logs (default: `true`)                                       |

Copy `.env.example` to `.env` and set the required variables. Missing or malformed required
values fail on start with a single message listing every problem.

## Run

```bash
yarn install
yarn start      # or: yarn start:dev for --watch
yarn test
yarn lint       # yarn format to apply fixes
```

On start the bot validates the environment, calls `getMe`, discovers the price checker
strategies, then starts a cron job that fetches prices, renders them into `[crypto]` and
`[fiat]` blocks, and sends the message to the configured chat. Overlapping ticks are
skipped, an empty result is logged instead of sent, and `SIGTERM`/`SIGINT` shut down
gracefully.
