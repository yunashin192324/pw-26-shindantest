import { useEffect } from 'react';
import { chapterById, chapters, sectionLabel } from '../data/chapters';
import { featureById } from '../data/features';
import { BlockView } from '../components/Blocks';
import { BookmarkButton } from '../components/Buttons';
import { Link, PageHeader, ProvenanceBadge } from '../components/common';
import { FeatureCard, SourceTextBlock, TableOfContents } from '../components/FeatureParts';
import { useStore } from '../utils/store';
import { NotFoundPage } from './NotFoundPage';

export function ChapterPage({ id }: { id: string }) {
  const chapter = chapterById[id];
  const { recordView } = useStore();
  useEffect(() => {
    if (chapter) recordView('chapter', chapter.id);
  }, [chapter, recordView]);
  if (!chapter) return <NotFoundPage />;

  const index = chapters.indexOf(chapter);
  const prev = chapters[index - 1];
  const next = chapters[index + 1];
  const title = `第${chapter.number}章 ${chapter.title}`;

  return (
    <div className="page with-toc">
      <div className="page-main">
        <PageHeader
          title={title}
          breadcrumbs={[{ label: '章で読む' }, { label: title }]}
          actions={<BookmarkButton type="chapter" id={chapter.id} label={title} />}
          lead={
            <p className="small">
              見出しと項目名は開発指示書の記載に基づきます <ProvenanceBadge kind="instruction" compact />。本文は元資料の提供後に「元資料の文章」欄へ収録されます。
            </p>
          }
        />

        {chapter.items.length > 0 && (
          <section className="field">
            <h2>対象製品</h2>
            <ul className="inline-list">
              {chapter.items.map((it) => (
                <li key={it.id} id={it.id}>
                  {it.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <SourceTextBlock sourceKey={chapter.sourceTextKey} id="chapter-original" />

        {chapter.sections.map((s) => (
          <section key={s.id} id={`sec-${s.id}`} className="chapter-section" aria-labelledby={`sec-${s.id}-h`}>
            <h2 id={`sec-${s.id}-h`}>{sectionLabel(s.id)}</h2>
            {s.items.length > 0 && (
              <>
                <h3>
                  収録項目 <ProvenanceBadge kind="instruction" compact />
                </h3>
                <ul>
                  {s.items.map((it) => (
                    <li key={it.id} id={it.id}>
                      {it.link ? <Link to={it.link}>{it.text}</Link> : it.text}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {s.notes?.map((n) => (
              <p key={n.id} id={n.id} className="note">
                <ProvenanceBadge kind={n.provenance} compact /> {n.link ? <Link to={n.link}>{n.text}</Link> : n.text}
              </p>
            ))}
            {s.blocks?.map((b) => (
              <BlockView key={b.id} block={b} />
            ))}
            {s.featureIds.length > 0 && (
              <>
                <h3>この節の機能（{s.featureIds.length} 件）</h3>
                <div className="card-grid">
                  {s.featureIds.map((fid) => (
                    <FeatureCard key={fid} feature={featureById[fid]} />
                  ))}
                </div>
              </>
            )}
            <SourceTextBlock sourceKey={s.sourceTextKey} id={`sec-${s.id}-original`} />
          </section>
        ))}

        <nav className="pager" aria-label="前後の章">
          {prev ? <Link to={`/chapter/${prev.id}`}>← 第{prev.number}章 {prev.title}</Link> : <span />}
          {next ? <Link to={`/chapter/${next.id}`}>第{next.number}章 {next.title} →</Link> : <span />}
        </nav>
      </div>
      <aside className="page-aside">
        <TableOfContents items={chapter.sections.map((s) => ({ id: `sec-${s.id}`, label: sectionLabel(s.id) }))} />
      </aside>
    </div>
  );
}
