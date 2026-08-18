import { TextLoader } from '@langchain/classic/document_loaders/fs/text';
import type { LoadersMapping } from '@langchain/classic/document_loaders/fs/directory';

import {
  LangChainDirectoryLoaderAdapter,
  UnknownHandling,
  type LangChainDirectoryUnknownHandling,
} from './langchain-directory-loader-adapter.js';

export type LangChainMarkdownDirectoryLoaderOptions = {
  path: string;
  recursive?: boolean;
  extensions?: string[];
  idPrefix?: string;
  unknown?: LangChainDirectoryUnknownHandling;
};

const DEFAULT_EXTENSIONS = ['.md', '.markdown'];
const DEFAULT_UNKNOWN_HANDLING = UnknownHandling.Ignore;

const createMarkdownLoaders = (extensions: string[]): LoadersMapping => {
  return Object.fromEntries(
    extensions.map((extension) => {
      return [extension, (filePath: string) => new TextLoader(filePath)];
    }),
  ) as LoadersMapping;
};

export class LangChainMarkdownDirectoryLoader extends LangChainDirectoryLoaderAdapter {
  constructor(options: LangChainMarkdownDirectoryLoaderOptions) {
    super({
      directoryPath: options.path,
      idPrefix: options.idPrefix,
      loaders: createMarkdownLoaders(options.extensions ?? DEFAULT_EXTENSIONS),
      recursive: options.recursive,
      unknown: options.unknown ?? DEFAULT_UNKNOWN_HANDLING,
    });
  }
}
