import consola from 'consola';

export const getCallerLocation = (): string => {
  const err = new Error();
  const stack = err.stack
    ?.split('\n')
    .slice(2) // remove "Error" and getFullStack frame
    .map(line => line.trim())
    .join('\n') || 'No stack trace available';

  return '\n\x1b[33m' + stack + '\x1b[0m\n';
};

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'success' | 'debug' | 'fatal';

const wrapWithLocation = (method: LogLevel) => {
  return (...args: any[]) => {
    const location = getCallerLocation();
    consola[method](`[${location}]`, ...args);
  };
};

// Custom logger with location-enhanced methods
export const logger = {
  log: wrapWithLocation('log'),
  info: wrapWithLocation('info'),
  warn: wrapWithLocation('warn'),
  error: wrapWithLocation('error'),
  success: wrapWithLocation('success'),
  debug: wrapWithLocation('debug'),
  fatal: wrapWithLocation('fatal'),
};
