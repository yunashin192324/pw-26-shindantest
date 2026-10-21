import { useEffect, useState } from 'react';

/**
 * ハッシュ（#/...）による画面遷移。
 * サーバー設定なしで静的配信でき、ブラウザーの戻る・進むもそのまま動作する。
 */
export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return {
    path,
    segments: path.split('/').filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(queryPart),
  };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function href(to: string): string {
  return `#${to.startsWith('/') ? to : `/${to}`}`;
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const target = href(to);
  if (options.replace) {
    window.history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target.slice(1);
  }
}

export function withQuery(path: string, params: Record<string, string | string[] | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    const value = Array.isArray(v) ? v.join(',') : v;
    if (value !== '') q.set(k, value);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export function listParam(query: URLSearchParams, key: string): string[] {
  const v = query.get(key);
  return v ? v.split(',').filter(Boolean) : [];
}
