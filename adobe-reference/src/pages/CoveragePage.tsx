import { useMemo, useState } from 'react';
import { Link, Notice, PageHeader } from '../components/common';
import { buildCoverage, coverageSummary } from '../utils/coverage';

export function CoveragePage() {
  const rows = useMemo(buildCoverage, []);
  const summary = coverageSummary(rows);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const shown = onlyMissing ? rows.filter((r) => r.body === false || !r.structure) : rows;

  return (
    <div className="page">
      <PageHeader
        title="収録対応表"
        breadcrumbs={[{ label: '収録対応表' }]}
        lead={<p>元資料の各章・節・項目・表・図が、アプリ内のどこに収録されているかを示す開発用の一覧です。元資料の構成は開発指示書の記載に基づきます。</p>}
      />
      <Notice tone="alert" title="完全性の確認はできていません">
        元資料の本文が未提供のため、元資料の段落・箇条書き・表のセル・注意書きが欠落していないかを照合できません。下の一覧は「開発指示書に書かれた構成」をすべて登録したことを示すもので、元資料そのものの完全な収録を示すものではありません。
      </Notice>
      <dl className="stats">
        <div>
          <dt>対応付けた要素</dt>
          <dd>{summary.total}</dd>
        </div>
        <div>
          <dt>構成（見出し・項目名）を登録済み</dt>
          <dd>{summary.structure}</dd>
        </div>
        <div>
          <dt>元資料本文を登録済み</dt>
          <dd>
            {summary.bodyDone} / {summary.bodyTargets}
          </dd>
        </div>
      </dl>
      <label className="check">
        <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> 未収録の要素だけを表示
      </label>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="収録対応表（横にスクロールできます）">
        <table className="coverage">
          <thead>
            <tr>
              <th scope="col">章</th>
              <th scope="col">種類</th>
              <th scope="col">元資料の要素（指示書の記載）</th>
              <th scope="col">アプリ内の収録先</th>
              <th scope="col">構成</th>
              <th scope="col">元資料本文</th>
              <th scope="col">本文の収録キー</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                <td>{r.chapter}</td>
                <td>{r.kind}</td>
                <td>{r.sourceItem}</td>
                <td>
                  <Link to={r.to}>{r.appLocation}</Link>
                </td>
                <td>{r.structure ? '登録済み' : <span className="text-alert">未収録</span>}</td>
                <td>{r.body === null ? '—' : r.body ? '登録済み' : <span className="text-alert">未提供</span>}</td>
                <td>{r.sourceKey ? <code>{r.sourceKey}</code> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption">「—」は、その要素が本文を持たない（項目名や図の工程そのものが内容である）ことを示します。表は全セルが埋まった場合に「登録済み」になります。</p>
    </div>
  );
}
