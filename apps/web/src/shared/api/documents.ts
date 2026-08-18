import { useMockApi } from '@/config/env';
import { apiDelete, apiGet, apiPost, apiPostSse } from '@/shared/api/http';
import {
  getSearchMock,
  mockAskStream,
  mockDocuments,
  mockIngestProgress,
  mockLastIngest,
} from '@/shared/api/mock/data';
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
  if (useMockApi) {
    await delay(180);
    let items = mockDocuments.filter((d) => d.collectionId === collectionId);
    const q = params?.q?.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (d) => d.title.toLowerCase().includes(q) || d.sourceId.toLowerCase().includes(q),
      );
    }
    if (params?.status && params.status !== 'all') {
      items = items.filter((d) => d.status === params.status);
    }
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }
  return apiGet<Paginated<DocumentSource>>(`/collections/${collectionId}/documents`, params);
}

export async function getLastIngest(collectionId: string): Promise<LastIngestSummary | null> {
  if (useMockApi) {
    await delay(100);
    return mockLastIngest[collectionId] ?? null;
  }
  return apiGet<LastIngestSummary | null>(`/collections/${collectionId}/ingest/latest`);
}

export async function startIngest(
  collectionId: string,
  _files?: File[],
): Promise<AsyncGenerator<IngestProgressEvent>> {
  if (useMockApi) {
    return mockIngestProgress();
  }
  const response = await apiPost<{ taskId: string }>(`/collections/${collectionId}/ingest`);
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
  if (useMockApi) {
    await delay(300);
    const doc = mockDocuments.find((d) => d.id === documentId && d.collectionId === collectionId);
    if (doc) {
      doc.status = 'indexed';
      doc.failReason = undefined;
      doc.updatedAt = new Date().toISOString();
    }
    notifyDocumentsChanged();
    return;
  }
  await apiPost(`/collections/${collectionId}/documents/${documentId}/retry`);
}

export async function removeDocument(collectionId: string, documentId: string): Promise<void> {
  if (useMockApi) {
    await delay(200);
    const idx = mockDocuments.findIndex(
      (d) => d.id === documentId && d.collectionId === collectionId,
    );
    if (idx >= 0) mockDocuments.splice(idx, 1);
    notifyDocumentsChanged();
    return;
  }
  await apiDelete(`/collections/${collectionId}/documents/${documentId}`);
}

export async function searchDocuments(
  collectionId: string,
  query: string,
  topK = 10,
): Promise<SearchResult> {
  if (useMockApi) {
    await delay(400);
    return getSearchMock(query, topK);
  }
  return apiPost<SearchResult>(`/collections/${collectionId}/search`, { query, topK });
}

export interface AskStreamResult {
  stream: AsyncGenerator<string>;
  effectiveQuery?: string;
  citations?: AskMessage['citations'];
}

/** ask 流式接口；mock 与真实 SSE 共用同一消费方式。 */
export async function askStream(
  collectionId: string,
  question: string,
  signal?: AbortSignal,
): Promise<AskStreamResult> {
  if (useMockApi) {
    void collectionId;
    void signal;
    const effectiveQuery = question.includes('退货') ? '商品退货申请时限' : undefined;
    return {
      stream: mockAskStream(question),
      effectiveQuery,
      citations: [
        {
          index: 1,
          sourceId: 'd-12',
          title: '退货政策.md',
          snippet: '…自签收之日起 7 日内，消费者可申请无理由退货…',
          score: 0.92,
        },
        {
          index: 2,
          sourceId: 'd-09',
          title: 'FAQ.md',
          snippet: '…特殊品类（定制、鲜活易腐等）不适用 7 日无理由…',
          score: 0.86,
        },
      ],
    };
  }

  const events = apiPostSse<{ type: string; content?: string; effectiveQuery?: string }>(
    `/collections/${collectionId}/ask`,
    { question },
    signal,
  );

  async function* streamFromSse(): AsyncGenerator<string> {
    let effectiveQuery: string | undefined;
    for await (const event of events) {
      if (event.type === 'meta' && event.effectiveQuery) {
        effectiveQuery = event.effectiveQuery;
      }
      if (event.type === 'token' && event.content) {
        yield event.content;
      }
    }
    void effectiveQuery;
  }

  return { stream: streamFromSse() };
}
