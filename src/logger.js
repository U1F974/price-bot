import { pino } from 'pino';

import { env } from './environment.js';

export const logger = pino({
  level: env.logLevel,
  formatters: { level: (label) => ({ level: label.toUpperCase() }) },
  transport: {
    ...(env.isPrettyLog && { target: 'pino-pretty' }),
  },
});
