import { APP_SLUG } from "./constants";

export interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** Console logger with a `[slug:scope]` prefix; `debug` output only appears when `verbose` is true. */
export function createLogger(scope: string, verbose: () => boolean = () => false): Logger {
  const prefix = `[${APP_SLUG}:${scope}]`;
  return {
    debug: (...args) => {
      if (verbose()) console.log(prefix, ...args);
    },
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
