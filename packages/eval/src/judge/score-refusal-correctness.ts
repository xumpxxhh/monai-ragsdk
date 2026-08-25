/**
 * 拒答维度不调 LLM：标注缺失则本维不可评；否则期望与实际一致为 1，否则为 0。
 */
export function scoreRefusalCorrectness(
  expectedRefusal: boolean | undefined,
  refused: boolean,
): number | null {
  if (typeof expectedRefusal !== 'boolean') {
    return null;
  }

  return expectedRefusal === refused ? 1 : 0;
}
