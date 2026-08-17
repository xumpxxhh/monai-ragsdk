import type { Document } from "@monai-ragsdk/core";

import type { DocumentTransformer } from "./document-transformer.js";

export type ContentCleanupTransformerOptions = {
  collapseBlankLinesTo?: number;
  trimTrailingWhitespace?: boolean;
};

export class ContentCleanupTransformer implements DocumentTransformer {
  readonly #collapseBlankLinesTo: number;
  readonly #trimTrailingWhitespace: boolean;

  constructor(options: ContentCleanupTransformerOptions = {}) {
    this.#collapseBlankLinesTo = options.collapseBlankLinesTo ?? 2;
    this.#trimTrailingWhitespace = options.trimTrailingWhitespace ?? true;

    if (this.#collapseBlankLinesTo < 1) {
      throw new Error("collapseBlankLinesTo must be greater than 0");
    }
  }

  async transform(document: Document): Promise<Document> {
    let content = document.content.replace(/\r\n/g, "\n");

    if (this.#trimTrailingWhitespace) {
      content = content.replace(/[ \t]+$/gm, "");
    }

    content = content
      .replace(/\t/g, " ")
      .replace(/\n{3,}/g, "\n".repeat(this.#collapseBlankLinesTo));

    return {
      ...document,
      content: content.trim(),
    };
  }
}
