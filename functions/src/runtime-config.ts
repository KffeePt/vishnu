import * as functions from 'firebase-functions/v1';

type ConfigRoot = Record<string, unknown>;

function readFunctionsConfigRoot(): ConfigRoot {
  try {
    const configGetter = (functions as unknown as { config?: () => unknown }).config;
    const config = typeof configGetter === 'function' ? configGetter() : {};
    return (config && typeof config === 'object') ? config as ConfigRoot : {};
  } catch {
    return {};
  }
}

function readNestedConfigValue(path: string[]): string {
  let current: unknown = readFunctionsConfigRoot();
  for (const segment of path) {
    if (!current || typeof current !== 'object') {
      return '';
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current.trim() : '';
}

export function getRuntimeConfigValue(options: {
  envNames: string[];
  configPath?: string[];
  normalizeNewlines?: boolean;
}): string {
  for (const envName of options.envNames) {
    const value = process.env[envName];
    if (typeof value === 'string' && value.trim()) {
      return options.normalizeNewlines ? value.replace(/\\n/g, '\n') : value.trim();
    }
  }

  if (options.configPath && options.configPath.length > 0) {
    const fallback = readNestedConfigValue(options.configPath);
    if (fallback) {
      return options.normalizeNewlines ? fallback.replace(/\\n/g, '\n') : fallback;
    }
  }

  return '';
}
