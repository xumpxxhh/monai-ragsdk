import { HTMLWebBaseLoader } from '@langchain/community/document_loaders/web/html';
import type { Loader } from '@monai-ragsdk/indexing';
import type { Document } from '@monai-ragsdk/core';

import { toRagDocument } from '../shared/document-mapper.js';

export type LangChainWebLoaderAdapterOptions = {
  urls: string[];
  idPrefix?: string;
  timeout?: number;
  headers?: HeadersInit;
  textDecoder?: TextDecoder;
};

/** 按 URL 列表抓取 HTML 正文；每个 URL 对应一条或多条 Document（由 LC loader 决定）。 */
export class LangChainWebLoaderAdapter implements Loader {
  readonly #urls: string[];
  readonly #idPrefix: string;
  readonly #timeout?: number;
  readonly #headers?: HeadersInit;
  readonly #textDecoder?: TextDecoder;

  constructor(options: LangChainWebLoaderAdapterOptions) {
    if (options.urls.length === 0) {
      throw new Error('urls must contain at least one entry');
    }

    this.#urls = options.urls;
    this.#idPrefix = options.idPrefix ?? 'web-doc';
    this.#timeout = options.timeout;
    this.#headers = options.headers;
    this.#textDecoder = options.textDecoder;
  }

  async load(): Promise<Document[]> {
    const documents: Document[] = [];
    let index = 0;

    for (const url of this.#urls) {
      const loader = new HTMLWebBaseLoader(url, {
        timeout: this.#timeout,
        headers: this.#headers,
        textDecoder: this.#textDecoder,
      });
      const loaded = await loader.load();

      for (const document of loaded) {
        documents.push(toRagDocument(document, index, this.#idPrefix));
        index += 1;
      }
    }

    return documents;
  }
}
