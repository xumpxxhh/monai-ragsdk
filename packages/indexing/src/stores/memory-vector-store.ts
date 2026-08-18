import type { Vector } from "@monai-ragsdk/core";
import type {
  VectorStore,
  VectorStoreDeleteFilter,
  VectorStoreSourceRecord,
  VectorStoreWriteContext,
} from "./vector-store.js";

/** 进程内 VectorStore，供测试与 demo 验证增量契约，不作为生产存储。 */
export class MemoryVectorStore implements VectorStore {
  readonly #vectors = new Map<string, Vector>();
  #lastWriteContext: VectorStoreWriteContext | undefined;

  async upsert(
    vectors: Vector[],
    context?: VectorStoreWriteContext,
  ): Promise<void> {
    this.#lastWriteContext = context;

    for (const vector of vectors) {
      this.#vectors.set(vector.id, vector);
    }
  }

  async deleteByFilter(filter: VectorStoreDeleteFilter): Promise<void> {
    for (const [id, vector] of this.#vectors.entries()) {
      const vectorSourceId = readStringMetadata(vector.metadata, "sourceId");
      const vectorFingerprint = readStringMetadata(
        vector.metadata,
        "fingerprint",
      );
      const matchesSourceId =
        !filter.sourceIds ||
        (vectorSourceId !== undefined &&
          filter.sourceIds.includes(vectorSourceId));
      const matchesFingerprint =
        !filter.fingerprints ||
        (vectorFingerprint !== undefined &&
          filter.fingerprints.includes(vectorFingerprint));

      if (matchesSourceId && matchesFingerprint) {
        this.#vectors.delete(id);
      }
    }
  }

  getAll(): Vector[] {
    return Array.from(this.#vectors.values());
  }

  getById(id: string): Vector | undefined {
    return this.#vectors.get(id);
  }

  size(): number {
    return this.#vectors.size;
  }

  getLastWriteContext(): VectorStoreWriteContext | undefined {
    return this.#lastWriteContext;
  }

  async listSourceRecords(): Promise<VectorStoreSourceRecord[]> {
    const records = new Map<string, VectorStoreSourceRecord>();

    for (const vector of this.#vectors.values()) {
      const sourceId = readStringMetadata(vector.metadata, "sourceId");

      if (!sourceId) {
        continue;
      }

      records.set(`${sourceId}\0${readStringMetadata(vector.metadata, "fingerprint") ?? ""}`, {
        sourceId,
        fingerprint: readStringMetadata(vector.metadata, "fingerprint"),
      });
    }

    return Array.from(records.values());
  }
}

function readStringMetadata(
  metadata: Vector["metadata"],
  key: string,
): string | undefined {
  const value = metadata?.[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}
