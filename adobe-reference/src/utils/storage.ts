/**
 * ブラウザー内保存（localStorage）の安全な読み書き。
 * 非公開ウィンドウや設定によって保存できない環境では available が false になり、
 * 画面側は「保存できない」ことを表示して、登録済みのようには見せない。
 */
const PREFIX = 'adobe-ref:';

function probe(): boolean {
  try {
    const key = `${PREFIX}__probe__`;
    window.localStorage.setItem(key, '1');
    const ok = window.localStorage.getItem(key) === '1';
    window.localStorage.removeItem(key);
    return ok;
  } catch {
    return false;
  }
}

export const storageAvailable: boolean = typeof window !== 'undefined' && probe();

export function readJson<T>(key: string, fallback: T): T {
  if (!storageAvailable) return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 保存に成功したら true を返す */
export function writeJson(key: string, value: unknown): boolean {
  if (!storageAvailable) return false;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const STORAGE_KEYS = {
  bookmarks: 'bookmarks',
  recent: 'recent',
  compare: 'compare',
  settings: 'settings',
} as const;

/** 保存内容の説明（アプリについて・ブックマーク画面で表示） */
export const storageDescription = [
  { key: `${PREFIX}bookmarks`, content: 'ブックマークした機能・章の識別子と登録日時' },
  { key: `${PREFIX}recent`, content: '最近閲覧した機能・章の識別子（最大8件）' },
  { key: `${PREFIX}compare`, content: '比較対象として選んだ機能の識別子' },
  { key: `${PREFIX}settings`, content: '表示設定（文字の大きさ、未記載項目の表示）' },
];
