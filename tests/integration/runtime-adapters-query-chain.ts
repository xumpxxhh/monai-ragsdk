import {
  assertRuntimeAdaptersQueryScenario,
  runRuntimeAdaptersQueryScenario,
} from '../shared/runtime-adapters-query-chain-scenario.ts';

async function main() {
  const scenario = await runRuntimeAdaptersQueryScenario();

  assertRuntimeAdaptersQueryScenario(scenario);

  console.log('runtime + adapters integration passed');
  console.log({
    answer: scenario.result.answer,
    chunkIds: scenario.result.chunks.map((chunk) => chunk.id),
    debug: scenario.result.debug,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
