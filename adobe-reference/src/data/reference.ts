import { officialRefs as r } from './officialRefs';
import type { AutomationState, AutomationTask, FileFormat, QualityCheckItem, WorkflowStep } from './types';

/* ───────── ファイル形式（元資料 4-1） ─────────
 * 形式名は開発指示書の記載。用途・特徴は元資料本文に記載される想定だが未提供のため null。
 * 元資料にない詳細仕様は確定情報として追加しない。 */
export const fileFormats: FileFormat[] = (
  [
    ['raw', 'RAW', ['lightroom', 'camera-raw']],
    ['psd', 'PSD', ['photoshop']],
    ['psb', 'PSB', ['photoshop']],
    ['tiff', 'TIFF', []],
    ['jpeg', 'JPEG', []],
    ['png', 'PNG', []],
    ['dng', 'DNG', ['lightroom', 'camera-raw']],
  ] as const
).map(([id, name, relatedProducts]) => ({
  id,
  name,
  usage: null,
  characteristics: null,
  sourceTextKey: `format:${id}`,
  relatedProducts: [...relatedProducts],
  officialStatus: 'unverified',
}));

/** 関連製品の欄の根拠 */
export const fileFormatProductNote =
  '関連製品の欄は、製品名に含まれる語（Camera Raw）や製品固有の形式であることに基づくアプリ独自の整理です。元資料の記載ではありません。空欄は対応付けを行っていないことを示し、対応しないという意味ではありません。';

/* ───────── 自動化（元資料 5-1 / 開発指示 8-2） ───────── */
export const automationStateLabel: Record<AutomationState, string> = {
  routine: '定型処理として実装しやすい',
  'ai-assist': 'AIによる支援が可能',
  external: '外部連携が必要',
  human: '人間の確認が必要',
  unverified: '未確認',
};

function task(
  id: string,
  name: string,
  relatedFeatures: string[],
  officialRefs: AutomationTask['officialRefs'],
): AutomationTask {
  return {
    id,
    task: name,
    method: null,
    requiredInputs: null,
    outputs: null,
    humanReview: null,
    constraints: null,
    cautions: null,
    // 元資料本文が未提供のため、自動化の可否はすべて「未確認」とする。
    states: ['unverified'],
    sourceTextKey: `automation:${id}`,
    relatedFeatures,
    officialRefs,
  };
}

export const automationTasks: AutomationTask[] = [
  task('file-io', 'ファイルの読み込み・保存', [], [r.psBatch, r.psImageProcessor]),
  task('resize', 'サイズ変更', [], [r.psImageProcessor]),
  task('bulk-export', '一括書き出し', ['lr-batch'], [r.psImageProcessor, r.psBatch]),
  task('routine-color', '定型的な色調補正', ['adjustment-layers', 'lr-batch'], [r.psBatch, r.psDroplet, r.lrcCopyPaste]),
  task('background-removal', '背景除去', ['remove-background'], [r.psRemoveBackground]),
  task('object-removal', '不要物除去', ['remove-tool', 'remove-tool-distractions'], [r.psRemoveTool]),
  task('genai-edit', '生成AIによる編集', ['generative-fill', 'generative-expand', 'harmonize'], [r.psGenAiOverview]),
  task('quality-judgement', '編集結果の品質判定', ['tech-quality-check'], []),
];

export const automationRefsNote =
  '「関連する公式ページ」は、作業名に関係する Adobe 公式ページの所在を Web 検索で確認したものです。ページ本文は未照合のため、その方法で自動化できると断定するものではありません。';

/* ───────── フォトウェディングの作業工程（開発指示 8-3） ─────────
 * 工程名は開発指示書の記載。各工程と機能の対応付けはアプリ独自の整理。 */
export const weddingWorkflow: WorkflowStep[] = [
  { id: 'wf-1', order: 1, title: '撮影データの取り込み', description: null, relatedFeatures: ['lr-batch'], relatedPages: [{ label: 'ファイル形式一覧', to: '/formats' }] },
  { id: 'wf-2', order: 2, title: '写真の選別', description: null, relatedFeatures: ['lr-ai-culling'], relatedPages: [] },
  {
    id: 'wf-3',
    order: 3,
    title: 'RAW現像・基本補正',
    description: null,
    relatedFeatures: ['lr-ai-denoise', 'nondestructive-color'],
    relatedPages: [
      { label: 'ファイル形式：RAW', to: '/formats?at=format-raw' },
      { label: '製品：Adobe Camera Raw', to: '/product/camera-raw' },
    ],
  },
  { id: 'wf-4', order: 4, title: '色調の統一', description: null, relatedFeatures: ['lr-batch', 'adjustment-layers'], relatedPages: [] },
  {
    id: 'wf-5',
    order: 5,
    title: '人物や衣装の部分補正',
    description: null,
    relatedFeatures: ['lr-mask-people', 'lr-mask-face-skin', 'lr-mask-object', 'select-and-mask', 'layer-mask'],
    relatedPages: [],
  },
  {
    id: 'wf-6',
    order: 6,
    title: '背景の修正',
    description: null,
    relatedFeatures: ['lr-mask-background', 'remove-background', 'remove-tool', 'lr-reflection-removal'],
    relatedPages: [],
  },
  {
    id: 'wf-7',
    order: 7,
    title: '必要に応じた生成AI編集',
    description: null,
    relatedFeatures: ['generative-fill', 'generative-expand', 'harmonize', 'text-based-edit'],
    relatedPages: [],
  },
  { id: 'wf-8', order: 8, title: '編集結果の品質検査', description: null, relatedFeatures: ['tech-quality-check'], relatedPages: [{ label: '品質検査項目一覧', to: '/quality' }] },
  { id: 'wf-9', order: 9, title: '納品データの作成', description: null, relatedFeatures: ['lr-batch'], relatedPages: [{ label: '自動化一覧', to: '/automation' }, { label: 'ファイル形式一覧', to: '/formats' }] },
];

/** 開発指示 2-3「重要な利用場面」（元資料の本文ではない） */
export const importantScenes: string[] = [
  'ウェディングドレスの形状や装飾を維持した編集',
  '人物の顔や肌の自然な補正',
  '髪の毛、ベール、レースの切り抜き',
  '背景の不要物除去',
  '写真の縦横比の変更と画像の拡張',
  '人物と背景の合成',
  '大量の撮影写真の選別',
  '色調の統一',
  'ノイズ低減と鮮明化',
  '納品画像の一括書き出し',
  '編集データの管理と再編集',
  'バッチ処理やスクリプトによる自動化',
];

/* ───────── 品質検査（元資料 4-2 / 開発指示 9） ─────────
 * 検査対象の名称は開発指示書の記載。
 * 「想定される問題」「確認すべき事項」は元資料にはない、アプリ独自の整理（一般的な目視確認の観点）。
 * このアプリは画像を解析しないため、品質判定は行わない。 */
export const qualityChecks: QualityCheckItem[] = [
  {
    id: 'qa-face-identity',
    target: '顔の同一性',
    origin: '4-2/9',
    relatedFeatures: ['generative-fill', 'text-based-edit', 'lr-mask-face-skin'],
    possibleIssues: ['編集後の顔が本人と異なる印象になる'],
    checkPoints: ['編集前の画像と並べて、顔立ち・表情・年齢の印象が変わっていないかを人の目で確認する'],
  },
  {
    id: 'qa-facial-parts',
    target: '目、鼻、口の形状',
    origin: '9',
    relatedFeatures: ['lr-mask-face-skin', 'generative-fill'],
    possibleIssues: ['左右の目の形や大きさが不自然にそろわない', '輪郭がにじむ、または形が崩れる'],
    checkPoints: ['拡大表示で各部位の形と左右の釣り合いを確認する'],
  },
  {
    id: 'qa-hands',
    target: '指、手、腕の形状',
    origin: '4-2/9',
    relatedFeatures: ['generative-fill', 'generative-expand'],
    possibleIssues: ['指の本数や関節の向きが不自然になる', '腕の長さや太さが左右で不自然に変わる'],
    checkPoints: ['指の本数、関節の向き、腕のつながり方を一つずつ確認する'],
  },
  {
    id: 'qa-dress-outline',
    target: 'ドレスの輪郭',
    origin: '9',
    relatedFeatures: ['select-and-mask', 'enhance-edge', 'remove-background', 'generative-expand'],
    possibleIssues: ['切り抜きや拡張の境目で、ドレスの形が欠ける・膨らむ'],
    checkPoints: ['裾、袖、腰回りの輪郭が編集前の形と一致しているかを確認する'],
  },
  {
    id: 'qa-embroidery-lace',
    target: '刺繍やレースの装飾',
    origin: '4-2/9',
    relatedFeatures: ['generative-fill', 'lr-ai-denoise', 'lr-ai-sharpen', 'generative-upscale'],
    possibleIssues: ['細かな模様が消える、つぶれる、別の模様に置き換わる'],
    checkPoints: ['等倍以上に拡大し、模様の形と配置が編集前と同じかを確認する'],
  },
  {
    id: 'qa-hair-veil',
    target: '髪の毛とベールの境界',
    origin: '9',
    relatedFeatures: ['select-and-mask', 'enhance-edge', 'remove-background', 'layer-mask'],
    possibleIssues: ['髪の毛先や透けたベールが背景色を残す、または切れる'],
    checkPoints: ['明るい背景と暗い背景の両方に重ねて、境界の残りや欠けを確認する'],
  },
  {
    id: 'qa-background-structure',
    target: '背景の建物や模様',
    origin: '4-2/9',
    relatedFeatures: ['generative-expand', 'generative-fill', 'remove-tool'],
    possibleIssues: ['柱や窓の線がゆがむ、途切れる、繰り返しが不自然になる'],
    checkPoints: ['直線や繰り返し模様が、拡張・除去した範囲の前後でつながっているかを確認する'],
  },
  {
    id: 'qa-perspective',
    target: '遠近法',
    origin: '9',
    relatedFeatures: ['transform-perspective', 'generative-expand'],
    possibleIssues: ['人物と背景で奥行きの向きが合わない'],
    checkPoints: ['床や壁の線の向きと、人物の大きさ・位置の釣り合いを確認する'],
  },
  {
    id: 'qa-light-shadow',
    target: '光源と影',
    origin: '4-2/9',
    relatedFeatures: ['harmonize', 'generative-fill'],
    possibleIssues: ['光の向きと影の向きが一致しない', '影が無い、または二重になる'],
    checkPoints: ['光が当たる側と影の落ちる側が、画像全体で一致しているかを確認する'],
  },
  {
    id: 'qa-color-match',
    target: '人物と背景の色味',
    origin: '9',
    relatedFeatures: ['harmonize', 'adjustment-layers', 'lr-batch'],
    possibleIssues: ['合成した人物だけが周囲と異なる色かぶりや明るさになる'],
    checkPoints: ['肌、白いドレス、背景の白い部分の色味を比較する'],
  },
  {
    id: 'qa-unintended-change',
    target: '元画像からの意図しない変化',
    origin: '4-2/9',
    relatedFeatures: ['generative-fill', 'text-based-edit', 'lr-prompt-to-edit'],
    possibleIssues: ['編集を指定していない範囲まで変化している'],
    checkPoints: ['編集前と編集後を切り替えて表示し、指定範囲の外に変化がないかを確認する'],
  },
];

export const qualityNote =
  'このアプリは画像を解析しません。ここに示す内容は確認の観点を整理したもので、品質判定を行った結果ではありません。また、画像の類似度などの数値だけで、人物の同一性やドレスの正確性を完全に保証することはできません。';
