import { MarkdownTextSplitter } from "@langchain/textsplitters";

import { LangChainTextSplitterAdapter } from "./langchain-text-splitter-adapter.js";

export type LangChainMarkdownTextSplitterAdapterOptions = ConstructorParameters<
  typeof MarkdownTextSplitter
>[0];

export class LangChainMarkdownTextSplitterAdapter extends LangChainTextSplitterAdapter {
  constructor(options: LangChainMarkdownTextSplitterAdapterOptions) {
    super({
      splitter: new MarkdownTextSplitter(options),
    });
  }
}
