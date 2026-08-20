import type { Chunk, JsonValue } from '@monai-ragsdk/core';

import type { ChunkTransformer, ChunkTransformContext } from './chunk-transformer.js';

export type ContextualHeaderTransformerOptions = {
  metadataKey?: string;
  contentPrefix?: string;
  separator?: string;
  includeInContent?: boolean;
};

export class ContextualHeaderTransformer implements ChunkTransformer {
  readonly #metadataKey: string;
  readonly #contentPrefix: string;
  readonly #separator: string;
  readonly #includeInContent: boolean;

  constructor(options: ContextualHeaderTransformerOptions = {}) {
    this.#metadataKey = options.metadataKey ?? 'headerPath';
    this.#contentPrefix = options.contentPrefix ?? 'Context:';
    this.#separator = options.separator ?? ' > ';
    this.#includeInContent = options.includeInContent ?? true;
  }

  async transform(chunk: Chunk, context: ChunkTransformContext): Promise<Chunk> {
    const headerPath = this.#getHeaderPath(chunk, context);

    if (headerPath.length === 0) {
      return chunk;
    }

    const metadata: Record<string, JsonValue> = {
      ...(chunk.metadata ?? {}),
      [this.#metadataKey]: headerPath,
    };

    const content = this.#includeInContent
      ? `${this.#contentPrefix} ${headerPath.join(this.#separator)}\n\n${chunk.content}`
      : chunk.content;

    return {
      ...chunk,
      content,
      metadata,
    };
  }

  #getHeaderPath(chunk: Chunk, context: ChunkTransformContext): string[] {
    const end = this.#resolveChunkEnd(chunk, context);
    const source = context.document.content.slice(0, end);
    const headerStack: string[] = [];

    for (const line of source.split(/\r?\n/)) {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());

      if (!match) {
        continue;
      }

      const level = match[1].length;
      const title = match[2].trim();

      headerStack.splice(level - 1);
      headerStack[level - 1] = title;
    }

    return headerStack.filter((segment) => segment.length > 0);
  }

  #resolveChunkEnd(chunk: Chunk, context: ChunkTransformContext): number {
    const end = chunk.metadata?.end;

    if (typeof end === 'number' && Number.isFinite(end)) {
      return Math.max(0, Math.min(end, context.document.content.length));
    }

    return context.document.content.length;
  }
}
