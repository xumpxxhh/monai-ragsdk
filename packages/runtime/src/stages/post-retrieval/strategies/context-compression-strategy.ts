import type { Query } from '@monai-ragsdk/core';

import type {
  PostRetrievalStrategy,
  PostRetrievalStrategyResult,
} from '../post-retrieval-strategy.js';

import type { RetrievalCandidate, RetrievalRequest, RuntimeContext } from '../../../types/index.js';

import type { RuntimeStrategyModel, RuntimeStrategyModelInput } from '../../../types/index.js';

function extractJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

function parseCompressed(text: string): string | undefined {
  const json = extractJson(text);
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const obj = json as Record<string, unknown>;
    const value = obj['compressed'];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
  }

  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return undefined;
  }

  return firstLine;
}

export type ContextCompressionStrategyOptions = {
  model: RuntimeStrategyModel;
  systemPrompt?: string;
  /** 每条 chunk 压缩最大字符数（近似）。 */
  maxCharsPerChunk?: number;
  /** 压缩输入的 chunk 内容上限（近似字符数），避免 token 过大。 */
  chunkInputMaxChars?: number;
  /** 单次并发数，避免同时请求过多。 */
  maxConcurrency?: number;
  onError?: 'passthrough' | 'throw';
};

function buildPrompt(
  query: Query,
  chunk: RetrievalCandidate['chunk'],
  maxChars: number,
  chunkInputMaxChars: number,
): RuntimeStrategyModelInput {
  const input = (chunk.content ?? '').slice(0, chunkInputMaxChars);

  return {
    prompt: [
      '你是上下文压缩器。',
      `将下面的 chunk 压缩为不超过 ${maxChars} 字符的关键信息，确保不引入新事实。`,
      '只输出 JSON：{"compressed":"..."}',
      '',
      `query=${query.query}`,
      '',
      `chunk=${input}`,
    ].join('\n'),
    system: undefined,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current]!, current);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Context Compression：对选中 candidates 的 chunk.content 做 LLM 压缩。
 * - 不改变候选数量，仅替换 chunk.content（从而影响 promptContext 与最终 citations 内容展示）
 * - 失败时：passthrough 保持原 content；throw 会中断链路（preference 由 options 控制）
 */
export function createContextCompressionStrategy(
  options: ContextCompressionStrategyOptions,
): PostRetrievalStrategy {
  const onError = options.onError ?? 'passthrough';
  const maxCharsPerChunk = options.maxCharsPerChunk ?? 400;
  const chunkInputMaxChars = options.chunkInputMaxChars ?? 2000;
  const maxConcurrency = options.maxConcurrency ?? 4;

  return {
    async apply(
      input: {
        request: RetrievalRequest;
        candidates: RetrievalCandidate[];
      },
      context: RuntimeContext,
    ): Promise<PostRetrievalStrategyResult> {
      const { request, candidates } = input;

      const systemPrompt =
        options.systemPrompt ??
        '你是上下文压缩器。不要编造新事实；若缺乏关键信息，输出尽量少的内容。';

      const compressedChunks = await mapWithConcurrency(
        candidates,
        maxConcurrency,
        async (candidate) => {
          try {
            const modelInput = buildPrompt(
              request.effectiveQuery,
              candidate.chunk,
              maxCharsPerChunk,
              chunkInputMaxChars,
            );

            const out = await options.model.complete(
              {
                ...modelInput,
                system: systemPrompt,
              },
              context,
            );

            const compressed = parseCompressed(out);
            if (!compressed) {
              return candidate.chunk.content;
            }
            return compressed;
          } catch (error) {
            if (onError === 'throw') {
              throw error;
            }
            return candidate.chunk.content;
          }
        },
      );

      const nextCandidates = candidates.map((candidate, index) => {
        const compressed = compressedChunks[index] ?? candidate.chunk.content;
        if (compressed === candidate.chunk.content) {
          return candidate;
        }

        return {
          ...candidate,
          compressed: true,
          originalContent: candidate.chunk.content,
          chunk: {
            ...candidate.chunk,
            content: compressed,
          },
        };
      });

      const selectionTrace: PostRetrievalStrategyResult['selectionTrace'] = nextCandidates.map(
        (candidate) => ({
          candidate,
          selected: true,
          reason: 'selected',
          stage: 'context-ordering',
          metadata: { compressed: true },
        }),
      );

      return {
        selectedCandidates: nextCandidates,
        droppedCandidates: [],
        selectionTrace,
      };
    },
  };
}
