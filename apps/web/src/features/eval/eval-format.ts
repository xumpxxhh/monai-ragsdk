import type { EvalSampleDiffVerdict } from '@/shared/types';

export const VERDICT_LABEL: Record<EvalSampleDiffVerdict, string> = {
  improved: '提升',
  regressed: '回退',
  unchanged: '持平',
  incomparable: '不可比',
};

export const VERDICT_CLASS: Record<EvalSampleDiffVerdict, string> = {
  improved: 'text-success',
  regressed: 'text-danger',
  unchanged: 'text-muted',
  incomparable: 'text-warning',
};

/** 分数展示；null 表示该维不可评，不要显示成 0。 */
export function formatScore(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(digits);
}

export function metricAtK<T extends { k: number }>(atK: T[], k: number): T | undefined {
  return atK.find((item) => item.k === k);
}

export function parseTraceIds(raw: string): string[] | undefined {
  const ids = raw
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}
