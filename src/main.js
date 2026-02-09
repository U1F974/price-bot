import '@dotenvx/dotenvx/config.js';

import { CronJob } from 'cron';
import { Bot } from 'grammy';

import { env } from './environment.js';
import { logger } from './logger.js';
import { PriceCheckers } from './price-checker/regestry.js';
import { fmtPrices } from './utils.js';

const bot = new Bot(env.telegram.botToken);
const job = CronJob.from({
  cronTime: env.cron.time,
  onTick: async () => {
    try {
      const prices = await PriceCheckers.handleAll();

      const text = `[crypto]\n${fmtPrices(prices.crypto)}\n\n[fiat]\n${fmtPrices(prices.fiat)}`;

      const result = await bot.api.sendMessage(env.telegram.chatId, text, {
        parse_mode: 'HTML',
        message_thread_id: env.telegram.topicId,
      });

      logger.debug({ data: { prices, result }, msg: 'telegram send message' });
    } catch (err) {
      logger.error({ err, msg: 'cron job failed' });
    }
  },
});

try {
  const me = await bot.api.getMe();
  logger.info({ data: me, msg: 'initialize telegram bot' });

  job.start();

  logger.info({ data: { cronTime: job.cronTime, nextDate: job.nextDate() }, msg: 'cron job started' });
} catch (err) {
  logger.error({ err, msg: 'failed to initialize bot' });
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
