import { chapterById, sectionLabel } from '../data/chapters';
import { featureById } from '../data/features';
import { EmptyState, Link, Notice, PageHeader } from '../components/common';
import { storageDescription } from '../utils/storage';
import { useStore } from '../utils/store';

export function BookmarksPage() {
  const { bookmarks, removeBookmark, storageAvailable } = useStore();
  return (
    <div className="page">
      <PageHeader title="ブックマーク" breadcrumbs={[{ label: 'ブックマーク' }]} />
      {!storageAvailable ? (
        <Notice tone="alert" title="この環境ではブックマークを利用できません">
          ブラウザーの設定（非公開ウィンドウ、保存の禁止など）により、ブラウザー内に保存できない状態です。ブックマークの登録ボタンは無効にしています。
        </Notice>
      ) : bookmarks.length === 0 ? (
        <EmptyState title="ブックマークはまだありません">
          <p>機能ページや章ページの「ブックマーク」ボタンで登録できます。</p>
        </EmptyState>
      ) : (
        <ul className="bookmark-list">
          {bookmarks.map((b) => {
            const label =
              b.type === 'feature'
                ? featureById[b.id].title
                : `第${chapterById[b.id].number}章 ${chapterById[b.id].title}`;
            const to = b.type === 'feature' ? `/feature/${b.id}` : `/chapter/${b.id}`;
            return (
              <li key={`${b.type}:${b.id}`}>
                <div>
                  <Link to={to}>{label}</Link>
                  <span className="small muted">
                    　{b.type === 'feature' ? `機能・${sectionLabel(featureById[b.id].section)}` : '章'}　登録：
                    {new Date(b.addedAt).toLocaleString('ja-JP')}
                  </span>
                </div>
                <button type="button" className="btn btn-small" onClick={() => removeBookmark(b.type, b.id)} aria-label={`${label}のブックマークを解除`}>
                  解除
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <section className="field">
        <h2>保存内容と保存場所</h2>
        <p className="small">
          ブックマークなどは、このブラウザーの保存領域（localStorage）にだけ保存します。サーバーには送信せず、他の端末やブラウザーとは共有されません。ブラウザーの閲覧データを消去すると削除されます。
        </p>
        <ul className="small">
          {storageDescription.map((d) => (
            <li key={d.key}>
              <code>{d.key}</code>：{d.content}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
