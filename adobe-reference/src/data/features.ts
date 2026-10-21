import { officialRefs as r } from './officialRefs';
import type { Feature, ProductId, RelatedLink, TagId } from './types';

/**
 * 機能データ。
 *
 * 収録の根拠:
 * - 機能名・英語名・節の配置・下位項目名は、開発指示書の第5章（元資料の構成）に記載されたもの。
 * - summary / purpose / inputs / processing / outputs / useCases / limitations / workflow /
 *   technicalDetails / automation / dataPreservation は元資料本文に記載される想定だが、
 *   元資料が未提供のため、すべて null（未記載）にしている。推測では埋めていない。
 * - tags はアプリ独自の整理。
 * - relatedFeatures は、開発指示 7-7 の例示に基づくもの（basis: 'instruction'）と、
 *   同じ名称の項目が複数の節にある場合の相互参照（basis: 'app-original'）のみ。
 */

const SPEC_2_1 = ['目的', '入力', '処理', '出力', '用途', '制約', '関連する公式資料', '実装状況に関する元資料の記述'];
const SPEC_2_2 = ['機能', '入力・操作', '主な出力', '実務上の用途'];
const SPEC_3_3 = ['主な処理', '具体例'];
const SPEC_3_4 = ['入力', '出力', '制約'];
const SPEC_BODY = ['本文'];

type Init = Partial<Feature> &
  Pick<Feature, 'id' | 'title' | 'products' | 'category' | 'section' | 'tags' | 'expectedSourceItems'>;

function feature(init: Init): Feature {
  return {
    englishName: null,
    summary: null,
    purpose: null,
    inputs: null,
    processing: null,
    outputs: null,
    useCases: null,
    limitations: null,
    workflow: null,
    technicalDetails: null,
    automation: null,
    dataPreservation: null,
    relatedFeatures: [],
    sourceReferences: [],
    verificationStatus: ['source-missing', 'unverified'],
    sourceTextKey: `feature:${init.id}`,
    ...init,
  };
}

const ins = (featureId: string, note?: string): RelatedLink => ({ featureId, basis: 'instruction', note });
const same = (featureId: string, note = '同じ名称の項目が別の節にも収録されています'): RelatedLink => ({
  featureId,
  basis: 'app-original',
  note,
});
const page = (to: string, label: string, basis: RelatedLink['basis'] = 'instruction', note?: string): RelatedLink => ({
  to,
  label,
  basis,
  note,
});

const PS: ProductId[] = ['photoshop'];
const LR: ProductId[] = ['lightroom'];
const FF: ProductId[] = ['firefly'];
const COMMON: ProductId[] = ['common'];

const t = (...ids: TagId[]) => ids;

export const features: Feature[] = [
  // ───────── 第2章 2-1 生成AIによる画像編集 ─────────
  feature({
    id: 'generative-fill',
    title: '生成塗りつぶし',
    englishName: 'Generative Fill',
    products: PS,
    category: '生成AIによる画像編集',
    section: '2-1',
    tags: t('genai', 'background', 'composite', 'dress'),
    expectedSourceItems: SPEC_2_1,
    relatedFeatures: [ins('layer-mask'), ins('remove-tool'), ins('generative-expand')],
    sourceReferences: [r.psGenerativeFill, r.psGenAiOverview],
  }),
  feature({
    id: 'generative-expand',
    title: '生成拡張',
    englishName: 'Generative Expand',
    products: PS,
    category: '生成AIによる画像編集',
    section: '2-1',
    tags: t('genai', 'expand', 'background'),
    expectedSourceItems: SPEC_2_1,
    sourceReferences: [r.psGenerativeExpand, r.acrGenerativeExpand, r.psGenAiOverview],
  }),
  feature({
    id: 'generate-image',
    title: '画像生成',
    englishName: 'Generate Image',
    products: PS,
    category: '生成AIによる画像編集',
    section: '2-1',
    tags: t('genai'),
    expectedSourceItems: SPEC_2_1,
    sourceReferences: [r.psGenerateImage, r.psGenAiOverview],
  }),
  feature({
    id: 'harmonize',
    title: '調和',
    englishName: 'Harmonize',
    products: PS,
    category: '生成AIによる画像編集',
    section: '2-1',
    tags: t('genai', 'composite', 'color'),
    expectedSourceItems: SPEC_2_1,
    sourceReferences: [r.psHarmonize, r.psGenAiOverview],
  }),
  feature({
    id: 'text-based-edit',
    title: '文章による編集・AI補助編集',
    products: PS,
    category: '生成AIによる画像編集',
    section: '2-1',
    tags: t('genai'),
    expectedSourceItems: SPEC_2_1,
    sourceReferences: [r.psPromptToEdit, r.psAiAssistedMode],
  }),

  // ───────── 第2章 2-2 生成AI以外の主要な編集機能 ─────────
  feature({
    id: 'select-subject',
    title: '被写体を選択',
    products: PS,
    category: '生成AI以外の主要な編集機能',
    section: '2-2',
    tags: t('cutout'),
    expectedSourceItems: SPEC_2_2,
    sourceReferences: [r.psSelectSubject, r.psImprovedSelectSubject],
  }),
  feature({
    id: 'remove-background',
    title: '背景を削除',
    products: PS,
    category: '生成AI以外の主要な編集機能',
    section: '2-2',
    tags: t('cutout', 'background', 'composite'),
    expectedSourceItems: SPEC_2_2,
    relatedFeatures: [ins('select-and-mask'), ins('layer-mask'), ins('harmonize')],
    sourceReferences: [r.psRemoveBackground, r.psImprovedSelectSubject],
  }),
  feature({
    id: 'select-and-mask',
    title: '選択とマスク',
    products: PS,
    category: '生成AI以外の主要な編集機能',
    section: '2-2',
    tags: t('cutout', 'dress'),
    expectedSourceItems: SPEC_2_2,
    sourceReferences: [r.psSelectAndMask],
  }),
  feature({
    id: 'enhance-edge',
    title: '強化された境界線',
    englishName: 'Enhance Edge',
    products: PS,
    category: '生成AI以外の主要な編集機能',
    section: '2-2',
    tags: t('cutout', 'dress'),
    expectedSourceItems: SPEC_2_2,
  }),
  feature({
    id: 'remove-tool',
    title: '削除ツール',
    products: PS,
    category: '生成AI以外の主要な編集機能',
    section: '2-2',
    tags: t('background'),
    expectedSourceItems: SPEC_2_2,
    relatedFeatures: [same('remove-tool-distractions', '2-3「削除ツールと不要物の検出」にも同じツールの項目があります')],
    sourceReferences: [r.psRemoveTool],
  }),
  feature({
    id: 'adjustment-layers',
    title: '調整レイヤー',
    products: PS,
    category: '生成AI以外の主要な編集機能',
    section: '2-2',
    tags: t('color'),
    expectedSourceItems: SPEC_2_2,
    relatedFeatures: [same('layer-adjustment')],
  }),
  feature({
    id: 'sharpen-noise-reduction',
    title: 'シャープ・ノイズ低減',
    products: PS,
    category: '生成AI以外の主要な編集機能',
    section: '2-2',
    tags: t('noise'),
    expectedSourceItems: SPEC_2_2,
  }),
  feature({
    id: 'transform-perspective',
    title: '変形・遠近法',
    products: PS,
    category: '生成AI以外の主要な編集機能',
    section: '2-2',
    tags: t('composite'),
    expectedSourceItems: SPEC_2_2,
  }),
  feature({
    id: 'layer-mask',
    title: 'レイヤーマスク',
    products: PS,
    category: '生成AI以外の主要な編集機能',
    section: '2-2',
    tags: t('cutout', 'composite'),
    expectedSourceItems: SPEC_2_2,
    relatedFeatures: [same('layer-mask-spec')],
  }),
  feature({
    id: 'blend-modes',
    title: '描画モード',
    products: PS,
    category: '生成AI以外の主要な編集機能',
    section: '2-2',
    tags: t('composite'),
    expectedSourceItems: SPEC_2_2,
    relatedFeatures: [same('layer-blend-mode')],
  }),

  // ───────── 第2章 2-3 画像の品質改善 ─────────
  feature({
    id: 'generative-upscale',
    title: '生成アップスケール',
    englishName: 'Generative Upscale',
    products: PS,
    category: '画像の品質改善',
    section: '2-3',
    tags: t('genai'),
    expectedSourceItems: SPEC_BODY,
    sourceReferences: [r.psGenerativeUpscale],
  }),
  feature({
    id: 'remove-tool-distractions',
    title: '削除ツールと不要物の検出',
    products: PS,
    category: '画像の品質改善',
    section: '2-3',
    tags: t('background'),
    expectedSourceItems: SPEC_BODY,
    relatedFeatures: [same('remove-tool', '2-2「削除ツール」にも同じツールの項目があります')],
    sourceReferences: [r.psRemoveTool],
  }),
  feature({
    id: 'nondestructive-color',
    title: '非破壊の色調補正',
    products: PS,
    category: '画像の品質改善',
    section: '2-3',
    tags: t('color'),
    expectedSourceItems: SPEC_BODY,
  }),

  // ───────── 第2章 2-4 レイヤーと編集データの仕様 ─────────
  ...(
    [
      ['layer-image', '画像レイヤー', t('composite'), []],
      ['layer-text', '文字レイヤー', t('composite'), []],
      ['layer-adjustment', '調整レイヤー', t('color'), [same('adjustment-layers')]],
      ['layer-mask-spec', 'レイヤーマスク', t('cutout', 'composite'), [same('layer-mask')]],
      ['layer-smart-object', 'スマートオブジェクト', t('composite', 'file'), []],
      ['layer-generative', '生成レイヤー', t('genai'), []],
      ['layer-group', 'グループ', t('file'), []],
      ['layer-blend-mode', '描画モード', t('composite'), [same('blend-modes')]],
      ['layer-opacity', '不透明度', t('composite'), []],
    ] as [string, string, TagId[], RelatedLink[]][]
  ).map(([id, title, tg, rel]) =>
    feature({
      id,
      title,
      products: PS,
      category: 'レイヤーと編集データの仕様',
      section: '2-4',
      tags: tg,
      expectedSourceItems: SPEC_BODY,
      relatedFeatures: rel,
    }),
  ),

  // ───────── 第3章 3-1 AIによる写真選別 ─────────
  feature({
    id: 'lr-ai-culling',
    title: 'AIによる写真選別',
    products: LR,
    category: 'AIによる写真選別',
    section: '3-1',
    tags: t('culling', 'batch', 'automation'),
    expectedSourceItems: [
      '大量の写真から候補を絞る仕組み',
      '顔や目の検出',
      '目の開閉や鮮明さの確認',
      '露出などの問題の検出',
      '人間による最終確認の必要性',
    ],
    instructionSubItems: [
      '大量の写真から候補を絞る仕組み',
      '顔や目の検出',
      '目の開閉や鮮明さの確認',
      '露出などの問題の検出',
      '人間による最終確認の必要性',
    ],
    sourceReferences: [r.lrAssistedCulling, r.lrcAssistedCulling],
  }),

  // ───────── 第3章 3-2 文章による写真編集 ─────────
  feature({
    id: 'lr-prompt-to-edit',
    title: '文章による写真編集',
    englishName: 'Prompt to Edit',
    products: LR,
    category: '文章による写真編集',
    section: '3-2',
    tags: t('genai', 'color'),
    expectedSourceItems: ['入力例', '出力', '制約', '元資料に記載されたモデル名'],
    instructionSubItems: ['Prompt to Edit', '入力例', '出力', '制約', '元資料に記載されたモデル名'],
    sourceReferences: [r.lrPromptToEdit],
  }),

  // ───────── 第3章 3-3 部分補正・マスク ─────────
  ...(
    [
      ['lr-mask-people', '人物', t('portrait', 'cutout')],
      ['lr-mask-face-skin', '顔・肌', t('portrait')],
      ['lr-mask-sky', '空', t('background', 'color')],
      ['lr-mask-background', '背景', t('background')],
      ['lr-mask-object', '物体', t('dress')],
      ['lr-mask-manual', '手動範囲', t('color')],
    ] as [string, string, TagId[]][]
  ).map(([id, title, tg]) =>
    feature({
      id,
      title: `部分補正・マスク：${title}`,
      products: LR,
      category: '部分補正・マスク',
      section: '3-3',
      tags: tg,
      expectedSourceItems: SPEC_3_3,
      relatedFeatures: [
        ins('lr-batch', '開発指示 7-7「Lightroomの部分補正 → 一括処理」'),
        ins('nondestructive-color', '開発指示 7-7「Lightroomの部分補正 → 色調補正」。この項目は Photoshop の節に属します'),
        page('/chapter/ch3?at=sec-3-3', '3-3 部分補正・マスク（他のマスク項目）', 'instruction', '開発指示 7-7「Lightroomの部分補正 → マスク」'),
      ],
      sourceReferences: [r.lrMasks],
    }),
  ),

  // ───────── 第3章 3-4 反射除去・ノイズ除去・鮮明化 ─────────
  feature({
    id: 'lr-reflection-removal',
    title: '反射の除去',
    products: LR,
    category: '反射除去・ノイズ除去・鮮明化',
    section: '3-4',
    tags: t('background'),
    expectedSourceItems: SPEC_3_4,
    sourceReferences: [r.lrRemoveReflections],
  }),
  feature({
    id: 'lr-ai-denoise',
    title: 'AIノイズ除去',
    products: LR,
    category: '反射除去・ノイズ除去・鮮明化',
    section: '3-4',
    tags: t('noise'),
    expectedSourceItems: SPEC_3_4,
    relatedFeatures: [
      page('/formats?at=format-raw', 'ファイル形式：RAW', 'instruction', '開発指示 7-7「ノイズ除去 → RAW」'),
      page('/product/camera-raw', '製品：Adobe Camera Raw', 'instruction', '開発指示 7-7「ノイズ除去 → Camera Raw」'),
      ins('lr-ai-sharpen', '開発指示 7-7「ノイズ除去 → 鮮明化」'),
    ],
    sourceReferences: [r.lrEnhance],
  }),
  feature({
    id: 'lr-ai-sharpen',
    title: 'AIによる鮮明化',
    products: LR,
    category: '反射除去・ノイズ除去・鮮明化',
    section: '3-4',
    tags: t('noise'),
    expectedSourceItems: SPEC_3_4,
    sourceReferences: [r.lrEnhance],
  }),

  // ───────── 第3章 3-5 Lightroomでの一括処理 ─────────
  feature({
    id: 'lr-batch',
    title: 'Lightroomでの一括処理',
    products: LR,
    category: 'Lightroomでの一括処理',
    section: '3-5',
    tags: t('batch', 'color', 'file', 'automation'),
    expectedSourceItems: SPEC_BODY,
    workflow: [
      '撮影写真を読み込む',
      '問題のある写真を確認して候補を絞る',
      '基準写真を補正する',
      '設定を複数の写真に適用する',
      '写真ごとに微調整する',
      '指定条件で書き出す',
    ],
    verificationStatus: ['instruction', 'source-missing', 'unverified'],
    sourceReferences: [r.lrcCopyPaste],
  }),

  // ───────── 第4章 技術仕様 ─────────
  feature({
    id: 'tech-image-data',
    title: '画像データの扱い',
    products: COMMON,
    category: '技術仕様',
    section: '4-1',
    tags: t('file'),
    expectedSourceItems: ['画像寸法', '解像度', '色深度', '色空間', 'レイヤー', 'マスク', '透明度', 'メタデータ', 'ICCプロファイル'],
    instructionSubItems: ['画像寸法', '解像度', '色深度', '色空間', 'レイヤー', 'マスク', '透明度', 'メタデータ', 'ICCプロファイル'],
    relatedFeatures: [page('/formats', 'ファイル形式一覧', 'app-original')],
  }),
  feature({
    id: 'tech-genai-io',
    title: '生成AIの入力・処理・出力',
    products: COMMON,
    category: '技術仕様',
    section: '4-2',
    tags: t('genai', 'qa'),
    expectedSourceItems: ['入力', '処理', '出力', '品質検査'],
    instructionSubItems: ['入力', '処理', '出力', '品質検査'],
    relatedFeatures: [page('/quality', '品質検査項目一覧', 'app-original')],
  }),
  feature({
    id: 'tech-model-selection',
    title: 'AIモデルの選択',
    products: COMMON,
    category: '技術仕様',
    section: '4-3',
    tags: t('genai'),
    expectedSourceItems: [
      '対応機能',
      '入力条件',
      '出力品質',
      '編集の一貫性',
      '処理時間',
      '利用費用',
      '商用利用条件',
      'データの取り扱い',
      '元資料に記載されたモデル名',
    ],
    instructionSubItems: ['対応機能', '入力条件', '出力品質', '編集の一貫性', '処理時間', '利用費用', '商用利用条件', 'データの取り扱い'],
    verificationStatus: ['source-missing', 'unverified', 'possibly-outdated'],
    sourceReferences: [r.partnerModels, r.fireflyCredits],
  }),

  // ───────── 第5章 自動化・大量処理 ─────────
  feature({
    id: 'automation-scope',
    title: '自動化できる範囲',
    products: COMMON,
    category: '自動化・大量処理',
    section: '5-1',
    tags: t('automation', 'batch'),
    expectedSourceItems: ['作業ごとの自動化方法', '作業ごとの注意点'],
    relatedFeatures: [
      page('/automation', '自動化一覧（バッチ処理・スクリプト）', 'instruction', '開発指示 7-7「自動化 → バッチ処理、スクリプト」'),
      ins('tech-quality-check', '開発指示 7-7「自動化 → 品質検査」'),
      ins('lr-batch'),
    ],
    sourceReferences: [r.psBatch, r.psImageProcessor, r.psDroplet, r.psUxpScripting],
  }),
  feature({
    id: 'automation-system-design',
    title: '大量の写真を処理するシステムの設計例',
    products: COMMON,
    category: '自動化・大量処理',
    section: '5-2',
    tags: t('automation', 'batch', 'culling', 'qa'),
    expectedSourceItems: ['6工程の説明', '定型化しやすい工程と人間による確認が必要な工程の違い'],
    workflow: ['写真の取り込み', '自動選別', '一括補正', '個別修正', '品質検査', '納品データの作成'],
    verificationStatus: ['instruction', 'source-missing', 'unverified'],
    relatedFeatures: [ins('automation-scope'), ins('lr-batch'), ins('tech-quality-check')],
  }),
  feature({
    id: 'tech-quality-check',
    title: '生成AI編集結果の品質検査',
    products: COMMON,
    category: '技術仕様',
    section: '4-2',
    tags: t('qa', 'genai', 'portrait', 'dress'),
    expectedSourceItems: ['顔の同一性', '指や手などの形状', '衣装の装飾', '背景の構造', '光源・影・輪郭', '意図しない変化'],
    instructionSubItems: ['顔の同一性', '指や手などの形状', '衣装の装飾', '背景の構造', '光源・影・輪郭', '意図しない変化'],
    verificationStatus: ['instruction', 'source-missing'],
    relatedFeatures: [page('/quality', '品質検査項目一覧（詳細）', 'app-original'), ins('tech-genai-io')],
  }),

  // ───────── 第6章 6-1 Firefly ─────────
  ...(
    [
      ['ff-image-generation', '画像生成', t('genai')],
      ['ff-image-editing', '画像編集', t('genai')],
      ['ff-video', '動画制作', t('genai')],
      ['ff-asset-management', '制作素材の管理', t('file')],
      ['ff-workflow-integration', '制作工程の連携', t('automation')],
      ['ff-enterprise', '組織向けの制作', t('automation')],
    ] as [string, string, TagId[]][]
  ).map(([id, title, tg]) =>
    feature({
      id,
      title: `Firefly：${title}`,
      products: FF,
      category: 'Firefly',
      section: '6-1',
      tags: tg,
      expectedSourceItems: [...SPEC_BODY, '個人向け機能か組織向け機能かの区別'],
      sourceReferences: [r.fireflyFaq],
      verificationStatus: ['source-missing', 'unverified', 'external-dependency'],
    }),
  ),
];

export const featureById: Record<string, Feature> = Object.fromEntries(features.map((f) => [f.id, f]));
