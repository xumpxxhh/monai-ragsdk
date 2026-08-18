import type { RetrievalCandidate } from "../../types/index.js";

export type FuseByReciprocalRankFusionOptions = {
  k?: number;
  enrichCandidate?: (
    candidate: RetrievalCandidate,
    score: number,
  ) => RetrievalCandidate;
};

const DEFAULT_RRF_K = 60;

/**
 * 对多路有序候选列表做 RRF 融合；score = Σ 1/(k+rank+1)。
 * enrichCandidate 可选，用于写入融合分或补 retrieverMetadata。
 */
export function fuseByReciprocalRankFusion(
  rankedLists: RetrievalCandidate[][],
  options: FuseByReciprocalRankFusionOptions = {},
): RetrievalCandidate[] {
  const k = options.k ?? DEFAULT_RRF_K;
  const enrichCandidate =
    options.enrichCandidate ??
    ((candidate, score) => ({
      ...candidate,
      score,
    }));
  const rrfScores = new Map<string, number>();
  const candidateMap = new Map<string, RetrievalCandidate>();

  for (const candidates of rankedLists) {
    for (const [rank, candidate] of candidates.entries()) {
      const id = candidate.chunk.id;
      rrfScores.set(id, (rrfScores.get(id) ?? 0) + 1 / (k + rank + 1));
      candidateMap.set(id, candidateMap.get(id) ?? candidate);
    }
  }

  return [...rrfScores.entries()]
    .sort((left, right) => right[1] - left[1])
    .flatMap(([id, score]) => {
      const candidate = candidateMap.get(id);

      if (!candidate) {
        return [];
      }

      return [enrichCandidate(candidate, score)];
    });
}

export { DEFAULT_RRF_K };
