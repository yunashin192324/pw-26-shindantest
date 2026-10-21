import { chapters, sectionLabel } from '../data/chapters';
import { featureById } from '../data/features';
import { automationTasks, fileFormats } from '../data/reference';
import { getSourceText } from '../data/sourceText';

/**
 * 収録対応表（開発指示 6-4）。
 * 開発指示書が示す元資料の構成要素ごとに、アプリ内の収録先と、元資料本文の収録状況を対応付ける。
 */
export interface CoverageRow {
  chapter: string;
  sourceItem: string;
  kind: '章' | '節' | '項目' | '表' | '図' | '画像' | '機能' | 'ファイル形式' | '自動化の作業';
  appLocation: string;
  to: string;
  /** 構成（見出し・項目名）をアプリに登録済みか */
  structure: boolean;
  /** 元資料の本文を登録済みか。本文キーを持たない要素は null */
  body: boolean | null;
  sourceKey: string | null;
}

export function buildCoverage(): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const c of chapters) {
    const ch = `第${c.number}章`;
    rows.push({
      chapter: ch,
      sourceItem: `${ch} ${c.title}`,
      kind: '章',
      appLocation: `章ページ：${ch}`,
      to: `/chapter/${c.id}`,
      structure: true,
      body: getSourceText(c.sourceTextKey) != null,
      sourceKey: c.sourceTextKey,
    });
    for (const it of c.items) {
      rows.push({ chapter: ch, sourceItem: `対象製品：${it.text}`, kind: '項目', appLocation: `章ページ：${ch}（対象製品）`, to: `/chapter/${c.id}`, structure: true, body: null, sourceKey: null });
    }
    for (const s of c.sections) {
      const sl = sectionLabel(s.id);
      const at = `/chapter/${c.id}?at=sec-${s.id}`;
      rows.push({ chapter: ch, sourceItem: sl, kind: '節', appLocation: `章ページ：${sl}`, to: at, structure: true, body: getSourceText(s.sourceTextKey) != null, sourceKey: s.sourceTextKey });
      for (const it of s.items) {
        rows.push({ chapter: ch, sourceItem: it.text, kind: '項目', appLocation: `${sl}（収録項目）`, to: `/chapter/${c.id}?at=${it.id}`, structure: true, body: null, sourceKey: null });
      }
      for (const b of s.blocks ?? []) {
        const kind = b.kind === 'flow' ? '図' : b.kind === 'table' ? '表' : '画像';
        rows.push({
          chapter: ch,
          sourceItem: b.title,
          kind,
          appLocation: `${sl}（${kind}）`,
          to: `/chapter/${c.id}?at=${b.id}`,
          structure: b.kind !== 'image-missing',
          body: b.kind === 'table' ? b.rows.every((r) => r.cells.every((x) => x != null)) : b.kind === 'flow' ? null : false,
          sourceKey: null,
        });
      }
      for (const fid of s.featureIds) {
        const f = featureById[fid];
        rows.push({ chapter: ch, sourceItem: f.title, kind: '機能', appLocation: `機能ページ：${f.title}`, to: `/feature/${f.id}`, structure: true, body: getSourceText(f.sourceTextKey) != null, sourceKey: f.sourceTextKey });
      }
      if (s.id === '4-1') {
        for (const ff of fileFormats) {
          rows.push({ chapter: ch, sourceItem: `ファイル形式：${ff.name}`, kind: 'ファイル形式', appLocation: 'ファイル形式一覧', to: `/formats?at=format-${ff.id}`, structure: true, body: getSourceText(ff.sourceTextKey) != null, sourceKey: ff.sourceTextKey });
        }
      }
      if (s.id === '5-1') {
        for (const t of automationTasks) {
          rows.push({ chapter: ch, sourceItem: t.task, kind: '自動化の作業', appLocation: '自動化一覧', to: `/automation?at=auto-${t.id}`, structure: true, body: getSourceText(t.sourceTextKey) != null, sourceKey: t.sourceTextKey });
        }
      }
    }
  }
  return rows;
}

export function coverageSummary(rows: CoverageRow[]) {
  const withBody = rows.filter((r) => r.body !== null);
  return {
    total: rows.length,
    structure: rows.filter((r) => r.structure).length,
    bodyTargets: withBody.length,
    bodyDone: withBody.filter((r) => r.body).length,
  };
}
