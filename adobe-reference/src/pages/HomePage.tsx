import { chapterById, chapters } from '../data/chapters';
import { featureById, features } from '../data/features';
import { products } from '../data/products';
import { Link, Notice, NotRecorded } from '../components/common';
import { SearchBar } from '../components/Layout';
import { countByProduct } from '../utils/filtering';
import { useStore } from '../utils/store';

const actions = [
  { label: '全機能を検索', to: '/features', desc: '機能一覧と絞り込み' },
  { label: 'Photoshopの機能を見る', to: '/product/photoshop', desc: '第2章' },
  { label: 'Lightroomの機能を見る', to: '/product/lightroom', desc: '第3章' },
  { label: '生成AI機能を比較する', to: '/compare?ids=generative-fill,generative-expand', desc: '機能比較' },
  { label: 'ファイル形式を確認する', to: '/formats', desc: '4-1 画像データの扱い' },
  { label: '自動化できる処理を確認する', to: '/automation', desc: '第5章' },
];

export function HomePage() {
  const { recent, storageAvailable } = useStore();
  return (
    <div className="page">
      <header className="hero">
        <h1>Adobe画像編集・技術仕様リファレンス</h1>
        <p className="lead">画像編集機能、生成AI、写真選別、色調補正、ファイル形式、自動化の仕様を検索・比較できる知識データベース</p>
        <SearchBar id="home-search" />
      </header>

      <Notice tone="alert" title="収録状況についての重要なお知らせ">
        <p>
          このアプリの基になる元資料（Adobe製品の機能解説文書）の本文は、開発時点で提供されていません。
          そのため現在は、開発指示書に記載された章・節・項目名・工程・検査項目だけを収録しており、各機能の説明文（目的・入力・処理・出力・制約など）は「未記載」と表示しています。
          内容を推測して補うことはしていません。
        </p>
        <p>
          また、このアプリ自体は Adobe の製品や生成AIを動かすものではなく、画像の編集・解析も行いません。詳しくは<Link to="/about">アプリについて</Link>をご覧ください。
        </p>
      </Notice>

      <section aria-labelledby="actions-h">
        <h2 id="actions-h">主な操作</h2>
        <ul className="action-grid">
          {actions.map((a) => (
            <li key={a.to}>
              <Link to={a.to} className="action">
                <span className="action-label">{a.label}</span>
                <span className="action-desc">{a.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="products-h">
        <h2 id="products-h">製品別の入口</h2>
        <ul className="product-grid">
          {products.map((p) => (
            <li key={p.id} className="product-card">
              <h3>
                <Link to={`/product/${p.id}`}>{p.name}</Link>
              </h3>
              <p className="small">
                役割：{p.role ?? <NotRecorded />}
              </p>
              <p className="count">
                収録機能数 <strong>{countByProduct(features, p.id)}</strong> 件
              </p>
            </li>
          ))}
        </ul>
        <p className="small muted">収録機能数は、登録されている機能データの件数から計算しています。</p>
      </section>

      <section aria-labelledby="chapters-h">
        <h2 id="chapters-h">章で読む</h2>
        <ol className="chapter-list">
          {chapters.map((c) => (
            <li key={c.id}>
              <Link to={`/chapter/${c.id}`}>
                第{c.number}章 {c.title}
              </Link>
              <span className="small muted">　節 {c.sections.length}・機能 {c.sections.reduce((n, s) => n + s.featureIds.length, 0)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h">最近閲覧した項目</h2>
        {!storageAvailable ? (
          <p className="muted">この環境ではブラウザーに保存できないため、閲覧履歴は記録されません。</p>
        ) : recent.length === 0 ? (
          <p className="muted">まだ閲覧履歴はありません。機能や章のページを開くと、ここに表示されます（このブラウザー内にのみ保存）。</p>
        ) : (
          <ul className="plain-list">
            {recent.map((r) => (
              <li key={`${r.type}:${r.id}`}>
                {r.type === 'feature' ? (
                  <Link to={`/feature/${r.id}`}>{featureById[r.id].title}</Link>
                ) : (
                  <Link to={`/chapter/${r.id}`}>
                    第{chapterById[r.id].number}章 {chapterById[r.id].title}
                  </Link>
                )}
                <span className="small muted">　{r.type === 'feature' ? '機能' : '章'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
