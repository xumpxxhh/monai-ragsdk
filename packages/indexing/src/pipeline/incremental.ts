import type { VectorStoreSourceRecord } from '../stages/store/vector-store.js';

export type SourceFingerprintMap = Map<string, Set<string>>;

/** 把跨运行 source 记录收成 sourceId -> fingerprint 集合，供 skip / replace 对比。 */
export function buildSourceFingerprintMap(
  records: VectorStoreSourceRecord[],
): SourceFingerprintMap {
  const map: SourceFingerprintMap = new Map();

  for (const record of records) {
    const fingerprints = map.get(record.sourceId) ?? new Set<string>();

    if (record.fingerprint) {
      fingerprints.add(record.fingerprint);
    }

    map.set(record.sourceId, fingerprints);
  }

  return map;
}

/**
 * 仅当增量模式、sourceId/fingerprint 齐全、且旧记录恰好只有这一个 fingerprint 时跳过。
 * 同一 source 出现多个 fingerprint 说明状态不干净，必须走 replace，不能当未变化。
 */
export function shouldSkipUnchanged(input: {
  mode: 'full' | 'incremental';
  sourceId?: string;
  fingerprint?: string;
  previous: SourceFingerprintMap;
}): boolean {
  // 全量模式或缺少 sourceId/fingerprint 时无法安全对比，只能当新文档写入
  if (input.mode !== 'incremental' || !input.sourceId || !input.fingerprint) {
    return false;
  }

  const fingerprints = input.previous.get(input.sourceId);

  return (
    fingerprints !== undefined && fingerprints.size === 1 && fingerprints.has(input.fingerprint)
  );
}

/** 上一轮有、本轮 loader 没再见到的 source；仅 incremental 跑完后交给 stale cleanup。 */
export function collectStaleSourceIds(
  previous: SourceFingerprintMap,
  seenSourceIds: Set<string>,
): string[] {
  return [...previous.keys()].filter((sourceId) => !seenSourceIds.has(sourceId));
}
