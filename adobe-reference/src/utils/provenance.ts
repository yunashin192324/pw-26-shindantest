import type { ProvenanceKind } from '../data/types';

export const provenanceLabel: Record<ProvenanceKind, string> = {
  source: '元資料の記載',
  'official-confirmed': 'Adobe公式資料で確認済み',
  'official-partial': '公式資料で一部確認済み',
  unverified: '未確認',
  'possibly-outdated': '旧情報の可能性あり',
  'external-dependency': '外部サービスに依存',
  'app-original': 'アプリ独自の整理・解説',
  instruction: '開発指示書の記載',
  'source-missing': '元資料本文：未提供',
};

export const provenanceDescription: Record<ProvenanceKind, string> = {
  source: '元資料（Adobe製品の機能解説文書）に書かれている内容です。',
  'official-confirmed': 'Adobe公式のヘルプ、製品情報、リリースノートで内容を照合し、一致を確認した内容です。',
  'official-partial': 'Adobe公式資料で一部のみ照合できた内容です。',
  unverified: 'Adobe公式資料との照合をしていない内容です。',
  'possibly-outdated': '時点によって変わる情報で、現在は異なる可能性がある内容です。',
  'external-dependency': 'Adobeのサービスなど、このアプリの外部にある仕組みに依存する内容です。',
  'app-original': 'このアプリが独自に整理・解説した内容です。元資料の記載ではありません。',
  instruction:
    'このアプリの開発指示書に、元資料の構成・項目名として書かれていた内容です。元資料の本文そのものではありません。',
  'source-missing': '元資料の本文が提供されていないため、この項目の文章は収録していません。',
};

/** 画面での色分け用 */
export const provenanceTone: Record<ProvenanceKind, 'ok' | 'warn' | 'muted' | 'info' | 'alert'> = {
  source: 'ok',
  'official-confirmed': 'ok',
  'official-partial': 'info',
  unverified: 'muted',
  'possibly-outdated': 'warn',
  'external-dependency': 'info',
  'app-original': 'info',
  instruction: 'muted',
  'source-missing': 'alert',
};

export const allProvenanceKinds = Object.keys(provenanceLabel) as ProvenanceKind[];
