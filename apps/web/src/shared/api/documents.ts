import { apiDelete, apiGet, apiPost, apiPostSse } from '@/shared/api/http';
import type {
  AskMessage,
  DocumentSource,
  IngestProgressEvent,
  LastIngestSummary,
  Paginated,
  SearchResult,
} from '@/shared/types';
import { delay } from '@/shared/utils';

type DocListener = () => void;
const docListeners = new Set<DocListener>();

export function subscribeDocumentsChanged(listener: DocListener): () => void {
  docListeners.add(listener);
  return () => docListeners.delete(listener);
}

function notifyDocumentsChanged(): void {
  for (const listener of docListeners) listener();
}

export async function listDocuments(
  collectionId: string,
  params?: { q?: string; status?: string; page?: number; pageSize?: number },
): Promise<Paginated<DocumentSource>> {
  return apiGet<Paginated<DocumentSource>>(`/collections/${collectionId}/documents`, params);
}

export async function getLastIngest(collectionId: string): Promise<LastIngestSummary | null> {
  return apiGet<LastIngestSummary | null>(`/collections/${collectionId}/ingest/latest`);
}

/** 启动异步入库，并以约 500ms 间隔轮询进度直到 done。 */
export async function startIngest(
  collectionId: string,
  files?: File[],
): Promise<AsyncGenerator<IngestProgressEvent>> {
  const documents = await Promise.all(
    (files ?? []).map(async (file, index) => ({
      id: `${file.name}-${index}`,
      content: await file.text(),
      metadata: { title: file.name, sourceId: file.name },
    })),
  );
  const response = await apiPost<{ taskId: string }>(`/collections/${collectionId}/ingest`, {
    documents,
  });
  return pollIngestProgress(collectionId, response.taskId);
}

async function* pollIngestProgress(
  collectionId: string,
  taskId: string,
): AsyncGenerator<IngestProgressEvent> {
  while (true) {
    const event = await apiGet<IngestProgressEvent>(
      `/collections/${collectionId}/ingest/${taskId}`,
    );
    yield event;
    if (event.done) break;
    await delay(500);
  }
}

export async function retryDocument(collectionId: string, documentId: string): Promise<void> {
  await apiPost(`/collections/${collectionId}/documents/${documentId}/retry`);
  notifyDocumentsChanged();
}

export async function removeDocument(collectionId: string, documentId: string): Promise<void> {
  await apiDelete(`/collections/${collectionId}/documents/${documentId}`);
  notifyDocumentsChanged();
}

export async function searchDocuments(
  collectionId: string,
  query: string,
  topK = 10,
): Promise<SearchResult> {
  return apiPost<SearchResult>(`/collections/${collectionId}/search`, { query, topK });
}

export interface AskStreamResult {
  stream: AsyncGenerator<string>;
  effectiveQuery?: string;
  citations?: AskMessage['citations'];
}

/** 消费服务端 ask SSE：token 为 delta，前端累加后再 yield。 */
export async function askStream(
  collectionId: string,
  question: string,
  signal?: AbortSignal,
): Promise<AskStreamResult> {
  const events = apiPostSse<{
    type: string;
    content?: string;
    effectiveQuery?: string;
    citations?: AskMessage['citations'];
    noGrounding?: boolean;
  }>(`/collections/${collectionId}/ask`, { question }, signal);

  const holder: { effectiveQuery?: string; citations?: AskMessage['citations'] } = {};

  async function* streamFromSse(): AsyncGenerator<string> {
    let accumulated = '';
    for await (const event of events) {
      if (event.type === 'meta' && event.effectiveQuery) {
        holder.effectiveQuery = event.effectiveQuery;
      }
      if (event.type === 'token' && event.content) {
        accumulated += event.content;
        yield accumulated;
      }
      if (event.type === 'result') {
        if (event.effectiveQuery) {
          holder.effectiveQuery = event.effectiveQuery;
        }
        if (event.citations) {
          holder.citations = event.citations;
        }
        if (event.noGrounding) {
          yield '__NO_GROUNDING__';
        }
      }
    }
  }

  return {
    stream: streamFromSse(),
    get effectiveQuery() {
      return holder.effectiveQuery;
    },
    get citations() {
      return holder.citations;
    },
  };
}
