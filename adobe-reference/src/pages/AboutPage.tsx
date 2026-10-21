import { Link, Notice, PageHeader } from '../components/common';
import { storageAvailable, storageDescription } from '../utils/storage';

const capabilities: { name: string; status: string; note: string }[] = [
  { name: '機能仕様・操作手順の説明を表示する', status: '実装済み（内容は未収録）', note: '表示の仕組みは動作します。説明文は元資料本文が未提供のため「未記載」です。' },
  { name: 'Adobe公式ページへ移動する', status: '実装済み', note: 'URLの所在を確認できたページだけをリンクしています。内容は未照合です。' },
  { name: '全文検索・絞り込み・比較・ブックマーク', status: '実装済み', note: 'すべてこのブラウザー内で動作します。' },
  { name: '画像を表示・閲覧する', status: '未実装', note: '元資料の画像が提供されていないため、画像の表示機能はありません。' },
  { name: '画像をアップロードして分析する', status: '未実装', note: '画像の読み込み・解析・品質判定は行いません。' },
  { name: 'Adobeの生成AIを実際に呼び出す', status: '未実装（外部連携が必要）', note: 'Adobeのサービスとの連携は実装していません。APIキーなども扱いません。' },
  { name: '最新情報の自動取得', status: '未実装', note: '外部から情報を取得しません。表示内容は登録済みのデータだけです。' },
];

export function AboutPage() {
  return (
    <div className="page">
      <PageHeader title="アプリについて" breadcrumbs={[{ label: 'アプリについて' }]} />
      <section className="field">
        <h2>このアプリの目的</h2>
        <p>Adobe製品の画像編集機能と技術仕様を、製品別、機能別、用途別に調べるための知識データベースです。</p>
        <Notice tone="info">
          このアプリは Adobe Photoshop、Lightroom、Firefly などの機能を実行するものではありません。Adobe とは関係のない独自の資料閲覧アプリです。
        </Notice>
      </section>

      <section className="field">
        <h2>できること・できないこと</h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="機能の実装状況（横にスクロールできます）">
          <table>
            <thead>
              <tr>
                <th scope="col">機能</th>
                <th scope="col">状態</th>
                <th scope="col">補足</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((c) => (
                <tr key={c.name}>
                  <th scope="row">{c.name}</th>
                  <td>{c.status}</td>
                  <td>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="field">
        <h2>収録状況</h2>
        <p>
          元資料の本文は未提供です。現在は開発指示書に記載された構成（章・節・項目名・工程・検査項目）を収録しています。詳細は<Link to="/coverage">収録対応表</Link>と<Link to="/sources">公式資料・出典</Link>をご覧ください。
        </p>
      </section>

      <section className="field">
        <h2>ブラウザー内の保存</h2>
        <p>
          現在の環境：{storageAvailable ? '保存できます。' : '保存できません（ブックマークと閲覧履歴は利用できません）。'}
        </p>
        <ul className="small">
          {storageDescription.map((d) => (
            <li key={d.key}>
              <code>{d.key}</code>：{d.content}
            </li>
          ))}
        </ul>
        <p className="small">保存内容はこのブラウザーにだけ残り、サーバーには送信しません。</p>
      </section>
    </div>
  );
}
