import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { LangChainTextSplitterAdapter } from "./langchain-text-splitter-adapter.js";

export type LangChainRecursiveCharacterTextSplitterAdapterOptions =
  ConstructorParameters<typeof RecursiveCharacterTextSplitter>[0];

export class LangChainRecursiveCharacterTextSplitterAdapter extends LangChainTextSplitterAdapter {
  constructor(options: LangChainRecursiveCharacterTextSplitterAdapterOptions) {
    super({
      splitter: new RecursiveCharacterTextSplitter(options),
    });
  }
}
