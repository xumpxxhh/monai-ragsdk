import assert from "node:assert/strict";

import { runIndexingRuntimeQueryScenario } from "../shared/indexing-runtime-query-chain-scenario.ts";

async function main() {
  const { indexingResult, runtimeResult } =
    await runIndexingRuntimeQueryScenario();

  assert.equal(indexingResult.documentsIndexed, 2);
  assert.equal(runtimeResult.chunks.length, 1);
  assert.equal(runtimeResult.chunks[0]?.id, "doc-runtime-api#0");
  assert.equal(runtimeResult.retrievalMetadata?.indexingMode, "incremental");

  console.log("indexing + runtime smoke passed");
  console.log({
    documentsIndexed: indexingResult.documentsIndexed,
    answer: runtimeResult.answer,
    chunkIds: runtimeResult.chunks.map((chunk) => chunk.id),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
