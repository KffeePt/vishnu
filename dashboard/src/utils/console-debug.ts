/* eslint-disable no-console */

type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

interface LogDetails {
  component?: string;
  function?: string;
  endpoint?: string;
  status?: number;
  [key: string]: any;
}

const isDevelopment = process.env.NODE_ENV === 'development';

const logToConsole = (level: LogLevel, message: string, details: LogDetails = {}) => {
  if (!isDevelopment) {
    // In production, you might send this to a logging service
    return;
  }

  const timestamp = new Date().toISOString();
  const colorMap: { [key in LogLevel]: string } = {
    log: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    info: '\x1b[36m', // cyan
    debug: '\x1b[35m', // magenta
  };
  const resetColor = '\x1b[0m';

  let logString = `${colorMap[level]}[${timestamp}] [${level.toUpperCase()}]${resetColor} ${message}`;

  const formattedDetails: { [key: string]: any } = {};
  for (const key in details) {
    if (Object.prototype.hasOwnProperty.call(details, key)) {
      formattedDetails[key] = details[key];
    }
  }

  if (Object.keys(formattedDetails).length > 0) {
    logString += `\n${JSON.stringify(formattedDetails, null, 2)}`;
  }

  console[level](logString);
};

export const consoleDebug = {
  log: (message: string, details?: LogDetails) => logToConsole('log', message, details),
  warn: (message: string, details?: LogDetails) => logToConsole('warn', message, details),
  error: (message: string, details?: LogDetails) => logToConsole('error', message, details),
  info: (message: string, details?: LogDetails) => logToConsole('info', message, details),
  debug: (message: string, details?: LogDetails) => logToConsole('debug', message, details),
};
