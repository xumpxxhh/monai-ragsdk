import { apiDelete, apiGet, apiPost, apiPostSse } from '@/shared/api/http';
import type {
  AskMessage,
  ChunkingConfig,
  DocumentSource,
  GlobalAskRequest,
  GlobalSearchRequest,
  IngestDocumentInput,
  IngestProgressEvent,
  IngestRecommendation,
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

/** 根据待入库文档 metadata 获取推荐的 chunk / loader 配置。 */
export async function recommendIngest(
  collectionId: string,
  documents: Array<{ id?: string; metadata?: { title?: string; mimeType?: string } }>,
): Promise<IngestRecommendation> {
  return apiPost<IngestRecommendation>(`/collections/${collectionId}/ingest/recommend`, {
    documents,
  });
}

export interface StartIngestOptions {
  files: File[];
  chunking?: ChunkingConfig;
  loaderHint?: string;
}

function inferMimeType(file: File, loaderHint?: string): string | undefined {
  if (loaderHint?.trim()) {
    return loaderHint.trim();
  }
  if (file.type?.trim()) {
    return file.type.trim();
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown';
  }
  if (lower.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'text/html';
  }
  return 'text/plain';
}

/** 启动异步入库，并以约 500ms 间隔轮询进度直到 done。 */
export async function startIngest(
  collectionId: string,
  options: StartIngestOptions,
): Promise<AsyncGenerator<IngestProgressEvent>> {
  const { files, chunking, loaderHint } = options;
  const documents: IngestDocumentInput[] = await Promise.all(
    files.map(async (file, index) => ({
      id: `${file.name}-${index}`,
      content: await file.text(),
      metadata: {
        title: file.name,
        sourceId: file.name,
        mimeType: inferMimeType(file, loaderHint),
      },
    })),
  );
  const response = await apiPost<{ taskId: string }>(`/collections/${collectionId}/ingest`, {
    documents,
    chunking,
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

export async function searchDocuments(input: {
  query: string;
  topK?: number;
  collectionIds?: string[];
}): Promise<SearchResult> {
  const body: GlobalSearchRequest = { query: input.query, topK: input.topK };
  if (input.collectionIds && input.collectionIds.length > 0) {
    body.collectionIds = input.collectionIds;
  }
  return apiPost<SearchResult>('/search', body);
}

export interface AskStreamResult {
  stream: AsyncGenerator<string>;
  effectiveQuery?: string;
  citations?: AskMessage['citations'];
}

/** 消费服务端 ask SSE：token 为 delta，前端累加后再 yield。 */
export async function askStream(input: {
  question: string;
  collectionIds?: string[];
  signal?: AbortSignal;
}): Promise<AskStreamResult> {
  const body: GlobalAskRequest = { question: input.question };
  if (input.collectionIds && input.collectionIds.length > 0) {
    body.collectionIds = input.collectionIds;
  }

  const events = apiPostSse<{
    type: string;
    content?: string;
    effectiveQuery?: string;
    citations?: AskMessage['citations'];
    noGrounding?: boolean;
  }>('/ask', body, input.signal);

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
