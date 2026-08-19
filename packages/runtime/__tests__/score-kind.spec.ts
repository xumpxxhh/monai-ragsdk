import { describe, expect, it } from 'vitest';

import { createDefaultRuntime, createScoreThresholdStrategy } from '../src/index.ts';
import { fuseByReciprocalRankFusion } from '../src/contract/index.ts';
import { applyScoreThresholdStrategy } from '../src/stages/post-retrieval/strategies/post-retrieval-strategies.ts';

describe('retrieval score kind', () => {
  it('refuses threshold comparison when scored candidates omit scoreKind', () => {
    const result = applyScoreThresholdStrategy(
      [
        { chunk: { id: 'chunk-1', content: 'high' }, score: 0.9 },
        { chunk: { id: 'chunk-2', content: 'low' }, score: 0.1 },
      ],
      0.5,
    );

    expect(result.selectedCandidates.map((candidate) => candidate.chunk.id)).toEqual([
      'chunk-1',
      'chunk-2',
    ]);
    expect(result.droppedCandidates).toEqual([]);
    expect(result.appliedScoreThreshold).toBe(0.5);
    expect(result.selectionTrace?.every((entry) => entry.reason === 'score-kind-unknown')).toBe(
      true,
    );
    expect(result.selectionTrace?.[0]?.metadata).toMatchObject({
      compared: false,
      skipReason: 'score-kind-unknown',
    });
  });

  it('refuses threshold comparison when scored candidates mix kinds', () => {
    const result = applyScoreThresholdStrategy(
      [
        { chunk: { id: 'chunk-1', content: 'rrf' }, score: 0.03, scoreKind: 'rrf' },
        { chunk: { id: 'chunk-2', content: 'llm' }, score: 0.9, scoreKind: 'llm' },
      ],
      0.5,
    );

    expect(result.droppedCandidates).toEqual([]);
    expect(result.selectionTrace?.every((entry) => entry.reason === 'score-kind-mismatch')).toBe(
      true,
    );
  });

  it('refuses threshold comparison when expectedScoreKind does not match', () => {
    const result = applyScoreThresholdStrategy(
      [{ chunk: { id: 'chunk-1', content: 'rrf' }, score: 0.03, scoreKind: 'rrf' }],
      0.2,
      { expectedScoreKind: 'retriever' },
    );

    expect(result.selectedCandidates).toHaveLength(1);
    expect(result.droppedCandidates).toEqual([]);
    expect(result.selectionTrace?.[0]?.reason).toBe('score-kind-unexpected');
  });

  it('compares scores when the batch shares one kind', () => {
    const result = applyScoreThresholdStrategy(
      [
        { chunk: { id: 'keep', content: 'keep' }, score: 0.03, scoreKind: 'rrf' },
        { chunk: { id: 'drop', content: 'drop' }, score: 0.01, scoreKind: 'rrf' },
      ],
      0.02,
    );

    expect(result.selectedCandidates.map((candidate) => candidate.chunk.id)).toEqual(['keep']);
    expect(result.droppedCandidates.map((candidate) => candidate.chunk.id)).toEqual(['drop']);
  });

  it('lets createScoreThresholdStrategy pass expectedScoreKind through', async () => {
    const strategy = createScoreThresholdStrategy({
      scoreThreshold: 0.2,
      expectedScoreKind: 'retriever',
    });

    const result = await strategy.apply(
      {
        request: {
          originalQuery: { query: 'q' },
          effectiveQuery: { query: 'q' },
        },
        candidates: [{ chunk: { id: 'c1', content: 'c1' }, score: 0.03, scoreKind: 'rrf' }],
      },
      {
        requestId: 'req-1',
        input: { query: 'q' },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(result.droppedCandidates).toEqual([]);
    expect(result.selectionTrace?.[0]?.reason).toBe('score-kind-unexpected');
  });

  it('stamps fused candidates as rrf even when enrichCandidate forgets the kind', () => {
    const fused = fuseByReciprocalRankFusion(
      [[{ chunk: { id: 'a', content: 'a' }, score: 0.9, scoreKind: 'retriever' }]],
      {
        enrichCandidate: (candidate, score) => ({ ...candidate, score }),
      },
    );

    expect(fused[0]?.scoreKind).toBe('rrf');
  });

  it('observes candidate.scoreKind instead of guessing retriever from provider', async () => {
    const events: Array<{ name?: string; attributes?: Record<string, unknown> }> = [];
    const runtime = createDefaultRuntime({
      observer: {
        async onEvent(event) {
          events.push(event);
        },
      },
      retriever: {
        async retrieve() {
          return {
            candidates: [
              { chunk: { id: 'chunk-1', content: 'c' }, score: 0.03, scoreKind: 'rrf' },
            ],
            retrievalMetadata: { provider: 'pgvector', fusedCandidateCount: 1 },
          };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return { chunks: candidates.map((candidate) => candidate.chunk) };
        },
      },
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    await runtime.run({ query: 'hello' });

    const retrievalComplete = events.find((event) => event.name === 'runtime.retrieval.complete');
    expect(retrievalComplete?.attributes).toMatchObject({
      candidates: [{ chunkId: 'chunk-1', score: 0.03, scoreKind: 'rrf' }],
    });
  });

  it('does not invent retriever scoreKind for unlabeled scores', async () => {
    const events: Array<{ name?: string; attributes?: Record<string, unknown> }> = [];
    const runtime = createDefaultRuntime({
      observer: {
        async onEvent(event) {
          events.push(event);
        },
      },
      retriever: {
        async retrieve() {
          return {
            candidates: [{ chunk: { id: 'chunk-1', content: 'c' }, score: 0.91 }],
            retrievalMetadata: { provider: 'unit-test' },
          };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return { chunks: candidates.map((candidate) => candidate.chunk) };
        },
      },
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    await runtime.run({ query: 'hello' });

    const retrievalComplete = events.find((event) => event.name === 'runtime.retrieval.complete');
    expect(retrievalComplete?.attributes).toMatchObject({
      candidates: [{ chunkId: 'chunk-1', score: 0.91 }],
    });
    expect(
      (retrievalComplete?.attributes?.candidates as Array<{ scoreKind?: string }>)[0],
    ).not.toHaveProperty('scoreKind');
  });
});
