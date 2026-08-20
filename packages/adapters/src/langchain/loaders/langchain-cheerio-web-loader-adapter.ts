import { readFile } from 'node:fs/promises';

import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import type { SelectorType } from 'cheerio';
import type { Loader } from '@monai-ragsdk/indexing';
import type { Document } from '@monai-ragsdk/core';

import { toRagDocument } from '../shared/document-mapper.js';

export type LangChainCheerioWebLoaderAdapterOptions = {
  webPath?: string;
  filePath?: string;
  html?: string;
  idPrefix?: string;
  selector?: SelectorType;
  timeout?: number;
  headers?: HeadersInit;
  textDecoder?: TextDecoder;
};

/** 用 Cheerio 解析 URL、本地 HTML 文件或内存 HTML 字符串。 */
export class LangChainCheerioWebLoaderAdapter implements Loader {
  readonly #options: LangChainCheerioWebLoaderAdapterOptions;
  readonly #idPrefix: string;

  constructor(options: LangChainCheerioWebLoaderAdapterOptions) {
    const sourceCount = [options.webPath, options.filePath, options.html].filter(Boolean).length;

    if (sourceCount !== 1) {
      throw new Error('Provide exactly one of webPath, filePath, or html');
    }

    this.#options = options;
    this.#idPrefix = options.idPrefix ?? 'html-doc';
  }

  async load(): Promise<Document[]> {
    if (this.#options.html !== undefined) {
      return this.#loadFromHtml(this.#options.html, 'inline-html');
    }

    if (this.#options.filePath !== undefined) {
      const html = await readFile(this.#options.filePath, 'utf8');
      return this.#loadFromHtml(html, this.#options.filePath);
    }

    const loader = new CheerioWebBaseLoader(this.#options.webPath!, {
      selector: this.#options.selector,
      timeout: this.#options.timeout,
      headers: this.#options.headers,
      textDecoder: this.#options.textDecoder,
    });

    const loaded = await loader.load();

    return loaded.map((document, index) => toRagDocument(document, index, this.#idPrefix));
  }

  async #loadFromHtml(html: string, source: string): Promise<Document[]> {
    const { load } = await CheerioWebBaseLoader.imports();
    const $ = load(html);
    const selector = this.#options.selector ?? 'body';
    const content = $(selector).text().trim();

    if (content.length === 0) {
      return [];
    }

    return [
      {
        id: `${this.#idPrefix}-0`,
        content,
        metadata: {
          source,
        },
      },
    ];
  }
}
