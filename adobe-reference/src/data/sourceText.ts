/**
 * 元資料（Adobe製品の機能解説文書）の原文を保存する場所。
 *
 * 現状:
 *   開発時点（2026-10-21）で元資料の本文はリポジトリ・Issue・PR のいずれにも存在せず、
 *   提供されていない。そのため、ここには1件も登録していない。
 *   推測で文章を作ることは禁止されているため、空のままにしている。
 *
 * 元資料が提供されたときの登録方法:
 *   キーは各データの sourceTextKey（例: 'feature:generative-fill', 'section:2-2',
 *   'format:psd', 'automation:resize'）と一致させる。
 *   値は元資料の文章を改変せずにそのまま貼り付ける。段落は空行で区切る。
 *   登録すると、該当ページの「元資料の文章」欄と「収録対応表」に自動で反映される。
 *
 * 例:
 *   'feature:generative-fill': `（元資料の該当部分をそのまま貼り付ける）`,
 */
export const sourceText: Record<string, string> = {};

export function getSourceText(key: string): string | null {
  const value = sourceText[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
