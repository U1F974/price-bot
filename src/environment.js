import '@dotenvx/dotenvx/config.js';

export const env = {
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  isPrettyLog: Boolean(process.env.LOG_PRETTY) ?? true,
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    chatId: Number(process.env.TELEGRAM_CHAT_ID) ?? 0,
    topicId: Number(process.env.TELEGRAM_TOPIC_ID) ?? 0,
  },
  cron: {
    time: process.env.CRON_JOB_TIME ?? '*/5 * * * *',
  },
};
