import type { Loader } from '@monai-ragsdk/indexing';
import type { Document } from '@monai-ragsdk/core';

import { type LangChainDocumentLike, toRagDocument } from '../shared/document-mapper.js';

export type LangChainLoaderLike = {
  load(): Promise<LangChainDocumentLike[]>;
};

export type LangChainLoaderAdapterOptions = {
  loader: LangChainLoaderLike;
  idPrefix?: string;
};

const DEFAULT_ID_PREFIX = 'langchain-doc';

export class LangChainLoaderAdapter implements Loader {
  readonly #loader: LangChainLoaderLike;
  readonly #idPrefix: string;

  constructor(options: LangChainLoaderAdapterOptions) {
    this.#loader = options.loader;
    this.#idPrefix = options.idPrefix ?? DEFAULT_ID_PREFIX;
  }

  async load(): Promise<Document[]> {
    const documents = await this.#loader.load();

    return documents.map((document, index) => {
      return toRagDocument(document, index, this.#idPrefix);
    });
  }
}
