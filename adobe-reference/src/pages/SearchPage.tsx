import { useMemo } from 'react';
import { EmptyState, Highlight, Link, PageHeader } from '../components/common';
import { SearchBar } from '../components/Layout';
import { listParam, navigate, withQuery, type Route } from '../utils/navigation';
import { search, searchTargetsDescription, splitTerms, type SearchKind } from '../utils/search';

const kinds: SearchKind[] = ['機能', '章・節', '製品', 'ファイル形式', '自動化', '作業工程', '品質検査', '利用場面', '公式資料'];

export function SearchPage({ route }: { route: Route }) {
  const q = route.query.get('q') ?? '';
  const selectedKinds = listParam(route.query, 'kinds').filter((k): k is SearchKind => (kinds as string[]).includes(k));
  const hits = useMemo(() => search(q, { kinds: selectedKinds }), [q, selectedKinds.join(',')]);
  const terms = splitTerms(q);
  const full = hits.filter((h) => h.allMatched);
  const partial = hits.filter((h) => !h.allMatched);

  const setKinds = (next: SearchKind[]) => navigate(withQuery('/search', { q, kinds: next }), { replace: true });

  const renderHits = (list: typeof hits) => (
    <ol className="search-results">
      {list.map((h) => (
        <li key={h.doc.id}>
          <Link to={h.doc.to} className="result-title">
            {h.doc.title}
          </Link>
          <p className="result-meta">
            <span className="kind">{h.doc.kind}</span>
            {h.doc.product && <span>{h.doc.product}</span>}
            <span>{h.doc.location}</span>
          </p>
          <p className="result-excerpt">
            <span className="field-label">{h.field.label}：</span>
            <Highlight text={h.excerpt.text} ranges={h.excerpt.ranges} />
          </p>
          {!h.allMatched && <p className="small muted">一致した語：{h.matchedTerms.join('、')}</p>}
        </li>
      ))}
    </ol>
  );

  return (
    <div className="page">
      <PageHeader title="検索" breadcrumbs={[{ label: '検索' }]} />
      <SearchBar initial={q} id="page-search" />
      <details className="search-help">
        <summary>検索の対象と方法</summary>
        <p className="small">対象：{searchTargetsDescription}</p>
        <p className="small">
          方法：部分一致です。全角と半角、英字の大文字と小文字、カタカナとひらがなは区別しません。空白で区切った複数の語は、すべてを含む項目を先に、一部だけを含む項目を後に表示します。検索はこのブラウザー内だけで行い、外部には送信しません。
        </p>
      </details>
      <div className="chips" aria-label="種類で絞り込み">
        {kinds.map((k) => (
          <label key={k} className={`chip ${selectedKinds.includes(k) ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={selectedKinds.includes(k)}
              onChange={() => setKinds(selectedKinds.includes(k) ? selectedKinds.filter((x) => x !== k) : [...selectedKinds, k])}
            />
            {k}
          </label>
        ))}
        {selectedKinds.length > 0 && (
          <button type="button" className="btn" onClick={() => setKinds([])}>
            種類の絞り込みを解除
          </button>
        )}
      </div>

      {terms.length === 0 ? (
        <p className="muted">検索語を入力してください。</p>
      ) : hits.length === 0 ? (
        <EmptyState title="該当する項目がありません">
          <p>
            検索条件：「{q}」{selectedKinds.length > 0 && `（種類：${selectedKinds.join('、')}）`}
          </p>
          <p className="small">元資料の本文が未提供のため、本文中の語では見つからない場合があります。</p>
        </EmptyState>
      ) : (
        <>
          <p role="status">
            「{q}」の検索結果：{hits.length} 件
            {terms.length > 1 && `（すべての語を含む ${full.length} 件、一部の語を含む ${partial.length} 件）`}
          </p>
          {terms.length > 1 ? (
            <>
              <h2>すべての語を含む項目</h2>
              {full.length ? renderHits(full) : <p className="muted">すべての語を含む項目はありません。</p>}
              {partial.length > 0 && (
                <>
                  <h2>一部の語を含む項目</h2>
                  {renderHits(partial)}
                </>
              )}
            </>
          ) : (
            renderHits(hits)
          )}
        </>
      )}
    </div>
  );
}
