import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import { LangChainTextSplitterAdapter } from './langchain-text-splitter-adapter.js';

const SENTENCE_SEPARATORS = ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ', ''];

export type LangChainSentenceTextSplitterAdapterOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
};

/** 句子优先切分，适合散文 / FAQ 等自然语言段落。 */
export class LangChainSentenceTextSplitterAdapter extends LangChainTextSplitterAdapter {
  constructor(options: LangChainSentenceTextSplitterAdapterOptions = {}) {
    super({
      splitter: new RecursiveCharacterTextSplitter({
        chunkSize: options.chunkSize,
        chunkOverlap: options.chunkOverlap,
        separators: options.separators ?? SENTENCE_SEPARATORS,
      }),
    });
  }
}
