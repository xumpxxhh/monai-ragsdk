import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import { LangChainTextSplitterAdapter } from './langchain-text-splitter-adapter.js';

export type LangChainLanguageTextSplitterAdapterOptions = {
  language: Parameters<typeof RecursiveCharacterTextSplitter.fromLanguage>[0];
  chunkSize?: number;
  chunkOverlap?: number;
};

/** 按编程语言边界切分，避免在函数体中间硬切。 */
export class LangChainLanguageTextSplitterAdapter extends LangChainTextSplitterAdapter {
  constructor(options: LangChainLanguageTextSplitterAdapterOptions) {
    super({
      splitter: RecursiveCharacterTextSplitter.fromLanguage(options.language, {
        chunkSize: options.chunkSize,
        chunkOverlap: options.chunkOverlap,
      }),
    });
  }
}
