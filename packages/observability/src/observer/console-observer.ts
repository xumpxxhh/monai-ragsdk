import type { RAGErrorRecord } from "../types/rag-error-record.js";
import type { RAGEvent } from "../types/rag-event.js";
import type { RAGTrace } from "../types/rag-trace.js";
import {
  formatError,
  formatEvent,
  formatTrace,
  resolveEventLevel,
  shouldLog,
  writeConsole,
  type ConsoleObserverLevel,
  type ConsoleOutputOptions,
} from "../formatters/index.js";
import { invokeObserverSafely } from "../utils/index.js";
import type { RAGObserver } from "./rag-observer.js";

export interface ConsoleObserverOptions extends ConsoleOutputOptions {}

export function createConsoleObserver(
  options: ConsoleObserverOptions = {},
): RAGObserver {
  const configuredLevel = options.level ?? "info";
  const includeAttributes =
    options.includeAttributes ?? configuredLevel === "debug";

  return {
    async onEvent(event) {
      const eventLevel = resolveEventLevel(event);

      if (!shouldLog(configuredLevel, eventLevel)) {
        return;
      }

      await invokeObserverSafely(async () => {
        writeConsole(
          eventLevel,
          formatEvent(event),
          includeAttributes ? event.attributes : undefined,
        );
      });
    },

    async onError(error) {
      if (!shouldLog(configuredLevel, "error")) {
        return;
      }

      await invokeObserverSafely(async () => {
        writeConsole(
          "error",
          formatError(error),
          includeAttributes ? error.attributes : undefined,
        );
      });
    },

    async onTraceEnd(trace) {
      const traceLevel: ConsoleObserverLevel =
        trace.status === "error" ? "error" : "info";

      if (!shouldLog(configuredLevel, traceLevel)) {
        return;
      }

      await invokeObserverSafely(async () => {
        writeConsole(traceLevel, formatTrace(trace));
      });
    },

    async flush() {},

    async shutdown() {},
  };
}
