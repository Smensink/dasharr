import winston from 'winston';
import Transport from 'winston-transport';
import { addLogEntry } from './log-store';
import { config } from '../config/services.config';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

class MemoryTransport extends Transport {
  log(info: any, callback: () => void): void {
    setImmediate(() => this.emit('logged', info));
    addLogEntry({
      time: info.timestamp || new Date().toISOString(),
      level: info.level,
      message: typeof info.message === 'string' ? info.message : safeStringify(info.message),
      exception: info.stack,
    });
    callback();
  }
}

export const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    new MemoryTransport(),
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat),
    }),
  ],
});
