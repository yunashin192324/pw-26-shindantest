/**
 * setupDatabase.gs
 * 第7章7-1章：既存の回答シートとは別に、新規のCRM専用データベース・スプレッドシートを1つ作成し、
 * シート一覧（＋補助シート）をすべて作成する初期セットアップスクリプト。
 *
 * v2：実際の運用ヒアリング（カウンセリングシート・手配課シート・旧日報ダッシュボード・
 * Q&A一巡目）を反映し、以下の点を当初のPDF設計書から変更している。
 *   ・日報は独立記録ではなく、カウンセリングシート回答（Cases）にひもづく接客結果として統合
 *   ・見積（Quotes）機能は撤去
 *   ・チャレンジ番号・媒体・問合せ方法は「案件」に1つだけ持つ（接客のたびに聞き直さない）
 *   ・CPL旅行・列席旅行人数は「契約（成約時確定情報）」に配置
 *   ・国内地方（Regions）・海外方面（Areas）を実データに更新、都市は方面配下に整理
 *   ・「経過メモ」（後日の電話対応等の追記ログ）を新設
 *   ・店舗区分（一般／AVA）・地方を店舗マスタに追加
 *   ・前年実績の遡及入力（HistoricalActuals）を新設
 *
 * 実行方法：
 *   1. Apps Scriptエディタでこのファイルを開き、setupDatabase() を選択して実行する。
 *   2. 実行後、生成されたスプレッドシートのURLがログに出力される。
 *      同時にスクリプトプロパティ DB_SPREADSHEET_ID にIDが保存され、以後のすべての処理が
 *      このスプレッドシートを参照するようになる。
 *   3. 既存のCRM用スプレッドシートを再利用したい場合は、事前にスクリプトプロパティ
 *      DB_SPREADSHEET_ID を手動でセットしてから実行すれば、新規作成をスキップしてシート追加のみ行う。
 */

const SHEET_DEFINITIONS_ = [
  { name: SHEET_NAMES.FORM_RESPONSES, headers: ['受信日時', 'FORM_RESPONSE_ID', 'CASE_ID', '生データJSON'] },
  { name: SHEET_NAMES.UNMAPPED_RESPONSES, headers: ['受信日時', 'FORM_RESPONSE_ID', 'ITEM_ID', '質問文', '回答値', '処理済み'] },
  {
    // 相談内容①(分岐)・チャレンジ番号・問合せ方法・媒体は「案件」に1つだけ持つ（Q&A一巡目 C-8, G-18, G-19）
    name: SHEET_NAMES.CASES,
    headers: ['CASE_ID', 'FORM_RESPONSE_ID', '登録経路', '受付日時', '相談予定日', '店舗ID', '担当者ID', 'CUSTOMER_ID',
      '相談区分', '相談内容', 'チャレンジ番号', '問合せ方法', '媒体', '流入経路', '検索ワード', '来店理由',
      '案件状態', '現在担当部署', '作成日時', '更新日時']
  },
  {
    name: SHEET_NAMES.CUSTOMERS,
    headers: ['CUSTOMER_ID', 'CASE_ID', '新郎姓', '新郎名', '新郎カナ', '新郎年齢', '新郎電話', '新郎住所',
      '新婦姓', '新婦名', '新婦カナ', '新婦年齢', '新婦電話', '新婦住所', '代表メール', '優先連絡先', '入籍状況']
  },
  {
    name: SHEET_NAMES.WEDDING_REQUESTS,
    headers: ['CASE_ID', '挙式予定時期', '具体的な挙式予定日', 'リゾート・海外挙式を選んだ理由', '希望挙式エリア',
      '具体的な国名・都市名', 'エリア・都市を選んだ理由', '気になる式場', '式場を選んだ理由', '未確定チェック項目',
      '衣裳の希望', '希望ドレスブランド', '予算（旅費＋挙式）', '現地パーティー・会食の希望有無',
      '国内お披露目パーティーの希望', '国内パーティー詳細', '国内前撮りの予定有無', '相談前に接触済みの他社',
      '今後接触予定の他社', '旅行期間', '希望発着地', '新郎側参列予定人数', '新婦側参列予定人数', '不安・心配事項']
  },
  {
    name: SHEET_NAMES.PHOTO_REQUESTS,
    headers: ['CASE_ID', '希望フォトエリア', 'エリア・都市を選んだ理由', '気になるフォトプラン', '未確定チェック項目',
      '衣裳の希望', '撮影予定時期', '具体的な撮影予定日', '日程優先度', '予算（旅費＋フォト）', '旅行の有無',
      '希望発着地', '旅行期間', '結婚式（挙式）の予定有無', '撮影同行予定人数', '現地パーティー・会食の希望有無',
      '国内お披露目パーティーの予定', '相談前に接触済みの他社', '今後接触予定の他社', '不安・心配事項',
      '情報収集に使うSNS等', '申込時に重視するポイント', '希望フォトタイプ', '国内前撮りの予定有無']
  },
  {
    // 実際に使っている接客履歴シートの項目（日付・媒体・窓口・担当・備考）にそのまま合わせている
    // （Q&A九巡目）。媒体＝お客様とのやり取りに使ったツール（電話/メール/郵送は着信・発信/受領・送付を
    // 区別、来店、オンライン）、窓口＝相手方（新郎／新婦／その他）。以前あった区分（新規/既存の自動判定）・
    // 商談内容・結果・次回来店日は実シートに無いため廃止し、備考（自由記述）に統合した。
    name: SHEET_NAMES.SALES_HISTORY,
    headers: ['HISTORY_ID', 'CASE_ID', '日付', '媒体', '窓口', '担当', '備考', '登録日時']
  },
  {
    // 経過メモ：後日の電話対応など、正式な接客記録ではない経過を随時追記するログ（新設）
    name: SHEET_NAMES.CASE_NOTES,
    headers: ['MEMO_ID', 'CASE_ID', '投稿者', '投稿日時', '内容']
  },
  {
    // 案件メモ（構造化・1案件1行）。実際の接客記録シートの備考欄にある固定見出し（CPLこんな方です／
    // 時期／エリア／ゲスト・パーティー／式場／旅行／お披露目・前撮り／TAVICA／結果）をそのまま再現し、
    // 案件の理解が進むにつれて随時更新していく自由記述のサマリーとして扱う（Q&A九巡目）。
    // カウンセリングシート由来のWeddingRequests/PhotoRequestsとは別物（あちらは初回回答の記録、
    // こちらは接客を重ねる中で分かってきたことを人が要約するメモ）。
    name: SHEET_NAMES.CASE_SUMMARY_MEMO,
    headers: ['CASE_ID', 'CPLこんな方です', '時期', 'エリア', 'ゲスト・パーティー', '式場', '旅行',
      'お披露目・前撮り', 'TAVICA', '結果', '更新日時', '更新者']
  },
  {
    // 方面・CPL旅行人数・列席旅行人数を追加（Q&A一巡目 C-9, G-17）。見積（Quotes）は撤去。
    name: SHEET_NAMES.CONTRACTS,
    headers: ['CONTRACT_ID', 'CASE_ID', '契約日', '商品', 'プラン', '方面', '国', '都市', '式場', '現地会社',
      'CPL旅行人数', '列席旅行人数', '旅行代金', '挙式代金', '衣装代金', 'オプション', '売上', '利益', '契約担当', '有効フラグ']
  },
  {
    name: SHEET_NAMES.LOST_CASES,
    headers: ['LOST_ID', 'CASE_ID', '種別', '未成約日', '未成約理由カテゴリ', '未成約理由その他', '競合会社ID',
      '競合会社（自由記述）', '詳細', '担当者']
  },
  {
    // 実際の手配課シート（A〜P列）にそのまま合わせている。早期納品フラグのような独立項目は無く、
    // 早期納品等のイレギュラー対応は備考（早期納品有無等）に書き添える運用（Q&A七巡目）。
    // 手配状態・手配担当者・更新日時は、実シートには無い本システム独自の管理項目として追加している。
    name: SHEET_NAMES.OPERATIONS,
    headers: ['CASE_ID', 'NB日', 'チャレンジ番号', 'プラン', '挙式日（撮影日）', 'AGT', 'FNL日', 'フォトブリッジ登録済',
      '名前①', 'AI加工有無', 'データアップロード', '名前②', '納品予定日', 'CXL日', 'キャンセル☑',
      '備考（早期納品有無等）', '手配状態', '手配担当者', '更新日時']
  },
  {
    name: SHEET_NAMES.OPERATION_HISTORY,
    headers: ['HISTORY_ID', 'CASE_ID', '更新日時', '担当', 'ステータス', '内容', 'メモ']
  },
  {
    name: SHEET_NAMES.OPERATION_MEMOS,
    headers: ['MEMO_ID', 'CASE_ID', '投稿者', '投稿日時', '内容']
  },
  {
    name: SHEET_NAMES.TASKS,
    headers: ['TASK_ID', 'CASE_ID', '担当部署', '担当者', '内容', '期限', '状態', '優先度', '完了日']
  },
  {
    // お渡し・回収書類チェックリストのマスタ（グループ＝「挙式・フォト」「旅行」。Q&A九巡目：
    // 実際に使っているチェックリストシートをそのまま再現。改定（例：25年10月改定）があり得るため
    // 項目名をハードコードせずマスタ化し、表示順・使用終了で管理する）。
    name: SHEET_NAMES.DOCUMENT_CHECKLIST_ITEMS,
    headers: ['ITEM_ID', 'グループ', '項目名', '表示順', '使用終了']
  },
  {
    // 案件×チェックリスト項目ごとのチェック状態（1案件1項目1行）。
    name: SHEET_NAMES.CASE_DOCUMENT_CHECKS,
    headers: ['CASE_ID', 'ITEM_ID', 'チェック済み', '更新日時', '更新者']
  },
  {
    // 地方（D列相当）・区分（E列相当：一般／AVA）を追加。目標はTargetsシートに一本化。
    name: SHEET_NAMES.STORES,
    headers: ['STORE_ID', '店舗名', '地方', '区分', '責任者', 'メール', '使用終了']
  },
  {
    name: SHEET_NAMES.STAFF,
    headers: ['STAFF_ID', '氏名', '店舗ID', '役職', 'メール', '権限', '在籍']
  },
  {
    name: SHEET_NAMES.PRODUCTS,
    headers: ['PRODUCT_ID', '商品名', '商品区分', '会社', '利益率', '販売開始', '販売終了', '使用終了']
  },
  {
    // 国内の地方区分（店舗の所在地方。北海道／東北／関東／中部／関西／中四国／九州）
    name: SHEET_NAMES.REGIONS,
    headers: ['REGION_ID', '地方名', '表示順']
  },
  {
    // 海外挙式・フォトの方面（ハワイ／グアム・サイパン・パラオ／沖縄／バリ島／ヨーロッパ 等）
    name: SHEET_NAMES.AREAS,
    headers: ['AREA_ID', '方面名', '表示順', '使用終了']
  },
  { name: SHEET_NAMES.CITIES, headers: ['CITY_ID', 'AREA_ID', '都市名', '表示順', '使用終了'] },
  {
    // 標準納品日数：未入力の場合は既定30日。60日を要するプランのみ個別設定する（Q&A一巡目 F-15）
    name: SHEET_NAMES.WEDDING_VENUES,
    headers: ['VENUE_ID', '会社', '方面', '都市', '式場名', '標準納品日数', '販売状況']
  },
  {
    name: SHEET_NAMES.PHOTO_PLANS,
    headers: ['PLAN_ID', '会社', '方面', '都市', 'プラン名', '標準納品日数', '販売状況']
  },
  {
    name: SHEET_NAMES.PARTNERS,
    headers: ['PARTNER_ID', '会社名', '方面', '都市', '担当者', 'メール', '電話', '備考']
  },
  { name: SHEET_NAMES.INQUIRY_METHODS, headers: ['METHOD_ID', '名称', '表示順', '使用終了'] },
  { name: SHEET_NAMES.MEDIA_MASTER, headers: ['MEDIA_ID', '名称', '表示順', '使用終了'] },
  {
    name: SHEET_NAMES.TARGETS,
    headers: ['年月', '店舗ID', '目標来店数', '目標成約数']
  },
  {
    // 本システム稼働前の実績を遡及入力するためのシート（前年同月比較用。Q&A一巡目 A-1・G-17）
    name: SHEET_NAMES.HISTORICAL_ACTUALS,
    headers: ['年月', '店舗ID', '方面', '来店数', '成約数', '登録者', '登録日時']
  },
  {
    name: SHEET_NAMES.ANALYTICS_CACHE,
    headers: ['集計日', '店舗ID', '地方', '区分', '方面ID', '商品ID', '来店数', '成約数', '未成約数', 'キャンセル数',
      '保留数', '最終更新日時']
  },
  {
    name: SHEET_NAMES.SYSTEM_LOGS,
    headers: ['日時', '実行者', '操作種別', '対象CASE_ID', '変更前後の値の要約']
  },
  {
    name: SHEET_NAMES.FORM_ITEM_MASTER,
    headers: ['ITEM_ID', '質問文（現在）', '内部項目名', '格納先テーブル', '格納先列', '分岐', '型',
      '正規化ルールID', '有効フラグ', '登録日', '備考']
  },
  { name: SHEET_NAMES.SETTINGS, headers: ['キー', '値', '説明'] },
  {
    // 過去データアーカイブの索引（年→退避先スプレッドシートID）。Q&A六巡目：
    // 本体シートを軽く保つ（読み込み速度対策）ことと、1ファイルのセル数上限（将来の容量枯渇対策）を
    // 回避することの両方を狙い、年ごとに"別ファイルの"スプレッドシートへ完了案件一式を退避する。
    name: SHEET_NAMES.ARCHIVE_INDEX,
    headers: ['年', 'スプレッドシートID', '作成日時']
  }
];

function setupDatabase() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  const existingId = props.getProperty('DB_SPREADSHEET_ID');
  if (existingId) {
    ss = SpreadsheetApp.openById(existingId);
  } else {
    ss = SpreadsheetApp.create('HIS WEDDING CRM Database');
    props.setProperty('DB_SPREADSHEET_ID', ss.getId());
  }

  SHEET_DEFINITIONS_.forEach(function (def) {
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
    }
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
  });

  // デフォルトの「シート1」が残っていれば削除する
  const defaultSheet = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  seedDefaultSettings_();
  seedSampleMasterData_();

  Logger.log('データベース・スプレッドシートを作成/更新しました: ' + ss.getUrl());
  return ss.getUrl();
}

/** 第2章11-1章・第8章7章：期限アラート基準日数の初期値。画面13（設定）から変更可能。 */
function seedDefaultSettings_() {
  saveSetting_('FNL_DAYS_BEFORE', 45, 'FNL日＝挙式日（撮影日）の何日前か');
  // Q&A一巡目F-15：30日が通常、60日は一部プランのみ（WeddingVenues/PhotoPlansの標準納品日数で個別上書き）、
  // 早期納品は日数固定ではないため自動算出せず手動入力とする（operationService.gs参照）
  saveSetting_('DELIVERY_DAYS_NORMAL', 30, '納品予定日＝撮影日＋何日か（標準納品日数が未設定の場合の既定値）');
  saveSetting_('DELIVERY_WARN_DAYS', 7, '納品予定日の何日前から警告色にするか');
  saveSetting_('NOTIFY_EMAIL', 't-avantikikaku@his-world.com', '未マッピング回答・手配引き継ぎ等の通知先（Q&A一巡目 I-22）');
  saveSetting_('FORM_ID', '11nTvJm6I0jRwiPi0iAItbmFrmwZW8XfqCceepBmAuxU', 'カウンセリングシートのフォームID');
  saveSetting_('CHALLENGE_NUMBER_PATTERN', '^[a-zA-Z0-9]{11}$', 'チャレンジ番号の形式チェック用正規表現');
  // Q&A六巡目：完了・未成約・キャンセル案件のうち、今年・前年より前のものだけを過去アーカイブへ退避する。
  // 今年＋前年の2年分は常に本体シートに残すため、ダッシュボードの前年比較は退避後も壊れない。
  saveSetting_('ARCHIVE_KEEP_YEARS', 2, '過去アーカイブへ退避せず本体シートに残す年数（今年を含む）。前年比較機能のため既定2年');
}

/**
 * 動作確認用のサンプルマスタデータ。本番運用前に実データへ置き換える。
 * 方面（Areas）・地方（Regions）・未成約理由・問合せ方法は実データそのまま投入している。
 */
function seedSampleMasterData_() {
  const storeSheet = getSheet_(SHEET_NAMES.STORES);
  if (storeSheet.getLastRow() < 2) {
    appendRowFromObject_(storeSheet, { STORE_ID: 'ST-001', 店舗名: '東京本店（AVA）', 地方: '関東', 区分: 'AVA', 責任者: '', メール: '', 使用終了: false });
    appendRowFromObject_(storeSheet, { STORE_ID: 'ST-002', 店舗名: '大阪店（一般）', 地方: '関西', 区分: '一般', 責任者: '', メール: '', 使用終了: false });
  }

  // 地方（国内7区分。Q&A一巡目G-17の記載どおり）
  const regionSheet = getSheet_(SHEET_NAMES.REGIONS);
  if (regionSheet.getLastRow() < 2) {
    ['北海道', '東北', '関東', '中部', '関西', '中四国', '九州'].forEach(function (r, i) {
      appendRowFromObject_(regionSheet, { REGION_ID: 'RG-00' + (i + 1), 地方名: r, 表示順: i + 1 });
    });
  }

  // 方面（Q&A一巡目C-10の実データをそのまま投入）
  const areaSheet = getSheet_(SHEET_NAMES.AREAS);
  if (areaSheet.getLastRow() < 2) {
    ['ハワイ', 'グアム・サイパン・パラオ', '沖縄', 'バリ島', 'ヨーロッパ', 'その他アジア', 'アメリカ・カリブ',
      '南米', 'アフリカ・中近東', 'オーストラリア・ニュージーランド', 'モルディブ・南太平洋', '国内（北海道等）']
      .forEach(function (a, i) {
        appendRowFromObject_(areaSheet, { AREA_ID: 'AR-' + Utilities.formatString('%03d', i + 1), 方面名: a, 表示順: i + 1, 使用終了: false });
      });
  }

  // 都市：撮影可能都市一覧（Q&A一巡目C-10）のうち、方面が明確に判定できるものを暫定で投入。
  // 判定が難しい都市も多いため、必ずマスタ管理画面で全件を確認・補完すること（README参照）。
  const citySheet = getSheet_(SHEET_NAMES.CITIES);
  if (citySheet.getLastRow() < 2) {
    const cityByArea = {
      'ハワイ': ['オアフ島', 'ハワイ島', 'マウイ島', 'ラナイ島'],
      'グアム・サイパン・パラオ': ['グアム', 'サイパン', 'パラオ'],
      '沖縄': ['沖縄本島', '宮古島', '石垣島', '小浜島', '西表島', '竹富島', '久米島'],
      'バリ島': ['バリ島'],
      'ヨーロッパ': ['ロンドン', 'パリ', 'モンサンミシェル', 'ストラスブール', 'コルマール', 'ニース', 'エズ',
        'ローマ', 'フィレンツェ', 'ベネチア', 'アマルフィ', 'ポジターノ', 'ミラノ', 'カプリ島', 'ナポリ', 'マルタ',
        'イスタンブール', 'カッパドキア', 'サントリーニ島', 'ミコノス島', 'アテネ', 'バルセロナ', 'マドリード',
        'プラハ', 'ブダペスト', 'ミュンヘン', 'ウィーン', 'ザルツブルク', 'ドブロブニク', 'ストックホルム',
        'ヘルシンキ', 'アムステルダム', 'ブリュッセル', 'リスボン', 'リガ', 'ワルシャワ', 'タリン'],
      'その他アジア': ['セブ島', 'アンコールワット', 'ダナン', 'フーコック島', 'プーケット', '台北'],
      'アメリカ・カリブ': ['ニューヨーク', 'ラスベガス', 'ロサンゼルス', 'セドナ', 'サンフランシスコ', 'サンディエゴ',
        'バンクーバー', 'プリンスエドワード島', 'バンフ', 'ホワイトホース', 'カンクン', 'ナッソー'],
      '南米': ['ウユニ塩湖'],
      'アフリカ・中近東': ['ドバイ', 'ギザ', 'マラケシュ'],
      'オーストラリア・ニュージーランド': ['ケアンズ', 'ゴールドコースト', 'シドニー', 'ウルル', 'パース',
        'ロットネスト島', 'メルボルン', 'テカポ湖', 'クイーンズタウン', 'クライストチャーチ'],
      'モルディブ・南太平洋': ['ボラボラ島', 'ナンディ', 'ヌーメア', 'マーレ'],
      '国内（北海道等）': ['北海道']
    };
    const areaByName = {};
    sheetToObjects_(areaSheet).forEach(function (a) { areaByName[a.方面名] = a.AREA_ID; });
    let seq = 1;
    Object.keys(cityByArea).forEach(function (areaName) {
      cityByArea[areaName].forEach(function (city, i) {
        appendRowFromObject_(citySheet, {
          CITY_ID: 'CI-' + Utilities.formatString('%04d', seq++), AREA_ID: areaByName[areaName] || '',
          都市名: city, 表示順: i + 1, 使用終了: false
        });
      });
    });
  }

  // 問合せ方法（Q&A一巡目G-19：オンライン相談を追加）
  const methodSheet = getSheet_(SHEET_NAMES.INQUIRY_METHODS);
  if (methodSheet.getLastRow() < 2) {
    ['来店', '電話', 'メール', 'Web', 'オンライン相談'].forEach(function (m, i) {
      appendRowFromObject_(methodSheet, { METHOD_ID: 'M-00' + (i + 1), 名称: m, 表示順: i + 1, 使用終了: false });
    });
  }
  // 媒体：カウンセリングシート項目18「流入経路」の回答値をそのまま使う運用のため、
  // ここでは手動登録（フォームを介さない問い合わせ）用の簡易マスタのみ用意する（Q&A一巡目G-18）。
  const mediaSheet = getSheet_(SHEET_NAMES.MEDIA_MASTER);
  if (mediaSheet.getLastRow() < 2) {
    ['Instagram', '紹介', '検索(SEO)', 'HISサイト', 'その他'].forEach(function (m, i) {
      appendRowFromObject_(mediaSheet, { MEDIA_ID: 'MD-00' + (i + 1), 名称: m, 表示順: i + 1, 使用終了: false });
    });
  }

  // お渡し・回収書類チェックリスト（Q&A九巡目：実際に使っているチェックリストシートをそのまま再現）
  const docChecklistSheet = getSheet_(SHEET_NAMES.DOCUMENT_CHECKLIST_ITEMS);
  if (docChecklistSheet.getLastRow() < 2) {
    const items = [
      ['挙式・フォト', 'プランチラシ'], ['挙式・フォト', 'AGT約款'], ['挙式・フォト', 'ウェディング受付書（回収・入力）'],
      ['挙式・フォト', 'サービス料のご案内'], ['挙式・フォト', '手配手数料一覧'], ['挙式・フォト', 'フォト同意書'],
      ['旅行', 'プランチラシ'], ['旅行', '取消規定'], ['旅行', '条件書（式ONの場合でも手配旅行！）'],
      ['旅行', '手配／募集／受注（一覧・国内含む）'], ['旅行', '申込前のご案内とご注意'], ['旅行', '旅行申込書（回収・入力）']
    ];
    items.forEach(function (item, i) {
      appendRowFromObject_(docChecklistSheet, { ITEM_ID: 'DC-' + Utilities.formatString('%03d', i + 1), グループ: item[0], 項目名: item[1], 表示順: i + 1, 使用終了: false });
    });
  }
}
