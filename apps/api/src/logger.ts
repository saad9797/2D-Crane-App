import { pino, type Logger } from 'pino';

export const logger = (level: string): Logger => pino({ level, base: undefined, timestamp: pino.stdTimeFunctions.isoTime });
