import type { Chunk, Vector } from '@monai-ragsdk/core';
import { type Embedder, MockEmbedder } from '@monai-ragsdk/indexing';
import type { RetrievalRequest, RuntimeRetrievalResult } from '@monai-ragsdk/runtime';

import type { IndexedChunkMap } from '../../types.js';
import { embedQuery } from '../../utils/embed-query.js';

export function createTrackingEmbedder(embedder: Embedder, chunkMap: IndexedChunkMap): Embedder {
  return {
    async embed(chunks: Chunk[]) {
      for (const chunk of chunks) {
        chunkMap.set(chunk.id, chunk);
      }

      const vectors = await embedder.embed(chunks);

      return vectors.map((vector) => {
        const chunk = chunkMap.get(vector.id);

        return {
          ...vector,
          metadata: {
            ...(vector.metadata ?? {}),
            ...(chunk ? { content: chunk.content } : {}),
          },
        };
      });
    },
  };
}

export async function retrieveRankedChunks(input: {
  embedder: MockEmbedder;
  request: RetrievalRequest;
  topK: number;
  vectors: Vector[];
  chunkMap: IndexedChunkMap;
}): Promise<RuntimeRetrievalResult> {
  const queryVector = await embedQuery(input.embedder, input.request.effectiveQuery.query);
  const candidates = rankVectors({
    chunkMap: input.chunkMap,
    queryVector,
    request: input.request,
    topK: input.topK,
    vectors: input.vectors,
  });

  return {
    candidates: candidates.map((candidate) => ({
      chunk: candidate.chunk,
      score: candidate.score,
      sourceId: readSourceId(candidate.chunk),
      metadata: candidate.chunk.metadata,
    })),
    retrievalMetadata: {
      topK: input.topK,
      candidateCount: candidates.length,
    },
  };
}

function rankVectors(input: {
  vectors: Vector[];
  queryVector: number[];
  chunkMap: IndexedChunkMap;
  request: RetrievalRequest;
  topK: number;
}): Array<{ chunk: Chunk; score: number }> {
  return input.vectors
    .map((vector) => {
      const chunk = input.chunkMap.get(vector.id);

      if (!chunk) {
        return undefined;
      }

      return {
        chunk,
        score: cosineSimilarity(input.queryVector, vector.values),
      };
    })
    .filter((item): item is { chunk: Chunk; score: number } => Boolean(item))
    .sort((left, right) => right.score - left.score)
    .slice(0, input.request.budget?.maxChunks ?? input.topK);
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return Number((dot / Math.sqrt(leftNorm * rightNorm)).toFixed(6));
}

function readSourceId(chunk: Chunk): string | undefined {
  const value = chunk.metadata?.sourceId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
