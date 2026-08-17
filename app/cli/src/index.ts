import { runCli } from "./cli/runner.js";

runCli(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLI failed: ${message}`);
  process.exitCode = 1;
});
