import type { Document } from '@monai-ragsdk/core';

export interface Loader {
  load(): Promise<Document[]>;
}
