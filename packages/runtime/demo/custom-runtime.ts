import {
  createIndexingRetrievalCandidate,
  createIndexingRetrievalFilters,
  createIndexingRetrievalRequest,
  createRuntime,
  filterRetrievalCandidatesByIndexingFilters,
} from '../dist/index.js';

const runtime = createRuntime({
  preprocessor: {
    async preprocess(input) {
      return createIndexingRetrievalRequest({
        originalQuery: { query: input.query },
        effectiveQuery: { query: `${input.query} site:docs` },
        route: 'docs-only',
        rewriteReason: 'demo rewrite',
        topK: 2,
        strategy: 'metadata-first',
        indexingMode: 'incremental',
        filters: createIndexingRetrievalFilters({
          sourceIds: ['docs/runtime'],
          hierarchyPath: ['runtime', 'api'],
        }),
        budget: {
          maxCandidates: 2,
          maxChunks: 1,
        },
        rerank: {
          strategy: 'score-threshold',
          minScore: 0.75,
        },
      });
    },
  },
  retriever: {
    async retrieve(request) {
      const candidates = [
        createIndexingRetrievalCandidate(
          {
            id: 'doc-1',
            content: `candidate 1 for ${request.effectiveQuery.query}`,
            metadata: {
              sourceId: 'docs/runtime',
              fingerprint: 'doc-1-fingerprint',
              hierarchyPath: ['runtime', 'api'],
              parentHierarchyPath: ['runtime'],
              hierarchyDepth: 2,
            },
          },
          {
            score: 0.8,
            route: request.route,
            strategy: request.strategy,
            filters: request.filters,
          },
        ),
        createIndexingRetrievalCandidate(
          {
            id: 'doc-2',
            content: `candidate 2 for ${request.effectiveQuery.query}`,
            metadata: {
              sourceId: 'docs/runtime',
              fingerprint: 'doc-2-fingerprint',
              hierarchyPath: ['runtime', 'faq'],
              parentHierarchyPath: ['runtime'],
              hierarchyDepth: 2,
            },
          },
          {
            score: 0.7,
            route: request.route,
            strategy: request.strategy,
            filters: request.filters,
          },
        ),
      ];

      return {
        candidates: filterRetrievalCandidatesByIndexingFilters(candidates, request.filters),
        retrievalMetadata: {
          route: request.route ?? 'unknown',
        },
      };
    },
  },
  postprocessor: {
    async postprocess({ request, candidates }) {
      const selectedCandidates = [...candidates]
        .filter((candidate) => candidate.score !== undefined && candidate.score >= 0.75)
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
      const droppedCandidates = candidates.filter(
        (candidate) => !selectedCandidates.includes(candidate),
      );

      return {
        chunks: selectedCandidates.map((candidate) => candidate.chunk),
        selectedCandidates,
        droppedCandidates,
        selectionTrace: candidates.map((candidate) => ({
          candidate,
          selected: selectedCandidates.includes(candidate),
          reason: selectedCandidates.includes(candidate) ? 'selected' : 'score-threshold',
          stage: 'score-threshold',
          score: candidate.score,
        })),
        appliedScoreThreshold: 0.75,
        promptContext: [
          `query: ${request.effectiveQuery.query}`,
          ...selectedCandidates.map((candidate) => `- ${candidate.chunk.content}`),
        ].join('\n'),
      };
    },
  },
  generator: {
    async generate({ request, promptContext }) {
      return {
        answer: `answer for ${request.effectiveQuery.query}: ${promptContext}`,
        generationMetadata: {
          style: 'custom',
        },
      };
    },
  },
});

const result = await runtime.run(
  { query: 'How does runtime orchestration work?' },
  { includeDebug: true },
);

console.log('runtime custom demo passed');
console.log(result);
