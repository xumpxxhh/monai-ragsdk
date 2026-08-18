import assert from 'node:assert/strict';

import { runRuntimeAdaptersQueryScenario } from '../shared/runtime-adapters-query-chain-scenario.ts';

async function main() {
  const { result } = await runRuntimeAdaptersQueryScenario();

  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0]?.id, 'chunk-runtime-api');
  assert.ok(result.answer.includes('runtime api for Explain runtime adapters'));

  console.log('runtime + adapters smoke passed');
  console.log({
    answer: result.answer,
    chunkCount: result.chunks.length,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
