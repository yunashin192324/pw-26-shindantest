import { allSections, sectionLabel } from '../data/chapters';
import { features } from '../data/features';
import { products, tags } from '../data/products';
import type { ProductId, TagId } from '../data/types';
import { EmptyState, PageHeader } from '../components/common';
import { FeatureCard } from '../components/FeatureParts';
import { filterFeatures, type FeatureFilter } from '../utils/filtering';
import { listParam, navigate, withQuery, type Route } from '../utils/navigation';

function readFilter(route: Route): FeatureFilter {
  const productIds = new Set(products.map((p) => p.id as string));
  const tagIds = new Set(tags.map((t) => t.id as string));
  const sectionIds = new Set(allSections.map((s) => s.id));
  return {
    products: listParam(route.query, 'products').filter((p) => productIds.has(p)) as ProductId[],
    tags: listParam(route.query, 'tags').filter((t) => tagIds.has(t)) as TagId[],
    tagMode: route.query.get('mode') === 'all' ? 'all' : 'any',
    sections: listParam(route.query, 'sections').filter((s) => sectionIds.has(s)),
  };
}

function writeFilter(f: FeatureFilter) {
  navigate(
    withQuery('/features', {
      products: f.products,
      tags: f.tags,
      mode: f.tagMode === 'all' ? 'all' : undefined,
      sections: f.sections,
    }),
    { replace: true },
  );
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FeaturesPage({ route }: { route: Route }) {
  const filter = readFilter(route);
  const result = filterFeatures(features, filter);
  const active = filter.products.length + filter.tags.length + filter.sections.length > 0;

  return (
    <div className="page">
      <PageHeader
        title="全機能一覧"
        breadcrumbs={[{ label: '全機能一覧' }]}
        lead={<p>製品・用途・章節で絞り込めます。種類の異なる条件は「かつ」で組み合わせ、製品と章節は選んだもののいずれかに当てはまる機能を表示します。</p>}
      />
      <div className="filters" aria-label="絞り込み条件">
        <fieldset>
          <legend>製品</legend>
          <div className="chips">
            {products.map((p) => (
              <label key={p.id} className={`chip ${filter.products.includes(p.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={filter.products.includes(p.id)} onChange={() => writeFilter({ ...filter, products: toggle(filter.products, p.id) })} />
                {p.id === 'common' ? p.name : p.name.replace('Adobe ', '')}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            用途
            <span className="small muted">（分類タグはアプリ独自の整理です）</span>
          </legend>
          <div className="chips">
            {tags.map((t) => (
              <label key={t.id} className={`chip ${filter.tags.includes(t.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={filter.tags.includes(t.id)} onChange={() => writeFilter({ ...filter, tags: toggle(filter.tags, t.id) })} />
                {t.label}
              </label>
            ))}
          </div>
          <div className="radio-row">
            用途の組み合わせ：
            <label>
              <input type="radio" name="mode" checked={filter.tagMode === 'any'} onChange={() => writeFilter({ ...filter, tagMode: 'any' })} /> いずれかを含む
            </label>
            <label>
              <input type="radio" name="mode" checked={filter.tagMode === 'all'} onChange={() => writeFilter({ ...filter, tagMode: 'all' })} /> すべてを含む
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>章・節</legend>
          <div className="chips">
            {allSections
              .filter((s) => s.featureIds.length > 0)
              .map((s) => (
                <label key={s.id} className={`chip ${filter.sections.includes(s.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={filter.sections.includes(s.id)} onChange={() => writeFilter({ ...filter, sections: toggle(filter.sections, s.id) })} />
                  {sectionLabel(s.id)}
                </label>
              ))}
          </div>
        </fieldset>
        <div className="filter-summary">
          <span role="status">
            {result.length} 件 / 全 {features.length} 件
          </span>
          <button type="button" className="btn" disabled={!active} onClick={() => writeFilter({ products: [], tags: [], tagMode: 'any', sections: [] })}>
            絞り込みを解除
          </button>
        </div>
      </div>
      {result.length === 0 ? (
        <EmptyState title="条件に該当する機能がありません">
          <p>条件を減らすか、「絞り込みを解除」を押してください。</p>
        </EmptyState>
      ) : (
        <div className="card-grid">
          {result.map((f) => (
            <FeatureCard key={f.id} feature={f} />
          ))}
        </div>
      )}
    </div>
  );
}
