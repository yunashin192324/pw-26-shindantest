import { features } from '../data/features';
import { productShortName } from '../data/products';
import type { Feature } from '../data/types';
import { provenanceLabel } from './provenance';

/** 比較表の行。値は登録された機能データから作る。データが無いものは null（未記載）。 */
export interface ComparisonRow {
  label: string;
  value: (f: Feature) => string | string[] | null;
}

export const comparisonRows: ComparisonRow[] = [
  { label: '目的', value: (f) => f.purpose },
  { label: '対応製品', value: (f) => f.products.map((p) => productShortName[p]) },
  { label: '入力', value: (f) => f.inputs },
  { label: '主な処理', value: (f) => f.processing },
  { label: '出力', value: (f) => f.outputs },
  { label: '適した用途', value: (f) => f.useCases },
  { label: '制約', value: (f) => f.limitations },
  { label: '自動化の可否', value: (f) => f.automation },
  { label: '元データの保持', value: (f) => f.dataPreservation },
  { label: '公式情報の確認状況', value: (f) => f.verificationStatus.map((s) => provenanceLabel[s]) },
];

/** 開発指示 7-5 の比較例。両方の比較対象がデータに存在するものだけを登録する。 */
export interface ComparisonPreset {
  label: string;
  featureIds?: string[];
  productIds?: string[];
  /** 比較対象のデータが存在しない場合の説明 */
  unavailableReason?: string;
}

export const comparisonPresets: ComparisonPreset[] = [
  { label: '生成塗りつぶしと生成拡張', featureIds: ['generative-fill', 'generative-expand'] },
  { label: '背景削除と選択とマスク', featureIds: ['remove-background', 'select-and-mask'] },
  { label: '通常のノイズ低減とAIノイズ除去', featureIds: ['sharpen-noise-reduction', 'lr-ai-denoise'] },
  { label: 'PhotoshopとLightroom', productIds: ['photoshop', 'lightroom'] },
  { label: 'PhotoshopとFirefly', productIds: ['photoshop', 'firefly'] },
  { label: 'LightroomとCamera Raw', productIds: ['lightroom', 'camera-raw'] },
  {
    label: '手動編集と自動処理',
    unavailableReason:
      '「手動編集」「自動処理」に相当する機能データが登録されていないため、比較表を作れません。存在しない仕様を補わないため、この比較は表示しません。',
  },
];

export function validFeatureIds(ids: string[]): string[] {
  const known = new Set(features.map((f) => f.id));
  return Array.from(new Set(ids.filter((id) => known.has(id))));
}

export function formatValue(v: string | string[] | null): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? v.join('、') : null;
  return v.trim() === '' ? null : v;
}
