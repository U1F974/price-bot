import '@dotenvx/dotenvx/config.js';

import { CronJob } from 'cron';
import { Bot } from 'grammy';

import { PAIRS } from './config/pairs.js';
import { Converter } from './converter.js';
import { env } from './environment.js';
import { renderConversion, renderMessage } from './format.js';
import { logger } from './logger.js';
import { PriceCheckerRegistry } from './price-checker/registry.js';

const bot = new Bot(env.telegram.botToken, { client: { baseFetchConfig: { agent: undefined } } });
const priceCheckers = new PriceCheckerRegistry();
const converter = new Converter(priceCheckers);

/**
 * @description Answers messages that are nothing but a conversion request, e.g.
 * `100 rub to usd`. Anything else - including a request for a pair no provider can
 * price - is left alone, so the bot stays quiet in a busy chat.
 */
bot.on('message:text', async (ctx) => {
  const request = Converter.parse(ctx.msg.text);
  if (!request) return;

  const conversion = await converter.convert(request);

  if (!conversion) {
    logger.debug({ data: { request }, msg: 'no rate for the requested conversion' });
    return;
  }

  const result = await ctx.reply(renderConversion(conversion), {
    parse_mode: 'HTML',
    reply_parameters: { message_id: ctx.msg.message_id },
  });

  logger.debug({ data: { conversion, result }, msg: 'telegram conversion reply' });
});

bot.catch(({ error, ctx }) => {
  logger.error({ err: error, data: { update: ctx?.update?.update_id }, msg: 'failed to handle an update' });
});

let isRunning = false;
const job = CronJob.from({
  cronTime: env.cron.time,
  onTick: async () => {
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
  },
});

try {
  const me = await bot.api.getMe();
  logger.info({ data: me, msg: 'initialize telegram bot' });

  await priceCheckers.ready();
  logger.info({ data: { strategies: priceCheckers.names }, msg: 'price checker strategies loaded' });

  job.start();

  logger.info({ data: { cronTime: job.cronTime, nextDate: job.nextDate() }, msg: 'cron job started' });

  // Resolves only once the bot stops, so it must not be awaited here
  bot
    .start({
      drop_pending_updates: true,
      onStart: () => logger.info({ msg: 'listening for conversion requests' }),
    })
    .catch((err) => logger.error({ err, msg: 'polling stopped' }));
} catch (err) {
  logger.error({ err, msg: 'failed to initialize bot' });
  process.exit(1);
}

async function shutdown(signal) {
  logger.info({ signal, msg: 'shutting down' });

  if (job.isActive) {
    job.stop();
    logger.info({ msg: 'cron job stopped' });
  }

  try {
    await bot.stop();
    logger.info({ msg: 'polling stopped' });
  } catch (err) {
    logger.error({ err, msg: 'failed to stop polling' });
  }

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
