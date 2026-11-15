/**
 * setupFormItemMaster.gs
 * 第3章3-1章：初期セットアップ。
 * 現行フォームの全質問について質問IDを一括取得し、FormItemMasterの雛形を自動生成する。
 * FormApp.openById(FORM_ID).getItems() を全件ループし、ID・質問文をB～C列に書き出す。
 * 書き出し後、D～H（格納先テーブル・格納先列・分岐・型・正規化ルールID）は
 * 第1章6章・第2章の対応表を見ながら人が確認して手動で埋める。
 *
 * 実行方法：setupFormItemMaster() を実行する。FORM_IDはSettingsシートの FORM_ID を使う
 * （第3章7章：11nTvJm6I0jRwiPi0iAItbmFrmwZW8XfqCceepBmAuxU が確認済み）。
 */
function setupFormItemMaster() {
  const formId = getSetting_('FORM_ID', '');
  if (!formId) {
    throw new AppError('SYSTEM', 'SettingsシートにFORM_IDが設定されていません。');
  }
  const form = FormApp.openById(formId);
  const items = form.getItems();
  const sheet = getSheet_(SHEET_NAMES.FORM_ITEM_MASTER);
  const existingIds = getColumnValues_(sheet, 'ITEM_ID');

  items.forEach(function (item) {
    const itemId = String(item.getId());
    if (existingIds.indexOf(itemId) !== -1) return; // 既存分はスキップ（再実行しても重複しない）
    appendRowFromObject_(sheet, {
      ITEM_ID: itemId,
      '質問文（現在）': item.getTitle(),
      内部項目名: '',
      格納先テーブル: '',
      格納先列: '',
      分岐: '',
      型: '',
      正規化ルールID: '',
      有効フラグ: true,
      登録日: new Date(),
      備考: '初期セットアップで自動生成。D〜H列を手動で埋めてください。'
    });
  });

  Logger.log('FormItemMasterの初期セットアップが完了しました。質問数: ' + items.length);
}

/**
 * 第3章5章：質問が削除された場合の運用。マスタにあるのに回答シート側から質問IDが来なくなった場合は、
 * そのITEM_IDのI列（有効フラグ）を手動でFALSEにする。この関数はその操作を補助する。
 */
function disableFormItem(itemId) {
  updateRowByKey_(getSheet_(SHEET_NAMES.FORM_ITEM_MASTER), 'ITEM_ID', String(itemId), { 有効フラグ: false });
}
