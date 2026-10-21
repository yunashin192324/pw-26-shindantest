import { sectionById } from '../data/chapters';
import { featureById } from '../data/features';
import { automationRefsNote, automationStateLabel, automationTasks } from '../data/reference';
import type { AutomationState } from '../data/types';
import { FlowDiagram } from '../components/Blocks';
import { ExternalLink, Link, NotRecorded, PageHeader, ProvenanceBadge } from '../components/common';

const states = Object.keys(automationStateLabel) as AutomationState[];

export function AutomationPage() {
  const flow = sectionById['5-2'].blocks?.find((b) => b.kind === 'flow');
  return (
    <div className="page">
      <PageHeader
        title="自動化・大量処理"
        breadcrumbs={[{ label: '第5章', to: '/chapter/ch5' }, { label: '自動化一覧' }]}
        lead={
          <p>
            元資料 <Link to="/chapter/ch5?at=sec-5-1">5-1 自動化できる範囲</Link> の作業一覧です。作業名は開発指示書の記載です <ProvenanceBadge kind="instruction" compact />。
          </p>
        }
      />

      <section className="field">
        <h2>自動化の可否の区分</h2>
        <ul className="inline-list">
          {states.map((s) => (
            <li key={s}>
              <span className={`state state-${s}`}>{automationStateLabel[s]}</span>
            </li>
          ))}
        </ul>
        <p className="small">
          一つの作業に複数の区分が当てはまる場合は併記します。元資料本文が未提供のため、現在はすべての作業を「未確認」としています。推測で区分を付けていません。
        </p>
      </section>

      <section className="field">
        <h2>作業ごとの自動化</h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="自動化一覧（横にスクロールできます）">
          <table>
            <thead>
              <tr>
                <th scope="col">作業内容</th>
                <th scope="col">自動化の可否</th>
                <th scope="col">自動化方法</th>
                <th scope="col">必要な入力</th>
                <th scope="col">出力</th>
                <th scope="col">人間による確認の必要性</th>
                <th scope="col">技術的な制約・注意点</th>
                <th scope="col">関連機能</th>
                <th scope="col">関連する公式ページ（所在のみ確認）</th>
              </tr>
            </thead>
            <tbody>
              {automationTasks.map((t) => (
                <tr key={t.id} id={`auto-${t.id}`}>
                  <th scope="row">{t.task}</th>
                  <td>
                    {t.states.map((s) => (
                      <span key={s} className={`state state-${s}`}>
                        {automationStateLabel[s]}
                      </span>
                    ))}
                  </td>
                  <td>{t.method ?? <NotRecorded reason="元資料未提供" />}</td>
                  <td>{t.requiredInputs ?? <NotRecorded reason="元資料未提供" />}</td>
                  <td>{t.outputs ?? <NotRecorded reason="元資料未提供" />}</td>
                  <td>{t.humanReview ?? <NotRecorded reason="元資料未提供" />}</td>
                  <td>{t.constraints ?? t.cautions ?? <NotRecorded reason="元資料未提供" />}</td>
                  <td>
                    {t.relatedFeatures.length ? (
                      <ul className="cell-list">
                        {t.relatedFeatures.map((id) => (
                          <li key={id}>
                            <Link to={`/feature/${id}`}>{featureById[id].title}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {t.officialRefs.length ? (
                      <ul className="cell-list">
                        {t.officialRefs.map((r) => (
                          <li key={r.url}>
                            <ExternalLink url={r.url}>{r.title}</ExternalLink>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">
          関連機能の欄はアプリ独自の整理です。{automationRefsNote}
        </p>
      </section>

      <section className="field">
        <h2>5-2 大量の写真を処理するシステムの設計例</h2>
        {flow && flow.kind === 'flow' && <FlowDiagram block={flow} />}
        <h3>定型化しやすい工程と、人間による確認が必要な工程の違い</h3>
        <p>
          <NotRecorded />
        </p>
        <p className="small muted">
          この違いの説明は元資料に記載される項目ですが、元資料本文が未提供のため収録していません。工程ごとの区分も推測では付けていません。
        </p>
        <p>
          <Link to="/chapter/ch5?at=sec-5-2">第5章 5-2 を開く</Link>
        </p>
      </section>
    </div>
  );
}
