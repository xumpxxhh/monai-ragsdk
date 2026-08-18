import type { RAGErrorRecord } from '../types/rag-error-record.js';
import type { RAGEvent, RAGEventAction } from '../types/rag-event.js';
import type { RAGTrace } from '../types/rag-trace.js';

export type ConsoleObserverLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ConsoleOutputOptions {
  level?: ConsoleObserverLevel;
  includeAttributes?: boolean;
}

const levelPriority: Record<ConsoleObserverLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function readAction(name: string): RAGEventAction | undefined {
  const action = name.split('.').at(-1);

  if (
    action === 'receive' ||
    action === 'preprocess' ||
    action === 'start' ||
    action === 'complete' ||
    action === 'fail' ||
    action === 'select' ||
    action === 'drop' ||
    action === 'store'
  ) {
    return action;
  }

  return undefined;
}

export function resolveEventLevel(event: RAGEvent): ConsoleObserverLevel {
  const action = readAction(event.name);

  switch (action) {
    case 'fail':
      return 'error';
    case 'receive':
    case 'start':
      return 'debug';
    default:
      return 'info';
  }
}

export function formatEvent(event: RAGEvent): string {
  const durationSuffix = typeof event.durationMs === 'number' ? ` ${event.durationMs}ms` : '';

  return `[${event.scope}] ${event.name}${durationSuffix}`;
}

export function formatError(error: RAGErrorRecord): string {
  return `[${error.scope}] ${error.name} ${error.error.name}: ${error.error.message}`;
}

export function formatTrace(trace: RAGTrace): string {
  const durationSuffix = typeof trace.durationMs === 'number' ? ` ${trace.durationMs}ms` : '';

  return `[${trace.scope}] trace.${trace.status}${durationSuffix} events=${trace.events.length}`;
}

export function shouldLog(
  configuredLevel: ConsoleObserverLevel,
  targetLevel: ConsoleObserverLevel,
): boolean {
  return levelPriority[targetLevel] >= levelPriority[configuredLevel];
}

export function writeConsole(
  level: ConsoleObserverLevel,
  message: string,
  payload?: unknown,
): void {
  if (payload === undefined) {
    console[level](message);
    return;
  }

  console[level](message, payload);
}
