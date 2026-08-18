import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listCollections } from '@/shared/api/collections';
import {
  readPreferences,
  readStoredCollectionId,
  savePreferences,
  saveStoredCollectionId,
  type StoredPreferences,
} from '@/shared/theme/theme';
import type { CollectionSummary } from '@/shared/types';

export type AppPreferences = StoredPreferences;

interface AppContextValue {
  collections: CollectionSummary[];
  currentCollection: CollectionSummary | null;
  currentCollectionId: string | null;
  setCurrentCollectionId: (id: string) => void;
  refreshCollections: () => Promise<void>;
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  isAdmin: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [currentCollectionId, setCurrentCollectionIdState] = useState<string | null>(
    readStoredCollectionId(),
  );
  const [preferences, setPreferences] = useState<AppPreferences>(readPreferences());

  const refreshCollections = useCallback(async () => {
    const items = await listCollections();
    setCollections(items);
    if (items.length === 0) {
      setCurrentCollectionIdState(null);
      return;
    }
    const stored = readStoredCollectionId();
    const valid = stored && items.some((c) => c.id === stored);
    if (!valid) {
      const first = items[0];
      if (first) {
        setCurrentCollectionIdState(first.id);
        saveStoredCollectionId(first.id);
      }
    }
  }, []);

  useEffect(() => {
    void refreshCollections();
  }, [refreshCollections]);

  const setCurrentCollectionId = useCallback((id: string) => {
    setCurrentCollectionIdState(id);
    saveStoredCollectionId(id);
  }, []);

  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const currentCollection = useMemo(
    () => collections.find((c) => c.id === currentCollectionId) ?? null,
    [collections, currentCollectionId],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      collections,
      currentCollection,
      currentCollectionId,
      setCurrentCollectionId,
      refreshCollections,
      preferences,
      updatePreferences,
      isAdmin: preferences.role === 'admin',
    }),
    [
      collections,
      currentCollection,
      currentCollectionId,
      setCurrentCollectionId,
      refreshCollections,
      preferences,
      updatePreferences,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext 必须在 AppProvider 内使用');
  return ctx;
}

export function useCurrentCollection(): CollectionSummary | null {
  return useAppContext().currentCollection;
}

export function useIsAdmin(): boolean {
  return useAppContext().isAdmin;
}
