import {
  printExampleCatalog,
  runAllExamples,
  runExampleById,
} from "./examples/registry.js";

/**
 * 示例入口：只负责解析参数并调度 examples/ 下的完整流程。
 * - pnpm start list
 * - pnpm start basic-stream
 * - EXAMPLE=full-pipeline pnpm start
 */
async function main(): Promise<void> {
  const selected =
    process.argv[2]?.trim() || process.env.EXAMPLE?.trim() || "basic-stream";

  if (selected === "list") {
    printExampleCatalog();
    return;
  }

  if (selected === "all") {
    await runAllExamples();
    return;
  }

  await runExampleById(selected);
}

await main();
