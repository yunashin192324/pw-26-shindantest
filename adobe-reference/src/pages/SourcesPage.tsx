import { officialRefs } from '../data/officialRefs';
import { ExternalLink, Link, Notice, PageHeader, ProvenanceBadge } from '../components/common';
import { allProvenanceKinds, provenanceDescription } from '../utils/provenance';

export function SourcesPage() {
  const entries = Object.entries(officialRefs);
  return (
    <div className="page">
      <PageHeader title="公式資料・出典" breadcrumbs={[{ label: '公式資料・出典' }]} />

      <section className="field">
        <h2>元資料</h2>
        <Notice tone="alert" title="元資料の本文は未提供です">
          <p>
            このアプリの基になる「Adobe製品の機能解説文書」は、開発時点（2026年10月21日）でリポジトリ・Issue・プルリクエストのいずれにも存在せず、提供されていません。
            開発指示書によると、元資料の基準日は2026年10月20日です。
          </p>
          <p>
            元資料が提供された場合は、<code>src/data/sourceText.ts</code> に原文を登録すると、各ページの「元資料の文章」欄と<Link to="/coverage">収録対応表</Link>に反映されます。
          </p>
        </Notice>
      </section>

      <section className="field">
        <h2>情報区分</h2>
        <p className="small">各項目には、情報の出所と確認状況を次の区分で表示しています。</p>
        <dl className="legend">
          {allProvenanceKinds.map((k) => (
            <div key={k}>
              <dt>
                <ProvenanceBadge kind={k} compact />
              </dt>
              <dd>{provenanceDescription[k]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="field">
        <h2>最新情報の扱い</h2>
        <ul>
          <li>このアプリは外部から情報を自動取得しません。表示内容は開発時に登録したデータだけです。</li>
          <li>現在の機能仕様を確認する場合は、Adobe公式のヘルプ、製品情報、リリースノートを優先してください。</li>
          <li>元資料の記載と公式情報が異なる場合は、元資料を削除せず、元資料の記載・公式資料で確認できた内容・相違点・確認日を並べて表示する方針です。現時点では元資料が未提供のため、照合した項目はありません。</li>
        </ul>
      </section>

      <section className="field">
        <h2>登録している公式ページ（{entries.length} 件）</h2>
        <Notice tone="warn">
          以下は、2026年10月21日に Web 検索を行い、検索結果に URL とページ題名が表示されたものです。この開発環境からは Adobe のヘルプサイトに直接接続できなかったため、ページ本文は開いておらず、内容の照合はしていません。そのため確認状況は「未確認」としています。
        </Notice>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="公式ページ一覧（横にスクロールできます）">
          <table>
            <thead>
              <tr>
                <th scope="col">ページ題名</th>
                <th scope="col">確認状況</th>
                <th scope="col">確認日</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, r]) => (
                <tr key={key} id={`ref-${key}`}>
                  <td>
                    <ExternalLink url={r.url}>{r.title}</ExternalLink>
                    <div className="small muted url">{r.url}</div>
                  </td>
                  <td>
                    <ProvenanceBadge kind={r.status} compact />
                  </td>
                  <td>{r.checkedOn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
