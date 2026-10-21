import { allSections, sectionLabel } from '../data/chapters';
import { featureById, features } from '../data/features';
import { officialRefs } from '../data/officialRefs';
import { productShortName, products, tagLabel } from '../data/products';
import { automationTasks, fileFormats, importantScenes, qualityChecks, weddingWorkflow } from '../data/reference';
import { getSourceText } from '../data/sourceText';
import type { SectionBlock } from '../data/types';

/**
 * ブラウザー内の全文検索。外部APIは使わない。
 *
 * - 文字の正規化: 全角・半角の統一（NFKC）、英字の小文字化、カタカナとひらがなの同一視。
 * - 部分一致: 正規化した文字列に検索語が含まれていれば一致とする。
 * - 複数語: 空白で区切る。すべての語を含む項目を上位に、一部の語だけを含む項目をその下に表示する。
 */

export type SearchKind =
  | '機能'
  | '製品'
  | '章・節'
  | 'ファイル形式'
  | '自動化'
  | '作業工程'
  | '品質検査'
  | '利用場面'
  | '公式資料';

export interface SearchField {
  label: string;
  text: string;
}

export interface SearchDoc {
  id: string;
  kind: SearchKind;
  title: string;
  product: string;
  location: string;
  to: string;
  fields: SearchField[];
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
  matchedTerms: string[];
  allMatched: boolean;
  field: SearchField;
  excerpt: { text: string; ranges: [number, number][] };
}

/** 1文字ずつ正規化し、正規化後の位置から元の位置を引けるようにする */
function normalizeChar(ch: string): string {
  let s = ch.normalize('NFKC').toLowerCase();
  // カタカナ（ァ〜ヶ）をひらがなに寄せる
  s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  return s;
}

export function normalize(text: string): string {
  let out = '';
  for (const ch of text) out += normalizeChar(ch);
  return out;
}

function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const n = normalizeChar(ch);
    for (let k = 0; k < n.length; k++) map.push(i);
    norm += n;
    i += ch.length;
  }
  map.push(text.length);
  return { norm, map };
}

export function splitTerms(query: string): string[] {
  const terms = normalize(query)
    .split(/[\s　、,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return Array.from(new Set(terms));
}

/** 元の文字列で一致した範囲を返す（強調表示用） */
export function findRanges(text: string, terms: string[]): [number, number][] {
  const { norm, map } = normalizeWithMap(text);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const idx = norm.indexOf(term, from);
      if (idx < 0) break;
      ranges.push([map[idx], map[idx + term.length]]);
      from = idx + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

const EXCERPT_RADIUS = 40;

function makeExcerpt(text: string, terms: string[]): { text: string; ranges: [number, number][] } {
  const ranges = findRanges(text, terms);
  if (ranges.length === 0 || text.length <= EXCERPT_RADIUS * 2) {
    return { text, ranges };
  }
  const start = Math.max(0, ranges[0][0] - EXCERPT_RADIUS);
  const end = Math.min(text.length, ranges[0][1] + EXCERPT_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const slice = text.slice(start, end);
  const shifted = ranges
    .filter(([a, b]) => a >= start && b <= end)
    .map(([a, b]) => [a - start + prefix.length, b - start + prefix.length] as [number, number]);
  return { text: prefix + slice + suffix, ranges: shifted };
}

/* ───────── 検索対象の作成 ───────── */

const add = (fields: SearchField[], label: string, value: string | string[] | null | undefined) => {
  if (value == null) return;
  const text = Array.isArray(value) ? value.join('／') : value;
  if (text.trim() !== '') fields.push({ label, text });
};

function blockFields(block: SectionBlock): SearchField[] {
  if (block.kind === 'flow') return [{ label: `図：${block.title}`, text: block.steps.join(' → ') }];
  if (block.kind === 'table')
    return [
      { label: `表：${block.title}（列）`, text: block.columns.join('／') },
      { label: `表：${block.title}（行）`, text: block.rows.map((r) => r.key).join('／') },
    ];
  return [{ label: block.title, text: block.caption }];
}

export function buildIndex(): SearchDoc[] {
  const docs: SearchDoc[] = [];

  for (const f of features) {
    const fields: SearchField[] = [];
    add(fields, '機能名', f.title);
    add(fields, '英語名', f.englishName);
    add(fields, '製品', f.products.map((p) => productShortName[p]));
    add(fields, '分類', f.category);
    add(fields, '章・節', sectionLabel(f.section));
    add(fields, '概要', f.summary);
    add(fields, '目的', f.purpose);
    add(fields, '入力', f.inputs);
    add(fields, '処理', f.processing);
    add(fields, '出力', f.outputs);
    add(fields, '用途', f.useCases);
    add(fields, '制約', f.limitations);
    add(fields, '操作手順・工程', f.workflow);
    add(fields, '技術上の注意', f.technicalDetails);
    add(fields, '用途タグ', f.tags.map((t) => tagLabel[t]));
    add(fields, '下位項目', f.instructionSubItems);
    add(fields, '元資料の記載項目', f.expectedSourceItems);
    add(
      fields,
      '関連機能',
      f.relatedFeatures.map((r) => (r.featureId ? featureById[r.featureId]?.title ?? '' : r.label ?? '')),
    );
    add(fields, '出典', f.sourceReferences.map((r) => r.title));
    add(fields, '元資料の文章', getSourceText(f.sourceTextKey));
    docs.push({
      id: `feature:${f.id}`,
      kind: '機能',
      title: f.englishName ? `${f.title}（${f.englishName}）` : f.title,
      product: f.products.map((p) => productShortName[p]).join('・'),
      location: sectionLabel(f.section),
      to: `/feature/${f.id}`,
      fields,
    });
  }

  for (const p of products) {
    const fields: SearchField[] = [];
    add(fields, '製品名', p.name);
    add(fields, '別称', p.aliases);
    add(fields, '役割', p.role);
    add(fields, '関連する章・節', p.sections.map(sectionLabel));
    docs.push({
      id: `product:${p.id}`,
      kind: '製品',
      title: p.name,
      product: productShortName[p.id],
      location: '製品別',
      to: `/product/${p.id}`,
      fields,
    });
  }

  for (const s of allSections) {
    const fields: SearchField[] = [];
    add(fields, '見出し', sectionLabel(s.id));
    add(fields, '収録項目', s.items.map((i) => i.text));
    add(fields, '注記', s.notes?.map((n) => n.text));
    s.blocks?.forEach((b) => fields.push(...blockFields(b)));
    add(fields, '機能', s.featureIds.map((id) => featureById[id].title));
    add(fields, '元資料の文章', getSourceText(s.sourceTextKey));
    docs.push({
      id: `section:${s.id}`,
      kind: '章・節',
      title: sectionLabel(s.id),
      product: '',
      location: `第${s.chapterId.replace('ch', '')}章`,
      to: `/chapter/${s.chapterId}?at=sec-${s.id}`,
      fields,
    });
  }

  for (const ff of fileFormats) {
    const fields: SearchField[] = [];
    add(fields, '形式名', ff.name);
    add(fields, '主な用途', ff.usage);
    add(fields, '特徴', ff.characteristics);
    add(fields, '関連製品', ff.relatedProducts.map((p) => productShortName[p]));
    add(fields, '元資料の文章', getSourceText(ff.sourceTextKey));
    docs.push({
      id: `format:${ff.id}`,
      kind: 'ファイル形式',
      title: ff.name,
      product: '共通・技術仕様',
      location: '4-1 画像データの扱い／ファイル形式一覧',
      to: `/formats?at=format-${ff.id}`,
      fields,
    });
  }

  for (const t of automationTasks) {
    const fields: SearchField[] = [];
    add(fields, '作業内容', t.task);
    add(fields, '自動化方法', t.method);
    add(fields, '注意点', t.cautions);
    add(fields, '関連機能', t.relatedFeatures.map((id) => featureById[id].title));
    add(fields, '関連する公式ページ', t.officialRefs.map((r) => r.title));
    add(fields, '分類', '自動化・大量処理');
    docs.push({
      id: `automation:${t.id}`,
      kind: '自動化',
      title: t.task,
      product: '共通・技術仕様',
      location: '5-1 自動化できる範囲／自動化一覧',
      to: `/automation?at=auto-${t.id}`,
      fields,
    });
  }

  for (const w of weddingWorkflow) {
    const fields: SearchField[] = [];
    add(fields, '工程', w.title);
    add(fields, '関連機能', w.relatedFeatures.map((id) => featureById[id].title));
    add(fields, '分類', 'フォトウェディングの作業工程');
    docs.push({
      id: `workflow:${w.id}`,
      kind: '作業工程',
      title: `${w.order}. ${w.title}`,
      product: '',
      location: 'フォトウェディングの作業工程',
      to: `/workflow?at=${w.id}`,
      fields,
    });
  }

  for (const q of qualityChecks) {
    const fields: SearchField[] = [];
    add(fields, '検査対象', q.target);
    add(fields, '想定される問題', q.possibleIssues);
    add(fields, '確認すべき事項', q.checkPoints);
    add(fields, '関連機能', q.relatedFeatures.map((id) => featureById[id].title));
    add(fields, '分類', '品質検査');
    docs.push({
      id: `quality:${q.id}`,
      kind: '品質検査',
      title: q.target,
      product: '',
      location: '品質検査項目',
      to: `/quality?at=${q.id}`,
      fields,
    });
  }

  importantScenes.forEach((scene, i) => {
    docs.push({
      id: `scene:${i}`,
      kind: '利用場面',
      title: scene,
      product: '',
      location: 'フォトウェディングの作業工程／重要な利用場面',
      to: `/workflow?at=scene-${i}`,
      fields: [{ label: '重要な利用場面', text: scene }],
    });
  });

  for (const [key, ref] of Object.entries(officialRefs)) {
    docs.push({
      id: `ref:${key}`,
      kind: '公式資料',
      title: ref.title,
      product: '',
      location: '公式資料・出典',
      to: `/sources?at=ref-${key}`,
      fields: [
        { label: 'ページ題名', text: ref.title },
        { label: 'URL', text: ref.url },
      ],
    });
  }

  return docs;
}

interface PreparedDoc {
  doc: SearchDoc;
  normTitle: string;
  normFields: string[];
}

let prepared: PreparedDoc[] | null = null;

function getPrepared(): PreparedDoc[] {
  if (!prepared) {
    prepared = buildIndex().map((doc) => ({
      doc,
      normTitle: normalize(doc.title),
      normFields: doc.fields.map((f) => normalize(f.text)),
    }));
  }
  return prepared;
}

export function search(query: string, options: { kinds?: SearchKind[] } = {}): SearchHit[] {
  const terms = splitTerms(query);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const p of getPrepared()) {
    if (options.kinds && options.kinds.length && !options.kinds.includes(p.doc.kind)) continue;
    const matched: string[] = [];
    let score = 0;
    let bestField = -1;
    for (const term of terms) {
      let termHit = false;
      if (p.normTitle.includes(term)) {
        score += 20;
        termHit = true;
        if (p.normTitle === term) score += 10;
      }
      p.normFields.forEach((nf, i) => {
        if (nf.includes(term)) {
          score += 3;
          termHit = true;
          if (bestField < 0) bestField = i;
        }
      });
      if (termHit) matched.push(term);
    }
    if (matched.length === 0) continue;
    const allMatched = matched.length === terms.length;
    if (allMatched) score += 100;
    const field = bestField >= 0 ? p.doc.fields[bestField] : p.doc.fields[0] ?? { label: '', text: p.doc.title };
    hits.push({ doc: p.doc, score, matchedTerms: matched, allMatched, field, excerpt: makeExcerpt(field.text, terms) });
  }
  return hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title, 'ja'));
}

export const searchTargetsDescription =
  '機能名、英語名、見出し、収録項目、表の列と行、図の工程、入力・処理・出力・制約などの各項目（登録済みのもの）、ファイル形式、製品名、用途タグ、関連機能、出典（公式ページ題名とURL）、作業工程、品質検査項目、元資料の文章（登録済みのもの）';
