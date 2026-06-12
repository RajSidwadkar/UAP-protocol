import pino from 'pino'
import type { ILoggerPort } from '../../application/ports/i-logger-port'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

export class PinoLoggerAdapter implements ILoggerPort {
  error(message: string, context?: Record<string, unknown>): void {
    logger.error(context ?? {}, message)
  }
  warn(message: string, context?: Record<string, unknown>): void {
    logger.warn(context ?? {}, message)
  }
  info(message: string, context?: Record<string, unknown>): void {
    logger.info(context ?? {}, message)
  }
  debug(message: string, context?: Record<string, unknown>): void {
    logger.debug(context ?? {}, message)
  }
}
