import { loadServerConfig } from './config/env.js';
import { createApp } from './app.js';
import { closeAllCollections, initCollectionRegistry } from './services/collection-registry.js';
import { shutdownSharedStack } from './services/shared-stack.js';

initCollectionRegistry();

const config = loadServerConfig();
const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`@monai-ragsdk/server listening on http://localhost:${config.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await closeAllCollections();
  await shutdownSharedStack();
}

process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});
