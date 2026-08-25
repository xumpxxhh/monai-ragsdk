import type { RetrievalObservation } from '../types/retrieval-observation.js';

/** source 去重后的排序条目；rank 为该 source 首次出现的位次（1-based）。 */
export type RankedSource = {
  sourceId: string;
  rank: number;
};

export type SourceRankingResult = {
  rankedSources: RankedSource[];
  /** 有 sourceId 的候选数 / 全部候选数；无候选时为 0。 */
  coverage: number;
  totalCandidates: number;
  scorableCandidates: number;
};

type RankedCandidateInput = {
  sourceId?: string;
  rank: number;
};

/**
 * 从观测层提取 source 排序列表：按 rank 升序遍历，同一 source 只保留首次出现。
 * 缺 sourceId 的候选不参与排序，也不计为 miss。
 */
export function buildSourceRanking(
  observation: RetrievalObservation,
  layer: 'retrieved' | 'selected',
): SourceRankingResult {
  const candidates: RankedCandidateInput[] =
    layer === 'retrieved'
      ? observation.retrieved.map((item) => ({
          sourceId: item.sourceId,
          rank: item.rank,
        }))
      : observation.selected.map((item, index) => ({
          sourceId: item.sourceId,
          rank: index + 1,
        }));

  const totalCandidates = candidates.length;
  const scorableCandidates = candidates.filter((item) => item.sourceId !== undefined).length;
  const coverage = totalCandidates === 0 ? 0 : scorableCandidates / totalCandidates;

  const sorted = [...candidates].sort((left, right) => left.rank - right.rank);
  const seen = new Set<string>();
  const rankedSources: RankedSource[] = [];

  for (const candidate of sorted) {
    if (!candidate.sourceId || seen.has(candidate.sourceId)) {
      continue;
    }

    seen.add(candidate.sourceId);
    rankedSources.push({
      sourceId: candidate.sourceId,
      rank: candidate.rank,
    });
  }

  return {
    rankedSources,
    coverage,
    totalCandidates,
    scorableCandidates,
  };
}

/** coverage 为 0 表示无法对齐 golden，不得产出有效指标。 */
export function isUnscorableRanking(ranking: SourceRankingResult): boolean {
  return ranking.coverage === 0;
}
