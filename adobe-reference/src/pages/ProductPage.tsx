import { sectionById, sectionLabel } from '../data/chapters';
import { features } from '../data/features';
import { productById } from '../data/products';
import { fileFormats } from '../data/reference';
import type { ProductId } from '../data/types';
import { EmptyState, Link, NotRecorded, PageHeader, RefList } from '../components/common';
import { FeatureCard } from '../components/FeatureParts';
import { NotFoundPage } from './NotFoundPage';

export function ProductPage({ id }: { id: string }) {
  const product = productById[id as ProductId];
  if (!product) return <NotFoundPage />;
  const list = features.filter((f) => f.products.includes(product.id));
  const bySection = product.sections
    .map((sid) => ({ sid, items: list.filter((f) => f.section === sid) }))
    .filter((g) => sectionById[g.sid]);
  const formats = fileFormats.filter((f) => f.relatedProducts.includes(product.id));

  return (
    <div className="page">
      <PageHeader title={product.name} breadcrumbs={[{ label: '製品別' }, { label: product.name }]} />
      <section className="field">
        <h2>役割</h2>
        <p>{product.role ?? <NotRecorded />}</p>
      </section>
      <section className="field">
        <h2>収録機能（{list.length} 件）</h2>
        {list.length === 0 ? (
          <EmptyState title="この製品に分類された機能データはありません">
            <p>関連する章・節は下記のとおりです。製品の説明は元資料本文が未提供のため未記載です。</p>
          </EmptyState>
        ) : (
          bySection
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.sid} className="group">
                <h3>
                  <Link to={`/chapter/${sectionById[g.sid].chapterId}?at=sec-${g.sid}`}>{sectionLabel(g.sid)}</Link>
                </h3>
                <div className="card-grid">
                  {g.items.map((f) => (
                    <FeatureCard key={f.id} feature={f} />
                  ))}
                </div>
              </div>
            ))
        )}
      </section>
      <section className="field">
        <h2>関連する章・節</h2>
        <ul>
          {bySection.map((g) => (
            <li key={g.sid}>
              <Link to={`/chapter/${sectionById[g.sid].chapterId}?at=sec-${g.sid}`}>{sectionLabel(g.sid)}</Link>
            </li>
          ))}
        </ul>
      </section>
      {formats.length > 0 && (
        <section className="field">
          <h2>関連するファイル形式（アプリ独自の整理）</h2>
          <ul>
            {formats.map((f) => (
              <li key={f.id}>
                <Link to={`/formats?at=format-${f.id}`}>{f.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="field">
        <h2>公式資料</h2>
        <RefList refs={product.officialRefs} />
      </section>
    </div>
  );
}
