/**
 * データ型の定義。
 *
 * 方針:
 * - 元資料（Adobe製品の機能解説文書）に書かれていない内容は推測で埋めない。
 *   値が無い項目は null とし、画面では「未記載」と表示する。
 * - 文字列ごとに「どこから来た情報か」を区別できるよう、情報区分（ProvenanceKind）を持たせる。
 */

/** 情報区分（開発指示 10-1 の区分 + 本アプリで追加した2区分） */
export type ProvenanceKind =
  | 'source' // 元資料の記載
  | 'official-confirmed' // Adobe公式資料で確認済み
  | 'official-partial' // 公式資料で一部確認済み
  | 'unverified' // 未確認
  | 'possibly-outdated' // 旧情報の可能性あり
  | 'external-dependency' // 外部サービスに依存
  | 'app-original' // アプリ独自の整理・解説
  | 'instruction' // 開発指示書に記載された構成・項目名（元資料の本文ではない）
  | 'source-missing'; // 元資料の本文が未提供のため未収録

export type ProductId =
  | 'photoshop'
  | 'lightroom'
  | 'camera-raw'
  | 'firefly'
  | 'illustrator'
  | 'express'
  | 'common';

export type TagId =
  | 'cutout'
  | 'background'
  | 'genai'
  | 'portrait'
  | 'dress'
  | 'color'
  | 'noise'
  | 'expand'
  | 'composite'
  | 'culling'
  | 'batch'
  | 'file'
  | 'automation'
  | 'qa';

/** 公式資料への参照。URLは実在を確認できたものだけを登録する。 */
export interface OfficialReference {
  title: string;
  url: string;
  /** 確認した日付（YYYY-MM-DD） */
  checkedOn: string;
  /** どのように確認したか */
  checkMethod: string;
  status: ProvenanceKind;
}

/** 関連機能へのリンク。featureId か to（画面のパス）のどちらかを持つ。 */
export interface RelatedLink {
  featureId?: string;
  to?: string;
  label?: string;
  /** 関連付けの根拠 */
  basis: ProvenanceKind;
  note?: string;
}

export interface Feature {
  id: string;
  title: string;
  /** 英語名。指示書に記載されたもののみ。 */
  englishName: string | null;
  products: ProductId[];
  /** 分類（指示書の節の区分に合わせる） */
  category: string;
  /** 所属する節の id（chapters.ts） */
  section: string;
  /** 用途タグ（アプリ独自の整理） */
  tags: TagId[];
  summary: string | null;
  purpose: string[] | null;
  inputs: string[] | null;
  processing: string[] | null;
  outputs: string[] | null;
  useCases: string[] | null;
  limitations: string[] | null;
  workflow: string[] | null;
  technicalDetails: string[] | null;
  /** 自動化の可否（比較用）。元資料に記載がなければ null */
  automation: string | null;
  /** 元データの保持（比較用）。元資料に記載がなければ null */
  dataPreservation: string | null;
  /** 関連機能・関連ページ。参照先が実在することをテストで検査する。 */
  relatedFeatures: RelatedLink[];
  sourceReferences: OfficialReference[];
  verificationStatus: ProvenanceKind[];
  /** 元資料の文章。sourceText.ts の該当キーから取得する。 */
  sourceTextKey: string;
  /**
   * 指示書が「元資料に含まれる」としている記載項目。
   * 元資料が提供された際に、この項目が揃っているかを検査するための一覧。
   */
  expectedSourceItems: string[];
  /** 指示書に記載された下位項目（項目名のみ） */
  instructionSubItems?: string[];
}

export interface Product {
  id: ProductId;
  name: string;
  /** 指示書での表記ゆれ・別称 */
  aliases: string[];
  /** 役割。元資料 6-2 に記載される想定。未提供のため null。 */
  role: string | null;
  /** 関連する章・節の id */
  sections: string[];
  officialRefs: OfficialReference[];
}

export interface SectionItem {
  /** 節内で一意の id（アンカーにも使う） */
  id: string;
  text: string;
  provenance: ProvenanceKind;
  /** 対応する機能ページ等 */
  link?: string;
}

export interface Section {
  id: string; // 例: '2-1'
  chapterId: string; // 例: 'ch2'
  title: string;
  /** 指示書に記載された収録項目 */
  items: SectionItem[];
  /** この節に属する機能 id（features.ts の section と一致すること） */
  featureIds: string[];
  /** 元資料の本文キー */
  sourceTextKey: string;
  /** 補足（表の列名、図の説明など） */
  notes?: SectionItem[];
  /** 節内に表・図・工程がある場合の種別 */
  blocks?: SectionBlock[];
}

export type SectionBlock =
  | { kind: 'flow'; id: string; title: string; steps: string[]; provenance: ProvenanceKind; caption?: string }
  | {
      kind: 'table';
      id: string;
      title: string;
      columns: string[];
      rows: { key: string; cells: (string | null)[]; link?: string }[];
      provenance: ProvenanceKind;
      caption?: string;
    }
  | { kind: 'image-missing'; id: string; title: string; caption: string };

export interface Chapter {
  id: string;
  number: number;
  title: string;
  sections: Section[];
  /** 章全体の収録項目（節を持たない記述） */
  items: SectionItem[];
  sourceTextKey: string;
}

export interface FileFormat {
  id: string;
  name: string;
  usage: string | null;
  characteristics: string | null;
  sourceTextKey: string;
  relatedProducts: ProductId[];
  officialStatus: ProvenanceKind;
}

export type AutomationState =
  | 'routine' // 定型処理として実装しやすい
  | 'ai-assist' // AIによる支援が可能
  | 'external' // 外部連携が必要
  | 'human' // 人間の確認が必要
  | 'unverified'; // 未確認

export interface AutomationTask {
  id: string;
  task: string;
  method: string | null;
  requiredInputs: string | null;
  outputs: string | null;
  humanReview: string | null;
  constraints: string | null;
  cautions: string | null;
  states: AutomationState[];
  sourceTextKey: string;
  relatedFeatures: string[];
  officialRefs: OfficialReference[];
}

export interface WorkflowStep {
  id: string;
  order: number;
  title: string;
  description: string | null;
  relatedFeatures: string[];
  relatedPages: { label: string; to: string }[];
}

export interface QualityCheckItem {
  id: string;
  target: string;
  /** 元資料 4-2 に含まれる項目か、指示書 9 で追加された検査対象か */
  origin: '4-2' | '9' | '4-2/9';
  relatedFeatures: string[];
  /** 想定される問題（アプリ独自の整理） */
  possibleIssues: string[];
  /** 確認すべき事項（アプリ独自の整理） */
  checkPoints: string[];
}
