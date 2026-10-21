import { type ReactNode } from 'react';
import type { OfficialReference, ProvenanceKind } from '../data/types';
import { href } from '../utils/navigation';
import { provenanceDescription, provenanceLabel, provenanceTone } from '../utils/provenance';

export function Link({ to, children, className, onClick }: { to: string; children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <a href={href(to)} className={className} onClick={onClick}>
      {children}
    </a>
  );
}

/** https の URL だけをリンクにする。新しいタブで開き、元のページを操作されないようにする。 */
export function ExternalLink({ url, children }: { url: string; children: ReactNode }) {
  let safe = false;
  try {
    safe = new URL(url).protocol === 'https:';
  } catch {
    safe = false;
  }
  if (!safe) return <span>{children}（URLが不正なためリンクにしていません）</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="external">
      {children}
      <span className="visually-hidden">（新しいタブで開きます）</span>
      <span aria-hidden="true" className="external-mark">↗</span>
    </a>
  );
}

export function ProvenanceBadge({ kind, compact }: { kind: ProvenanceKind; compact?: boolean }) {
  return (
    <span className={`badge tone-${provenanceTone[kind]}`} title={provenanceDescription[kind]}>
      {provenanceLabel[kind]}
      {!compact && <span className="visually-hidden">：{provenanceDescription[kind]}</span>}
    </span>
  );
}

export function SourceStatus({ kinds }: { kinds: ProvenanceKind[] }) {
  return (
    <span className="badge-row">
      {kinds.map((k) => (
        <ProvenanceBadge key={k} kind={k} compact />
      ))}
    </span>
  );
}

export function NotRecorded({ reason = '元資料本文が未提供' }: { reason?: string }) {
  return <span className="not-recorded">未記載（{reason}）</span>;
}

/** 文字列の一致箇所を <mark> で強調する。HTMLとしては解釈しない。 */
export function Highlight({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([a, b], i) => {
    if (a > pos) parts.push(text.slice(pos, a));
    parts.push(<mark key={i}>{text.slice(a, b)}</mark>);
    pos = b;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="パンくずリスト" className="breadcrumbs">
      <ol>
        {items.map((it, i) => (
          <li key={i}>
            {it.to && i < items.length - 1 ? <Link to={it.to}>{it.label}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{it.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, lead, breadcrumbs, actions }: { title: string; lead?: ReactNode; breadcrumbs?: { label: string; to?: string }[]; actions?: ReactNode }) {
  return (
    <header className="page-header">
      {breadcrumbs && <Breadcrumbs items={[{ label: 'ホーム', to: '/' }, ...breadcrumbs]} />}
      <div className="page-title-row">
        <h1>{title}</h1>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {lead && <div className="lead">{lead}</div>}
    </header>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'alert'; title?: string; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'alert' ? 'note' : undefined}>
      {title && <p className="notice-title">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function RefList({ refs }: { refs: OfficialReference[] }) {
  if (!refs.length) return <NotRecorded reason="所在を確認できた公式ページはありません" />;
  return (
    <ul className="ref-list">
      {refs.map((r) => (
        <li key={r.url}>
          <ExternalLink url={r.url}>{r.title}</ExternalLink>
          <div className="ref-meta">
            <ProvenanceBadge kind={r.status} compact /> 確認日：{r.checkedOn}　{r.checkMethod}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {children && <div>{children}</div>}
    </div>
  );
}
