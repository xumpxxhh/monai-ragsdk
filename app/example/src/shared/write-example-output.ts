import { writeFile } from "node:fs/promises";

import type { IndexingResult } from "@monai-ragsdk/indexing";
import type { RuntimeResult } from "@monai-ragsdk/runtime";

import type { ExampleConfig } from "./example-config.js";
import { ASSETS_DIRECTORY, buildOutputPath } from "./paths.js";

export type ExampleOutputPayload = {
  exampleId: string;
  description: string;
  config: ExampleConfig;
  indexing: IndexingResult;
  sourceRecordCount: number;
  query: string;
  result: RuntimeResult;
  traceFilePath?: string;
};

/** 把完整示例结果写入临时 JSON，避免大对象打进终端。 */
export async function writeExampleOutput(
  payload: ExampleOutputPayload,
): Promise<string> {
  const outputPath = buildOutputPath(payload.exampleId);

  await writeFile(
    outputPath,
    JSON.stringify(
      {
        exampleId: payload.exampleId,
        description: payload.description,
        assetsDirectory: ASSETS_DIRECTORY,
        pgvector: {
          tableName: payload.config.tableName,
          dimension: payload.config.dimension,
          ensureTable: true,
        },
        indexing: payload.indexing,
        sourceRecordCount: payload.sourceRecordCount,
        query: payload.query,
        answer: payload.result.answer,
        citations: payload.result.citations,
        chunks: payload.result.chunks.map((chunk) => ({
          id: chunk.id,
          content: chunk.content,
          metadata: chunk.metadata,
        })),
        generationMetadata: payload.result.generationMetadata,
        retrievalMetadata: payload.result.retrievalMetadata,
        ...(payload.traceFilePath
          ? { traceFilePath: payload.traceFilePath }
          : {}),
      },
      null,
      2,
    ),
    "utf8",
  );

  return outputPath;
}
