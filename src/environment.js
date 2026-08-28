import '@dotenvx/dotenvx/config.js';

import envar from 'env-var';

export const env = {
  logLevel: envar
    .get('LOG_LEVEL')
    .default('debug')
    .asEnum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  isPrettyLog: envar.get('LOG_PRETTY').default('true').asBool(),
  telegram: {
    botToken: envar.get('TELEGRAM_BOT_TOKEN').required().asString(),
    chatId: envar.get('TELEGRAM_CHAT_ID').required().asInt(),
    topicId: envar.get('TELEGRAM_TOPIC_ID').asIntPositive(),
  },
  cron: {
    time: envar.get('CRON_JOB_TIME').default('0 0-23/8 * * *').asString(),
  },
  priceChecker: {
    providers: envar.get('PRICE_PROVIDERS').default('').asArray(),
    timeoutMs: envar.get('PRICE_FETCH_TIMEOUT_MS').default('10000').asIntPositive(),
  },
};
