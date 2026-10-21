import { officialRefs as r } from './officialRefs';
import type { Product, ProductId, TagId } from './types';

/**
 * 製品データ。
 * role（役割）は元資料 6-2「各製品の役割を元資料に沿って説明」に対応するが、
 * 元資料本文が未提供のため null にしている。
 */
export const products: Product[] = [
  {
    id: 'photoshop',
    name: 'Adobe Photoshop',
    aliases: ['Photoshop', 'フォトショップ', 'PS'],
    role: null,
    sections: ['1', '2-1', '2-2', '2-3', '2-4', '6-2'],
    officialRefs: [r.psHelp, r.psWhatsNew, r.psReleaseNotes, r.psGenAiOverview],
  },
  {
    id: 'lightroom',
    name: 'Adobe Lightroom',
    aliases: ['Lightroom', 'ライトルーム', 'LR'],
    role: null,
    sections: ['1', '3-1', '3-2', '3-3', '3-4', '3-5'],
    officialRefs: [r.lrHelp, r.lrWhatsNew, r.lrReleaseNotes, r.lrcReleaseNotes],
  },
  {
    id: 'camera-raw',
    name: 'Adobe Camera Raw',
    aliases: ['Camera Raw', 'カメラロー', 'ACR'],
    role: null,
    sections: ['1', '6-2'],
    officialRefs: [r.acrGenerativeExpand, r.acrAiEditStatus],
  },
  {
    id: 'firefly',
    name: 'Adobe Firefly',
    aliases: ['Firefly', 'ファイアフライ'],
    role: null,
    sections: ['1', '6-1', '6-2'],
    officialRefs: [r.fireflyFaq, r.fireflyCredits, r.partnerModels],
  },
  {
    id: 'illustrator',
    name: 'Adobe Illustrator',
    aliases: ['Illustrator', 'イラストレーター', 'AI'],
    role: null,
    sections: ['6-2'],
    officialRefs: [r.illustratorFirefly],
  },
  {
    id: 'express',
    name: 'Adobe Express',
    aliases: ['Express', 'エクスプレス'],
    role: null,
    sections: ['6-2'],
    officialRefs: [r.expressHelp, r.expressWhatsNew],
  },
  {
    id: 'common',
    name: '共通・技術仕様',
    aliases: ['共通', '技術仕様'],
    role: null,
    sections: ['4-1', '4-2', '4-3', '5-1', '5-2'],
    officialRefs: [],
  },
];

export const productById = Object.fromEntries(products.map((p) => [p.id, p])) as Record<ProductId, Product>;

export const productShortName: Record<ProductId, string> = {
  photoshop: 'Photoshop',
  lightroom: 'Lightroom',
  'camera-raw': 'Camera Raw',
  firefly: 'Firefly',
  illustrator: 'Illustrator',
  express: 'Express',
  common: '共通・技術仕様',
};

/** 用途タグ（開発指示 7-3 の一覧）。機能への割り当てはアプリ独自の整理。 */
export const tags: { id: TagId; label: string }[] = [
  { id: 'cutout', label: '人物の切り抜き' },
  { id: 'background', label: '背景の編集' },
  { id: 'genai', label: '生成AI' },
  { id: 'portrait', label: '人物の補正' },
  { id: 'dress', label: 'ドレス・衣装' },
  { id: 'color', label: '色調補正' },
  { id: 'noise', label: 'ノイズ除去' },
  { id: 'expand', label: '画像の拡張' },
  { id: 'composite', label: '合成' },
  { id: 'culling', label: '写真選別' },
  { id: 'batch', label: '一括処理' },
  { id: 'file', label: 'ファイル管理' },
  { id: 'automation', label: '自動化' },
  { id: 'qa', label: '品質検査' },
];

export const tagLabel = Object.fromEntries(tags.map((t) => [t.id, t.label])) as Record<TagId, string>;
