import { featureById } from '../data/features';
import { qualityChecks, qualityNote } from '../data/reference';
import { Link, Notice, PageHeader, ProvenanceBadge } from '../components/common';

const originLabel = {
  '4-2': '元資料 4-2 の品質検査項目',
  '9': '開発指示 9 で追加された検査対象',
  '4-2/9': '元資料 4-2 の品質検査項目に対応（開発指示 9 にも記載）',
} as const;

export function QualityPage() {
  return (
    <div className="page">
      <PageHeader
        title="品質検査項目"
        breadcrumbs={[{ label: '技術仕様', to: '/chapter/ch4' }, { label: '品質検査項目' }]}
        lead={
          <p>
            生成AIなどによる編集結果を確認するときの検査対象です。検査対象の名称は開発指示書の記載です <ProvenanceBadge kind="instruction" compact />。
            「想定される問題」「確認すべき事項」「関連する編集機能」はアプリ独自の整理です <ProvenanceBadge kind="app-original" compact />。
          </p>
        }
      />
      <Notice tone="warn" title="品質判定は行っていません">
        {qualityNote}
      </Notice>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="品質検査項目（横にスクロールできます）">
        <table>
          <thead>
            <tr>
              <th scope="col">検査対象</th>
              <th scope="col">想定される問題</th>
              <th scope="col">確認すべき事項</th>
              <th scope="col">関連する編集機能</th>
              <th scope="col">項目の出所</th>
            </tr>
          </thead>
          <tbody>
            {qualityChecks.map((q) => (
              <tr key={q.id} id={q.id}>
                <th scope="row">{q.target}</th>
                <td>
                  <ul className="cell-list">
                    {q.possibleIssues.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </td>
                <td>
                  <ul className="cell-list">
                    {q.checkPoints.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </td>
                <td>
                  <ul className="cell-list">
                    {q.relatedFeatures.map((id) => (
                      <li key={id}>
                        <Link to={`/feature/${id}`}>{featureById[id].title}</Link>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="small">{originLabel[q.origin]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <Link to="/chapter/ch4?at=sec-4-2">4-2 生成AIの入力・処理・出力</Link>／<Link to="/feature/tech-quality-check">生成AI編集結果の品質検査</Link>
      </p>
    </div>
  );
}
