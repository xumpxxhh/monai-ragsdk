import { useMockApi } from '@/config/env';
import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/api/http';
import {
  mockCollections,
  paginate,
  toCollectionSummary,
} from '@/shared/api/mock/data';
import type {
  CollectionDetail,
  CollectionSummary,
  CreateCollectionInput,
  Paginated,
} from '@/shared/types';
import { delay } from '@/shared/utils';

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
  if (useMockApi) {
    await delay(200);
    return mockCollections.map(toCollectionSummary);
  }
  return apiGet<CollectionSummary[]>('/collections');
}

export async function getCollection(id: string): Promise<CollectionDetail> {
  if (useMockApi) {
    await delay(150);
    const found = mockCollections.find((c) => c.id === id);
    if (!found) throw new Error('知识库不存在');
    return found;
  }
  return apiGet<CollectionDetail>(`/collections/${id}`);
}

export async function createCollection(input: CreateCollectionInput): Promise<CollectionDetail> {
  if (useMockApi) {
    await delay(300);
    const created: CollectionDetail = {
      id: `kb-${Date.now()}`,
      name: input.name,
      description: input.description ?? '',
      documentCount: 0,
      health: 'empty',
      presetLabel: '均衡',
      failedIngestCount: 0,
      lastIngestAt: null,
      createdAt: new Date().toISOString(),
    };
    mockCollections.push(created);
    notifyCollectionsChanged();
    return created;
  }
  return apiPost<CollectionDetail>('/collections', input);
}

export async function removeCollection(id: string): Promise<void> {
  if (useMockApi) {
    await delay(200);
    const idx = mockCollections.findIndex((c) => c.id === id);
    if (idx >= 0) mockCollections.splice(idx, 1);
    notifyCollectionsChanged();
    return;
  }
  await apiDelete(`/collections/${id}`);
}

export async function searchCollections(
  query: string,
  page = 1,
  pageSize = 12,
): Promise<Paginated<CollectionSummary>> {
  if (useMockApi) {
    await delay(150);
    const q = query.trim().toLowerCase();
    const filtered = mockCollections
      .map(toCollectionSummary)
      .filter((c) => !q || c.name.toLowerCase().includes(q));
    return paginate(filtered, page, pageSize);
  }
  return apiGet<Paginated<CollectionSummary>>('/collections', { q: query, page, pageSize });
}

export async function updateCollection(
  id: string,
  patch: Partial<Pick<CollectionDetail, 'name' | 'description'>>,
): Promise<CollectionDetail> {
  if (useMockApi) {
    await delay(200);
    const found = mockCollections.find((c) => c.id === id);
    if (!found) throw new Error('知识库不存在');
    if (patch.name) found.name = patch.name;
    if (patch.description !== undefined) found.description = patch.description;
    notifyCollectionsChanged();
    return found;
  }
  return apiPut<CollectionDetail>(`/collections/${id}`, patch);
}
