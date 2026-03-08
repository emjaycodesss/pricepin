/**
 * Central logger for the web app. Use instead of console.log/warn/error so we can
 * switch to a reporting service or strip logs in production later.
 */

const PREFIX = '[PricePin]';

export const logger = {
  /** Debug / verbose; typically no-op in production. */
  debug(message: string, ...args: unknown[]): void {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(PREFIX, message, ...args);
    }
  },

  /** Informational (e.g. flow milestones). */
  info(message: string, ...args: unknown[]): void {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(PREFIX, message, ...args);
    }
  },

  /** Warnings (e.g. missing config, recoverable issues). */
  warn(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(PREFIX, message, ...args);
  },

  /** Errors (exceptions, failed requests). */
  error(message: string, error?: unknown, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error(PREFIX, message, error, ...args);
  },
};
