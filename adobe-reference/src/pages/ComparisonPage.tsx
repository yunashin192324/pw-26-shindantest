import { useEffect, useState, type ReactNode } from 'react';
import { allSections, sectionLabel } from '../data/chapters';
import { featureById, features } from '../data/features';
import { productById, productShortName, tags } from '../data/products';
import type { ProductId } from '../data/types';
import { EmptyState, Link, NotRecorded, PageHeader } from '../components/common';
import { comparisonPresets, comparisonRows, formatValue, validFeatureIds } from '../utils/comparison';
import { countByProduct } from '../utils/filtering';
import { listParam, navigate, withQuery, type Route } from '../utils/navigation';
import { useStore } from '../utils/store';

function ProductComparison({ ids }: { ids: ProductId[] }) {
  const list = ids.map((id) => productById[id]);
  const rows: { label: string; value: (id: ProductId) => ReactNode }[] = [
    { label: '役割', value: (id) => productById[id].role ?? <NotRecorded /> },
    { label: '収録機能数', value: (id) => `${countByProduct(features, id)} 件` },
    {
      label: '関連する章・節',
      value: (id) => productById[id].sections.map(sectionLabel).join('、'),
    },
    {
      label: '用途タグ別の機能数（アプリ独自の整理）',
      value: (id) => {
        const fs = features.filter((f) => f.products.includes(id));
        const parts = tags.map((t) => [t.label, fs.filter((f) => f.tags.includes(t.id)).length] as const).filter(([, n]) => n > 0);
        return parts.length ? parts.map(([l, n]) => `${l} ${n}`).join('、') : 'なし';
      },
    },
  ];
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="製品比較表（横にスクロールできます）">
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">比較項目</th>
            {list.map((p) => (
              <th key={p.id} scope="col">
                <Link to={`/product/${p.id}`}>{p.name}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {list.map((p) => (
                <td key={p.id}>{r.value(p.id)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ComparisonPage({ route }: { route: Route }) {
  const { compare, setCompare, removeCompare, addCompare } = useStore();
  const urlIds = validFeatureIds(listParam(route.query, 'ids'));
  const productIds = listParam(route.query, 'products').filter((p): p is ProductId => p in productById);
  const [pick, setPick] = useState('');

  // URL で比較対象が指定された場合は、それを選択状態にする
  useEffect(() => {
    if (urlIds.length) {
      setCompare(urlIds);
      navigate('/compare', { replace: true });
    }
  }, [urlIds.join(',')]);

  const selected = compare.map((id) => featureById[id]).filter(Boolean);

  return (
    <div className="page">
      <PageHeader
        title="機能比較"
        breadcrumbs={[{ label: '機能比較' }]}
        lead={<p>複数の機能を選び、同じ観点で並べて比較します。表の内容は登録された機能データから作成しており、データが無い項目は「未記載」と表示します。</p>}
      />

      <section className="field">
        <h2>比較の例</h2>
        <ul className="preset-list">
          {comparisonPresets.map((p) => (
            <li key={p.label}>
              {p.featureIds ? (
                <button type="button" className="btn" onClick={() => setCompare(p.featureIds!)}>
                  {p.label}
                </button>
              ) : p.productIds ? (
                <Link className="btn" to={withQuery('/compare', { products: p.productIds })}>
                  {p.label}（製品）
                </Link>
              ) : (
                <span className="preset-unavailable">
                  {p.label}：<span className="small muted">{p.unavailableReason}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {productIds.length >= 2 && (
        <section className="field">
          <h2>製品の比較：{productIds.map((p) => productShortName[p]).join(' と ')}</h2>
          <ProductComparison ids={productIds} />
          <p>
            <Link to="/compare">製品の比較を閉じる</Link>
          </p>
        </section>
      )}

      <section className="field">
        <h2>比較対象の選択（{selected.length} 件）</h2>
        <form
          className="compare-picker"
          onSubmit={(e) => {
            e.preventDefault();
            if (pick) addCompare(pick);
            setPick('');
          }}
        >
          <label htmlFor="compare-pick">機能を追加：</label>
          <select id="compare-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">選択してください</option>
            {allSections
              .filter((s) => s.featureIds.length)
              .map((s) => (
                <optgroup key={s.id} label={sectionLabel(s.id)}>
                  {s.featureIds.map((id) => (
                    <option key={id} value={id} disabled={compare.includes(id)}>
                      {featureById[id].title}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
          <button type="submit" className="btn btn-primary" disabled={!pick}>
            追加
          </button>
          <button type="button" className="btn" disabled={!selected.length} onClick={() => setCompare([])}>
            すべて外す
          </button>
        </form>
        {selected.length > 0 && (
          <ul className="selected-list">
            {selected.map((f) => (
              <li key={f.id}>
                {f.title}
                <button type="button" className="btn btn-small" onClick={() => removeCompare(f.id)} aria-label={`${f.title}を比較対象から外す`}>
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected.length < 2 ? (
        <EmptyState title="比較するには機能を2件以上選んでください">
          <p>上の「機能を追加」または各機能ページの「比較に追加」から選べます。</p>
        </EmptyState>
      ) : (
        <section className="field">
          <h2>比較表</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="機能比較表（横にスクロールできます）">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">比較項目</th>
                  {selected.map((f) => (
                    <th key={f.id} scope="col">
                      <Link to={`/feature/${f.id}`}>{f.title}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {selected.map((f) => {
                      const v = formatValue(row.value(f));
                      return <td key={f.id}>{v ?? <NotRecorded reason="元資料未提供" />}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
