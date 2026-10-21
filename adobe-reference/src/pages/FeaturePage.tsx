import { useEffect } from 'react';
import { sectionById, sectionLabel } from '../data/chapters';
import { featureById } from '../data/features';
import { productShortName, tagLabel } from '../data/products';
import { BookmarkButton, CompareButton } from '../components/Buttons';
import { Link, PageHeader, ProvenanceBadge, RefList } from '../components/common';
import { FieldBlock, SourceTextBlock, TableOfContents } from '../components/FeatureParts';
import { withQuery } from '../utils/navigation';
import { provenanceDescription, provenanceLabel } from '../utils/provenance';
import { useStore } from '../utils/store';
import { NotFoundPage } from './NotFoundPage';

export function FeaturePage({ id }: { id: string }) {
  const feature = featureById[id];
  const { recordView, settings } = useStore();
  useEffect(() => {
    if (feature) recordView('feature', feature.id);
  }, [feature, recordView]);
  if (!feature) return <NotFoundPage />;

  const section = sectionById[feature.section];
  const siblings = section.featureIds.filter((x) => x !== feature.id);

  // 表示順は開発指示 7-4 に従う
  const fields: { id: string; label: string; value: string | string[] | null; ordered?: boolean }[] = [
    { id: 'summary', label: '3. 概要', value: feature.summary },
    { id: 'purpose', label: '4. 目的', value: feature.purpose },
    { id: 'inputs', label: '5. 入力', value: feature.inputs },
    { id: 'workflow', label: '6. 操作手順', value: feature.workflow, ordered: true },
    { id: 'processing', label: '7. 処理の概要', value: feature.processing },
    { id: 'outputs', label: '8. 出力', value: feature.outputs },
    { id: 'usecases', label: '9. 用途', value: feature.useCases },
    { id: 'limitations', label: '10. 制約', value: feature.limitations },
    { id: 'technical', label: '11. 技術上の注意', value: feature.technicalDetails },
  ];
  const visibleFields = settings.showEmptyFields ? fields : fields.filter((f) => f.value != null);

  const toc = [
    { id: 'products', label: '2. 対応製品' },
    ...visibleFields.map((f) => ({ id: f.id, label: f.label })),
    { id: 'related', label: '12. 関連機能' },
    { id: 'refs', label: '13. 公式資料' },
    { id: 'status', label: '14. 情報確認状況' },
    { id: 'original', label: '元資料の文章' },
    { id: 'expected', label: '元資料に含まれる記載項目' },
  ];

  return (
    <div className="page with-toc">
      <div className="page-main">
        <PageHeader
          title={feature.title}
          breadcrumbs={[
            { label: `第${section.chapterId.replace('ch', '')}章`, to: `/chapter/${section.chapterId}` },
            { label: sectionLabel(section.id), to: `/chapter/${section.chapterId}?at=sec-${section.id}` },
            { label: feature.title },
          ]}
          lead={
            <>
              {feature.englishName && (
                <p className="en">
                  英語名：{feature.englishName} <ProvenanceBadge kind="instruction" compact />
                </p>
              )}
              <p className="small muted">分類：{feature.category}</p>
            </>
          }
          actions={
            <>
              <BookmarkButton type="feature" id={feature.id} label={feature.title} />
              <CompareButton id={feature.id} label={feature.title} />
            </>
          }
        />

        <section className="field" id="products">
          <h2>2. 対応製品</h2>
          <p>
            {feature.products.map((p, i) => (
              <span key={p}>
                {i > 0 && '・'}
                <Link to={`/product/${p}`}>{productShortName[p]}</Link>
              </span>
            ))}
            <span className="small muted">　（収録した章・節に基づく分類）</span>
          </p>
          <p className="tags">
            用途タグ（アプリ独自の整理）：
            {feature.tags.map((t) => (
              <Link key={t} to={withQuery('/features', { tags: t })} className="tag">
                {tagLabel[t]}
              </Link>
            ))}
          </p>
        </section>

        {feature.instructionSubItems && (
          <section className="field">
            <h2>
              収録する下位項目 <ProvenanceBadge kind="instruction" compact />
            </h2>
            <ul>
              {feature.instructionSubItems.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="small muted">項目名のみです。各項目の説明は元資料本文が未提供のため未記載です。</p>
          </section>
        )}

        {fields.map((f) => (
          <FieldBlock key={f.id} {...f} />
        ))}
        {feature.workflow && (
          <p className="small muted">操作手順・工程の項目名は開発指示書の記載です（元資料本文で確認したものではありません）。</p>
        )}

        <section className="field" id="related">
          <h2>12. 関連機能</h2>
          {feature.relatedFeatures.length === 0 ? (
            <p className="muted">関連付けは登録されていません。</p>
          ) : (
            <ul>
              {feature.relatedFeatures.map((r, i) => {
                const target = r.featureId ? featureById[r.featureId] : null;
                return (
                  <li key={i}>
                    {target ? (
                      <Link to={`/feature/${target.id}`}>
                        {target.title}（{sectionLabel(target.section)}）
                      </Link>
                    ) : (
                      <Link to={r.to!}>{r.label}</Link>
                    )}{' '}
                    <ProvenanceBadge kind={r.basis} compact />
                    {r.note && <span className="small muted">　{r.note}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {siblings.length > 0 && (
            <>
              <h3>同じ節の項目</h3>
              <ul className="inline-list">
                {siblings.map((sid) => (
                  <li key={sid}>
                    <Link to={`/feature/${sid}`}>{featureById[sid].title}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="field" id="refs">
          <h2>13. 公式資料</h2>
          <RefList refs={feature.sourceReferences} />
        </section>

        <section className="field" id="status">
          <h2>14. 情報確認状況</h2>
          <ul>
            {feature.verificationStatus.map((s) => (
              <li key={s}>
                <ProvenanceBadge kind={s} compact /> {provenanceDescription[s]}
              </li>
            ))}
          </ul>
          <p className="small muted">
            このアプリはAdobeの機能を実行しません。この機能を実際に使うには、Adobeの製品が必要です（{provenanceLabel['external-dependency']}）。
          </p>
        </section>

        <SourceTextBlock sourceKey={feature.sourceTextKey} />

        <section className="field" id="expected">
          <h2>
            元資料に含まれる記載項目 <ProvenanceBadge kind="instruction" compact />
          </h2>
          <p className="small">開発指示書が、この機能について元資料から保持するよう求めている項目です。元資料の提供後、収録漏れの確認に使います。</p>
          <ul className="inline-list">
            {feature.expectedSourceItems.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      </div>
      <aside className="page-aside">
        <TableOfContents items={toc} />
      </aside>
    </div>
  );
}
