import { apiGet } from '@/shared/api/http';
import type {
  ActivityItem,
  AskTrace,
  ConnectionInfo,
  DashboardStats,
  IngestTaskTrace,
} from '@/shared/types';

export async function getDashboard(collectionId: string): Promise<DashboardStats> {
  return apiGet<DashboardStats>(`/collections/${collectionId}/dashboard`);
}

export async function listActivities(collectionId?: string): Promise<ActivityItem[]> {
  return apiGet<ActivityItem[]>('/activities', collectionId ? { collectionId } : undefined);
}

export async function listAskTraces(params?: {
  collectionId?: string;
  q?: string;
}): Promise<AskTrace[]> {
  return apiGet<AskTrace[]>('/traces/ask', params);
}

export async function getAskTrace(id: string): Promise<AskTrace> {
  return apiGet<AskTrace>(`/traces/ask/${id}`);
}

export async function listIngestTraces(collectionId?: string): Promise<IngestTaskTrace[]> {
  return apiGet<IngestTaskTrace[]>('/traces/ingest', collectionId ? { collectionId } : undefined);
}

export async function getConnectionInfo(): Promise<ConnectionInfo> {
  return apiGet<ConnectionInfo>('/connection');
}
