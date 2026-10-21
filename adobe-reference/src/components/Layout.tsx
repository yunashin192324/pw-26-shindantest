import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { chapters } from '../data/chapters';
import { products } from '../data/products';
import type { ProductId } from '../data/types';
import { navigate, withQuery, type Route } from '../utils/navigation';
import { useStore } from '../utils/store';
import { Link } from './common';

export function SearchBar({ initial = '', autoFocus, id = 'global-search' }: { initial?: string; autoFocus?: boolean; id?: string }) {
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(withQuery('/search', { q: q.trim() }));
  };
  return (
    <form role="search" className="searchbar" onSubmit={submit}>
      <label htmlFor={id} className="visually-hidden">
        全文検索
      </label>
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="機能名・用語で検索（例：生成拡張、髪の毛、RAW）"
        autoFocus={autoFocus}
        autoComplete="off"
      />
      <button type="submit" className="btn btn-primary">
        検索
      </button>
    </form>
  );
}

function Header({ route, onToggleMenu, menuOpen }: { route: Route; onToggleMenu: () => void; menuOpen: boolean }) {
  const { bookmarks, settings, updateSettings, storageAvailable } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSettingsOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  const currentProduct = route.path === '/features' ? route.query.get('products') ?? '' : '';

  return (
    <header className="app-header">
      <button
        type="button"
        className="btn menu-toggle"
        aria-expanded={menuOpen}
        aria-controls="sidebar"
        onClick={onToggleMenu}
      >
        <span aria-hidden="true">☰</span>
        <span className="menu-label">{menuOpen ? '目次を閉じる' : '目次'}</span>
      </button>
      <Link to="/" className="app-name">
        Adobe画像編集・技術仕様リファレンス
      </Link>
      <div className="header-search">
        <SearchBar initial={route.path === '/search' ? route.query.get('q') ?? '' : ''} />
      </div>
      <label className="product-select">
        <span className="visually-hidden">製品で絞り込み</span>
        <select
          value={currentProduct.includes(',') ? '' : currentProduct}
          onChange={(e) => navigate(withQuery('/features', { products: e.target.value || undefined }))}
        >
          <option value="">製品で絞り込み</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === 'common' ? p.name : p.name.replace('Adobe ', '')}
            </option>
          ))}
        </select>
      </label>
      <Link to="/bookmarks" className="btn">
        <span aria-hidden="true">★</span> <span className="btn-label">ブックマーク</span>
        {storageAvailable ? `（${bookmarks.length}）` : ''}
      </Link>
      <div className="settings" ref={panelRef}>
        <button type="button" className="btn" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
          表示設定
        </button>
        {settingsOpen && (
          <div className="settings-panel" role="dialog" aria-label="表示設定">
            <fieldset>
              <legend>文字の大きさ</legend>
              <label>
                <input type="radio" name="fs" checked={settings.fontSize === 'normal'} onChange={() => updateSettings({ fontSize: 'normal' })} /> 標準
              </label>
              <label>
                <input type="radio" name="fs" checked={settings.fontSize === 'large'} onChange={() => updateSettings({ fontSize: 'large' })} /> 大きい
              </label>
            </fieldset>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.showEmptyFields}
                onChange={(e) => updateSettings({ showEmptyFields: e.target.checked })}
              />
              機能詳細で「未記載」の項目も表示する
            </label>
            <p className="small muted">
              {storageAvailable ? '設定はこのブラウザーに保存されます。' : 'この環境では保存できないため、再読み込みすると設定は元に戻ります。'}
            </p>
          </div>
        )}
      </div>
    </header>
  );
}

interface NavItem {
  label: string;
  to: string;
  match?: (r: Route) => boolean;
  children?: NavItem[];
}

const productNav = (id: ProductId, label: string): NavItem => ({
  label,
  to: `/product/${id}`,
  match: (r) => r.path === `/product/${id}`,
});

const navItems: NavItem[] = [
  { label: 'ホーム', to: '/', match: (r) => r.path === '/' },
  { label: '全機能一覧', to: '/features', match: (r) => r.path === '/features' },
  productNav('photoshop', 'Photoshop'),
  productNav('lightroom', 'Lightroom'),
  productNav('camera-raw', 'Camera Raw'),
  productNav('firefly', 'Firefly'),
  {
    label: 'Illustrator・Express',
    to: '/product/illustrator',
    match: () => false,
    children: [productNav('illustrator', 'Illustrator'), productNav('express', 'Express')],
  },
  { label: '技術仕様', to: '/chapter/ch4', match: (r) => r.path === '/chapter/ch4' },
  { label: 'ファイル形式一覧', to: '/formats', match: (r) => r.path === '/formats' },
  { label: '自動化・大量処理', to: '/automation', match: (r) => r.path === '/automation' },
  { label: 'フォトウェディングの作業工程', to: '/workflow', match: (r) => r.path === '/workflow' },
  { label: '品質検査項目', to: '/quality', match: (r) => r.path === '/quality' },
  { label: '機能比較', to: '/compare', match: (r) => r.path === '/compare' },
  { label: 'ブックマーク', to: '/bookmarks', match: (r) => r.path === '/bookmarks' },
  { label: '公式資料・出典', to: '/sources', match: (r) => r.path === '/sources' },
  { label: '収録対応表', to: '/coverage', match: (r) => r.path === '/coverage' },
  { label: 'アプリについて', to: '/about', match: (r) => r.path === '/about' },
];

function NavLink({ item, route, onNavigate }: { item: NavItem; route: Route; onNavigate: () => void }) {
  const active = item.match?.(route) ?? false;
  return (
    <a href={`#${item.to}`} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
      {item.label}
    </a>
  );
}

function Sidebar({ route, open, onNavigate }: { route: Route; open: boolean; onNavigate: () => void }) {
  return (
    <nav id="sidebar" className={`sidebar ${open ? 'open' : ''}`} aria-label="サイト内の目次">
      <ul>
        {navItems.map((item) => (
          <li key={item.label}>
            {item.children ? (
              <>
                <span className="nav-group">{item.label}</span>
                <ul>
                  {item.children.map((c) => (
                    <li key={c.label}>
                      <NavLink item={c} route={route} onNavigate={onNavigate} />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <NavLink item={item} route={route} onNavigate={onNavigate} />
            )}
          </li>
        ))}
      </ul>
      <p className="nav-heading">章で読む</p>
      <ul>
        {chapters.map((c) => (
          <li key={c.id}>
            <NavLink
              item={{ label: `第${c.number}章 ${c.title}`, to: `/chapter/${c.id}`, match: (r) => r.path === `/chapter/${c.id}` }}
              route={route}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

const NARROW = '(max-width: 1023px)';

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  // 狭い画面: 目次を重ねて開閉する。広い画面: 目次の表示・非表示を切り替える。
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setMenuOpen(false), [route.path]);
  const toggle = () => {
    if (window.matchMedia(NARROW).matches) setMenuOpen((v) => !v);
    else setCollapsed((v) => !v);
  };
  const expanded = window.matchMedia(NARROW).matches ? menuOpen : !collapsed;
  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        本文へ移動
      </a>
      <Header route={route} menuOpen={expanded} onToggleMenu={toggle} />
      <div className="app-body">
        <Sidebar route={route} open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
