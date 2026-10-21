import { describe, expect, it } from 'vitest';
import { features } from '../src/data/features';
import { emptyFilter, filterFeatures } from '../src/utils/filtering';
import { findRanges, normalize, search } from '../src/utils/search';

const titles = (q: string) => search(q).map((h) => h.doc.title);

describe('検索', () => {
  it('文字の正規化（全角半角・大文字小文字・カタカナひらがな）', () => {
    expect(normalize('ＲＡＷ')).toBe('raw');
    expect(normalize('レイヤー')).toBe(normalize('れいやー'));
  });

  it.each([
    ['Photoshop', 'Adobe Photoshop'],
    ['Generative Fill', '生成塗りつぶし（Generative Fill）'],
    ['generative fill', '生成塗りつぶし（Generative Fill）'],
    ['ドレス', 'ドレスの輪郭'],
    ['背景', '背景を削除'],
    ['背景を削除', '背景を削除'],
    ['レイヤーマスク', 'レイヤーマスク'],
    ['ノイズ除去', 'AIノイズ除去'],
    ['RAW', 'RAW'],
    ['raw', 'RAW'],
    ['自動化', '自動化できる範囲'],
    ['品質検査', '生成AI編集結果の品質検査'],
    ['髪の毛', '髪の毛とベールの境界'],
    ['生成拡張', '生成拡張（Generative Expand）'],
  ])('「%s」で「%s」が見つかる', (q, expected) => {
    expect(titles(q)).toContain(expected);
  });

  it('完全一致だけでなく部分一致で見つかる', () => {
    expect(titles('塗りつぶし')).toContain('生成塗りつぶし（Generative Fill）');
    expect(titles('ベール')).toContain('髪の毛とベールの境界');
  });

  it('複数語ではすべての語を含む項目が先頭に並ぶ', () => {
    const hits = search('Photoshop Lightroom 違い');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].allMatched).toBe(true);
    expect(hits[0].doc.title).toContain('最新版の全体像');
    const firstPartial = hits.findIndex((h) => !h.allMatched);
    if (firstPartial >= 0) expect(hits.slice(firstPartial).every((h) => !h.allMatched)).toBe(true);
  });

  it('該当がなければ空', () => {
    expect(search('存在しない語句xyz')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });

  it('結果には遷移先・抜粋・強調範囲が含まれる', () => {
    const [hit] = search('生成拡張');
    expect(hit.doc.to).toBe('/feature/generative-expand');
    expect(hit.excerpt.ranges.length).toBeGreaterThan(0);
  });

  it('強調範囲は元の文字列の位置を指す', () => {
    const text = 'Adobe ＲＡＷ 形式';
    const [[a, b]] = findRanges(text, ['raw']);
    expect(text.slice(a, b)).toBe('ＲＡＷ');
  });
});

describe('絞り込み', () => {
  it('条件なしなら全件', () => {
    expect(filterFeatures(features, emptyFilter)).toHaveLength(features.length);
  });

  it('製品で絞り込める（複数はいずれか）', () => {
    const ps = filterFeatures(features, { ...emptyFilter, products: ['photoshop'] });
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.every((f) => f.products.includes('photoshop'))).toBe(true);
    const both = filterFeatures(features, { ...emptyFilter, products: ['photoshop', 'lightroom'] });
    expect(both.length).toBe(ps.length + filterFeatures(features, { ...emptyFilter, products: ['lightroom'] }).length);
  });

  it('製品と用途を組み合わせられる（かつ）', () => {
    const r = filterFeatures(features, { ...emptyFilter, products: ['photoshop'], tags: ['genai'] });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((f) => f.products.includes('photoshop') && f.tags.includes('genai'))).toBe(true);
  });

  it('用途の「すべてを含む」', () => {
    const r = filterFeatures(features, { ...emptyFilter, tags: ['cutout', 'dress'], tagMode: 'all' });
    expect(r.every((f) => f.tags.includes('cutout') && f.tags.includes('dress'))).toBe(true);
    expect(r.map((f) => f.id)).toContain('select-and-mask');
  });
});
