import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 示例 markdown 资产目录（与源码同级的 assets/）。 */
export const ASSETS_DIRECTORY = path.join(SRC_DIR, "..", "assets");

/** 示例输出 JSON 写入 src/ 目录，便于与源码对照。 */
export const OUTPUT_DIRECTORY = path.join(SRC_DIR, "..");

export function buildOutputPath(exampleId: string): string {
  return path.join(OUTPUT_DIRECTORY, `example-output.${exampleId}.tmp.json`);
}

/** RAG trace JSONL 输出路径；用于观察 run / runStream 每阶段的事件链路。 */
export function buildTraceOutputPath(exampleId: string): string {
  return path.join(OUTPUT_DIRECTORY, `observability-trace.${exampleId}.jsonl`);
}
