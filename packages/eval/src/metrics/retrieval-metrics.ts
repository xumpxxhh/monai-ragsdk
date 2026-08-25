import type { RankedSource } from './source-ranking.js';

/** 默认 @k 切点；与常见检索 benchmark 对齐。 */
export const DEFAULT_RETRIEVAL_K = [1, 3, 5, 10] as const;

function relevantInTopK(rankedSources: RankedSource[], relevant: Set<string>, k: number): number {
  let hits = 0;

  for (const item of rankedSources) {
    if (item.rank > k) {
      break;
    }

    if (relevant.has(item.sourceId)) {
      hits += 1;
    }
  }

  return hits;
}

/** |R ∩ topK| / |R|；|R| 为 0 时返回 0。 */
export function recallAtK(
  rankedSources: RankedSource[],
  relevantSourceIds: string[],
  k: number,
): number {
  if (relevantSourceIds.length === 0) {
    return 0;
  }

  const relevant = new Set(relevantSourceIds);
  const hits = relevantInTopK(rankedSources, relevant, k);
  return hits / relevantSourceIds.length;
}

/** |R ∩ topK| / k。 */
export function precisionAtK(
  rankedSources: RankedSource[],
  relevantSourceIds: string[],
  k: number,
): number {
  if (k <= 0) {
    return 0;
  }

  const relevant = new Set(relevantSourceIds);
  const hits = relevantInTopK(rankedSources, relevant, k);
  return hits / k;
}

/** topK 内是否至少命中一个 relevant source。 */
export function hitRateAtK(
  rankedSources: RankedSource[],
  relevantSourceIds: string[],
  k: number,
): number {
  const relevant = new Set(relevantSourceIds);
  return relevantInTopK(rankedSources, relevant, k) > 0 ? 1 : 0;
}

/** 首个 relevant source 的 reciprocal rank；未命中为 0。 */
export function meanReciprocalRank(
  rankedSources: RankedSource[],
  relevantSourceIds: string[],
): number {
  const relevant = new Set(relevantSourceIds);

  for (const item of rankedSources) {
    if (relevant.has(item.sourceId)) {
      return 1 / item.rank;
    }
  }

  return 0;
}

function dcgAtK(relevances: number[], k: number): number {
  let sum = 0;

  for (let index = 0; index < Math.min(k, relevances.length); index += 1) {
    const rel = relevances[index] ?? 0;
    if (rel <= 0) {
      continue;
    }

    sum += rel / Math.log2(index + 2);
  }

  return sum;
}

/** 二元相关性 nDCG@k；IDCG 为 0 时返回 0。 */
export function ndcgAtK(
  rankedSources: RankedSource[],
  relevantSourceIds: string[],
  k: number,
): number {
  const relevant = new Set(relevantSourceIds);
  const relevances = rankedSources.slice(0, k).map((item) => (relevant.has(item.sourceId) ? 1 : 0));
  const idealCount = Math.min(k, relevantSourceIds.length);
  const idealRelevances = Array.from({ length: idealCount }, () => 1);
  const dcg = dcgAtK(relevances, k);
  const idcg = dcgAtK(idealRelevances, k);

  if (idcg === 0) {
    return 0;
  }

  return dcg / idcg;
}

export function computeMetricsAtK(
  rankedSources: RankedSource[],
  relevantSourceIds: string[],
  k: number,
) {
  return {
    k,
    recall: recallAtK(rankedSources, relevantSourceIds, k),
    precision: precisionAtK(rankedSources, relevantSourceIds, k),
    hitRate: hitRateAtK(rankedSources, relevantSourceIds, k),
    ndcg: ndcgAtK(rankedSources, relevantSourceIds, k),
  };
}
