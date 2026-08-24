import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listCollections, subscribeCollectionsChanged } from '@/shared/api/collections';
import { readPreferences, savePreferences, type StoredPreferences } from '@/shared/theme/theme';
import type { CollectionSummary } from '@/shared/types';

export type AppPreferences = StoredPreferences;

interface AppContextValue {
  collections: CollectionSummary[];
  refreshCollections: () => Promise<void>;
  /** 全部已注册知识库的文档总数，用于全局问答空态判断。 */
  totalDocumentCount: number;
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  isAdmin: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>(readPreferences());

  const refreshCollections = useCallback(async () => {
    const items = await listCollections();
    setCollections(items);
  }, []);

  useEffect(() => {
    void refreshCollections();
  }, [refreshCollections]);

  // 创建 / 更新 / 删除知识库后同步列表
  useEffect(
    () => subscribeCollectionsChanged(() => void refreshCollections()),
    [refreshCollections],
  );

  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const totalDocumentCount = useMemo(
    () => collections.reduce((sum, item) => sum + item.documentCount, 0),
    [collections],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      collections,
      refreshCollections,
      totalDocumentCount,
      preferences,
      updatePreferences,
      isAdmin: preferences.role === 'admin',
    }),
    [collections, refreshCollections, totalDocumentCount, preferences, updatePreferences],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext 必须在 AppProvider 内使用');
  return ctx;
}

export function useIsAdmin(): boolean {
  return useAppContext().isAdmin;
}
