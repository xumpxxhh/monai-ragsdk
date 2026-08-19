import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/api/http';
import type {
  CollectionDetail,
  CollectionSummary,
  CreateCollectionInput,
  Paginated,
} from '@/shared/types';

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeCollectionsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyCollectionsChanged(): void {
  for (const listener of listeners) listener();
}

export async function listCollections(): Promise<CollectionSummary[]> {
  return apiGet<CollectionSummary[]>('/collections');
}

export async function getCollection(id: string): Promise<CollectionDetail> {
  return apiGet<CollectionDetail>(`/collections/${id}`);
}

export async function createCollection(input: CreateCollectionInput): Promise<CollectionDetail> {
  const created = await apiPost<CollectionDetail>('/collections', input);
  notifyCollectionsChanged();
  return created;
}

export async function removeCollection(id: string): Promise<void> {
  await apiDelete(`/collections/${id}`);
  notifyCollectionsChanged();
}

export async function searchCollections(
  query: string,
  page = 1,
  pageSize = 12,
): Promise<Paginated<CollectionSummary>> {
  return apiGet<Paginated<CollectionSummary>>('/collections', { q: query, page, pageSize });
}

export async function updateCollection(
  id: string,
  patch: Partial<Pick<CollectionDetail, 'name' | 'description'>>,
): Promise<CollectionDetail> {
  const updated = await apiPut<CollectionDetail>(`/collections/${id}`, patch);
  notifyCollectionsChanged();
  return updated;
}
