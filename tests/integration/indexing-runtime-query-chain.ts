import {
  assertIndexingRuntimeQueryScenario,
  runIndexingRuntimeQueryScenario,
} from "../shared/indexing-runtime-query-chain-scenario.ts";

async function main() {
  const scenario = await runIndexingRuntimeQueryScenario();

  assertIndexingRuntimeQueryScenario(scenario);

  console.log("indexing + runtime integration passed");
  console.log({
    indexingResult: scenario.indexingResult,
    answer: scenario.runtimeResult.answer,
    chunkIds: scenario.runtimeResult.chunks.map((chunk) => chunk.id),
    retrievalMetadata: scenario.runtimeResult.retrievalMetadata,
    debug: scenario.runtimeResult.debug,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
