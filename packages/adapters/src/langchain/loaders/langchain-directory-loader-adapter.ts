import {
  DirectoryLoader,
  type LoadersMapping,
  UnknownHandling,
} from "@langchain/classic/document_loaders/fs/directory";

import {
  LangChainLoaderAdapter,
  type LangChainLoaderAdapterOptions,
} from "./langchain-loader-adapter.js";

export { UnknownHandling };

export type LangChainDirectoryUnknownHandling =
  (typeof UnknownHandling)[keyof typeof UnknownHandling];

export type LangChainDirectoryLoaderAdapterOptions = Omit<
  LangChainLoaderAdapterOptions,
  "loader"
> & {
  directoryPath: string;
  loaders: LoadersMapping;
  recursive?: boolean;
  unknown?: LangChainDirectoryUnknownHandling;
};

export class LangChainDirectoryLoaderAdapter extends LangChainLoaderAdapter {
  constructor(options: LangChainDirectoryLoaderAdapterOptions) {
    super({
      idPrefix: options.idPrefix,
      loader: new DirectoryLoader(
        options.directoryPath,
        options.loaders,
        options.recursive,
        options.unknown,
      ),
    });
  }
}
