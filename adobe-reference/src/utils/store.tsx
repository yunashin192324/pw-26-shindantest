import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { chapterById } from '../data/chapters';
import { featureById } from '../data/features';
import { readJson, STORAGE_KEYS, storageAvailable, writeJson } from './storage';
import { validFeatureIds } from './comparison';

export type BookmarkType = 'feature' | 'chapter';

export interface Bookmark {
  type: BookmarkType;
  id: string;
  addedAt: string;
}

export interface Settings {
  fontSize: 'normal' | 'large';
  showEmptyFields: boolean;
}

const defaultSettings: Settings = { fontSize: 'normal', showEmptyFields: true };
const RECENT_MAX = 8;

/** 存在しない機能・章を指す保存データは読み込み時に除外する */
function exists(type: BookmarkType, id: string): boolean {
  return type === 'feature' ? id in featureById : id in chapterById;
}

interface Store {
  storageAvailable: boolean;
  bookmarks: Bookmark[];
  isBookmarked: (type: BookmarkType, id: string) => boolean;
  toggleBookmark: (type: BookmarkType, id: string) => void;
  removeBookmark: (type: BookmarkType, id: string) => void;
  recent: { type: BookmarkType; id: string }[];
  recordView: (type: BookmarkType, id: string) => void;
  compare: string[];
  addCompare: (id: string) => void;
  removeCompare: (id: string) => void;
  setCompare: (ids: string[]) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() =>
    readJson<Bookmark[]>(STORAGE_KEYS.bookmarks, []).filter((b) => b && exists(b.type, b.id)),
  );
  const [recent, setRecent] = useState<{ type: BookmarkType; id: string }[]>(() =>
    readJson<{ type: BookmarkType; id: string }[]>(STORAGE_KEYS.recent, []).filter((r) => r && exists(r.type, r.id)),
  );
  const [compare, setCompareState] = useState<string[]>(() =>
    validFeatureIds(readJson<string[]>(STORAGE_KEYS.compare, [])),
  );
  const [settings, setSettings] = useState<Settings>(() => ({
    ...defaultSettings,
    ...readJson<Partial<Settings>>(STORAGE_KEYS.settings, {}),
  }));

  useEffect(() => void writeJson(STORAGE_KEYS.bookmarks, bookmarks), [bookmarks]);
  useEffect(() => void writeJson(STORAGE_KEYS.recent, recent), [recent]);
  useEffect(() => void writeJson(STORAGE_KEYS.compare, compare), [compare]);
  useEffect(() => {
    writeJson(STORAGE_KEYS.settings, settings);
    document.documentElement.dataset.fontSize = settings.fontSize;
  }, [settings]);

  const isBookmarked = useCallback(
    (type: BookmarkType, id: string) => bookmarks.some((b) => b.type === type && b.id === id),
    [bookmarks],
  );

  const toggleBookmark = useCallback((type: BookmarkType, id: string) => {
    if (!storageAvailable) return;
    setBookmarks((prev) =>
      prev.some((b) => b.type === type && b.id === id)
        ? prev.filter((b) => !(b.type === type && b.id === id))
        : [...prev, { type, id, addedAt: new Date().toISOString() }],
    );
  }, []);

  const removeBookmark = useCallback((type: BookmarkType, id: string) => {
    setBookmarks((prev) => prev.filter((b) => !(b.type === type && b.id === id)));
  }, []);

  const recordView = useCallback((type: BookmarkType, id: string) => {
    if (!storageAvailable || !exists(type, id)) return;
    setRecent((prev) => {
      if (prev[0]?.type === type && prev[0]?.id === id) return prev;
      return [{ type, id }, ...prev.filter((r) => !(r.type === type && r.id === id))].slice(0, RECENT_MAX);
    });
  }, []);

  const addCompare = useCallback((id: string) => setCompareState((prev) => validFeatureIds([...prev, id])), []);
  const removeCompare = useCallback((id: string) => setCompareState((prev) => prev.filter((x) => x !== id)), []);
  const setCompare = useCallback((ids: string[]) => setCompareState(validFeatureIds(ids)), []);
  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })), []);

  const value = useMemo<Store>(
    () => ({
      storageAvailable,
      bookmarks,
      isBookmarked,
      toggleBookmark,
      removeBookmark,
      recent,
      recordView,
      compare,
      addCompare,
      removeCompare,
      setCompare,
      settings,
      updateSettings,
    }),
    [bookmarks, isBookmarked, toggleBookmark, removeBookmark, recent, recordView, compare, addCompare, removeCompare, setCompare, settings, updateSettings],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreProvider が必要です');
  return ctx;
}
