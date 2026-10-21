import { featureById } from '../data/features';
import { importantScenes, weddingWorkflow } from '../data/reference';
import { Link, Notice, NotRecorded, PageHeader, ProvenanceBadge } from '../components/common';

export function WorkflowPage() {
  return (
    <div className="page">
      <PageHeader
        title="フォトウェディングの作業工程"
        breadcrumbs={[{ label: 'フォトウェディングの作業工程' }]}
        lead={
          <p>
            作業内容を整理するための画面です。工程名は開発指示書の記載です <ProvenanceBadge kind="instruction" compact />。各工程と機能の対応付けはアプリ独自の整理です <ProvenanceBadge kind="app-original" compact />。
          </p>
        }
      />
      <Notice tone="info">この画面は作業工程を閲覧するためのもので、Adobeの編集処理を実行するものではありません。</Notice>

      <ol className="workflow">
        {weddingWorkflow.map((w) => (
          <li key={w.id} id={w.id} className="workflow-step">
            <div className="workflow-head">
              <span className="flow-num">{w.order}</span>
              <h2>{w.title}</h2>
            </div>
            <p>{w.description ?? <NotRecorded />}</p>
            <p className="small">関連するAdobe機能：</p>
            <ul className="inline-list">
              {w.relatedFeatures.map((id) => (
                <li key={id}>
                  <Link to={`/feature/${id}`}>{featureById[id].title}</Link>
                </li>
              ))}
              {w.relatedPages.map((p) => (
                <li key={p.to}>
                  <Link to={p.to}>{p.label}</Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <section className="field">
        <h2>
          重要な利用場面 <ProvenanceBadge kind="instruction" compact />
        </h2>
        <p className="small">開発指示書に「特に重視する業務」として記載された場面です。元資料の本文ではありません。</p>
        <ul>
          {importantScenes.map((s, i) => (
            <li key={s} id={`scene-${i}`}>
              {s}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
