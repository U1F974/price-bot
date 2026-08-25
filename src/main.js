import '@dotenvx/dotenvx/config.js';

import { CronJob } from 'cron';
import { Bot } from 'grammy';

import { PAIRS } from './config/pairs.js';
import { env } from './environment.js';
import { renderMessage } from './format.js';
import { logger } from './logger.js';
import { PriceCheckerRegistry } from './price-checker/registry.js';

const bot = new Bot(env.telegram.botToken, {
  // grammY pins its own keep-alive agent, and Node's --use-env-proxy only patches the
  // global one. Dropping it lets HTTPS_PROXY apply, which matters where Telegram is blocked.
  client: { baseFetchConfig: { agent: undefined } },
});
const priceCheckers = new PriceCheckerRegistry();

let isRunning = false;

const tick = async () => {
  if (isRunning) {
    logger.warn({ msg: 'previous run is still in progress, skipping tick' });
    return;
  }
  isRunning = true;

  try {
    const quotes = await priceCheckers.collect(PAIRS);

    if (!quotes.length) {
      logger.error({ msg: 'no quotes collected, nothing to send' });
      return;
    }

    const result = await bot.api.sendMessage(env.telegram.chatId, renderMessage(quotes), {
      parse_mode: 'HTML',
      message_thread_id: env.telegram.topicId,
    });

    logger.debug({ data: { quotes, result }, msg: 'telegram send message' });
  } catch (err) {
    logger.error({ err, msg: 'cron job failed' });
  } finally {
    isRunning = false;
  }
};

const job = CronJob.from({ cronTime: env.cron.time, onTick: tick });

try {
  const me = await bot.api.getMe();
  logger.info({ data: me, msg: 'initialize telegram bot' });

  await priceCheckers.ready();
  logger.info({ data: { strategies: priceCheckers.names }, msg: 'price checker strategies loaded' });

  job.start();

  logger.info({ data: { cronTime: job.cronTime, nextDate: job.nextDate() }, msg: 'cron job started' });
} catch (err) {
  logger.error({ err, msg: 'failed to initialize bot' });
  process.exit(1);
}

function shutdown(signal) {
  logger.info({ signal, msg: 'shutting down' });

  if (job.isActive) {
    job.stop();
    logger.info({ msg: 'cron job stopped' });
  }

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
