import type {
  PostRetrievalSelectionStage,
  PostRetrievalSelectionReason,
  PostRetrievalSelectionTraceEntry,
  RetrievalBudget,
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
} from '../../../types/index.js';

type CandidateDecision = {
  candidate: RetrievalCandidate;
  selected: boolean;
  reason: PostRetrievalSelectionReason;
  stage: PostRetrievalSelectionStage;
  order?: number;
  metadata?: Record<string, unknown>;
};

export type CandidatePredicate = (input: {
  candidate: RetrievalCandidate;
  request: RetrievalRequest;
  context: RuntimeContext;
}) => boolean | Promise<boolean>;

export type CandidateComparator = (
  left: RetrievalCandidate,
  right: RetrievalCandidate,
  input: {
    request: RetrievalRequest;
    context: RuntimeContext;
  },
) => number;

export type NearDuplicateRemovalConfig = {
  enabled?: boolean;
  similarityThreshold?: number;
  fingerprintBased?: boolean;
  comparator?: CandidateComparator;
};

export type SourceCoverageConfig = {
  enabled?: boolean;
  maxPerSource?: number;
  distribution?: 'balanced';
  getSourceKey?: (candidate: RetrievalCandidate) => string | undefined;
};

export type ScoreThresholdStrategyResult = {
  selectedCandidates: RetrievalCandidate[];
  droppedCandidates: RetrievalCandidate[];
  selectionTrace: PostRetrievalSelectionTraceEntry[];
  appliedScoreThreshold?: number;
};

export type CandidatePredicateStrategyResult = {
  selectedCandidates: RetrievalCandidate[];
  droppedCandidates: RetrievalCandidate[];
  selectionTrace: PostRetrievalSelectionTraceEntry[];
  appliedCandidatePredicate: boolean;
};

export type BudgetTrimStrategyResult = {
  selectedCandidates: RetrievalCandidate[];
  droppedCandidates: RetrievalCandidate[];
  selectionTrace: PostRetrievalSelectionTraceEntry[];
  appliedBudget?: RetrievalBudget;
};

export type CandidateOrderingStrategyResult = {
  candidates: RetrievalCandidate[];
  selectionTrace: PostRetrievalSelectionTraceEntry[];
};

export type NearDuplicateRemovalStrategyResult = {
  selectedCandidates: RetrievalCandidate[];
  droppedCandidates: RetrievalCandidate[];
  selectionTrace: PostRetrievalSelectionTraceEntry[];
  appliedNearDuplicateRemoval: boolean;
};

export type SourceCoverageStrategyResult = {
  selectedCandidates: RetrievalCandidate[];
  droppedCandidates: RetrievalCandidate[];
  selectionTrace: PostRetrievalSelectionTraceEntry[];
  appliedSourceCoverage: boolean;
};

function normalizeCandidateContent(candidate: RetrievalCandidate): string {
  return candidate.chunk.content.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenizeContent(content: string): Set<string> {
  return new Set(content.split(/\s+/).filter(Boolean));
}

function calculateTokenSetSimilarity(left: string, right: string): number {
  if (left.length === 0 || right.length === 0) {
    return left === right ? 1 : 0;
  }

  const leftTokens = tokenizeContent(left);
  const rightTokens = tokenizeContent(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return left === right ? 1 : 0;
  }

  let intersection = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function defaultDuplicateComparator(left: RetrievalCandidate, right: RetrievalCandidate): number {
  const leftScore = left.score ?? Number.NEGATIVE_INFINITY;
  const rightScore = right.score ?? Number.NEGATIVE_INFINITY;

  if (leftScore === rightScore) {
    return 0;
  }

  return rightScore - leftScore;
}

function resolveDuplicateComparator(
  config: NearDuplicateRemovalConfig | undefined,
): CandidateComparator {
  return config?.comparator ?? ((left, right) => defaultDuplicateComparator(left, right));
}

function findDuplicateMatch(
  candidate: RetrievalCandidate,
  selectedCandidates: RetrievalCandidate[],
  config: NearDuplicateRemovalConfig | undefined,
):
  | {
      matchedCandidate: RetrievalCandidate;
      similarity: number;
      fingerprintMatch: boolean;
    }
  | undefined {
  const shouldUseFingerprint = config?.fingerprintBased !== false;
  const candidateFingerprint = candidate.fingerprint;
  const normalizedContent = normalizeCandidateContent(candidate);
  const similarityThreshold = config?.similarityThreshold ?? 0.9;

  for (const selectedCandidate of selectedCandidates) {
    if (
      shouldUseFingerprint &&
      candidateFingerprint !== undefined &&
      candidateFingerprint.length > 0 &&
      candidateFingerprint === selectedCandidate.fingerprint
    ) {
      return {
        matchedCandidate: selectedCandidate,
        similarity: 1,
        fingerprintMatch: true,
      };
    }

    const selectedContent = normalizeCandidateContent(selectedCandidate);
    const similarity = calculateTokenSetSimilarity(normalizedContent, selectedContent);

    if (similarity >= similarityThreshold) {
      return {
        matchedCandidate: selectedCandidate,
        similarity,
        fingerprintMatch: false,
      };
    }
  }

  return undefined;
}

function defaultSourceKey(candidate: RetrievalCandidate): string | undefined {
  return candidate.sourceId;
}

function toTraceEntries(decisions: CandidateDecision[]): PostRetrievalSelectionTraceEntry[] {
  return decisions.map((decision) => ({
    candidate: decision.candidate,
    selected: decision.selected,
    reason: decision.reason,
    stage: decision.stage,
    score: decision.candidate.score,
    order: decision.order,
    metadata: decision.metadata as PostRetrievalSelectionTraceEntry['metadata'],
  }));
}

function buildSelectedAndDropped(decisions: CandidateDecision[]): {
  selectedCandidates: RetrievalCandidate[];
  droppedCandidates: RetrievalCandidate[];
} {
  return {
    selectedCandidates: decisions
      .filter((decision) => decision.selected)
      .map((decision) => decision.candidate),
    droppedCandidates: decisions
      .filter((decision) => !decision.selected)
      .map((decision) => decision.candidate),
  };
}

export function applyScoreThresholdStrategy(
  candidates: RetrievalCandidate[],
  scoreThreshold?: number,
): ScoreThresholdStrategyResult {
  const decisions = candidates.map((candidate) => {
    const belowThreshold =
      scoreThreshold !== undefined &&
      candidate.score !== undefined &&
      candidate.score < scoreThreshold;

    return {
      candidate,
      selected: !belowThreshold,
      reason: belowThreshold ? 'score-threshold' : 'selected',
      stage: 'score-threshold',
      metadata: scoreThreshold === undefined ? undefined : { scoreThreshold },
    } satisfies CandidateDecision;
  });

  const { selectedCandidates, droppedCandidates } = buildSelectedAndDropped(decisions);

  return {
    selectedCandidates,
    droppedCandidates,
    selectionTrace: toTraceEntries(decisions),
    appliedScoreThreshold: scoreThreshold,
  };
}

function trimByMaxItems(
  candidates: RetrievalCandidate[],
  maxItems: number | undefined,
  reason: 'max-candidates' | 'max-chunks',
): CandidateDecision[] {
  if (maxItems === undefined || maxItems < 0) {
    return candidates.map((candidate) => ({
      candidate,
      selected: true,
      reason: 'selected',
      stage: 'budget-trim',
    }));
  }

  return candidates.map((candidate, index) => ({
    candidate,
    selected: index < maxItems,
    reason: index < maxItems ? 'selected' : reason,
    stage: 'budget-trim',
    metadata: { limit: maxItems },
  }));
}

function trimByPromptChars(
  candidates: RetrievalCandidate[],
  maxPromptChars: number | undefined,
): CandidateDecision[] {
  if (maxPromptChars === undefined || maxPromptChars < 0) {
    return candidates.map((candidate) => ({
      candidate,
      selected: true,
      reason: 'selected',
      stage: 'budget-trim',
    }));
  }

  let totalChars = 0;

  return candidates.map((candidate) => {
    const nextChars = totalChars + candidate.chunk.content.length;
    const selected = nextChars <= maxPromptChars;

    if (selected) {
      totalChars = nextChars;
    }

    return {
      candidate,
      selected,
      reason: selected ? 'selected' : 'max-prompt-chars',
      stage: 'budget-trim',
      metadata: {
        maxPromptChars,
        nextChars,
      },
    } satisfies CandidateDecision;
  });
}

function mergeDecisionLists(
  baseCandidates: RetrievalCandidate[],
  ...decisionGroups: CandidateDecision[][]
): CandidateDecision[] {
  return baseCandidates.map((candidate) => {
    for (const group of decisionGroups) {
      const matched = group.find((decision) => decision.candidate === candidate);

      if (matched && !matched.selected) {
        return matched;
      }
    }

    return {
      candidate,
      selected: true,
      reason: 'selected',
      stage: 'budget-trim',
    } satisfies CandidateDecision;
  });
}

export async function applyCandidatePredicateStrategy(
  candidates: RetrievalCandidate[],
  predicate: CandidatePredicate | undefined,
  input: {
    request: RetrievalRequest;
    context: RuntimeContext;
  },
): Promise<CandidatePredicateStrategyResult> {
  if (!predicate) {
    const decisions = candidates.map(
      (candidate) =>
        ({
          candidate,
          selected: true,
          reason: 'selected',
          stage: 'predicate-filter',
        }) satisfies CandidateDecision,
    );

    return {
      selectedCandidates: candidates,
      droppedCandidates: [],
      selectionTrace: toTraceEntries(decisions),
      appliedCandidatePredicate: false,
    };
  }

  const decisions = await Promise.all(
    candidates.map(async (candidate) => {
      const selected = await predicate({
        candidate,
        request: input.request,
        context: input.context,
      });

      return {
        candidate,
        selected,
        reason: selected ? 'selected' : 'predicate-filter',
        stage: 'predicate-filter',
      } satisfies CandidateDecision;
    }),
  );

  const { selectedCandidates, droppedCandidates } = buildSelectedAndDropped(decisions);

  return {
    selectedCandidates,
    droppedCandidates,
    selectionTrace: toTraceEntries(decisions),
    appliedCandidatePredicate: true,
  };
}

export function applyNearDuplicateRemovalStrategy(
  candidates: RetrievalCandidate[],
  config: NearDuplicateRemovalConfig | undefined,
  input: {
    request: RetrievalRequest;
    context: RuntimeContext;
  },
): NearDuplicateRemovalStrategyResult {
  if (!config?.enabled) {
    const decisions = candidates.map(
      (candidate) =>
        ({
          candidate,
          selected: true,
          reason: 'selected',
          stage: 'duplicate-removal',
        }) satisfies CandidateDecision,
    );

    return {
      selectedCandidates: candidates,
      droppedCandidates: [],
      selectionTrace: toTraceEntries(decisions),
      appliedNearDuplicateRemoval: false,
    };
  }

  const comparator = resolveDuplicateComparator(config);
  const selectedCandidates: RetrievalCandidate[] = [];
  const decisions = new Map<RetrievalCandidate, CandidateDecision>();

  for (const candidate of candidates) {
    decisions.set(candidate, {
      candidate,
      selected: true,
      reason: 'selected',
      stage: 'duplicate-removal',
    });
  }

  for (const candidate of candidates) {
    const duplicateMatch = findDuplicateMatch(candidate, selectedCandidates, config);

    if (!duplicateMatch) {
      selectedCandidates.push(candidate);
      continue;
    }

    const { matchedCandidate, similarity, fingerprintMatch } = duplicateMatch;
    const currentDecision = decisions.get(candidate)!;
    const matchedDecision = decisions.get(matchedCandidate)!;
    const currentPreferred = comparator(candidate, matchedCandidate, input) < 0;

    if (currentPreferred) {
      matchedDecision.selected = false;
      matchedDecision.reason = 'duplicate';
      matchedDecision.stage = 'duplicate-removal';
      matchedDecision.metadata = {
        duplicateOf: candidate.chunk.id,
        nearDuplicateSimilarity: similarity,
        fingerprintMatch,
      };

      const matchedIndex = selectedCandidates.indexOf(matchedCandidate);

      if (matchedIndex >= 0) {
        selectedCandidates.splice(matchedIndex, 1, candidate);
      }
    } else {
      currentDecision.selected = false;
      currentDecision.reason = 'duplicate';
      currentDecision.stage = 'duplicate-removal';
      currentDecision.metadata = {
        duplicateOf: matchedCandidate.chunk.id,
        nearDuplicateSimilarity: similarity,
        fingerprintMatch,
      };
    }
  }

  const finalDecisions = candidates.map((candidate) => decisions.get(candidate)!);
  const { selectedCandidates: deduplicatedCandidates, droppedCandidates } =
    buildSelectedAndDropped(finalDecisions);

  return {
    selectedCandidates: deduplicatedCandidates,
    droppedCandidates,
    selectionTrace: toTraceEntries(finalDecisions),
    appliedNearDuplicateRemoval: true,
  };
}

export function applyBudgetTrimStrategy(
  candidates: RetrievalCandidate[],
  budget?: RetrievalBudget,
): BudgetTrimStrategyResult {
  const maxCandidatesDecisions = trimByMaxItems(
    candidates,
    budget?.maxCandidates,
    'max-candidates',
  );
  const afterCandidateTrim = maxCandidatesDecisions
    .filter((decision) => decision.selected)
    .map((decision) => decision.candidate);

  const maxChunksDecisions = trimByMaxItems(afterCandidateTrim, budget?.maxChunks, 'max-chunks');
  const afterChunkTrim = maxChunksDecisions
    .filter((decision) => decision.selected)
    .map((decision) => decision.candidate);

  const promptCharDecisions = trimByPromptChars(afterChunkTrim, budget?.maxPromptChars);

  const decisions = mergeDecisionLists(
    candidates,
    maxCandidatesDecisions,
    maxChunksDecisions,
    promptCharDecisions,
  );
  const { selectedCandidates, droppedCandidates } = buildSelectedAndDropped(decisions);

  return {
    selectedCandidates,
    droppedCandidates,
    selectionTrace: toTraceEntries(decisions),
    appliedBudget: budget,
  };
}

export function applySourceCoverageStrategy(
  candidates: RetrievalCandidate[],
  config: SourceCoverageConfig | undefined,
): SourceCoverageStrategyResult {
  if (!config?.enabled || config.maxPerSource === undefined) {
    const decisions = candidates.map(
      (candidate) =>
        ({
          candidate,
          selected: true,
          reason: 'selected',
          stage: 'source-coverage',
        }) satisfies CandidateDecision,
    );

    return {
      selectedCandidates: candidates,
      droppedCandidates: [],
      selectionTrace: toTraceEntries(decisions),
      appliedSourceCoverage: false,
    };
  }

  const getSourceKey = config.getSourceKey ?? defaultSourceKey;
  const sourceCounts = new Map<string, number>();
  const decisions = candidates.map((candidate) => {
    const sourceKey = getSourceKey(candidate);

    if (!sourceKey) {
      return {
        candidate,
        selected: true,
        reason: 'selected',
        stage: 'source-coverage',
      } satisfies CandidateDecision;
    }

    const nextCount = (sourceCounts.get(sourceKey) ?? 0) + 1;
    const selected = nextCount <= config.maxPerSource!;

    if (selected) {
      sourceCounts.set(sourceKey, nextCount);
    }

    return {
      candidate,
      selected,
      reason: selected ? 'selected' : 'source-coverage-quota',
      stage: 'source-coverage',
      metadata: {
        distribution: config.distribution ?? 'balanced',
        sourceKey,
        maxPerSource: config.maxPerSource,
        sourceDistribution: Object.fromEntries(sourceCounts),
      },
    } satisfies CandidateDecision;
  });

  const { selectedCandidates, droppedCandidates } = buildSelectedAndDropped(decisions);

  return {
    selectedCandidates,
    droppedCandidates,
    selectionTrace: toTraceEntries(decisions),
    appliedSourceCoverage: true,
  };
}

export function applyCandidateOrderingStrategy(
  candidates: RetrievalCandidate[],
  comparator: CandidateComparator | undefined,
  input: {
    request: RetrievalRequest;
    context: RuntimeContext;
  },
): CandidateOrderingStrategyResult {
  const orderedCandidates = comparator
    ? [...candidates].sort((left, right) => comparator(left, right, input))
    : [...candidates];

  return {
    candidates: orderedCandidates,
    selectionTrace: orderedCandidates.map((candidate, order) => ({
      candidate,
      selected: true,
      reason: 'selected',
      stage: 'context-ordering',
      score: candidate.score,
      order,
    })),
  };
}

export function mergeSelectionTrace(
  ...selectionTraces: Array<PostRetrievalSelectionTraceEntry[] | undefined>
): PostRetrievalSelectionTraceEntry[] | undefined {
  const merged = new Map<string, PostRetrievalSelectionTraceEntry>();

  for (const trace of selectionTraces) {
    if (!trace) {
      continue;
    }

    for (const entry of trace) {
      merged.set(entry.candidate.chunk.id, entry);
    }
  }

  return merged.size > 0 ? Array.from(merged.values()) : undefined;
}

export type LostInTheMiddleStrategyResult = CandidateOrderingStrategyResult;

/**
 * Lost in the Middle 重排：按 score 降序后交替放到首尾，高分居两端。
 * 只重排不丢弃，便于缓解 LLM 对中间上下文的忽视。
 */
export function applyLostInTheMiddleStrategy(
  candidates: RetrievalCandidate[],
): LostInTheMiddleStrategyResult {
  const sorted = [...candidates].sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  const ordered: RetrievalCandidate[] = [];
  let left = 0;
  let right = sorted.length - 1;
  let placeAtFront = true;

  while (left <= right) {
    const candidate = placeAtFront ? sorted[left]! : sorted[right]!;

    ordered.push(candidate);

    if (placeAtFront) {
      left += 1;
    } else {
      right -= 1;
    }

    placeAtFront = !placeAtFront;
  }

  return {
    candidates: ordered,
    selectionTrace: ordered.map((candidate, order) => ({
      candidate,
      selected: true,
      reason: 'selected',
      stage: 'context-ordering',
      score: candidate.score,
      order,
      metadata: { ordering: 'lost-in-the-middle' },
    })),
  };
}
