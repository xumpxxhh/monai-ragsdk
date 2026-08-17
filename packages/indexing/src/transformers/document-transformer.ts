import type { Document } from "@monai-ragsdk/core";

export interface DocumentTransformer {
  transform(document: Document): Promise<Document>;
}
