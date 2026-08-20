import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

import {
  LangChainLoaderAdapter,
  type LangChainLoaderAdapterOptions,
} from './langchain-loader-adapter.js';

export type LangChainPdfLoaderAdapterOptions = Omit<LangChainLoaderAdapterOptions, 'loader'> & {
  filePath: string;
  splitPages?: boolean;
  parsedItemSeparator?: string;
};

/** 单文件 PDF 加载；底层依赖 pdf-parse，由调用环境提供网络/文件访问。 */
export class LangChainPdfLoaderAdapter extends LangChainLoaderAdapter {
  constructor(options: LangChainPdfLoaderAdapterOptions) {
    super({
      idPrefix: options.idPrefix,
      loader: new PDFLoader(options.filePath, {
        splitPages: options.splitPages,
        parsedItemSeparator: options.parsedItemSeparator,
      }),
    });
  }
}
