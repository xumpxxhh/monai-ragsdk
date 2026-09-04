import { loadKnowledgeConfig } from './config/env.js';
import { createApp } from './app.js';
import { closeRetrieverPool } from './services/retriever-pool.js';
import { shutdownKnowledgeStack } from './services/stack.js';

const config = loadKnowledgeConfig();
const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`@monai-ragsdk/knowledge listening on http://localhost:${config.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await closeRetrieverPool();
  await shutdownKnowledgeStack();
}

process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});
