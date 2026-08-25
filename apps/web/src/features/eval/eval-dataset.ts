export type ParsedEvalDataset = {
  name: string;
  version: string;
  sampleCount: number;
  dataset: unknown;
};

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * 浏览器侧预检 golden JSON，避免把明显坏数据打到 server。
 * 完整 Zod 仍由 `/eval/*` 校验；此处只挡缺字段 / 空 samples。
 */
export function parseEvalDatasetJson(raw: string): ParsedEvalDataset | { error: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { error: '请粘贴或上传 EvalDataset JSON' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { error: '不是合法 JSON' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: '数据集必须是对象' };
  }

  const record = parsed as Record<string, unknown>;
  const name = readNonEmptyString(record.name);
  const version = readNonEmptyString(record.version);
  if (!name || !version) {
    return { error: '缺少 name 或 version' };
  }
  if (!Array.isArray(record.samples) || record.samples.length === 0) {
    return { error: 'samples 不能为空' };
  }

  const seen = new Set<string>();
  for (const item of record.samples) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: '每条 sample 必须是对象' };
    }
    const sample = item as Record<string, unknown>;
    const id = readNonEmptyString(sample.id);
    const query = readNonEmptyString(sample.query);
    if (!id || !query) {
      return { error: '每条 sample 需要 id 与 query' };
    }
    if (seen.has(id)) {
      return { error: `重复 sample id: ${id}` };
    }
    seen.add(id);
    if (!Array.isArray(sample.relevantSourceIds) || sample.relevantSourceIds.length === 0) {
      return { error: `样本 ${id} 缺少 relevantSourceIds` };
    }
  }

  return {
    name,
    version,
    sampleCount: record.samples.length,
    dataset: parsed,
  };
}

export const EVAL_DATASET_EXAMPLE = `{
  "name": "demo-kb",
  "version": "1.0.0",
  "samples": [
    {
      "id": "q1",
      "query": "退货时效是多久？",
      "relevantSourceIds": ["return-policy"],
      "expectedRefusal": false
    }
  ]
}`;
