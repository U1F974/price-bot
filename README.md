# Price Bot

A small Telegram bot that fetches fiat and crypto exchange rates on a schedule and posts them to a chat.

## Stack

- Node.js (ESM)
- [GrammY](https://grammy.dev/) - Telegram Bot API
- [cron](https://www.npmjs.com/package/cron) - job scheduling
- [pino](https://getpino.io/) - logging (optional `pino-pretty` for dev)
- [@dotenvx/dotenvx](https://github.com/dotenvx/dotenvx) - env loading
- [undici](https://undici.nodejs.org/) - HTTP (used by the price checker)
- [Biome](https://biomejs.dev/) - linting and formatting

## Architecture

Price checkers use the **Strategy pattern**. Each strategy implements `PriceCheckerStrategy` and returns `{ crypto, fiat }` maps. The registry (`PriceCheckers`) runs all strategies and merges results.

Default data source: **CoinGecko** - fetches SOL/USD, ETH/USD, BNB/USD, USD/ARS (Argentine peso).

## Environment

| Variable               | Required | Description                                                                                 |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`   | yes      | Telegram bot token from [@BotFather](https://t.me/BotFather)                                |
| `TELEGRAM_CHAT_ID`     | yes      | Chat ID to send messages to (integer)                                                       |
| `TELEGRAM_TOPIC_ID`    | no       | Topic (thread) ID in a forum chat                                                           |
| `CRON_JOB_TIME`        | no       | Cron expression (default: `0 0-23/8 * * *` - every 8 hours)                                 |
| `LOG_LEVEL`            | no       | Pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` (default: `debug`) |
| `LOG_PRETTY`           | no       | Use `pino-pretty` for readable logs (default: `true`)                                       |

Copy `.env.example` to `.env` and set the required variables.

## Run

```bash
yarn install
yarn start
```

On start the bot calls `getMe`, then starts a cron job that periodically fetches prices, formats them into `[crypto]` and `[fiat]` blocks, and sends the message to the configured chat. Handles `SIGTERM` and `SIGINT` for graceful shutdown.
