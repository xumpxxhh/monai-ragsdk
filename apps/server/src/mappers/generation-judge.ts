import type { EvalSample, GenerationJudgeInput } from '@monai-ragsdk/eval';
import type { RuntimeResult } from '@monai-ragsdk/runtime';

function readString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

function resolveSourceId(
  citation: { sourceId?: string } | undefined,
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readString(citation?.sourceId) ??
    readString(metadata?.sourceId) ??
    readString(metadata?.source)
  );
}

/**
 * 把 runtime.run 结果与 golden 样本合成 GenerationJudgeInput。
 * refused 读 groundingRefusal；完整 answer 来自 RuntimeResult，不用 trace 预览。
 */
export function toGenerationJudgeInput(
  sample: EvalSample,
  result: RuntimeResult,
): GenerationJudgeInput {
  const citationByChunkId = new Map(
    result.citations.map((citation) => [citation.chunkId, citation]),
  );
  const contexts = result.chunks.map((chunk) => {
    const citation = citationByChunkId.get(chunk.id);
    const metadata =
      chunk.metadata && typeof chunk.metadata === 'object'
        ? (chunk.metadata as Record<string, unknown>)
        : undefined;
    const sourceId = resolveSourceId(citation, metadata);

    return {
      text: chunk.content,
      ...(sourceId ? { sourceId } : {}),
    };
  });

  return {
    sampleId: sample.id,
    query: sample.query,
    answer: result.answer,
    contexts,
    refused: result.generationMetadata?.groundingRefusal === true,
    ...(typeof sample.expectedRefusal === 'boolean'
      ? { expectedRefusal: sample.expectedRefusal }
      : {}),
    ...(sample.referenceAnswer ? { referenceAnswer: sample.referenceAnswer } : {}),
  };
}
