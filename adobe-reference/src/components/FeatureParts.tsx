import { sectionLabel } from '../data/chapters';
import { productShortName, tagLabel } from '../data/products';
import { getSourceText } from '../data/sourceText';
import type { Feature } from '../data/types';
import { useStore } from '../utils/store';
import { Link, NotRecorded, ProvenanceBadge, SourceStatus } from './common';

export function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className="feature-card">
      <h3>
        <Link to={`/feature/${feature.id}`}>{feature.title}</Link>
      </h3>
      {feature.englishName && <p className="en">{feature.englishName}</p>}
      <p className="meta">
        {feature.products.map((p) => productShortName[p]).join('・')}　／　{sectionLabel(feature.section)}
      </p>
      <p className="tags" aria-label="用途タグ">
        {feature.tags.map((t) => (
          <span key={t} className="tag">
            {tagLabel[t]}
          </span>
        ))}
      </p>
      <SourceStatus kinds={feature.verificationStatus} />
    </article>
  );
}

/** 機能詳細の1項目。値がなければ「未記載」と表示する（表示設定で隠せる）。 */
export function FieldBlock({ id, label, value, ordered }: { id: string; label: string; value: string | string[] | null; ordered?: boolean }) {
  const { settings } = useStore();
  const empty = value == null || (Array.isArray(value) && value.length === 0);
  if (empty && !settings.showEmptyFields) return null;
  return (
    <section className="field" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{label}</h2>
      {empty ? (
        <p>
          <NotRecorded />
        </p>
      ) : Array.isArray(value) ? (
        ordered ? (
          <ol>
            {value.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ol>
        ) : (
          <ul>
            {value.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        )
      ) : (
        <p>{value}</p>
      )}
    </section>
  );
}

/** 元資料の文章欄。段落（空行区切り）を保ったまま文字列として表示する。 */
export function SourceTextBlock({ sourceKey, id = 'original' }: { sourceKey: string; id?: string }) {
  const text = getSourceText(sourceKey);
  return (
    <section className="source-text" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>
        元資料の文章 {text ? <ProvenanceBadge kind="source" compact /> : <ProvenanceBadge kind="source-missing" compact />}
      </h2>
      {text ? (
        text.split(/\n{2,}/).map((p, i) => (
          <p key={i} className="pre-line">
            {p}
          </p>
        ))
      ) : (
        <p className="muted">
          元資料の本文が提供されていないため、この欄は空です（収録キー：<code>{sourceKey}</code>）。
        </p>
      )}
    </section>
  );
}

export function TableOfContents({ items }: { items: { id: string; label: string }[] }) {
  if (items.length < 2) return null;
  return (
    <nav className="toc" aria-label="ページ内目次">
      <p className="toc-title">このページの目次</p>
      <ol>
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(it.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
