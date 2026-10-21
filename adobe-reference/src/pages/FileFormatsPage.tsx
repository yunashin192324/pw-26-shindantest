import { productShortName } from '../data/products';
import { fileFormatProductNote, fileFormats } from '../data/reference';
import { getSourceText } from '../data/sourceText';
import { Link, NotRecorded, PageHeader, ProvenanceBadge } from '../components/common';

export function FileFormatsPage() {
  return (
    <div className="page">
      <PageHeader
        title="ファイル形式一覧"
        breadcrumbs={[{ label: '技術仕様', to: '/chapter/ch4' }, { label: 'ファイル形式一覧' }]}
        lead={
          <p>
            元資料 <Link to="/chapter/ch4?at=sec-4-1">4-1 画像データの扱い</Link> に含まれるファイル形式です。形式名は開発指示書の記載です <ProvenanceBadge kind="instruction" compact />。
            元資料にない詳細仕様は、確定情報として追加していません。
          </p>
        }
      />
      <div className="table-scroll" tabIndex={0} role="region" aria-label="ファイル形式一覧（横にスクロールできます）">
        <table>
          <thead>
            <tr>
              <th scope="col">形式名</th>
              <th scope="col">主な用途</th>
              <th scope="col">特徴</th>
              <th scope="col">元資料の説明</th>
              <th scope="col">関連製品</th>
              <th scope="col">公式資料の確認状況</th>
            </tr>
          </thead>
          <tbody>
            {fileFormats.map((f) => {
              const original = getSourceText(f.sourceTextKey);
              return (
                <tr key={f.id} id={`format-${f.id}`}>
                  <th scope="row">{f.name}</th>
                  <td>{f.usage ?? <NotRecorded reason="元資料未提供" />}</td>
                  <td>{f.characteristics ?? <NotRecorded reason="元資料未提供" />}</td>
                  <td className="pre-line">{original ?? <NotRecorded reason="元資料未提供" />}</td>
                  <td>{f.relatedProducts.length ? f.relatedProducts.map((p) => productShortName[p]).join('、') : '—'}</td>
                  <td>
                    <ProvenanceBadge kind={f.officialStatus} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="caption">{fileFormatProductNote}</p>
    </div>
  );
}
