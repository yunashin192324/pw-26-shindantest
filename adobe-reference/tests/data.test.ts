import { describe, expect, it } from 'vitest';
import { allSections, chapters, sectionById } from '../src/data/chapters';
import { featureById, features } from '../src/data/features';
import { officialRefs } from '../src/data/officialRefs';
import { products, tags } from '../src/data/products';
import { automationTasks, fileFormats, qualityChecks, weddingWorkflow } from '../src/data/reference';
import { getSourceText } from '../src/data/sourceText';
import { comparisonPresets } from '../src/utils/comparison';
import { buildCoverage, coverageSummary } from '../src/utils/coverage';

/** アプリ内のパスが実在する画面を指しているか */
const knownPaths = new Set(['/', '/features', '/formats', '/automation', '/workflow', '/quality', '/compare', '/bookmarks', '/sources', '/coverage', '/about', '/search']);
function isValidRoute(to: string): boolean {
  const [path] = to.split('?');
  if (knownPaths.has(path)) return true;
  const [, head, id] = path.split('/');
  if (head === 'feature') return id in featureById;
  if (head === 'chapter') return chapters.some((c) => c.id === id);
  if (head === 'product') return products.some((p) => p.id === id);
  return false;
}

describe('データの整合性', () => {
  it('機能 id は一意', () => {
    const ids = features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('すべての機能が実在する節に属し、節の機能一覧と一致する', () => {
    for (const f of features) {
      expect(sectionById[f.section], f.id).toBeDefined();
      expect(sectionById[f.section].featureIds).toContain(f.id);
    }
    const listed = allSections.flatMap((s) => s.featureIds);
    expect(listed.length).toBe(features.length);
  });

  it('関連機能・関連ページの参照先がすべて実在する', () => {
    for (const f of features) {
      for (const r of f.relatedFeatures) {
        if (r.featureId) expect(featureById[r.featureId], `${f.id} → ${r.featureId}`).toBeDefined();
        else expect(r.to && isValidRoute(r.to), `${f.id} → ${r.to}`).toBe(true);
        expect(r.featureId).not.toBe(f.id);
      }
    }
    for (const t of automationTasks) t.relatedFeatures.forEach((id) => expect(featureById[id], id).toBeDefined());
    for (const w of weddingWorkflow) {
      w.relatedFeatures.forEach((id) => expect(featureById[id], id).toBeDefined());
      w.relatedPages.forEach((p) => expect(isValidRoute(p.to), p.to).toBe(true));
    }
    for (const q of qualityChecks) q.relatedFeatures.forEach((id) => expect(featureById[id], id).toBeDefined());
  });

  it('表の行リンク・節の注記リンクが実在する画面を指す', () => {
    for (const s of allSections) {
      for (const b of s.blocks ?? []) if (b.kind === 'table') b.rows.forEach((r) => r.link && expect(isValidRoute(r.link), r.link).toBe(true));
      for (const it of [...s.items, ...(s.notes ?? [])]) if (it.link) expect(isValidRoute(it.link), it.link).toBe(true);
    }
  });

  it('比較の例は実在する機能・製品だけを使う', () => {
    for (const p of comparisonPresets) {
      p.featureIds?.forEach((id) => expect(featureById[id], id).toBeDefined());
      p.productIds?.forEach((id) => expect(products.some((x) => x.id === id), id).toBe(true));
      if (!p.featureIds && !p.productIds) expect(p.unavailableReason).toBeTruthy();
    }
  });

  it('公式資料の URL はすべて Adobe の https URL', () => {
    for (const r of Object.values(officialRefs)) {
      const u = new URL(r.url);
      expect(u.protocol).toBe('https:');
      expect(['helpx.adobe.com', 'developer.adobe.com']).toContain(u.hostname);
      // 内容を照合していないため、確認済みと表示していないこと
      expect(r.status).not.toBe('official-confirmed');
    }
  });

  it('タグは定義済みのものだけを使う', () => {
    const tagIds = new Set(tags.map((t) => t.id));
    for (const f of features) f.tags.forEach((t) => expect(tagIds.has(t), `${f.id}:${t}`).toBe(true));
  });
});

describe('元資料の収録状況（推測で埋めていないこと）', () => {
  it('元資料本文が未登録の機能は、説明項目が空（null）で、未提供と表示する', () => {
    for (const f of features) {
      if (getSourceText(f.sourceTextKey)) continue;
      expect(f.summary, f.id).toBeNull();
      expect(f.purpose, f.id).toBeNull();
      expect(f.inputs, f.id).toBeNull();
      expect(f.processing, f.id).toBeNull();
      expect(f.outputs, f.id).toBeNull();
      expect(f.limitations, f.id).toBeNull();
      expect(f.verificationStatus, f.id).toContain('source-missing');
    }
  });

  it('製品の役割・ファイル形式の説明・自動化の区分を推測で埋めていない', () => {
    products.forEach((p) => expect(p.role).toBeNull());
    fileFormats.forEach((f) => {
      expect(f.usage).toBeNull();
      expect(f.characteristics).toBeNull();
    });
    automationTasks.forEach((t) => {
      expect(t.method).toBeNull();
      expect(t.states).toEqual(['unverified']);
    });
  });

  it('開発指示書に列挙された構成要素がすべて登録されている', () => {
    const titles = features.map((f) => f.title);
    const expected = [
      '生成塗りつぶし', '生成拡張', '画像生成', '調和', '文章による編集・AI補助編集',
      '被写体を選択', '背景を削除', '選択とマスク', '強化された境界線', '削除ツール', '調整レイヤー', 'シャープ・ノイズ低減', '変形・遠近法', 'レイヤーマスク', '描画モード',
      '生成アップスケール', '削除ツールと不要物の検出', '非破壊の色調補正',
      '画像レイヤー', '文字レイヤー', 'スマートオブジェクト', '生成レイヤー', 'グループ', '不透明度',
      'AIによる写真選別', '文章による写真編集',
      '部分補正・マスク：人物', '部分補正・マスク：顔・肌', '部分補正・マスク：空', '部分補正・マスク：背景', '部分補正・マスク：物体', '部分補正・マスク：手動範囲',
      '反射の除去', 'AIノイズ除去', 'AIによる鮮明化', 'Lightroomでの一括処理',
      'Firefly：画像生成', 'Firefly：画像編集', 'Firefly：動画制作', 'Firefly：制作素材の管理', 'Firefly：制作工程の連携', 'Firefly：組織向けの制作',
    ];
    expected.forEach((t) => expect(titles, t).toContain(t));
    // 2-2 と 2-4 に同名の「調整レイヤー」「レイヤーマスク」「描画モード」が両方ある（重複を削除していない）
    for (const t of ['調整レイヤー', 'レイヤーマスク', '描画モード']) expect(titles.filter((x) => x === t).length, t).toBe(2);

    expect(fileFormats.map((f) => f.name)).toEqual(['RAW', 'PSD', 'PSB', 'TIFF', 'JPEG', 'PNG', 'DNG']);
    expect(automationTasks.map((t) => t.task)).toEqual([
      'ファイルの読み込み・保存', 'サイズ変更', '一括書き出し', '定型的な色調補正', '背景除去', '不要物除去', '生成AIによる編集', '編集結果の品質判定',
    ]);
    expect(weddingWorkflow.map((w) => w.title)).toHaveLength(9);
    expect(qualityChecks).toHaveLength(11);
    expect(chapters.map((c) => c.sections.map((s) => s.id))).toEqual([
      ['1'], ['2-1', '2-2', '2-3', '2-4'], ['3-1', '3-2', '3-3', '3-4', '3-5'], ['4-1', '4-2', '4-3'], ['5-1', '5-2'], ['6-1', '6-2'],
    ]);
  });

  it('図の工程が指示書の順序どおり', () => {
    const flow = (id: string) => {
      const b = allSections.flatMap((s) => s.blocks ?? []).find((x) => x.id === id);
      return b && b.kind === 'flow' ? b.steps : null;
    };
    expect(flow('flow-2-4')).toEqual(['元画像', '選択範囲・マスク', '編集レイヤー・生成結果', '補正・合成・確認', '最終書き出し']);
    expect(flow('flow-3-5')).toEqual(['撮影写真を読み込む', '問題のある写真を確認して候補を絞る', '基準写真を補正する', '設定を複数の写真に適用する', '写真ごとに微調整する', '指定条件で書き出す']);
    expect(flow('flow-5-2')).toEqual(['写真の取り込み', '自動選別', '一括補正', '個別修正', '品質検査', '納品データの作成']);
  });

  it('収録対応表のリンクがすべて実在する画面を指し、本文未提供が明示される', () => {
    const rows = buildCoverage();
    rows.forEach((r) => expect(isValidRoute(r.to), r.to).toBe(true));
    const s = coverageSummary(rows);
    expect(s.structure).toBeLessThanOrEqual(s.total);
    expect(s.bodyDone).toBe(0);
  });
});
