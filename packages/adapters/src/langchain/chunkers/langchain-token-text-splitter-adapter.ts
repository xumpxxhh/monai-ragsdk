import { TokenTextSplitter } from '@langchain/textsplitters';

import { LangChainTextSplitterAdapter } from './langchain-text-splitter-adapter.js';

export type LangChainTokenTextSplitterAdapterOptions = ConstructorParameters<
  typeof TokenTextSplitter
>[0];

export class LangChainTokenTextSplitterAdapter extends LangChainTextSplitterAdapter {
  constructor(options: LangChainTokenTextSplitterAdapterOptions) {
    super({
      splitter: new TokenTextSplitter(options),
    });
  }
}
