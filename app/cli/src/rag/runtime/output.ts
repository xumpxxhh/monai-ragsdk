import type { Chunk } from "@monai-ragsdk/core";
import type { IndexingResult } from "@monai-ragsdk/indexing";
import type { RuntimeResult, RuntimeRetrievalResult } from "@monai-ragsdk/runtime";

export function buildAnswer(input: { chunks: Chunk[]; query: string }): string {
  if (input.chunks.length === 0) {
    return `未找到可用上下文。query: ${input.query}`;
  }

  return [
    `query: ${input.query}`,
    ...input.chunks.map((chunk, index) => {
      const title =
        typeof chunk.metadata?.documentTitle === "string"
          ? chunk.metadata.documentTitle
          : chunk.id;
      return `[${index + 1}] ${title}\n${chunk.content}`;
    }),
  ].join("\n\n");
}

export function printAskSummary(input: {
  indexingResult: Pick<
    IndexingResult,
    "documentsIndexed" | "chunksTotal" | "vectorsTotal"
  >;
  runtimeResult: Pick<RuntimeResult, "answer" | "chunks">;
  traceFilePath: string;
  debug: boolean;
}): void {
  console.log("CLI indexing + runtime completed");
  console.log(`documentsIndexed: ${input.indexingResult.documentsIndexed}`);
  console.log(`chunksTotal: ${input.indexingResult.chunksTotal}`);
  console.log(`vectorsTotal: ${input.indexingResult.vectorsTotal}`);
  console.log(`retrievedChunks: ${input.runtimeResult.chunks.length}`);

  if (input.debug) {
    console.log(
      "retrieved chunk ids:",
      input.runtimeResult.chunks.map((chunk) => chunk.id),
    );
  }

  console.log("answer:");
  console.log(input.runtimeResult.answer);
  console.log(`traceFile: ${input.traceFilePath}`);
}

export function printIndexSummary(input: {
  indexingResult: Pick<
    IndexingResult,
    "documentsIndexed" | "chunksTotal" | "vectorsTotal"
  >;
  directoryPath: string;
  indexFilePath: string;
  traceFilePath: string;
}): void {
  console.log("CLI indexing completed");
  console.log(`directoryPath: ${input.directoryPath}`);
  console.log(`documentsIndexed: ${input.indexingResult.documentsIndexed}`);
  console.log(`chunksTotal: ${input.indexingResult.chunksTotal}`);
  console.log(`vectorsTotal: ${input.indexingResult.vectorsTotal}`);
  console.log(`indexFile: ${input.indexFilePath}`);
  console.log(`traceFile: ${input.traceFilePath}`);
}

export function printRuntimeAnswerSummary(input: {
  runtimeResult: Pick<RuntimeResult, "answer" | "chunks">;
  indexSource: string;
  traceFilePath: string;
  debug: boolean;
}): void {
  console.log("CLI runtime completed");
  console.log(`indexSource: ${input.indexSource}`);
  console.log(`retrievedChunks: ${input.runtimeResult.chunks.length}`);

  if (input.debug) {
    console.log(
      "retrieved chunk ids:",
      input.runtimeResult.chunks.map((chunk) => chunk.id),
    );
  }

  console.log("answer:");
  console.log(input.runtimeResult.answer);
  console.log(`traceFile: ${input.traceFilePath}`);
}

export function printRuntimeRetrievalSummary(input: {
  retrievalResult: RuntimeRetrievalResult;
  indexSource: string;
  traceFilePath: string;
  debug: boolean;
}): void {
  console.log("CLI runtime retrieval completed");
  console.log(`indexSource: ${input.indexSource}`);
  console.log(`candidateCount: ${input.retrievalResult.candidates.length}`);

  for (const [index, candidate] of input.retrievalResult.candidates.entries()) {
    const title =
      typeof candidate.chunk.metadata?.documentTitle === "string"
        ? candidate.chunk.metadata.documentTitle
        : candidate.chunk.id;
    const score =
      typeof candidate.score === "number" ? candidate.score.toFixed(6) : "n/a";

    console.log(`[${index + 1}] ${title}`);
    console.log(`  chunkId: ${candidate.chunk.id}`);
    console.log(`  score: ${score}`);

    if (candidate.sourceId) {
      console.log(`  sourceId: ${candidate.sourceId}`);
    }

    if (input.debug) {
      console.log(`  content: ${candidate.chunk.content}`);
      console.log(
        `  metadata: ${JSON.stringify(candidate.chunk.metadata ?? {})}`,
      );
    }
  }

  if (input.retrievalResult.retrievalMetadata) {
    console.log(
      `retrievalMetadata: ${JSON.stringify(input.retrievalResult.retrievalMetadata)}`,
    );
  }

  console.log(`traceFile: ${input.traceFilePath}`);
}
