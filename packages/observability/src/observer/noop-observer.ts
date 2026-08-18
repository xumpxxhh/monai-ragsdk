import type { RAGObserver } from './rag-observer.js';

class NoopRAGObserver implements RAGObserver {
  async onEvent(): Promise<void> {}

  async onError(): Promise<void> {}

  async onTraceEnd(): Promise<void> {}

  async flush(): Promise<void> {}

  async shutdown(): Promise<void> {}
}

export const NoopObserver: RAGObserver = new NoopRAGObserver();
