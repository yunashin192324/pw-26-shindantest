/**
 * setupFormItemMasterAutoFill.gs
 * 実際のカウンセリングシートの質問文（ユーザー提供の実データ）に基づき、FormItemMasterのD〜H列
 * （格納先テーブル・格納先列・分岐・型・正規化ルールID）を、質問文の一致から自動的に埋める。
 *
 * 挙式用とフォト用で【まったく同じ質問文】が使われている項目が6ペアあり
 * （例：「お衣裳についてお聞かせ下さい。」が挙式・フォト両方に存在）、これらは自動判定できない
 * ため、AMBIGUOUS_PAIRS_ に明記した上で該当行に警告を残し、人の確認に委ねる。
 *
 * 実行方法：setupFormItemMaster() を実行して質問ID・質問文を取り込んだ後、
 * autoFillFormItemMaster() を実行する。何度実行しても、既に埋まっている行は上書きしない。
 */

// No（第1章6章の項番相当）: { keywords: [質問文に含まれるはずのキーワード群（すべて含めばマッチ）],
//   internalName, table, column, branch, type, norm, ambiguous(重複質問文のため自動判定不可) }
const FORM_ITEM_DEFINITIONS_ = [
  { no: 1, keywords: ['タイムスタンプ'], internalName: 'タイムスタンプ', table: 'Cases', column: '受付日時', branch: '共通', type: 'Datetime' },
  { no: 2, keywords: ['メールアドレス'], internalName: 'メールアドレス', table: 'Customers', column: '代表メール', branch: '共通', type: '文字列' },
  { no: 3, keywords: ['個人情報について', '個人情報の取扱い'], internalName: '個人情報の取扱いに関する同意', table: '', column: '', branch: '共通', type: '文字列', note: 'FormResponses原本のみに残す' },
  { no: 4, keywords: ['ご相談されている', '店舗名'], internalName: 'ご相談店舗名', table: 'Cases', column: '店舗ID', branch: '共通', type: '文字列', note: '店舗マスタと照合してSTORE_IDへ変換' },
  { no: 5, keywords: ['ご相談予定日'], internalName: 'ご相談予定日', table: 'Cases', column: '相談予定日', branch: '共通', type: 'Date' },
  { no: 6, keywords: ['ご新郎様', 'お名前', '漢字'], internalName: '新郎氏名（漢字）', table: 'Customers', column: '新郎姓', branch: '共通', type: '文字列', note: '姓名一体入力のためフルネームを新郎姓に入れる' },
  { no: 7, keywords: ['ご新郎様', 'お名前', 'カタカナ'], internalName: '新郎氏名（カナ）', table: 'Customers', column: '新郎カナ', branch: '共通', type: '文字列' },
  { no: 8, keywords: ['ご新郎様', 'ご年齢'], internalName: '新郎年齢', table: 'Customers', column: '新郎年齢', branch: '共通', type: '数値' },
  { no: 9, keywords: ['ご新郎様', '電話番号'], internalName: '新郎電話', table: 'Customers', column: '新郎電話', branch: '共通', type: '文字列' },
  { no: 10, keywords: ['ご新郎様', 'ご住所'], internalName: '新郎住所', table: 'Customers', column: '新郎住所', branch: '共通', type: '文字列' },
  { no: 11, keywords: ['ご新婦様', 'お名前', '漢字'], internalName: '新婦氏名（漢字）', table: 'Customers', column: '新婦姓', branch: '共通', type: '文字列' },
  { no: 12, keywords: ['ご新婦様', 'お名前', 'カタカナ'], internalName: '新婦氏名（カナ）', table: 'Customers', column: '新婦カナ', branch: '共通', type: '文字列' },
  { no: 13, keywords: ['ご新婦様', 'ご年齢'], internalName: '新婦年齢', table: 'Customers', column: '新婦年齢', branch: '共通', type: '数値' },
  { no: 14, keywords: ['ご新婦様', '電話番号'], internalName: '新婦電話', table: 'Customers', column: '新婦電話', branch: '共通', type: '文字列' },
  { no: 15, keywords: ['ご新婦様', 'ご住所', '同上'], internalName: '新婦住所', table: 'Customers', column: '新婦住所', branch: '共通', type: '文字列', norm: 'N-02' },
  { no: 16, keywords: ['優先連絡先'], internalName: '優先連絡先', table: 'Customers', column: '優先連絡先', branch: '共通', type: '文字列' },
  { no: 17, keywords: ['ご入籍はされていらっしゃいますか'], internalName: '入籍状況', table: 'Customers', column: '入籍状況', branch: '共通', type: '文字列' },
  { no: 18, keywords: ['どのようにお知りになりましたか', 'ご来店のきっかけ'], internalName: '流入経路', table: 'Cases', column: '流入経路', branch: '共通', type: '複数選択', norm: 'N-01', note: 'このまま媒体としても流用する（Q&A一巡目G-18）' },
  { no: 19, keywords: ['検索ワードをお教えください'], internalName: '検索ワード', table: 'Cases', column: '検索ワード', branch: '共通', type: '文字列' },
  { no: 20, keywords: ['弊社へのご来店をご希望頂いた理由'], internalName: '来店理由', table: 'Cases', column: '来店理由', branch: '共通', type: '複数選択', norm: 'N-01' },
  { no: 21, keywords: ['ご相談内容をお選び下さい①'], internalName: '相談内容①', table: '', column: '', branch: '共通', type: '文字列', note: '分岐トリガー。内部項目名は必ず「相談内容①」のままにする' },
  { no: 22, keywords: ['ご相談内容をお選び下さい②'], internalName: '相談内容', table: 'Cases', column: '相談内容', branch: '共通', type: '文字列' },
  { no: 23, keywords: ['挙式のご予定時期'], internalName: '挙式予定時期', table: 'WeddingRequests', column: '挙式予定時期', branch: '挙式のみ', type: '文字列' },
  { no: 24, keywords: ['具体的な日程をお聞かせ下さい', '２０２５年１１月２２日'], internalName: '具体的な挙式予定日', table: 'WeddingRequests', column: '具体的な挙式予定日', branch: '挙式のみ', type: 'Date', norm: 'N-03' },
  { no: 25, keywords: ['リゾート・海外挙式を選ばれた理由'], internalName: 'リゾート・海外挙式を選んだ理由', table: 'WeddingRequests', column: 'リゾート・海外挙式を選んだ理由', branch: '挙式のみ', type: '文字列' },
  { no: 26, keywords: ['ご希望の挙式エリア'], internalName: '希望挙式エリア', table: 'WeddingRequests', column: '希望挙式エリア', branch: '挙式のみ', type: '複数選択', norm: 'N-01' },
  { no: 27, keywords: ['具体的な国名や都市名'], internalName: '具体的な国名・都市名', table: 'WeddingRequests', column: '具体的な国名・都市名', branch: '挙式のみ', type: '文字列' },
  { no: 28, keywords: ['ご希望のエリア・都市を選ばれた理由'], internalName: 'エリア・都市を選んだ理由', table: 'WeddingRequests', column: 'エリア・都市を選んだ理由', branch: '挙式のみ', type: '文字列', ambiguous: 47 },
  { no: 29, keywords: ['気になる式場がございましたら'], internalName: '気になる式場', table: 'WeddingRequests', column: '気になる式場', branch: '挙式のみ', type: '複数選択', norm: 'N-01' },
  { no: 30, keywords: ['気になる式場をお選びいただいた理由'], internalName: '式場を選んだ理由', table: 'WeddingRequests', column: '式場を選んだ理由', branch: '挙式のみ', type: '文字列' },
  { no: 31, keywords: ['具体的にお決まりでない方は'], internalName: '未確定チェック項目（挙式）', table: 'WeddingRequests', column: '未確定チェック項目', branch: '挙式のみ', type: '複数選択', ambiguous: 49 },
  { no: 32, keywords: ['お衣裳についてお聞かせ下さい'], internalName: '衣裳の希望（挙式）', table: 'WeddingRequests', column: '衣裳の希望', branch: '挙式のみ', type: '文字列', ambiguous: 50 },
  { no: 33, keywords: ['着たいドレスブランド'], internalName: '希望ドレスブランド', table: 'WeddingRequests', column: '希望ドレスブランド', branch: '挙式のみ', type: '文字列' },
  { no: 34, keywords: ['お二人の旅費＋挙式'], internalName: '予算（旅費＋挙式）', table: 'WeddingRequests', column: '予算（旅費＋挙式）', branch: '挙式のみ', type: '文字列' },
  { no: 35, keywords: ['挙式後', '現地にてパーティーや会食'], internalName: '現地パーティー・会食の希望有無（挙式）', table: 'WeddingRequests', column: '現地パーティー・会食の希望有無', branch: '挙式のみ', type: '文字列' },
  { no: 36, keywords: ['リゾート挙式以外に', '国内でのお披露目パーティーについて'], internalName: '国内お披露目パーティーの希望', table: 'WeddingRequests', column: '国内お披露目パーティーの希望', branch: '挙式のみ', type: '文字列' },
  { no: 37, keywords: ['帰国後お披露目パーティー'], internalName: '国内パーティー詳細', table: 'WeddingRequests', column: '国内パーティー詳細', branch: '挙式のみ', type: '文字列' },
  { no: 38, keywords: ['リゾート挙式以外に', '前撮り'], internalName: '国内前撮りの予定有無（挙式）', table: 'WeddingRequests', column: '国内前撮りの予定有無', branch: '挙式のみ', type: '文字列' },
  { no: 39, keywords: ['弊社とのご相談前に既に足を運ばれた', '複数回答可'], internalName: '相談前に接触済みの他社（挙式）', table: 'WeddingRequests', column: '相談前に接触済みの他社', branch: '挙式のみ', type: '複数選択', norm: 'N-01' },
  { no: 40, keywords: ['これから足を運ばれるご予定の', '複数回答可'], internalName: '今後接触予定の他社（挙式）', table: 'WeddingRequests', column: '今後接触予定の他社', branch: '挙式のみ', type: '複数選択', norm: 'N-01' },
  { no: 41, keywords: ['ご旅行期間についてお聞かせ下さい'], internalName: '旅行期間（挙式）', table: 'WeddingRequests', column: '旅行期間', branch: '挙式のみ', type: '文字列', ambiguous: 57 },
  { no: 42, keywords: ['希望発着地についてお聞かせ下さい'], internalName: '希望発着地（挙式）', table: 'WeddingRequests', column: '希望発着地', branch: '挙式のみ', type: '文字列', ambiguous: 56 },
  { no: 43, keywords: ['新郎様側', '参列予定人数'], internalName: '新郎側参列予定人数', table: 'WeddingRequests', column: '新郎側参列予定人数', branch: '挙式のみ', type: '数値' },
  { no: 44, keywords: ['新婦様側', '参列予定人数'], internalName: '新婦側参列予定人数', table: 'WeddingRequests', column: '新婦側参列予定人数', branch: '挙式のみ', type: '数値' },
  { no: 45, keywords: ['最後に何かご不安なこと'], internalName: '不安・心配事項（挙式）', table: 'WeddingRequests', column: '不安・心配事項', branch: '挙式のみ', type: '文字列', ambiguous: 64 },
  { no: 46, keywords: ['ご検討頂いているウェディングフォトのエリア'], internalName: '希望フォトエリア', table: 'PhotoRequests', column: '希望フォトエリア', branch: 'フォトのみ', type: '複数選択' },
  { no: 47, keywords: ['ご希望のエリア・都市を選ばれた理由'], internalName: 'エリア・都市を選んだ理由（フォト）', table: 'PhotoRequests', column: 'エリア・都市を選んだ理由', branch: 'フォトのみ', type: '文字列', ambiguous: 28 },
  { no: 48, keywords: ['気になるウェディングフォトプラン'], internalName: '気になるフォトプラン', table: 'PhotoRequests', column: '気になるフォトプラン', branch: 'フォトのみ', type: '複数選択' },
  { no: 49, keywords: ['具体的にお決まりでない方は'], internalName: '未確定チェック項目（フォト）', table: 'PhotoRequests', column: '未確定チェック項目', branch: 'フォトのみ', type: '複数選択', ambiguous: 31 },
  { no: 50, keywords: ['お衣裳についてお聞かせ下さい'], internalName: '衣裳の希望（フォト）', table: 'PhotoRequests', column: '衣裳の希望', branch: 'フォトのみ', type: '文字列', ambiguous: 32 },
  { no: 51, keywords: ['ウェディングフォトのご予定時期'], internalName: '撮影予定時期', table: 'PhotoRequests', column: '撮影予定時期', branch: 'フォトのみ', type: '文字列' },
  { no: 52, keywords: ['具体的な日程をお聞かせ下さい', '２０２６年'], internalName: '具体的な撮影予定日', table: 'PhotoRequests', column: '具体的な撮影予定日', branch: 'フォトのみ', type: 'Date', norm: 'N-03' },
  { no: 53, keywords: ['ご日程にこだわりはございますか'], internalName: '日程優先度', table: 'PhotoRequests', column: '日程優先度', branch: 'フォトのみ', type: '文字列' },
  { no: 54, keywords: ['お二人の旅費＋フォト'], internalName: '予算（旅費＋フォト）', table: 'PhotoRequests', column: '予算（旅費＋フォト）', branch: 'フォトのみ', type: '文字列' },
  { no: 55, keywords: ['旅行についてお聞かせください'], internalName: '旅行の有無', table: 'PhotoRequests', column: '旅行の有無', branch: 'フォトのみ', type: '文字列' },
  { no: 56, keywords: ['希望発着地についてお聞かせ下さい'], internalName: '希望発着地（フォト）', table: 'PhotoRequests', column: '希望発着地', branch: 'フォトのみ', type: '文字列', ambiguous: 42 },
  { no: 57, keywords: ['ご旅行期間についてお聞かせ下さい'], internalName: '旅行期間（フォト）', table: 'PhotoRequests', column: '旅行期間', branch: 'フォトのみ', type: '文字列', ambiguous: 41 },
  { no: 58, keywords: ['結婚式についてお聞かせください'], internalName: '結婚式（挙式）の予定有無', table: 'PhotoRequests', column: '結婚式（挙式）の予定有無', branch: 'フォトのみ', type: '文字列' },
  { no: 59, keywords: ['フォト撮影にご同行予定人数'], internalName: '撮影同行予定人数', table: 'PhotoRequests', column: '撮影同行予定人数', branch: 'フォトのみ', type: '数値' },
  { no: 60, keywords: ['フォト撮影後', '現地にてパーティーや会食'], internalName: '現地パーティー・会食の希望有無（フォト）', table: 'PhotoRequests', column: '現地パーティー・会食の希望有無', branch: 'フォトのみ', type: '文字列' },
  { no: 61, keywords: ['フォトウェディング以外に', 'お披露目パーティーのご予定'], internalName: '国内お披露目パーティーの予定', table: 'PhotoRequests', column: '国内お披露目パーティーの予定', branch: 'フォトのみ', type: '文字列' },
  { no: 62, keywords: ['弊社とのご相談前に既に足を運ばれた'], internalName: '相談前に接触済みの他社（フォト）', table: 'PhotoRequests', column: '相談前に接触済みの他社', branch: 'フォトのみ', type: '文字列' },
  { no: 63, keywords: ['これから足を運ばれるご予定の'], internalName: '今後接触予定の他社（フォト）', table: 'PhotoRequests', column: '今後接触予定の他社', branch: 'フォトのみ', type: '文字列' },
  { no: 64, keywords: ['最後に何かご不安なこと'], internalName: '不安・心配事項（フォト）', table: 'PhotoRequests', column: '不安・心配事項', branch: 'フォトのみ', type: '文字列', ambiguous: 45 },
  { no: 65, keywords: ['情報収集の際', 'SNS'], internalName: '情報収集に使うSNS等', table: 'PhotoRequests', column: '情報収集に使うSNS等', branch: 'フォトのみ', type: '複数選択', norm: 'N-01' },
  { no: 66, keywords: ['お申し込みされる際に', '重視するポイント'], internalName: '申込時に重視するポイント', table: 'PhotoRequests', column: '申込時に重視するポイント', branch: 'フォトのみ', type: '複数選択', norm: 'N-01' },
  { no: 67, keywords: ['ご希望のウェディングフォトについて最も近い項目'], internalName: '希望フォトタイプ', table: 'PhotoRequests', column: '希望フォトタイプ', branch: 'フォトのみ', type: '文字列' },
  { no: 68, keywords: ['フォトウェディング以外に', '前撮り'], internalName: '国内前撮りの予定有無（フォト）', table: 'PhotoRequests', column: '国内前撮りの予定有無', branch: 'フォトのみ', type: '文字列' },
  { no: 69, keywords: ['HISで「旅行」を今まで利用'], internalName: 'HIS旅行の利用・申込経験有無', table: '', column: '', branch: '共通', type: '文字列', note: '格納先未定義。運用側でCustomersへの追加列等を検討' }
];

/**
 * 質問文重複により自動判定できないペア（一覧化。setupFormItemMaster実行後は必ずこのペアだけ
 * 目視で確認する。それ以外は自動で埋まる）。
 */
const AMBIGUOUS_PAIRS_ = [[28, 47], [31, 49], [32, 50], [41, 57], [42, 56], [45, 64]];

function normalizeQuestionText_(text) {
  return String(text || '').replace(/\s+/g, '');
}

/**
 * FormItemMasterのうち、格納先テーブルが未入力の行を対象に、質問文とFORM_ITEM_DEFINITIONS_の
 * キーワード集合を照合して自動的にD〜H列を埋める。複数の定義がマッチした場合（＝質問文重複）は
 * 自動判定せず、備考列に警告を残すだけにする。
 */
function autoFillFormItemMaster() {
  const sheet = getSheet_(SHEET_NAMES.FORM_ITEM_MASTER);
  const rows = sheetToObjects_(sheet);
  let filled = 0;
  let ambiguousCount = 0;

  rows.forEach(function (row) {
    if (row.格納先テーブル) return; // 既に埋まっている行はスキップ
    const normalized = normalizeQuestionText_(row['質問文（現在）']);
    const matches = FORM_ITEM_DEFINITIONS_.filter(function (def) {
      return def.keywords.every(function (kw) { return normalized.indexOf(normalizeQuestionText_(kw)) !== -1; });
    });

    if (matches.length === 1) {
      const def = matches[0];
      updateRowByKey_(sheet, 'ITEM_ID', row.ITEM_ID, {
        内部項目名: def.internalName,
        格納先テーブル: def.table,
        格納先列: def.column,
        分岐: def.branch,
        型: def.type,
        正規化ルールID: def.norm || '',
        備考: (def.note || '') + '（自動判定 No.' + def.no + '）'
      });
      filled++;
    } else if (matches.length > 1) {
      updateRowByKey_(sheet, 'ITEM_ID', row.ITEM_ID, {
        備考: '⚠質問文が重複しているため自動判定できません。候補No: ' + matches.map(function (m) { return m.no; }).join('/') +
          '。フォーム上での表示順（挙式パート／フォトパートどちらに出てくるか）を見て手動で確定してください。'
      });
      ambiguousCount++;
    }
  });

  Logger.log('FormItemMaster自動判定：' + filled + '件を自動入力、' + ambiguousCount + '件は質問文重複のため要手動確認。' +
    '要確認ペア一覧：' + JSON.stringify(AMBIGUOUS_PAIRS_));
}
