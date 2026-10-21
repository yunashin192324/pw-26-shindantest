import { useStore, type BookmarkType } from '../utils/store';

export function BookmarkButton({ type, id, label }: { type: BookmarkType; id: string; label: string }) {
  const { storageAvailable, isBookmarked, toggleBookmark } = useStore();
  if (!storageAvailable) {
    return (
      <button type="button" className="btn" disabled title="この環境ではブラウザーに保存できないため、ブックマークを利用できません">
        ブックマーク利用不可
      </button>
    );
  }
  const on = isBookmarked(type, id);
  return (
    <button
      type="button"
      className={`btn ${on ? 'btn-on' : ''}`}
      aria-pressed={on}
      onClick={() => toggleBookmark(type, id)}
      aria-label={on ? `${label}のブックマークを解除` : `${label}をブックマークに登録`}
    >
      <span aria-hidden="true">{on ? '★' : '☆'}</span> {on ? 'ブックマーク済み（解除）' : 'ブックマーク'}
    </button>
  );
}

export function CompareButton({ id, label }: { id: string; label: string }) {
  const { compare, addCompare, removeCompare } = useStore();
  const on = compare.includes(id);
  return (
    <button
      type="button"
      className={`btn ${on ? 'btn-on' : ''}`}
      aria-pressed={on}
      onClick={() => (on ? removeCompare(id) : addCompare(id))}
      aria-label={on ? `${label}を比較対象から外す` : `${label}を比較対象に追加`}
    >
      {on ? '比較対象から外す' : '比較に追加'}
    </button>
  );
}
