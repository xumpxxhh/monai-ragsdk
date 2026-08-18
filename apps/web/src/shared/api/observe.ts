import { useMockApi } from '@/config/env';
import { apiGet } from '@/shared/api/http';
import {
  mockActivities,
  mockAskTraces,
  mockConnectionInfo,
  mockIngestTraces,
  getDashboardStats,
} from '@/shared/api/mock/data';
import type {
  ActivityItem,
  AskTrace,
  ConnectionInfo,
  DashboardStats,
  IngestTaskTrace,
} from '@/shared/types';
import { delay } from '@/shared/utils';

export async function getDashboard(collectionId: string): Promise<DashboardStats> {
  if (useMockApi) {
    await delay(150);
    return getDashboardStats(collectionId);
  }
  return apiGet<DashboardStats>(`/collections/${collectionId}/dashboard`);
}

export async function listActivities(collectionId?: string): Promise<ActivityItem[]> {
  if (useMockApi) {
    await delay(120);
    if (!collectionId) return mockActivities;
    return mockActivities.filter((a) => !a.collectionId || a.collectionId === collectionId);
  }
  return apiGet<ActivityItem[]>('/activities', collectionId ? { collectionId } : undefined);
}

export async function listAskTraces(params?: {
  collectionId?: string;
  q?: string;
}): Promise<AskTrace[]> {
  if (useMockApi) {
    await delay(180);
    let items = [...mockAskTraces];
    if (params?.collectionId) {
      items = items.filter((t) => t.collectionId === params.collectionId);
    }
    if (params?.q) {
      const q = params.q.toLowerCase();
      items = items.filter((t) => t.question.toLowerCase().includes(q));
    }
    return items;
  }
  return apiGet<AskTrace[]>('/traces/ask', params);
}

export async function getAskTrace(id: string): Promise<AskTrace> {
  if (useMockApi) {
    await delay(100);
    const found = mockAskTraces.find((t) => t.id === id);
    if (!found) throw new Error('轨迹不存在');
    return found;
  }
  return apiGet<AskTrace>(`/traces/ask/${id}`);
}

export async function listIngestTraces(collectionId?: string): Promise<IngestTaskTrace[]> {
  if (useMockApi) {
    await delay(150);
    if (!collectionId) return mockIngestTraces;
    return mockIngestTraces.filter((t) => t.collectionId === collectionId);
  }
  return apiGet<IngestTaskTrace[]>('/traces/ingest', collectionId ? { collectionId } : undefined);
}

export async function getConnectionInfo(): Promise<ConnectionInfo> {
  if (useMockApi) {
    await delay(80);
    return mockConnectionInfo;
  }
  return apiGet<ConnectionInfo>('/connection');
}
