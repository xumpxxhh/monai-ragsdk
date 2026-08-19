import type { Chunk } from '@monai-ragsdk/core';

import type { RetrievalRequest } from './retrieval-request.js';

/**
 * chunks 为空的成因。三种情况在 generator 侧都表现为 `chunks.length === 0`，
 * 但「明确拒答」与「允许用模型自身知识」必须能分开。
 * `skipped` 留给检索被主动跳过（切片 D / routing skip）；当前 runtime 不会写出它。
 */
export type GenerationChunksEmptyReason = 'no-hits' | 'filtered' | 'skipped';

export type GenerationGrounding = {
  chunksEmptyReason: GenerationChunksEmptyReason;
};

/** generate / generateStream 共用输入，避免两套签名分叉。 */
export type RuntimeGeneratorInput = {
  request: RetrievalRequest;
  chunks: Chunk[];
  promptContext?: string;
  /** 仅 chunks 为空时出现；有依据时不写，避免把「空」当成默认状态。 */
  grounding?: GenerationGrounding;
};
