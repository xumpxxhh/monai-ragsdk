export type IndexingResult = {
  documentsTotal: number;
  documentsIndexed: number;
  chunksTotal: number;
  vectorsTotal: number;
  skippedDocuments: number;
  failedDocuments: number;
};
