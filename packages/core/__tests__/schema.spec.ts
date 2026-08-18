import { describe, expect, it } from 'vitest';

import {
  ChunkSchema,
  DocumentSchema,
  JsonObjectSchema,
  JsonValueSchema,
  QuerySchema,
  RAGResponseSchema,
  VectorSchema,
} from '../src/index.ts';

describe('core schemas', () => {
  it('accepts a valid query', () => {
    expect(QuerySchema.parse({ query: 'What is RAG?' })).toEqual({
      query: 'What is RAG?',
    });
  });

  it('accepts a query with replay metadata', () => {
    expect(
      QuerySchema.parse({
        query: 'What is RAG?',
        metadata: { route: 'docs', source: 'unit-test' },
      }),
    ).toEqual({
      query: 'What is RAG?',
      metadata: { route: 'docs', source: 'unit-test' },
    });
  });

  it('rejects an empty query', () => {
    const result = QuerySchema.safeParse({ query: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['query']);
  });

  it('accepts deeply nested json values', () => {
    expect(
      JsonValueSchema.parse({
        level1: {
          level2: ['text', 1, true, null, { level3: ['leaf'] }],
        },
      }),
    ).toMatchObject({
      level1: {
        level2: ['text', 1, true, null, { level3: ['leaf'] }],
      },
    });
  });

  it('rejects unsupported json values', () => {
    const result = JsonValueSchema.safeParse({ invalid: undefined });

    expect(result.success).toBe(false);
    expect(result.error?.issues.length).toBeGreaterThan(0);
  });

  it('accepts plain json objects', () => {
    expect(
      JsonObjectSchema.parse({
        source: 'unit-test',
        stats: {
          score: 0.99,
          tags: ['rag', 'core'],
        },
      }),
    ).toMatchObject({
      source: 'unit-test',
      stats: {
        score: 0.99,
        tags: ['rag', 'core'],
      },
    });
  });

  it('accepts chunk metadata as a json object', () => {
    expect(
      ChunkSchema.parse({
        id: 'chunk-1',
        content: 'RAG combines retrieval and generation.',
        metadata: {
          source: 'unit-test',
          score: 0.99,
        },
      }),
    ).toMatchObject({
      id: 'chunk-1',
      metadata: {
        source: 'unit-test',
        score: 0.99,
      },
    });
  });

  it('accepts a valid document', () => {
    expect(
      DocumentSchema.parse({
        id: 'doc-1',
        content: 'raw source content',
        metadata: {
          source: 'markdown',
          tags: ['rag', 'indexing'],
        },
      }),
    ).toMatchObject({
      id: 'doc-1',
      content: 'raw source content',
      metadata: {
        source: 'markdown',
        tags: ['rag', 'indexing'],
      },
    });
  });

  it('accepts a valid vector', () => {
    expect(
      VectorSchema.parse({
        id: 'vector-1',
        values: [0.1, 0.2, 0.3],
        metadata: {
          documentId: 'doc-1',
          source: 'unit-test',
        },
      }),
    ).toMatchObject({
      id: 'vector-1',
      values: [0.1, 0.2, 0.3],
      metadata: {
        documentId: 'doc-1',
        source: 'unit-test',
      },
    });
  });

  it('rejects non-object metadata', () => {
    const result = ChunkSchema.safeParse({
      id: 'chunk-2',
      content: 'invalid metadata',
      metadata: ['not-object'],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'metadata')).toBe(true);
  });

  it('accepts a minimal audit rag response', () => {
    const query = { query: 'What is RAG?' };
    const chunk = {
      id: 'chunk-1',
      content: 'retrieved context',
    };

    expect(
      RAGResponseSchema.parse({
        answer: 'RAG combines retrieval and generation.',
        chunks: [chunk],
        originalQuery: query,
        effectiveQuery: query,
        citations: [
          {
            index: 1,
            chunkId: chunk.id,
          },
        ],
      }),
    ).toMatchObject({
      answer: 'RAG combines retrieval and generation.',
      chunks: [{ id: 'chunk-1', content: 'retrieved context' }],
      originalQuery: query,
      effectiveQuery: query,
      citations: [{ index: 1, chunkId: 'chunk-1' }],
    });
  });

  it('accepts optional replay and decision-trace fields', () => {
    const query = { query: 'What is RAG?' };

    expect(
      RAGResponseSchema.parse({
        answer: 'RAG combines retrieval and generation.',
        chunks: [{ id: 'chunk-1', content: 'kept context' }],
        originalQuery: query,
        effectiveQuery: { query: 'retrieval augmented generation' },
        citations: [{ index: 1, chunkId: 'chunk-1', score: 0.91 }],
        requestId: 'runtime:what-is-rag:1',
        startedAt: Date.UTC(2026, 7, 18, 8, 0, 0),
        endedAt: Date.UTC(2026, 7, 18, 8, 0, 1),
        subQueries: [{ query: 'retrieval augmented generation' }],
        rewriteReason: 'query-expansion',
        route: 'docs',
        strategies: {
          preRetrieval: ['query-expansion'],
          retrieval: ['fan-out'],
          postRetrieval: ['score-threshold', 'budget-trim'],
        },
        topK: 4,
        filters: {
          sourceIds: ['docs/runtime'],
          metadata: { sourceId: 'docs/runtime' },
        },
        budget: { maxChunks: 4, maxPromptChars: 2000 },
        appliedBudget: { maxChunks: 4, maxPromptChars: 1200 },
        rerank: { strategy: 'llm-rerank', minScore: 0.5 },
        indexingMode: 'incremental',
        droppedChunkIds: ['chunk-2'],
        retrievedCandidates: [
          {
            chunkId: 'chunk-1',
            score: 0.91,
            sourceId: 'docs/runtime',
            strategy: 'fan-out',
          },
          {
            chunkId: 'chunk-2',
            score: 0.12,
            sourceId: 'docs/faq',
          },
        ],
        selectionTrace: [
          {
            chunkId: 'chunk-1',
            selected: true,
            reason: 'selected',
            stage: 'budget-trim',
            score: 0.91,
            order: 1,
            sourceId: 'docs/runtime',
          },
          {
            chunkId: 'chunk-2',
            selected: false,
            reason: 'score-threshold',
            score: 0.12,
            sourceId: 'docs/faq',
          },
        ],
        appliedScoreThreshold: 0.5,
        counts: {
          retrieved: 2,
          selected: 1,
          dropped: 1,
          finalChunks: 1,
        },
        timings: {
          retrieval: 8,
          generation: 3,
          total: 12,
        },
        traceId: 'trace-what-is-rag',
        streamed: false,
        generationModel: 'demo-model',
        promptContext: 'kept context',
        retrievalMetadata: { provider: 'fan-out' },
        postRetrievalMetadata: { selected: 1 },
        generationMetadata: { model: 'demo' },
        debug: { timings: { total: 12 } },
      }),
    ).toMatchObject({
      rewriteReason: 'query-expansion',
      strategies: {
        preRetrieval: ['query-expansion'],
        retrieval: ['fan-out'],
        postRetrieval: ['score-threshold', 'budget-trim'],
      },
      droppedChunkIds: ['chunk-2'],
      appliedScoreThreshold: 0.5,
      counts: {
        retrieved: 2,
        selected: 1,
        dropped: 1,
        finalChunks: 1,
      },
    });
  });

  it('rejects a rag response with a non-string answer', () => {
    const result = RAGResponseSchema.safeParse({
      answer: 123,
      chunks: [],
      originalQuery: { query: 'What is RAG?' },
      effectiveQuery: { query: 'What is RAG?' },
      citations: [],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['answer']);
  });

  it('rejects a rag response missing citations', () => {
    const result = RAGResponseSchema.safeParse({
      answer: 'RAG combines retrieval and generation.',
      chunks: [],
      originalQuery: { query: 'What is RAG?' },
      effectiveQuery: { query: 'What is RAG?' },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'citations')).toBe(true);
  });

  it('rejects citations that do not align with chunks', () => {
    const result = RAGResponseSchema.safeParse({
      answer: 'RAG combines retrieval and generation.',
      chunks: [{ id: 'chunk-1', content: 'kept context' }],
      originalQuery: { query: 'What is RAG?' },
      effectiveQuery: { query: 'What is RAG?' },
      citations: [{ index: 2, chunkId: 'chunk-other' }],
    });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        (issue) =>
          issue.path[0] === 'citations' && (issue.path[1] === 0 || issue.path.length === 1),
      ),
    ).toBe(true);
  });

  it('rejects ISO-8601 strings for startedAt and endedAt', () => {
    const result = RAGResponseSchema.safeParse({
      answer: 'RAG combines retrieval and generation.',
      chunks: [],
      originalQuery: { query: 'What is RAG?' },
      effectiveQuery: { query: 'What is RAG?' },
      citations: [],
      startedAt: '2026-08-18T08:00:00.000Z',
      endedAt: '2026-08-18T08:00:01.000Z',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'startedAt')).toBe(true);
  });

  it('rejects endedAt earlier than startedAt', () => {
    const result = RAGResponseSchema.safeParse({
      answer: 'RAG combines retrieval and generation.',
      chunks: [],
      originalQuery: { query: 'What is RAG?' },
      effectiveQuery: { query: 'What is RAG?' },
      citations: [],
      startedAt: Date.UTC(2026, 7, 18, 8, 0, 1),
      endedAt: Date.UTC(2026, 7, 18, 8, 0, 0),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'endedAt')).toBe(true);
  });

  it('rejects a non-finite score threshold', () => {
    const result = RAGResponseSchema.safeParse({
      answer: 'RAG combines retrieval and generation.',
      chunks: [],
      originalQuery: { query: 'What is RAG?' },
      effectiveQuery: { query: 'What is RAG?' },
      citations: [],
      appliedScoreThreshold: Number.NaN,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'appliedScoreThreshold')).toBe(
      true,
    );
  });

  it('rejects an empty chunk id', () => {
    const result = ChunkSchema.safeParse({
      id: '',
      content: 'missing id',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['id']);
  });

  it('rejects a single string as stage strategies', () => {
    const result = RAGResponseSchema.safeParse({
      answer: 'RAG combines retrieval and generation.',
      chunks: [],
      originalQuery: { query: 'What is RAG?' },
      effectiveQuery: { query: 'What is RAG?' },
      citations: [],
      strategies: 'query-expansion',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'strategies')).toBe(true);
  });
});
