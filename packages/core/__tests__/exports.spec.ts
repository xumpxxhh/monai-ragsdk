import { describe, expect, expectTypeOf, it } from 'vitest';

import * as srcExports from '../src/index.ts';
import * as distExports from '../dist/index.js';
import type {
  Chunk,
  Document,
  Generator,
  Query,
  RAGCitation,
  RAGCounts,
  RAGFilters,
  RAGPipeline,
  RAGResponse,
  RAGRetrievedCandidate,
  RAGSelectionTraceEntry,
  RAGStageStrategies,
  Retriever,
  Vector,
} from '../src/index.ts';

describe('core export surface', () => {
  it('keeps dist runtime exports aligned with src runtime exports', () => {
    expect(Object.keys(distExports).sort()).toEqual(Object.keys(srcExports).sort());
  });

  it('exposes schemas and error constructors from dist', () => {
    expect(distExports.QuerySchema).toBeDefined();
    expect(distExports.ChunkSchema).toBeDefined();
    expect(distExports.DocumentSchema).toBeDefined();
    expect(distExports.VectorSchema).toBeDefined();
    expect(distExports.RAGCitationSchema).toBeDefined();
    expect(distExports.RAGSelectionTraceEntrySchema).toBeDefined();
    expect(distExports.RAGStageStrategiesSchema).toBeDefined();
    expect(distExports.RAGFiltersSchema).toBeDefined();
    expect(distExports.RAGBudgetSchema).toBeDefined();
    expect(distExports.RAGRerankSchema).toBeDefined();
    expect(distExports.RAGCountsSchema).toBeDefined();
    expect(distExports.RAGTimingsSchema).toBeDefined();
    expect(distExports.RAGRetrievedCandidateSchema).toBeDefined();
    expect(distExports.RAGResponseSchema).toBeDefined();
    expect(distExports.JsonValueSchema).toBeDefined();
    expect(distExports.JsonObjectSchema).toBeDefined();
    expect(distExports.RAGCoreError).toBeDefined();
    expect(distExports.ValidationError).toBeDefined();
    expect(distExports.RetrievalError).toBeDefined();
    expect(distExports.GenerationError).toBeDefined();
  });

  it('preserves the intended public types', () => {
    expectTypeOf<Query>().toMatchObjectType<{
      query: string;
      metadata?: Record<string, unknown>;
    }>();
    expectTypeOf<Chunk>().toMatchObjectType<{
      id: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>();
    expectTypeOf<Document>().toMatchObjectType<{
      id: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>();
    expectTypeOf<Vector>().toMatchObjectType<{
      id: string;
      values: number[];
      metadata?: Record<string, unknown>;
    }>();
    expectTypeOf<RAGCitation>().toMatchObjectType<{
      index: number;
      chunkId: string;
    }>();
    expectTypeOf<RAGSelectionTraceEntry>().toMatchObjectType<{
      chunkId: string;
      selected: boolean;
      reason: string;
    }>();
    expectTypeOf<RAGStageStrategies>().toMatchObjectType<{
      preRetrieval?: string[];
      retrieval?: string[];
      postRetrieval?: string[];
      generation?: string[];
    }>();
    expectTypeOf<RAGFilters>().toMatchObjectType<{
      sourceIds?: string[];
      metadata?: Record<string, unknown>;
    }>();
    expectTypeOf<RAGCounts>().toMatchObjectType<{
      retrieved: number;
      selected: number;
      dropped: number;
      finalChunks: number;
    }>();
    expectTypeOf<RAGRetrievedCandidate>().toMatchObjectType<{
      chunkId: string;
    }>();
    expectTypeOf<RAGResponse>().toMatchObjectType<{
      answer: string;
      chunks: Chunk[];
      citations: RAGCitation[];
      originalQuery: Query;
      effectiveQuery: Query;
    }>();
    expectTypeOf<Retriever>().toHaveProperty('retrieve');
    expectTypeOf<Generator>().toHaveProperty('generate');
    expectTypeOf<RAGPipeline>().toBeFunction();
  });
});
