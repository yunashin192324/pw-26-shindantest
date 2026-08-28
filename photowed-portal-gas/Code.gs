// =====================================================
// ★WEDLINK 統合ポータル：全支店横断WEBアプリ版 (Code.gs)
// ROW支店専用スクリプト(ROW_fixed.gs)を、世界中の支店へコード改修なしで横展開できる
// 「1つのWebアプリ + 支店マスタ」構成に再設計したもの。
//
// 設計方針：
//  ・支店ごとにスクリプトをコピーしない。ロジックは1本のスクリプトに集約する。
//  ・支店固有の情報（支店名／国／都市／ログインコード／通知先メール／案件番号プレフィックス）は
//    コードに書かず「支店マスタ」シートで管理する。支店を増やす時はマスタに1行追加するだけ。
//  ・日本側は「関東手配課」「関西手配課」の2アカウントに分離。どちらでログインしても
//    全支店を横断閲覧・操作でき、チェックボックスで表示範囲（全国／関東／関西／支店ごと）を絞り込める。
//  ・支店ユーザーは自分の支店のデータのみ閲覧・操作可能。
//  ・プラン・オプションは支店ごとに異なるため「プランマスタ／オプションマスタ」で支店別に管理する。
// =====================================================

// --- このWebアプリが使うスプレッドシートのID ---
const SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE';

// --- シート名 ---
const BRANCH_MASTER_SHEET_NAME = '支店マスタ';
const PLAN_MASTER_SHEET_NAME = 'プランマスタ';
const OPTION_MASTER_SHEET_NAME = 'オプションマスタ';
const LOCATION_MASTER_SHEET_NAME = '撮影場所マスタ';
const STAFF_MASTER_SHEET_NAME = 'スタッフマスタ';   // 現地スタッフ（カメラマン・ヘアメイク等）の入力候補
const PHRASE_MASTER_SHEET_NAME = '定型文マスタ';    // メッセージのテンプレート
const SALE_MASTER_SHEET_NAME = 'セールマスタ';      // セール名の入力候補（支店ごと。自由入力も可）
const RESERVATION_SHEET_NAME = '予約一覧';
const HISTORY_SHEET_NAME = 'やり取り履歴';
const ARCHIVE_SHEET_NAME = '過去一覧';
const STATUS_LOG_SHEET_NAME = 'ステータス変更履歴';
// ★機能追加：共有メモ・現地用メモ・お客様アンケート回答を「積み上げ式」で記録するログ
// （機能：メモの追記化・アンケート回答連携）
const MEMO_LOG_SHEET_NAME = 'メモ履歴';
// ★機能追加：カメラマン・ヘアメイク等の現地スタッフ手配リクエストを送った履歴
// （機能：現地スタッフ手配メール）
const ARRANGEMENT_LOG_SHEET_NAME = '手配履歴';

// --- システムエラー通知先 ---
const SYSTEM_ALERT_EMAIL = 'it-planning@his-world.com';

// --- ロール ---
const BRANCH_ROLE = 'BRANCH';
const JP_ROLE = 'JP';
// ★機能追加：日本の店舗スタッフが新規の撮影依頼を起票するための第三のロール。
// 支店マスタに ロール=SHOP の行を追加してログインできるようにする（支店・JPと同じ仕組みを流用）。
// 起票した案件だけを閲覧・メッセージでき、通常の案件の項目は一切編集できない（prepareFieldWrite_で遮断）。
const SHOP_ROLE = 'SHOP';
// 日本側の手配チーム（固定2チーム。"管轄"列の値と一致させる）
const JP_TEAMS = ['関東', '関西'];

// --- セッション設定 ---
const SESSION_TTL_SEC = 21600; // 6時間（CacheServiceの上限）
// ★セキュリティ：パスコードの総当たり対策。支店コード単位で連続失敗をこの回数まで許容し、
// 超えたら LOGIN_LOCKOUT_SEC の間ログインを受け付けない（正規利用者の打ち間違いは救える回数にする）
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCKOUT_SEC = 900; // 15分

// --- ステータスコード（"確定"等の和訳ラベルは使わず、コードそのものを運用する） ---
// ★機能廃止：NC（ネームチェンジ専用コードとして一時再定義していたもの）は結局不要と判断し廃止した。
// 名前の変更は、新郎名・新婦名欄を直接書き換えて通常の3択フロー（変更＋メッセージ送信）で送るだけで
// 現地に伝わるようにしている（apiCommitChanges内でお客様名の変更を検知し、通知を
// 「ネームチェンジのお知らせ」として分かりやすく送る。専用のステータスは持たない）。
// DC（日付変更依頼）・PC（プラン・式場変更依頼）は新設。どちらもチャージが発生し得る
// 重要な変更のため、専用のステータスコードで管理する（詳細は STATUS_AUTO_CASCADE 付近を参照）。
// ★機能追加：ST（現地側がまだ確認していない、の意）は主に希望日ごとのSTS(支店側)の初期値として使う
// （現地スタッフが見てベンダーへ連絡したらRQへ変える。詳細はhopeStsBranchCol_付近を参照）。
const STATUS_CODES = ['RQ', 'OK', 'CHK', 'CR', 'FN', 'CW', 'UC', 'CF', 'DC', 'PC', 'ST'];
const ALERT_COMPLETED_STATUS = 'FN';
// ★要件：撮影日の45日前時点でSTSがFNになっていない場合に日本側へアラート
const ALERT_DAYS_BEFORE = 45;
// ★要件：撮影日から何日後までに納品(DriveフォルダURL登録)がないとアラートするか。
// 国（支店）ごとに異なるため支店マスタの「納品期限日数」列で管理し、未設定ならこの値を使う
const DELIVERY_ALERT_DEFAULT_DAYS = 30;
// 納品期限を過ぎても未納品の場合、この日数おきに再通知する（期限当日にトリガーが
// 実行できなかった場合でもアラートが消えてしまわないようにするため）
const DELIVERY_ALERT_REMIND_INTERVAL_DAYS = 7;
// ただし無期限に再通知すると過去の未納品案件から延々メールが飛ぶため、
// 期限日からこの日数を過ぎたら通知を打ち切る
const DELIVERY_ALERT_REMIND_UNTIL_DAYS = 28;

// ★性能：アーカイブは1行ずつ deleteRow するため件数に比例して遅くなる。
// 長期間トリガーが止まっていた場合などに6分の実行時間制限へ達しないよう、1回あたりの上限を設ける。
// 残りは翌日の実行で処理される（取りこぼしにはならない）。
const ARCHIVE_MAX_ROWS_PER_RUN = 500;

// ★機能追加：相手からのメッセージが何日未読なら督促メールを送るか（支店マスタ「督促日数」未設定時の既定）
const UNANSWERED_REMIND_DEFAULT_DAYS = 3;
// 書き出し（apiExportReservations）の1回あたり最大件数。setValuesで一括書き込みするが、
// 極端に大量だと実行時間・メモリを圧迫するため上限を設ける
const EXPORT_MAX_ROWS = 5000;

// --- 支店側がSTS(支店側)を編集してよい条件（キー＝対になるSTS(JP側)の現在値） ---
// null = 値の制限なし（STATUS_CODESから自由に選べる）／配列 = その中からのみ選べる／
// キーが存在しない値（OK,FN,CW,UC,CFなど）のときは支店側は編集不可（ロック）
//  - RQ/CHK：日本側からの依頼待ち・確認依頼中の状態。支店側は自由に回答できる
//    （空きがなければ UC＝空きなし、を含めどのコードでも返せる）
//  - CR：日本側が既存予約のキャンセルを依頼した状態。支店側は CW（チャージなしで取消）か
//    CF（キャンセルチャージが発生）のいずれかで回答する
//  - DC／PC：日付変更・プラン/式場変更の依頼中。支店側は OK（対応可）か UC（対応不可）で回答する
//    （このOK／UCの回答だけは、通常の「支店側はSTS(支店側)のみ編集できる」の例外として
//    STS(JP側)にも同じ値がそのまま反映される。STATUS_AUTO_CASCADE 参照）
const BRANCH_EDIT_GATE = {
  'RQ': null,
  'CHK': null,
  'CR': ['CW', 'CF'],
  'DC': ['OK', 'UC'],
  'PC': ['OK', 'UC'],
  // ★機能追加：STS(JP側)がFN（最終確定）になった後、現地側もベンダーへ確定連絡が済んだら
  // 自分のSTS(支店側)をFNにできる（それまでは編集不可のロックのまま）。
  'FN': ['FN']
};
// 請求先（日本の地域区分）
const BILLING_REGIONS = ['北海道', '東北', '関東', '中部', '関西', '中四国', '九州'];
// ★要件：準備場所の選択式表示・同意書欄の表示は「イタリアの支店」だけに絞る（他支店は非表示）。
// 支店マスタの「国」列の値で判定する（新しくイタリアの支店が増えても自動的に対象になる）
const ITALY_COUNTRY_NAME = 'イタリア';

// --- 予約一覧の列定義 ---
const COL_BRANCH_CODE = '支店コード';
const COL_KANRI_NO = '管理番号';
const COL_CHALLENGE_NO = 'CHG NO';
// ★要件：チャレンジ番号（CHG NO）は英数字11桁固定（0から始まる場合・アルファベットから
// 始まる場合もある）。店舗の新規依頼では必須、既存案件の変更時も値を入れるならこの形式のみ許可する。
const CHALLENGE_NO_PATTERN = /^[A-Za-z0-9]{11}$/;
const COL_STATUS_JP = 'STS JP';
const COL_STATUS_BRANCH = 'STS 支店';
const COL_CONFIRMED_DATE = '撮影日FIX';
const COL_CEREMONY_DATE = '挙式日FIX';
const COL_HOPE1 = '希望日①';
const COL_HOPE2 = '希望日②';
const COL_HOPE3 = '希望日③';
const COL_HOPE4 = '希望日④';
const COL_HOPE5 = '希望日⑤';
// ★機能追加：「空き確認のみ」にチェックを入れて確定すると、STS JPが自動でCHK（確認依頼中）になり、
// 撮影日FIXの確定ではなく「上の希望日①〜⑤の中で空きがあるか」を現地へ確認する依頼になる。
const COL_INQUIRY_ONLY = '空き確認のみ';
// ★要件：新郎名・新婦名は姓・名を分けて入力できるようにする。既存のCOL_GROOM_NAME／COL_BRIDE_NAME
// （列名はそのまま）は「名（given name）」専用の欄とし、新しく姓（surname）専用の欄を追加する。
// 表示・検索・メール本文などで使う「フルネーム」は、どこでも fullName_(姓, 名) で組み立てる
// （フルネームだけを持つ列は新設しない＝姓・名がずれて食い違う事故を防ぐため）。
const COL_GROOM_LAST_NAME = '新郎姓（ローマ字）';
const COL_GROOM_NAME = '新郎名（ローマ字）';
const COL_BRIDE_LAST_NAME = '新婦姓（ローマ字）';
const COL_BRIDE_NAME = '新婦名（ローマ字）';
// 姓・名から表示用のフルネームを組み立てる（姓 名 の順。片方だけ入っていてもそのまま返す）
function fullName_(lastName, firstName) {
  const l = String(lastName || '').trim();
  const f = String(firstName || '').trim();
  return [l, f].filter(Boolean).join(' ');
}
// ★要件：新郎新婦の姓・名の4項目まとめて扱う場所（必須チェック・大文字化・ネームチェンジ検知）で使う一覧。
const CUSTOMER_NAME_FIELDS = [COL_GROOM_LAST_NAME, COL_GROOM_NAME, COL_BRIDE_LAST_NAME, COL_BRIDE_NAME];
// ★要件：パスポート等の正式表記に合わせ、姓・名は常に大文字（例：YAMADA / TARO）で保存する。
// 小文字で入力されても自動で大文字化する（お客様・店舗側の入力ミスをここで吸収する）。
function normalizeNameValue_(value) {
  return String(value || '').trim().toUpperCase();
}
// ★要件：新郎新婦それぞれの年齢欄（日本の店舗画面向け。※ISWのみ必要という注記付きで表示する）
const COL_GROOM_AGE = '新郎年齢';
const COL_BRIDE_AGE = '新婦年齢';
// ★機能追加：お客様がGoogleフォームで記入する『同意書』の記入有無を案件に反映する（機能④）。
// 支店マスタの「同意書必須」が有効な支店（例：ローマ）では未回収を目立たせる。
// ★要件：「お客様情報」タブに移動。表示は日本側、またはイタリアの支店のみ（他支店は非表示）。
const COL_CONSENT = '同意書';
const COL_PLAN = 'プラン名';
// ★機能追加：セールは頻度が高く名称も毎回変わるため、プラン名とは別の欄にする（機能⑤）。
// セールマスタに事前登録した候補から選ぶか、自由入力もできる（撮影希望場所と同じ運用）
const COL_SALE_NAME = 'セール名';
const COL_LOCATION = '撮影希望場所';
// ★要件：準備場所はイタリアの支店のみ表示し、ホテル／サロンの選択式にする（他支店は非表示）
const COL_PREP = '準備場所';
const PREP_CHOICES = ['ホテル', 'サロン'];
// --- お客様情報（新設タブ） ---
// ★要件：パスポート番号はイスタンブール支店など「支店マスタのパスポート番号欄がON」の支店だけに出す。
// 日本側・現地側どちらからも入力できる（日本側が入れる想定）。
const COL_PASSPORT_NO = 'パスポート番号';
const COL_LOCAL_EMAIL = '現地連絡先メール';
const COL_LOCAL_PHONE = '現地連絡先電話';
const COL_HOTEL = 'ホテル'; // 画面表示名は「滞在ホテル名」（列名は既存互換のため変更しない）
const COL_HOTEL_ADDRESS = 'ホテル住所';
const COL_FLIGHT_INFO = 'フライト情報';
const COL_AREA = '管轄';
const COL_BILLING_REGION = '請求先';
const COL_JP_SHOP = '日本支店名';
const COL_INVOICE_NO = '請求番号';   // ラベル名は支店マスタの「請求番号欄名称」で支店ごとに変更可能
const COL_SHOP = '店舗／担当（現地）';
// ★要件：当日の現地運用向け項目（現地記入欄）
const COL_DAY_STAFF = '当日の担当';
const COL_HAIR_MAKEUP = 'ヘアメイク';
const COL_HAIR_START_TIME = 'ヘアメイク開始時間'; // ★要件：ヘアメイクのすぐ近くに開始時間欄
const COL_PHOTOGRAPHER = 'カメラマン';
const COL_PHOTO_START_TIME = '撮影開始時間';       // ★要件：カメラマンのすぐ近くに撮影開始時間欄
const COL_ASSISTANT = 'アシスタント';
const COL_PICKUP_TIME = '配車時間';
const COL_LOCAL_MEMO = 'メモ（現地用）';
const COL_REMARKS = '備考';
const COL_MEMO = '共有メモ';
// ★機能追加：共有メモ・メモ（現地用）は「上書き」ではなく「積み上げ」で記録する（メモ履歴シート）。
// 上の COL_MEMO / COL_LOCAL_MEMO の2列は、この機能を追加する前からある案件の
// 「移行前の最後のメモ」を表示するためだけに残しており、新しい書き込みはメモ履歴シートへ行う。
const MEMO_TYPE_SHARED = COL_MEMO;          // '共有メモ'
const MEMO_TYPE_LOCAL = COL_LOCAL_MEMO;     // 'メモ（現地用）'
const MEMO_TYPE_SURVEY = 'アンケート回答';   // お客様がGoogleフォームで回答した内容（自動反映・追記のみ）
const MEMO_TYPES = [MEMO_TYPE_SHARED, MEMO_TYPE_LOCAL, MEMO_TYPE_SURVEY];
// お客様入力（Googleフォーム）である目印。手入力のメモと見分けるために使う
const MEMO_AUTHOR_CUSTOMER = 'お客様（Googleフォーム）';
// ★機能追加：日本の手配課側のみが見る「日本記入欄」タブ（支店には一切表示しない）。
// フォトブリッジ登録・データアップロードは「済／未」のチェックボックスで、チェックした
// 担当者名と日時を自動で記録する（ベースは未＝未チェック）。早期納品は有無だけのチェックボックス。
// AI加工は「有／無」ではなく、加工内容そのものを選択式で記録する（AI_EDIT_OPTIONS参照）。
const COL_PHOTOBRIDGE = 'フォトブリッジ登録';
const COL_PHOTOBRIDGE_BY = 'フォトブリッジ登録者';     // 自動反映。画面から直接編集はさせない
const COL_PHOTOBRIDGE_AT = 'フォトブリッジ登録日時';   // 自動反映。画面から直接編集はさせない
const COL_AI_EDIT = 'AI加工';
const AI_EDIT_OPTIONS = ['美肌・小顔・痩身加工', '美肌加工'];
const COL_DATA_UPLOAD = 'データアップロード';
const COL_DATA_UPLOAD_BY = 'データアップロード者';     // 自動反映。画面から直接編集はさせない
const COL_DATA_UPLOAD_AT = 'データアップロード日時';   // 自動反映。画面から直接編集はさせない
const COL_DELIVERY_EMAIL = '納品先メールアドレス';
const COL_EARLY_DELIVERY = '早期納品';
const COL_LAST_UPDATED = '最終更新日';
const COL_DRIVE_URL = 'DriveフォルダURL';
// ★性能：相手側からの未読メッセージ・変更があるか（＝「要対応」）を予約一覧側に保持する。
// 以前はダッシュボードを開くたびに「やり取り履歴」を全件走査して判定していたため、
// 履歴が増え続けると一覧の表示が確実に遅くなっていた。履歴を書いた時と既読にした時だけ
// この列を更新し、一覧は列を読むだけにする（システム列のため画面からは編集不可）。
const COL_UNREAD_JP = '未読 JP';       // trueなら日本側に未読がある
const COL_UNREAD_BRANCH = '未読 支店';  // trueなら支店側に未読がある
// ★機能追加：店舗ロールが起票した案件かどうか（起票元の店舗コード。手入力の案件は空欄のまま）。
// 空欄なら従来どおりJP⇔支店だけの案件として扱う（挙動は一切変わらない）。
const COL_ORIGIN_SHOP = '起票元店舗';
const COL_UNREAD_SHOP = '未読 店舗';    // trueなら店舗側に未読がある（起票元店舗が設定されている案件のみ使う）
// ★機能追加（拡張要望8章）：店舗がお客様提供画像・指示書をアップロードするための自動作成フォルダ。
// COL_DRIVE_URL（最終的な撮影データ納品先）と同じ親フォルダを使い回す（8-2）ため、
// 未登録なら新規作成したフォルダのURLをこの列とCOL_DRIVE_URLの両方に入れる（ensureShopUploadFolder_参照）。
// システム列のため画面から直接編集はさせない（COMMITTABLE_FIELDSの対象外）。
const COL_SHOP_UPLOAD_FOLDER_URL = '店舗アップロード用フォルダURL';

const OPTION_COUNT = 5;
function opNameCol_(n) { return `OP${n}`; }
function opStsJpCol_(n) { return `OP${n} STS JP`; }
function opStsBranchCol_(n) { return `OP${n} STS 支店`; }

// ★機能追加：希望日ごとの空き確認ステータス（第一〜第五希望それぞれにSTS JP／STS 支店を持たせる。
// OPn（オプション）と同じ構造）。
//   ・STS(JP側)：新規作成時、日付が入っている希望日だけ自動でRQになる（誰も直接編集しない。
//     生成時の初期化と、現地側のOK/UC回答に連動する自動反映だけで動く）
//   ・STS(支店側)：現地側が編集する。初期値ST（まだ確認していない）→ ベンダーへ連絡したらRQ→
//     取れたらOK／取れなければUC。OK／UCの回答はSTS(JP側)にもそのまま反映される
//     （DC/PCの回答と同じ「支店側の回答がJP側にも映る」例外パターン。applyHopeStatusCascade_参照）
// 希望日が複数OKになることは無い前提で、いずれかがOKになったら他の入力済みの希望日は自動でUCになり、
// その日付が撮影日FIX（COL_CONFIRMED_DATE）へ反映される。
const HOPE_COLS = [COL_HOPE1, COL_HOPE2, COL_HOPE3, COL_HOPE4, COL_HOPE5];
function hopeStsJpCol_(n) { return `${HOPE_COLS[n - 1]} STS JP`; }
function hopeStsBranchCol_(n) { return `${HOPE_COLS[n - 1]} STS 支店`; }

// ★機能追加（拡張要望9章）：必要書類チェックリスト。店舗スタッフ（主）・現地(支店)のどちらからでも
// チェックでき、どちらの変更も双方に反映される（＝どちらのロールにとっても普通のCOMMITTABLE_FIELDS）。
// 通知アラートの要否は要望書自体が「未確定」としているため、今回はあえて何も送らない
// （＝チェックの保存はapiSaveFieldsQuietの「保存のみ」を使う想定。メッセージを添えたい時は
// 従来どおりapiCommitChangesで変更内容として送ればよい）。
const CHECKLIST_ITEMS = ['ヘアメイク画像', '衣裳画像', '撮影指示書', '着付け指示書'];
function checklistCol_(item) { return `必要書類チェック:${item}`; }

const RESERVATION_HEADERS = (() => {
  const base = [
    COL_BRANCH_CODE, COL_KANRI_NO, COL_CHALLENGE_NO, COL_STATUS_JP, COL_STATUS_BRANCH,
    COL_CONFIRMED_DATE, COL_CEREMONY_DATE, COL_INQUIRY_ONLY,
    COL_HOPE1, COL_HOPE2, COL_HOPE3, COL_HOPE4, COL_HOPE5,
    COL_GROOM_LAST_NAME, COL_GROOM_NAME, COL_BRIDE_LAST_NAME, COL_BRIDE_NAME,
    COL_GROOM_AGE, COL_BRIDE_AGE,
    COL_CONSENT, COL_PLAN, COL_SALE_NAME, COL_LOCATION, COL_PREP,
    COL_PASSPORT_NO, COL_LOCAL_EMAIL, COL_LOCAL_PHONE, COL_HOTEL, COL_HOTEL_ADDRESS, COL_FLIGHT_INFO,
    COL_AREA, COL_BILLING_REGION, COL_JP_SHOP, COL_INVOICE_NO, COL_SHOP,
    COL_DAY_STAFF, COL_HAIR_MAKEUP, COL_HAIR_START_TIME, COL_PHOTOGRAPHER, COL_PHOTO_START_TIME,
    COL_ASSISTANT, COL_PICKUP_TIME, COL_LOCAL_MEMO,
    COL_REMARKS, COL_MEMO,
    COL_PHOTOBRIDGE, COL_PHOTOBRIDGE_BY, COL_PHOTOBRIDGE_AT, COL_AI_EDIT,
    COL_DATA_UPLOAD, COL_DATA_UPLOAD_BY, COL_DATA_UPLOAD_AT, COL_DELIVERY_EMAIL, COL_EARLY_DELIVERY,
    COL_LAST_UPDATED, COL_DRIVE_URL, COL_SHOP_UPLOAD_FOLDER_URL, COL_ORIGIN_SHOP,
    COL_UNREAD_JP, COL_UNREAD_BRANCH, COL_UNREAD_SHOP,
    ...CHECKLIST_ITEMS.map(checklistCol_)
  ];
  for (let n = 1; n <= OPTION_COUNT; n++) {
    base.push(opNameCol_(n), opStsJpCol_(n), opStsBranchCol_(n));
  }
  for (let n = 1; n <= HOPE_COLS.length; n++) {
    base.push(hopeStsJpCol_(n), hopeStsBranchCol_(n));
  }
  return base;
})();

// ★機能追加：日本の手配課側のみが見る「日本記入欄」タブ。専用API（apiSetInternalFlag／
// apiSetInternalValue）で扱い、通常の3択（保存のみ／メッセージのみ／変更＋メッセージ）には一切乗せない。
// 理由：これらの項目を通常フローに乗せると、「変更＋メッセージ」を選んだ際の要約行や
// 通知メールに項目名・変更内容が入ってしまい、支店から見える履歴に漏れてしまうため。
// ★要件：「管轄」は日本記入欄タブへ移したが、支店側の画面（案件一覧・詳細ヘッダーの「担当」表示）にも
// 引き続き見せる必要があるため、ここには含めない（COMMITTABLE_FIELDSのまま・編集は日本側のみに制限）。
const JP_INTERNAL_FIELDS = [
  COL_PHOTOBRIDGE, COL_PHOTOBRIDGE_BY, COL_PHOTOBRIDGE_AT, COL_AI_EDIT,
  COL_DATA_UPLOAD, COL_DATA_UPLOAD_BY, COL_DATA_UPLOAD_AT, COL_DELIVERY_EMAIL, COL_EARLY_DELIVERY
];
// フィールドごとの仕様：doneValue=チェック時に保存する値／byField=担当者名を自動記録する相方の列／
// atField=チェックした日時を自動記録する相方の列（どちらも無ければnull）
const INTERNAL_FLAG_SPECS = {
  [COL_PHOTOBRIDGE]: { doneValue: '済', byField: COL_PHOTOBRIDGE_BY, atField: COL_PHOTOBRIDGE_AT },
  [COL_DATA_UPLOAD]: { doneValue: '済', byField: COL_DATA_UPLOAD_BY, atField: COL_DATA_UPLOAD_AT },
  [COL_EARLY_DELIVERY]: { doneValue: '有', byField: null, atField: null }
};
// ★要件：AI加工は有無だけでなく「何を加工したか」を選択式で記録する（apiSetInternalValueで扱う）。
// 納品先メールアドレスは自由入力のテキスト項目（値の形式チェックはしない：担当者が把握している
// 納品先を書ける自由記述欄として運用する想定のため）。
const INTERNAL_VALUE_SPECS = {
  [COL_AI_EDIT]: { type: 'select', options: AI_EDIT_OPTIONS },
  [COL_DELIVERY_EMAIL]: { type: 'text' }
};

// ★要件：既存予約の中の項目は「その場で自動保存」ではなく、まとめて
// （a）保存のみ（通知しない）／（b）メッセージのみ送信／（c）変更内容＋メッセージを送信
// のいずれかを選んで確定する。COMMITTABLE_FIELDS はその対象となる全フィールド
// （システム列・DriveフォルダURL・JP内部進行管理欄は専用フローがあるため除く）。
// ★希望日ごとのSTS(JP側)は、誰も直接編集しない（作成時の自動初期化と、現地側のOK/UC回答に
// 連動する自動反映だけで動く。applyHopeStatusCascade_参照）。COMMITTABLE_FIELDSから除外しないと、
// 通常の3択フロー経由で誰でも自由な文字列を書き込めてしまい、ゲート・自動連動の仕組みが素通りされる。
const HOPE_JP_STATUS_FIELDS = Array.from({ length: HOPE_COLS.length }, (_, i) => hopeStsJpCol_(i + 1));
const COMMITTABLE_FIELDS = RESERVATION_HEADERS.filter(h => ![
  COL_BRANCH_CODE, COL_KANRI_NO, COL_LAST_UPDATED, COL_DRIVE_URL, COL_SHOP_UPLOAD_FOLDER_URL, COL_ORIGIN_SHOP,
  COL_UNREAD_JP, COL_UNREAD_BRANCH, COL_UNREAD_SHOP, ...JP_INTERNAL_FIELDS, ...HOPE_JP_STATUS_FIELDS
].includes(h));

// ★機能追加（店舗拡張）：店舗ロールが自分の起票した案件について、通常の3択フロー
// （保存のみ／メッセージのみ／変更＋メッセージ）で変更できる項目。新規予約フォーム
// （apiShopCreateRequest）で入力できる項目と揃えている（オプションは「名前」だけで、
// STS(JP側)／STS(支店側)は含めない＝オプションの状態管理は現行のまま手配課・支店のもの）。
// ★機能追加（拡張要望9章）：必要書類チェックリストは店舗・現地(支店)どちらからでもチェックできる
// （双方向）ため、店舗の編集可能項目にも含める。
// ★要件：店舗がSTS(JP側)を変更できる範囲は、この配列＋isJpStatusField_が真になる列
// （案件全体のSTS JPと各オプションのSTS JP）。詳しくはprepareFieldWrite_・validateFieldPermission_参照。
const SHOP_EDITABLE_FIELDS = [
  COL_GROOM_LAST_NAME, COL_GROOM_NAME, COL_BRIDE_LAST_NAME, COL_BRIDE_NAME,
  COL_GROOM_AGE, COL_BRIDE_AGE,
  COL_PLAN, COL_SALE_NAME, COL_LOCATION, COL_PREP,
  COL_HOPE1, COL_HOPE2, COL_HOPE3, COL_HOPE4, COL_HOPE5, COL_PASSPORT_NO,
  ...Array.from({ length: OPTION_COUNT }, (_, i) => opNameCol_(i + 1)),
  ...CHECKLIST_ITEMS.map(checklistCol_)
];
// ★機能追加（店舗拡張）：店舗が案件作成後にSTS(JP側)を変更できる先。新規作成時のRQ／CHKの
// 選択は apiShopCreateRequest 側で扱うため、ここには含めない（作成後の変更だけを対象にする）。
// FN（最終確定）だけは「OKの状態から」という前提条件があるため、validateFieldPermission_側で
// 別途チェックする。
// ★機能廃止：ネームチェンジ専用のNCは廃止（新郎名・新婦名欄を直接編集して送信すれば
// 現地に伝わるため、専用ステータスは不要と判断した）。
// ★要件：専用の「ステータス変更」欄は廃止し、案件全体・各オプションいずれもプラン名／
// オプション名のすぐ隣に出るSTS(JP側)バッジから、店舗自身がその場で直接この中の値へ変更できるようにする
// （現在の値がFN以外の状態からいつでもRQ→CR等に変えられる。FNだけは対象の項目がOKの時だけ選べる）。
// ★要件：RQ（予約依頼）へ戻す操作も、案件全体・各オプションいずれのSTS(JP側)バッジからも
// 選べるようにする（一度CR等にした後に取り消して依頼中の状態へ戻す、といった用途）。
const SHOP_STATUS_TARGETS = ['RQ', 'FN', 'CR', 'DC', 'PC'];
// ★要件：一度OK（現地確定）になった「各オプション」は、店舗側からRQ・DC・PCへは戻せない。
// OKの状態から店舗が選べるのはCR（キャンセル依頼）・FN（最終確定）のみにする（対象はオプションの
// STS(JP側)のみ。案件全体のSTS(JP側)は、OKになった後もDC/PCを店舗から出せる仕様のため対象外）。
const SHOP_STATUS_TARGETS_FROM_OK = ['CR', 'FN'];

// 日付として保存すべきフィールド（<input type="date">で受け渡しし、実Dateとして保存する）
// checkAlerts/archivePastReservations/sortReservationSheet_ は撮影日FIXがDate型であることを前提にしている
const DATE_FIELDS = [COL_CONFIRMED_DATE, COL_CEREMONY_DATE];
// 日付だけでなく時刻まで表示したいフィールド（社内進行管理欄のチェック日時など）
const DATETIME_FIELDS = [COL_PHOTOBRIDGE_AT, COL_DATA_UPLOAD_AT];

// ★機能追加：現地スタッフ手配メール（機能：スタッフ手配）
// カメラマン・ヘアメイク等、押すボタンごとに「宛先（名前・メール）」を支店マスタに持つ。
// 同じ宛先を複数カテゴリに設定すれば「ヘアメイクさんに頼めばカメラマンも手配してもらえる」
// 「現地の委託会社1件に全部頼む」といった支店ごとの実態にそのまま対応できる。
const ARRANGEMENT_CATEGORIES = [
  { key: 'photographer', label: 'カメラマン' },
  { key: 'hairMakeup', label: 'ヘアメイク' },
  { key: 'assistant', label: 'アシスタント' },
  { key: 'florist', label: '花屋さん' },
  { key: 'transport', label: '送迎車' }
];
function arrNameCol_(label) { return `手配先名-${label}`; }
function arrEmailCol_(label) { return `手配先メール-${label}`; }

// --- 支店マスタの列定義 ---
const BM_COL_CODE = '支店コード';
const BM_COL_NAME = '支店名';
const BM_COL_COUNTRY = '国';
const BM_COL_CITY = '都市';
const BM_COL_ROLE = 'ロール';
const BM_COL_TEAM = '手配チーム';               // JPロールのみ使用（関東/関西）
const BM_COL_PASSCODE = 'ログインパスコード';
const BM_COL_EMAIL = '通知先メール';
const BM_COL_PREFIX = '案件番号プレフィックス';  // BRANCHロールのみ使用。支店ごとに一意
const BM_COL_INVOICE_LABEL = '請求番号欄名称';   // BRANCHロールのみ使用。空欄なら「請求番号」を使用（支店が独自名称に変更可）
const BM_COL_DELIVERY_DAYS = '納品期限日数';     // BRANCHロールのみ使用。空欄ならDELIVERY_ALERT_DEFAULT_DAYSを使用
// ★機能追加：相手からのメッセージが何日未読なら督促するか。空欄ならUNANSWERED_REMIND_DEFAULT_DAYS
const BM_COL_REMIND_DAYS = '督促日数';
// ★機能追加：Googleフォームの『同意書』を必須とする支店ではTRUEにする（例：ローマ支店）。
// 未設定／FALSEの支店は任意扱い（同意書欄自体は全支店で入力・確認できる）
const BM_COL_CONSENT_REQUIRED = '同意書必須';
// ★機能追加：現地スタッフ手配メール機能を使うかどうか（支店ごとに任意。既定は無効＝使わない）
const BM_COL_ARRANGEMENT_ENABLED = '手配メール機能';
// ★機能追加：パスポート番号欄を「お客様情報」タブに出すかどうか（例：イスタンブール支店）。
// 未設定／FALSEの支店では非表示（同意書必須と同じ運用）
const BM_COL_PASSPORT_REQUIRED = 'パスポート番号欄';
// ★機能追加：店舗発の依頼（ロール=SHOPの行が起票した案件）について、支店とのやり取りを
// 手配課を通さず直接行えるようにするかどうか。BRANCHロールの行だけに意味がある設定で、
// 「日本の手配課側があらかじめマスタで決める」という要件どおり、支店マスタの編集はJPのみ可能。
const BM_COL_SHOP_DIRECT = '店舗直接やり取り許可';
// ★機能追加（店舗拡張）：店舗発の新規依頼で、日本の該当手配課への通知メールを送るかどうか
// （支店ごとに切り替え）。既定（未設定）はON＝送る。店舗直接やり取り許可の支店で、
// 手配課への通知が不要な場合にOFFにする想定。案件の可視性・未読フラグには影響しない
// （日本側は常に監督のため案件を閲覧できる。あくまでメール通知だけを止める）。
const BM_COL_SHOP_NOTIFY_HQ = '店舗依頼の手配課通知';
// ★機能追加（店舗拡張）：SHOPロールの行だけに意味を持つ列。店舗発の案件の請求先（店舗の
// 営業本部）として扱う。予約一覧側の「請求先」（日本の地域区分）とは別物。
const BM_COL_SHOP_BILLING = '請求先';
// ★機能追加（店舗拡張）：店舗がアップロードした書類（8章）を現地支店にも見せるかどうか。
// 既定（未設定）はOFF＝手配課のみ閲覧可。
const BM_COL_SHOP_UPLOAD_VISIBLE_TO_BRANCH = '店舗アップロードの現地公開';
const BM_COL_ACTIVE = '有効';
// ★不具合防止：既存のテスト・運用スプレッドシートは「有効」列が支店マスタの最後尾にある前提で
// 位置決め打ちの行を作っている場合がある。新しい列（手配メール機能まわり）は、その並びを崩さないよう
// 必ず「有効」の後ろに追加する（ensureSheetWithHeaders_ が既存シートの末尾へ列を追加するのと同じ考え方）。
const BRANCH_MASTER_HEADERS = [
  BM_COL_CODE, BM_COL_NAME, BM_COL_COUNTRY, BM_COL_CITY, BM_COL_ROLE, BM_COL_TEAM,
  BM_COL_PASSCODE, BM_COL_EMAIL, BM_COL_PREFIX, BM_COL_INVOICE_LABEL, BM_COL_DELIVERY_DAYS,
  BM_COL_REMIND_DAYS, BM_COL_CONSENT_REQUIRED, BM_COL_ACTIVE,
  BM_COL_ARRANGEMENT_ENABLED, BM_COL_PASSPORT_REQUIRED, BM_COL_SHOP_DIRECT,
  BM_COL_SHOP_NOTIFY_HQ, BM_COL_SHOP_BILLING, BM_COL_SHOP_UPLOAD_VISIBLE_TO_BRANCH,
  // カテゴリごとの手配先（名前・メール）。同じ宛先を複数カテゴリに入れれば「まとめて1件に依頼」にできる
  ...ARRANGEMENT_CATEGORIES.flatMap(c => [arrNameCol_(c.label), arrEmailCol_(c.label)])
];

// --- プラン／オプション／撮影場所／スタッフマスタの列定義（支店ごとに管理） ---
const MM_COL_BRANCH = '支店コード';
const MM_COL_NAME = '名称';
const MM_COL_ACTIVE = '有効';
const MASTER_ITEM_HEADERS = [MM_COL_BRANCH, MM_COL_NAME, MM_COL_ACTIVE];

// ★要件：プランごとに撮影希望場所の入力方式（チェックボックスで複数選択／決まった候補から
// 1つ選ぶプルダウン／自由入力）を変えられるようにする（例：ローマ支店の「フィレンツェ3時間フォト」
// では候補A・Bのチェックボックス、「ローマ3時間フォト」では別の候補、というように、プランごとに
// 表示する候補・入力方式が変わる）。プランマスタに列を2つ追加し、コード変更なしでJP・支店側の
// 担当者がスプレッドシート上で自由に設定・変更できるようにする（他のマスタと同じ運用方針）。
const MM_COL_PLAN_LOCATION_MODE = '撮影場所方式';       // 'checkbox' / 'select' / 空欄（＝自由入力。既定）
const MM_COL_PLAN_LOCATION_CANDIDATES = '撮影場所候補';  // 改行または読点（、）区切りの候補一覧
const PLAN_LOCATION_MODE_CHECKBOX = 'checkbox';
const PLAN_LOCATION_MODE_SELECT = 'select';
const PLAN_LOCATION_MODE_FREE = 'free';
const PLAN_MASTER_HEADERS = [MM_COL_BRANCH, MM_COL_NAME, MM_COL_ACTIVE, MM_COL_PLAN_LOCATION_MODE, MM_COL_PLAN_LOCATION_CANDIDATES];
function normalizePlanLocationMode_(v) {
  const s = String(v || '').trim().toLowerCase();
  return (s === PLAN_LOCATION_MODE_CHECKBOX || s === PLAN_LOCATION_MODE_SELECT) ? s : PLAN_LOCATION_MODE_FREE;
}
function splitLocationCandidates_(v) {
  return String(v || '').split(/[\n,、]/).map(s => s.trim()).filter(Boolean);
}

// ★要件：セール名は登録時に「一括（全支店・全プラン共通）」「特定の支店の全プラン共通」
// 「特定の支店の特定プランのみ」のいずれかに反映範囲を指定できるようにする。
// 支店コードに定型文マスタと同じ ALL を入れると全支店共通になる。対象プランを空欄にすると、
// その支店（またはALL）の全プランで使えるセールとして扱う。
const SALE_COL_TARGET_PLAN = '対象プラン';
const SALE_MASTER_HEADERS = [MM_COL_BRANCH, MM_COL_NAME, MM_COL_ACTIVE, SALE_COL_TARGET_PLAN];
const SALE_SHARED_CODE = 'ALL';

// --- 定型文マスタの列定義 ---
// 支店コードに ALL を入れると全支店・日本側の共通テンプレートとして使える
const PH_COL_BRANCH = '支店コード';
const PH_COL_NAME = '表示名';
const PH_COL_BODY = '本文';
const PH_COL_ACTIVE = '有効';
const PHRASE_MASTER_HEADERS = [PH_COL_BRANCH, PH_COL_NAME, PH_COL_BODY, PH_COL_ACTIVE];
const PHRASE_SHARED_CODE = 'ALL';

// --- 履歴シートの列定義 ---
const H_COL_ID = '__id';
const H_COL_BRANCH_CODE = '支店コード';
const H_COL_KANRI = '管理番号';
const H_COL_CHALLENGE_NO = 'CHG NO';
const H_COL_CONFIRMED_DATE = '撮影日FIX';
const H_COL_GROOM_NAME = '新郎名（ローマ字）';
const H_COL_BRIDE_NAME = '新婦名（ローマ字）';
const H_COL_DATETIME = '日時';
const H_COL_SENDER = '送信者';
const H_COL_SENDER_ROLE = '送信者ロール'; // 'JP' / 'BRANCH' / 'SHOP'（未読＝要対応の判定に使用）
const H_COL_BODY = '内容';
const H_COL_CHECK_JP = 'CHECK JP';
const H_COL_DATE_JP = 'DATE JP';
const H_COL_CHECKED_BY_JP = 'CHECK JP 氏名';
const H_COL_CHECK_BRANCH = 'CHECK 支店';
const H_COL_DATE_BRANCH = 'DATE 支店';
const H_COL_CHECKED_BY_BRANCH = 'CHECK 支店 氏名';
// ★機能追加：店舗ロールが関わるメッセージの既読チェック用（起票元店舗が無い通常の案件では使わない）
const H_COL_CHECK_SHOP = 'CHECK 店舗';
const H_COL_DATE_SHOP = 'DATE 店舗';
const H_COL_CHECKED_BY_SHOP = 'CHECK 店舗 氏名';
// ★機能追加：起票元店舗が絡む案件は「送信者」だけでは相手（宛先）が一意に決まらないため
// （JP⇔支店・JP⇔店舗・支店⇔店舗の3通りがあり得る）、宛先ロールもそのまま記録しておく。
// 起票元店舗が無い通常の案件・この機能追加より前のデータでは空欄のままになる
// （読み取り側は空欄なら送信者ロールから相手を推定する＝従来の2者間ロジックにフォールバックする）。
const H_COL_RECIPIENT_ROLE = '宛先ロール';
const H_COL_ORIGIN_SHOP = '起票元店舗';
const HISTORY_HEADERS = [
  H_COL_ID, H_COL_BRANCH_CODE, H_COL_KANRI, H_COL_CHALLENGE_NO, H_COL_CONFIRMED_DATE,
  H_COL_GROOM_NAME, H_COL_BRIDE_NAME, H_COL_DATETIME, H_COL_SENDER, H_COL_SENDER_ROLE, H_COL_BODY,
  H_COL_CHECK_JP, H_COL_DATE_JP, H_COL_CHECKED_BY_JP, H_COL_CHECK_BRANCH, H_COL_DATE_BRANCH, H_COL_CHECKED_BY_BRANCH,
  H_COL_CHECK_SHOP, H_COL_DATE_SHOP, H_COL_CHECKED_BY_SHOP, H_COL_RECIPIENT_ROLE, H_COL_ORIGIN_SHOP
];

// --- ステータス変更履歴（STS JP／STS 支店／各OPのSTSを「誰が・いつ・何から何に」変更したかの監査ログ） ---
const SL_COL_KANRI = '管理番号';
const SL_COL_FIELD = 'フィールド';
const SL_COL_OLD = '変更前';
const SL_COL_NEW = '変更後';
const SL_COL_WHO = '変更者';
const SL_COL_WHEN = '日時';
const STATUS_LOG_HEADERS = [SL_COL_KANRI, SL_COL_FIELD, SL_COL_OLD, SL_COL_NEW, SL_COL_WHO, SL_COL_WHEN];

// --- メモ履歴（共有メモ／メモ（現地用）／アンケート回答を積み上げ式で記録） ---
const ML_COL_KANRI = '管理番号';
const ML_COL_TYPE = '種別';       // MEMO_TYPES のいずれか
const ML_COL_BODY = '内容';
const ML_COL_WHO = '記入者';      // 自動反映（お客様アンケートの場合は MEMO_AUTHOR_CUSTOMER）
const ML_COL_WHEN = '日時';       // 自動反映
const MEMO_LOG_HEADERS = [ML_COL_KANRI, ML_COL_TYPE, ML_COL_BODY, ML_COL_WHO, ML_COL_WHEN];

// --- 手配履歴（現地スタッフ手配メールの送信履歴） ---
const AL_COL_KANRI = '管理番号';
const AL_COL_CATEGORY = 'カテゴリ';       // ARRANGEMENT_CATEGORIES の label
const AL_COL_TO_NAME = '宛先名';
const AL_COL_TO_EMAIL = '宛先メール';
const AL_COL_SUBJECT = '件名';
const AL_COL_BODY = '本文';
const AL_COL_WHO = '送信者';              // 自動反映
const AL_COL_WHEN = '日時';               // 自動反映
const ARRANGEMENT_LOG_HEADERS = [
  AL_COL_KANRI, AL_COL_CATEGORY, AL_COL_TO_NAME, AL_COL_TO_EMAIL, AL_COL_SUBJECT, AL_COL_BODY, AL_COL_WHO, AL_COL_WHEN
];

// =====================================================
// ⓪ Webアプリのエントリポイント
// =====================================================
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('WEDLINK 支店ポータル')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // ★セキュリティ：以前は ALLOWALL で、どんな外部サイトからでもiframeに埋め込めた。
    // 埋め込んだ画面の上に透明な要素を重ねて誤操作させる手口（クリックジャッキング）を
    // 防ぐため、既定（Googleのドメイン内のみ）に戻す。通常の利用に影響はない。
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =====================================================
// ① 初期セットアップ（初回のみ手動実行）
// =====================================================
function setupPortal() {
  const ss = getSpreadsheet_();

  ensureSheetWithHeaders_(ss, BRANCH_MASTER_SHEET_NAME, BRANCH_MASTER_HEADERS);
  ensureSheetWithHeaders_(ss, PLAN_MASTER_SHEET_NAME, PLAN_MASTER_HEADERS);
  ensureSheetWithHeaders_(ss, OPTION_MASTER_SHEET_NAME, MASTER_ITEM_HEADERS);
  ensureSheetWithHeaders_(ss, LOCATION_MASTER_SHEET_NAME, MASTER_ITEM_HEADERS);
  ensureSheetWithHeaders_(ss, STAFF_MASTER_SHEET_NAME, MASTER_ITEM_HEADERS);
  ensureSheetWithHeaders_(ss, PHRASE_MASTER_SHEET_NAME, PHRASE_MASTER_HEADERS);
  ensureSheetWithHeaders_(ss, SALE_MASTER_SHEET_NAME, SALE_MASTER_HEADERS);
  ensureSheetWithHeaders_(ss, RESERVATION_SHEET_NAME, RESERVATION_HEADERS);
  ensureSheetWithHeaders_(ss, HISTORY_SHEET_NAME, HISTORY_HEADERS);
  ensureSheetWithHeaders_(ss, ARCHIVE_SHEET_NAME, RESERVATION_HEADERS);
  ensureSheetWithHeaders_(ss, STATUS_LOG_SHEET_NAME, STATUS_LOG_HEADERS);
  ensureSheetWithHeaders_(ss, MEMO_LOG_SHEET_NAME, MEMO_LOG_HEADERS);
  ensureSheetWithHeaders_(ss, ARRANGEMENT_LOG_SHEET_NAME, ARRANGEMENT_LOG_HEADERS);

  const bm = ss.getSheetByName(BRANCH_MASTER_SHEET_NAME);
  if (bm.getLastRow() < 2) {
    // ★不具合修正：以前はここに支店マスタの全列を順番どおり並べていたため、
    // 「同意書必須」のように列を1つ増やすたびにこのシード行もズレて、
    // まっさらなスプレッドシートでの setupPortal が落ちる（＝新規導入が一切できない）状態になっていた。
    // 下記は SEED_BRANCH_FIELDS の9項目だけを並べ、残りの列は列名基準で空欄（有効のみtrue）を埋める。
    // 今後どれだけ列が増えても、この配列を直す必要はない。
    const SEED_BRANCH_FIELDS = [
      BM_COL_CODE, BM_COL_NAME, BM_COL_COUNTRY, BM_COL_CITY, BM_COL_ROLE,
      BM_COL_TEAM, BM_COL_PASSCODE, BM_COL_EMAIL, BM_COL_PREFIX
    ];
    const rows = [
      // 支店コード, 支店名, 国, 都市, ロール, 手配チーム, パスコード, 通知先メール, 番号プレフィックス
      ['KANTO', '関東手配課', '', '', JP_ROLE, '関東', 'CHANGE-ME-KANTO', 'tw-avanti@his-world.com', ''],
      ['KANSAI', '関西手配課', '', '', JP_ROLE, '関西', 'CHANGE-ME-KANSAI', 'o-avanti@his-world.com', ''],
      // ローマは既に「R-」採番で運用中のためプレフィックスは変更しない
      ['ROW', 'ローマ支店', 'イタリア', 'ローマ', BRANCH_ROLE, '', 'CHANGE-ME-ROW', 'row-branch@his-world.com', 'R'],
      ['VIE', 'ウィーン支店', 'オーストリア', 'ウィーン', BRANCH_ROLE, '', 'CHANGE-ME-VIE', 'vienna-branch@his-world.com', 'VIE'],
      ['AMS', 'アムステルダム支店', 'オランダ', 'アムステルダム', BRANCH_ROLE, '', 'CHANGE-ME-AMS', 'amsterdam-branch@his-world.com', 'AMS'],
      ['GVA', 'ジュネーブ支店', 'スイス', 'ジュネーブ', BRANCH_ROLE, '', 'CHANGE-ME-GVA', 'geneva-branch@his-world.com', 'GVA'],
      ['ATH', 'アテネ支店', 'ギリシャ', 'アテネ', BRANCH_ROLE, '', 'CHANGE-ME-ATH', 'athens-branch@his-world.com', 'ATH'],
      ['IST', 'イスタンブール支店', 'トルコ', 'イスタンブール', BRANCH_ROLE, '', 'CHANGE-ME-IST', 'istanbul-branch@his-world.com', 'IST'],
      ['DXB', 'ドバイ支店', 'アラブ首長国連邦', 'ドバイ', BRANCH_ROLE, '', 'CHANGE-ME-DXB', 'dubai-branch@his-world.com', 'DXB'],
      ['CAI', 'カイロ支店', 'エジプト', 'カイロ', BRANCH_ROLE, '', 'CHANGE-ME-CAI', 'cairo-branch@his-world.com', 'CAI'],
      ['CAS', 'カサブランカ支店', 'モロッコ', 'カサブランカ', BRANCH_ROLE, '', 'CHANGE-ME-CAS', 'casablanca-branch@his-world.com', 'CAS'],
      ['LON', 'ロンドン支店', 'イギリス', 'ロンドン', BRANCH_ROLE, '', 'CHANGE-ME-LON', 'london-branch@his-world.com', 'LON'],
      ['FRA', 'フランクフルト支店', 'ドイツ', 'フランクフルト', BRANCH_ROLE, '', 'CHANGE-ME-FRA', 'frankfurt-branch@his-world.com', 'FRA'],
      ['NBO', 'ナイロビ支店', 'ケニア', 'ナイロビ', BRANCH_ROLE, '', 'CHANGE-ME-NBO', 'nairobi-branch@his-world.com', 'NBO'],
      ['CUN', 'カンクン支店', 'メキシコ', 'カンクン', BRANCH_ROLE, '', 'CHANGE-ME-CUN', 'cancun-branch@his-world.com', 'CUN'],
      ['YVR', 'バンクーバー支店', 'カナダ', 'バンクーバー', BRANCH_ROLE, '', 'CHANGE-ME-YVR', 'vancouver-branch@his-world.com', 'YVR'],
      ['LPB', 'ラパス支店', 'ボリビア', 'ラパス', BRANCH_ROLE, '', 'CHANGE-ME-LPB', 'lapaz-branch@his-world.com', 'LPB'],
      ['FIJ', 'フィジー支店', 'フィジー', '', BRANCH_ROLE, '', 'CHANGE-ME-FIJ', 'fiji-branch@his-world.com', 'FIJ'],
      ['AUS', 'オーストラリア支店', 'オーストラリア', '', BRANCH_ROLE, '', 'CHANGE-ME-AUS', 'australia-branch@his-world.com', 'AUS'],
      ['NZL', 'ニュージーランド支店', 'ニュージーランド', '', BRANCH_ROLE, '', 'CHANGE-ME-NZL', 'newzealand-branch@his-world.com', 'NZL'],
      ['DPS', 'デンパサール支店', 'インドネシア', 'デンパサール', BRANCH_ROLE, '', 'CHANGE-ME-DPS', 'denpasar-branch@his-world.com', 'DPS'],
      ['TPE', '台北支店', '台湾', '台北', BRANCH_ROLE, '', 'CHANGE-ME-TPE', 'taipei-branch@his-world.com', 'TPE'],
      ['SIN', 'シンガポール支店', 'シンガポール', 'シンガポール', BRANCH_ROLE, '', 'CHANGE-ME-SIN', 'singapore-branch@his-world.com', 'SIN'],
      ['REP', 'シェムリアップ支店', 'カンボジア', 'シェムリアップ', BRANCH_ROLE, '', 'CHANGE-ME-REP', 'siemreap-branch@his-world.com', 'REP'],
      ['TAS', 'タシケント支店', 'ウズベキスタン', 'タシケント', BRANCH_ROLE, '', 'CHANGE-ME-TAS', 'tashkent-branch@his-world.com', 'TAS'],
      ['JED', 'ジェッダ支店', 'サウジアラビア', 'ジェッダ', BRANCH_ROLE, '', 'CHANGE-ME-JED', 'jeddah-branch@his-world.com', 'JED']
    ];
    const seedRows = rows.map(vals => {
      const byName = {};
      SEED_BRANCH_FIELDS.forEach((h, i) => { byName[h] = vals[i]; });
      byName[BM_COL_ACTIVE] = true;
      return BRANCH_MASTER_HEADERS.map(h => (h in byName ? byName[h] : ''));
    });
    bm.getRange(2, 1, seedRows.length, BRANCH_MASTER_HEADERS.length).setValues(seedRows);
  }
  [
    bm,
    ss.getSheetByName(PLAN_MASTER_SHEET_NAME),
    ss.getSheetByName(OPTION_MASTER_SHEET_NAME),
    ss.getSheetByName(LOCATION_MASTER_SHEET_NAME),
    ss.getSheetByName(STAFF_MASTER_SHEET_NAME),
    ss.getSheetByName(PHRASE_MASTER_SHEET_NAME),
    ss.getSheetByName(SALE_MASTER_SHEET_NAME),
    ss.getSheetByName(RESERVATION_SHEET_NAME),
    ss.getSheetByName(HISTORY_SHEET_NAME),
    ss.getSheetByName(ARCHIVE_SHEET_NAME),
    ss.getSheetByName(STATUS_LOG_SHEET_NAME),
    ss.getSheetByName(MEMO_LOG_SHEET_NAME),
    ss.getSheetByName(ARRANGEMENT_LOG_SHEET_NAME)
  ].forEach(formatHeaderRow_);

  // 未読フラグ列を追加した直後は全て空欄になるため、履歴から実態を計算して反映する
  rebuildUnreadFlags();

  SpreadsheetApp.getUi().alert(
    'セットアップが完了しました。\n\n' +
    '「支店マスタ」シートで各行のログインパスコード・通知先メールを実際の値に書き換えてから、\n' +
    'デプロイ（ウェブアプリとして導入）してください。\n' +
    '支店を追加したいときは「支店マスタ」シートに1行追加するだけでOKです（コード変更不要）。\n' +
    '案件番号プレフィックスは支店ごとに一意である必要があります（ローマ支店は既存運用のため "R" のまま変更しないでください）。\n\n' +
    '※この関数は何度でも安全に実行できます。コードを新しい版に差し替えたあとに再実行すると、\n' +
    '　新しく増えた列だけが各シートの右端に追加されます（既存のデータや入力済みの値は消えません）。'
  );
}

function ensureSheetWithHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }
  // ★不具合修正（重大）：以前は「シートが空のときだけヘッダーを書く」実装だったため、
  // 機能追加で列が増えても既存シートには反映されなかった。その状態で運用すると
  //  ・請求番号／現地記入欄などの新項目を保存しようとするとエラーになる
  //  ・やり取り履歴の書き込み位置がずれてデータが壊れる
  // といった問題が起きる。既存シートに不足している列を末尾へ追加して追従させる。
  // （列の削除・並べ替えは行わないので、既存データは一切失われない）
  const lastCol = sheet.getLastColumn();
  const existing = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim())
    : [];
  const missing = headers.filter(h => existing.indexOf(h) === -1);
  if (missing.length > 0) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

function formatHeaderRow_(sheet) {
  if (!sheet) return;
  const range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setBackground('#00bcd4').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function getSpreadsheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'PUT_YOUR_SPREADSHEET_ID_HERE') {
    throw new Error('SPREADSHEET_ID が未設定です。Code.gs 上部に対象スプレッドシートのIDを設定してください。');
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// =====================================================
// ② 認証・セッション
// =====================================================
// スプレッドシートのチェックボックス列は実体がboolean(true/false)のことも、
// プレーンテキストで"TRUE"/"FALSE"のこともあるため、両対応で真偽判定する
function isActiveFlag_(val) {
  return val === true || String(val).trim().toUpperCase() === 'TRUE';
}

// ★機能追加（店舗拡張）：一部の設定は「未設定＝ON」を既定にしたい（例：店舗依頼の手配課通知）。
// 明示的にFALSEと書かれた場合だけOFF扱いにする（isActiveFlag_の逆＝既定値だけが違う）。
function isActiveFlagDefaultTrue_(val) {
  return String(val).trim().toUpperCase() !== 'FALSE';
}

// 支店マスタの「納品期限日数」等、任意入力の整数列を安全にパースする。
// 未入力は null（呼び出し側でデフォルト値にフォールバック）。
// ★不具合修正：単純に `Number(val) || null` にすると 0 が falsy 判定でnull扱いになり、
// 「0日（撮影当日から即アラート）」を設定できなくなる。また小数（例: "30.5"）が入っていると
// 後続の日数比較・7日おき再送の剰余判定が永久に一致せず、アラートが一切飛ばなくなるため、
// 必ず整数に丸めてから返す。
function parseIntOrNull_(val) {
  if (val === '' || val === null || val === undefined) return null;
  const n = Math.round(Number(val));
  return isNaN(n) ? null : n;
}

// ログイン画面のプルダウンに出す一覧（未ログインでも呼べる。パスコード・メール等は含めない）
function apiListLoginOptions() {
  const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
  return getRowsAsObjects_(sheet)
    .filter(r => isActiveFlag_(r[BM_COL_ACTIVE]))
    .map(r => ({
      code: r[BM_COL_CODE],
      name: r[BM_COL_NAME],
      role: normalizeRole_(r[BM_COL_ROLE])
    }));
}

function apiLogin(branchCode, passcode) {
  const code = String(branchCode === null || branchCode === undefined ? '' : branchCode).trim().toUpperCase();
  if (!code) return { ok: false, error: '支店を選択してください。' };

  // ★セキュリティ：パスコードは短い合言葉のため、総当たりで試されると破られ得る。
  // 支店コード単位で連続失敗回数を数え、一定回数を超えたら一時的にログインを止める。
  const cache = CacheService.getScriptCache();
  const failKey = 'loginfail_' + code;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= LOGIN_MAX_ATTEMPTS) {
    return { ok: false, error: `ログインの失敗が続いたため、${Math.round(LOGIN_LOCKOUT_SEC / 60)}分ほどこの支店のログインを停止しています。時間をおいて再度お試しください。` };
  }

  const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet);

  const match = rows.find(r =>
    String(r[BM_COL_CODE]).trim().toUpperCase() === code &&
    String(r[BM_COL_PASSCODE]) === String(passcode === null || passcode === undefined ? '' : passcode) &&
    isActiveFlag_(r[BM_COL_ACTIVE])
  );

  if (!match) {
    // 失敗回数を加算（LOGIN_LOCKOUT_SEC 経過すればキャッシュ失効で自動的に解除される）
    cache.put(failKey, String(fails + 1), LOGIN_LOCKOUT_SEC);
    return { ok: false, error: '支店コードまたはパスコードが違います。' };
  }
  cache.remove(failKey); // 成功したら失敗回数をリセット

  const role = normalizeRole_(match[BM_COL_ROLE]);
  const token = Utilities.getUuid();
  const session = {
    token,
    // ★店舗ロールもこのフィールドをそのまま「自分のコード」として使う（支店コードと同じ扱い）。
    // 案件側の起票元店舗（COL_ORIGIN_SHOP）もこのコードで一致判定する。
    branchCode: String(match[BM_COL_CODE]).trim().toUpperCase(),
    branchName: match[BM_COL_NAME],
    role,
    team: role === JP_ROLE ? match[BM_COL_TEAM] : ''
  };
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(session), SESSION_TTL_SEC);

  return { ok: true, session };
}

function apiLogout(token) {
  CacheService.getScriptCache().remove('sess_' + token);
  return { ok: true };
}

function requireSession_(token) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get('sess_' + token);
  if (!raw) throw new Error('セッションの有効期限が切れました。再度ログインしてください。');
  const session = JSON.parse(raw);
  cache.put('sess_' + token, raw, SESSION_TTL_SEC); // スライディング延長
  return session;
}

function assertJp_(session) {
  if (session.role !== JP_ROLE) throw new Error('この操作は日本手配課（関東／関西）のみ実行できます。');
}

function assertBranchAccess_(session, branchCode) {
  // ★不具合防止：以前は「BRANCHロールで自支店以外」だけを拒否し、それ以外（＝JPロール）は
  // 素通りさせていた。ロールがJP／BRANCHの2種類しか無かった間は問題なかったが、
  // 店舗ロール（SHOP）を追加したことで「BRANCHロールではない＝無条件で許可」という前提が崩れる
  // （支店マスタ・プラン等の管理APIを店舗ロールが呼べてしまう）。許可する条件を明示し、
  // それ以外は必ず拒否する形に直す。
  if (session.role === JP_ROLE) return;
  if (session.role === BRANCH_ROLE && session.branchCode === String(branchCode).trim().toUpperCase()) return;
  throw new Error('自分の支店以外のデータは操作できません。');
}

// ★要件：メッセージ・変更履歴に個人名を残す。
// 各拠点のGoogleアカウントは「氏名@his-world.com」形式で運用されている前提のため、
// ログイン中のGoogleアカウントのメールアドレスからローカル部（氏名部分）を取り出す。
// Webアプリを「アクセスしたユーザーとして実行」かつ組織内限定で公開している場合のみ取得できる。
// 取得できない場合（デプロイ設定が異なる等）は空文字を返し、呼び出し側は支店名/チーム名にフォールバックする。
function getActiveUserName_() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (email) return email.split('@')[0];
  } catch (e) {
    // ignore
  }
  return '';
}

// 履歴・メールに使う「送信者ラベル」。個人名が取得できれば「氏名（支店名/チーム名）」、
// 取得できなければ従来どおり支店名/チーム名のみ。
function senderLabel_(session) {
  const personal = getActiveUserName_();
  return personal ? `${personal}（${session.branchName}）` : session.branchName;
}

// ログイン中の実際の担当者名を画面表示用に返す（取得できなければ空文字）
function apiGetCurrentUserName(token) {
  requireSession_(token);
  return { name: getActiveUserName_() };
}

// =====================================================
// ③ 支店マスタ管理（JPのみ）— これが「横展開」の実体
// =====================================================
function apiListBranches(token) {
  const session = requireSession_(token);
  assertJp_(session);
  return listBranchesRaw_();
}

// 支店マスタの「ロール」列を正規化する（JP／SHOP／それ以外はBRANCHとして扱う）。
// listBranchesRaw_・apiLogin・apiListLoginOptions で必ずこれを通す：どれか1箇所だけ
// 表記ゆれに寛容な独自ロジックを持つと、ロールごとの判定がずれる不具合につながるため。
function normalizeRole_(raw) {
  const v = String(raw || '').trim().toUpperCase();
  if (v === JP_ROLE) return JP_ROLE;
  if (v === SHOP_ROLE) return SHOP_ROLE;
  return BRANCH_ROLE;
}

function listBranchesRaw_() {
  const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
  return getRowsAsObjects_(sheet).map(r => ({
    // ★不具合修正：支店コード・ロールはスプレッドシート上の表記ゆれ（大文字小文字・前後の空白）に関わらず
    // 常に正規化して返す。他の全ての判定（apiLogin・セッション・JP側メール振り分け等）は
    // 正規化済みの値（大文字の支店コード、"BRANCH"/"JP"/"SHOP"）を前提にしているため、ここで揺れを残すと
    // 「スプレッドシート上のロール表記が少し崩れただけで、その支店がJP側の一覧・新規案件の選択肢・
    // メール送信先候補から静かに消える」という気づきにくい不具合につながる。
    code: String(r[BM_COL_CODE] || '').trim().toUpperCase(),
    name: r[BM_COL_NAME], country: r[BM_COL_COUNTRY], city: r[BM_COL_CITY],
    role: normalizeRole_(r[BM_COL_ROLE]),
    team: String(r[BM_COL_TEAM] || '').trim(), email: r[BM_COL_EMAIL], prefix: r[BM_COL_PREFIX],
    invoiceLabel: r[BM_COL_INVOICE_LABEL] || '請求番号',
    // ★機能追加：店舗直接やり取り許可（BRANCHロールの行のみ意味を持つ）
    shopDirect: isActiveFlag_(r[BM_COL_SHOP_DIRECT]),
    // ★機能追加（店舗拡張）：店舗発の新規依頼で日本の手配課へメール通知するか（既定ON）
    shopNotifyHq: isActiveFlagDefaultTrue_(r[BM_COL_SHOP_NOTIFY_HQ]),
    // ★機能追加（店舗拡張）：SHOPロールの行のみ意味を持つ、店舗の営業本部（請求先表示用）
    shopBilling: r[BM_COL_SHOP_BILLING] || '',
    // ★機能追加（店舗拡張）：店舗がアップロードした書類を現地支店にも公開するか（既定OFF）
    shopUploadVisibleToBranch: isActiveFlag_(r[BM_COL_SHOP_UPLOAD_VISIBLE_TO_BRANCH]),
    deliveryDays: parseIntOrNull_(r[BM_COL_DELIVERY_DAYS]),
    remindDays: parseIntOrNull_(r[BM_COL_REMIND_DAYS]),
    consentRequired: isActiveFlag_(r[BM_COL_CONSENT_REQUIRED]),
    passportRequired: isActiveFlag_(r[BM_COL_PASSPORT_REQUIRED]),
    active: isActiveFlag_(r[BM_COL_ACTIVE])
    // ログインパスコードは一覧APIには返さない（画面表示上の漏洩防止）
  }));
}

function apiSaveBranch(token, branch) {
  const session = requireSession_(token);
  assertJp_(session);
  // ★引数そのものが欠けている場合にGAS内部の英語エラーが画面へ出ないようにする
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
    throw new Error('支店の情報が正しく送信されませんでした。入力内容を確認してください。');
  }
  if (!branch.code || !branch.name) {
    throw new Error('支店コード・支店名は必須です。');
  }
  const role = branch.role === JP_ROLE ? JP_ROLE : BRANCH_ROLE;
  const code = String(branch.code).trim().toUpperCase();
  const prefix = role === BRANCH_ROLE ? (String(branch.prefix || code).trim().toUpperCase()) : '';

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastRow = sheet.getLastRow();
    const codeColIdx = headers.indexOf(BM_COL_CODE);
    const prefixColIdx = headers.indexOf(BM_COL_PREFIX);
    const passcodeColIdx = headers.indexOf(BM_COL_PASSCODE);
    let targetRow = -1;
    let existingPasscode = '';
    let existingRowValues = null;

    if (lastRow > 1) {
      const existing = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      for (let i = 0; i < existing.length; i++) {
        const rowCode = String(existing[i][codeColIdx]).trim().toUpperCase();
        if (rowCode === code) {
          targetRow = i + 2;
          existingPasscode = existing[i][passcodeColIdx];
          existingRowValues = existing[i];
          continue;
        }
        // 案件番号プレフィックスの重複チェック（支店が増えても番号が破綻しないための必須制約）
        if (role === BRANCH_ROLE && prefix &&
            String(existing[i][prefixColIdx]).trim().toUpperCase() === prefix) {
          throw new Error(`案件番号プレフィックス「${prefix}」は既に「${existing[i][headers.indexOf(BM_COL_NAME)]}」で使用されています。別のプレフィックスにしてください。`);
        }
      }
    }

    // 新規追加時はパスコード必須。既存支店の編集で未入力の場合は現在のパスコードを維持する
    const passcode = String(branch.passcode || '').trim();
    if (targetRow === -1 && !passcode) {
      throw new Error('新規追加の場合はログインパスコードが必須です。');
    }
    const finalPasscode = passcode || existingPasscode;

    const rowData = headers.map((h, idx) => {
      switch (h) {
        case BM_COL_CODE: return code;
        case BM_COL_NAME: return branch.name;
        case BM_COL_COUNTRY: return branch.country || '';
        case BM_COL_CITY: return branch.city || '';
        case BM_COL_ROLE: return role;
        case BM_COL_TEAM: return role === JP_ROLE ? (branch.team || '') : '';
        case BM_COL_PASSCODE: return finalPasscode;
        case BM_COL_EMAIL: return branch.email || '';
        case BM_COL_PREFIX: return prefix;
        case BM_COL_ACTIVE: return branch.active !== false;
        // ★不具合修正：このAPIが直接扱わない列（請求番号欄名称・納品期限日数など、今後追加される
        // 列も含む）は、新規行なら空欄、既存行の編集なら元の値をそのまま維持する。
        // 以前は無条件に空文字で上書きしていたため、このAPI経由で支店情報を保存すると
        // スプレッドシート側で個別に設定していた値が消えてしまう不具合があった。
        default: return existingRowValues ? existingRowValues[idx] : '';
      }
    });
    if (targetRow === -1) {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([rowData]);
    } else {
      sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// 有効／無効のみを切り替える軽量API（パスコードを再送する必要がない）
function apiSetBranchActive(token, code, active) {
  const session = requireSession_(token);
  assertJp_(session);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastRow = sheet.getLastRow();
    const codeColIdx = headers.indexOf(BM_COL_CODE);
    const activeColIdx = headers.indexOf(BM_COL_ACTIVE);
    if (lastRow > 1) {
      const codes = sheet.getRange(2, codeColIdx + 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < codes.length; i++) {
        if (String(codes[i][0]).trim().toUpperCase() === String(code).trim().toUpperCase()) {
          sheet.getRange(i + 2, activeColIdx + 1).setValue(!!active);
          return { ok: true };
        }
      }
    }
    throw new Error('対象の支店が見つかりません。');
  } finally {
    lock.releaseLock();
  }
}

// =====================================================
// ④ プラン／オプションマスタ管理（支店ごと。自支店 or JPが操作可能）
// =====================================================
// ★要件：プランごとに撮影希望場所の入力方式・候補が変わるため、name/activeだけでなく
// locationMode（'checkbox'/'select'/'free'）とlocationCandidates（候補の配列）も返す。
// 既存の呼び出し側はname/activeしか見ないため、この拡張だけでは何も壊れない。
function apiListPlans(token, branchCode) {
  const session = requireSession_(token);
  const target = session.role === BRANCH_ROLE ? session.branchCode : String(branchCode || '').toUpperCase();
  const sheet = getSpreadsheet_().getSheetByName(PLAN_MASTER_SHEET_NAME);
  return getRowsAsObjects_(sheet)
    .filter(r => String(r[MM_COL_BRANCH]).trim().toUpperCase() === String(target).trim().toUpperCase())
    .map(r => ({
      name: r[MM_COL_NAME],
      active: isActiveFlag_(r[MM_COL_ACTIVE]),
      locationMode: normalizePlanLocationMode_(r[MM_COL_PLAN_LOCATION_MODE]),
      locationCandidates: splitLocationCandidates_(r[MM_COL_PLAN_LOCATION_CANDIDATES])
    }));
}
function apiListOptionItems(token, branchCode) {
  const session = requireSession_(token);
  const target = session.role === BRANCH_ROLE ? session.branchCode : String(branchCode || '').toUpperCase();
  return listMasterItems_(OPTION_MASTER_SHEET_NAME, target);
}
// 撮影希望場所：支店ごとのマスター候補一覧（任意入力の補助用。強制の選択式にはしない）
function apiListLocations(token, branchCode) {
  const session = requireSession_(token);
  const target = session.role === BRANCH_ROLE ? session.branchCode : String(branchCode || '').toUpperCase();
  return listMasterItems_(LOCATION_MASTER_SHEET_NAME, target);
}
// ★機能追加：現地スタッフ（カメラマン・ヘアメイク等）の入力候補。
// 自由入力の表記ゆれ（"M.Gruber" と "Gruber"）はダブルブッキング検知の精度を落とすため、
// 候補から選べるようにして表記を揃える狙い。
function apiListStaff(token, branchCode) {
  const session = requireSession_(token);
  const target = session.role === BRANCH_ROLE ? session.branchCode : String(branchCode || '').toUpperCase();
  return listMasterItems_(STAFF_MASTER_SHEET_NAME, target);
}
function apiSaveStaffItem(token, branchCode, name, originalName, active) {
  const session = requireSession_(token);
  assertBranchAccess_(session, branchCode);
  return saveMasterItem_(STAFF_MASTER_SHEET_NAME, branchCode, name, originalName, active);
}

// ★機能追加：セール名（機能⑤）。プランマスタと同じく支店ごとの事前登録＋自由入力の両対応。
// セールは頻度が高く名称も毎回変わるため、必須の選択式にはしない（撮影希望場所と同じ運用）
// ★要件：セールは登録時に反映範囲を選べるようにする。
//   ・支店コードにALLを入れる＝全支店共通（定型文マスタのALLと同じ考え方）
//   ・対象プランが空欄＝その支店（またはALL）の全プランで使える
//   ・対象プランを指定＝そのプランを選んだ時だけ候補に出る
// planNameを渡すと、対象プランが空欄の行＋そのプラン名と一致する行だけに絞り込む
// （渡さない場合は従来どおり支店単位の全件を返す＝新規依頼フォームで支店だけ選んだ直後などに使う）。
function apiListSales(token, branchCode, planName) {
  const session = requireSession_(token);
  const target = String(session.role === BRANCH_ROLE ? session.branchCode : (branchCode || '')).trim().toUpperCase();
  const plan = String(planName || '').trim();
  const sheet = getSpreadsheet_().getSheetByName(SALE_MASTER_SHEET_NAME);
  return getRowsAsObjects_(sheet)
    .filter(r => {
      const code = String(r[MM_COL_BRANCH]).trim().toUpperCase();
      if (code !== SALE_SHARED_CODE && code !== target) return false;
      const targetPlan = String(r[SALE_COL_TARGET_PLAN] || '').trim();
      if (!plan || !targetPlan) return true; // 対象プラン未指定の絞り込み、またはこの行が全プラン共通
      return targetPlan === plan;
    })
    .map(r => ({ name: r[MM_COL_NAME], active: isActiveFlag_(r[MM_COL_ACTIVE]), targetPlan: r[SALE_COL_TARGET_PLAN] || '' }));
}
// targetPlanは省略可（省略・空欄＝全プラン共通）。branchCodeにALLを渡すと全支店共通のセールになる。
function apiSaveSaleItem(token, branchCode, name, originalName, active, targetPlan) {
  const session = requireSession_(token);
  if (String(branchCode || '').trim().toUpperCase() !== SALE_SHARED_CODE) assertBranchAccess_(session, branchCode);
  else if (session.role !== JP_ROLE) throw new Error('全支店共通（ALL）のセール登録はJPロールのみ実行できます。');
  return saveMasterItem_(SALE_MASTER_SHEET_NAME, branchCode, name, originalName, active, [String(targetPlan || '')]);
}

// ★機能追加：メッセージの定型文。支店コードに ALL を入れた行は全員が使える共通テンプレート。
function apiListPhrases(token, branchCode) {
  const session = requireSession_(token);
  const target = session.role === BRANCH_ROLE ? session.branchCode : String(branchCode || '').toUpperCase();
  const sheet = getSpreadsheet_().getSheetByName(PHRASE_MASTER_SHEET_NAME);
  return getRowsAsObjects_(sheet)
    .filter(r => {
      if (!isActiveFlag_(r[PH_COL_ACTIVE])) return false;
      const code = String(r[PH_COL_BRANCH]).trim().toUpperCase();
      return code === PHRASE_SHARED_CODE || code === String(target).trim().toUpperCase();
    })
    .map(r => ({
      name: r[PH_COL_NAME] || r[PH_COL_BODY],
      body: r[PH_COL_BODY] || r[PH_COL_NAME],
      shared: String(r[PH_COL_BRANCH]).trim().toUpperCase() === PHRASE_SHARED_CODE
    }));
}

function apiSaveLocationItem(token, branchCode, name, originalName, active) {
  const session = requireSession_(token);
  assertBranchAccess_(session, branchCode);
  return saveMasterItem_(LOCATION_MASTER_SHEET_NAME, branchCode, name, originalName, active);
}
// locationMode/locationCandidatesTextは省略可（省略時は自由入力＝従来どおりのプランのまま）。
// locationCandidatesTextは改行または読点（、）区切りの文字列で渡す。
function apiSavePlanItem(token, branchCode, name, originalName, active, locationMode, locationCandidatesText) {
  const session = requireSession_(token);
  assertBranchAccess_(session, branchCode);
  return saveMasterItem_(PLAN_MASTER_SHEET_NAME, branchCode, name, originalName, active,
    [normalizePlanLocationMode_(locationMode) === PLAN_LOCATION_MODE_FREE ? '' : normalizePlanLocationMode_(locationMode), String(locationCandidatesText || '')]);
}
function apiSaveOptionItem(token, branchCode, name, originalName, active) {
  const session = requireSession_(token);
  assertBranchAccess_(session, branchCode);
  return saveMasterItem_(OPTION_MASTER_SHEET_NAME, branchCode, name, originalName, active);
}

function listMasterItems_(sheetName, branchCode) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  return getRowsAsObjects_(sheet)
    .filter(r => String(r[MM_COL_BRANCH]).trim().toUpperCase() === String(branchCode).trim().toUpperCase())
    .map(r => ({ name: r[MM_COL_NAME], active: isActiveFlag_(r[MM_COL_ACTIVE]) }));
}

// extraCols: プランマスタ（撮影場所方式・撮影場所候補）やセールマスタ（対象プラン）など、
// 基本の3列（支店コード・名称・有効）より後ろに続く追加列の値を渡す（省略時は基本3列のみ書く。
// オプション／撮影場所／スタッフマスタは今まで通り3列のまま）。
function saveMasterItem_(sheetName, branchCode, name, originalName, active, extraCols) {
  if (!name || !String(name).trim()) throw new Error('名称を入力してください。');
  const code = String(branchCode).trim().toUpperCase();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(sheetName);
    const lastRow = sheet.getLastRow();
    let targetRow = -1;
    if (lastRow > 1) {
      // 支店コード・名称の2列だけ見て既存行を探す（追加列があっても位置は変わらないため2列で十分）
      const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      const matchName = (originalName || name);
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][0]).trim().toUpperCase() === code &&
            String(values[i][1]) === String(matchName)) {
          targetRow = i + 2;
          break;
        }
      }
    }
    const rowData = [code, name, active !== false].concat(extraCols || []);
    if (targetRow === -1) {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑤ ダッシュボード（予約一覧の取得：役割・表示範囲に応じてスコープを絞る）
// =====================================================
// scope（JPロールのみ使用）: { showAll: bool, teams: ['関東','関西'の部分集合], branches: [支店コードの部分集合] }
function apiGetDashboard(token, scope) {
  const session = requireSession_(token);
  const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet);
  const branchMeta = branchMetaMap_();
  // ★性能改善：未読判定は予約一覧の列を読むだけで済ませる（履歴の全件走査をやめた）。
  // 列がまだ無い旧シートのときだけ、従来どおり履歴を走査するフォールバックに切り替える。
  const unreadCol = unreadColFor_(session.role);
  const hasUnreadCol = rows.length > 0 && Object.prototype.hasOwnProperty.call(rows[0], unreadCol);
  const fallbackMap = hasUnreadCol ? null : needsActionMap_(session);
  const isNeedsAction = (r) => hasUnreadCol
    ? isActiveFlag_(r[unreadCol])
    : !!fallbackMap[String(r[COL_KANRI_NO])];

  const scoped = rows.filter(r => rowInScope_(session, scope, r));

  const list = scoped.map(r => ({
    branchCode: r[COL_BRANCH_CODE],
    branchName: (branchMeta[r[COL_BRANCH_CODE]] || {}).name || r[COL_BRANCH_CODE],
    country: (branchMeta[r[COL_BRANCH_CODE]] || {}).country || '',
    city: (branchMeta[r[COL_BRANCH_CODE]] || {}).city || '',
    kanriNo: r[COL_KANRI_NO],
    challengeNo: r[COL_CHALLENGE_NO],
    statusJp: r[COL_STATUS_JP],
    statusBranch: r[COL_STATUS_BRANCH],
    confirmedDate: formatMaybeDate_(r[COL_CONFIRMED_DATE]),
    ceremonyDate: formatMaybeDate_(r[COL_CEREMONY_DATE]),
    groomName: fullName_(r[COL_GROOM_LAST_NAME], r[COL_GROOM_NAME]),
    brideName: fullName_(r[COL_BRIDE_LAST_NAME], r[COL_BRIDE_NAME]),
    plan: r[COL_PLAN],
    area: r[COL_AREA],
    lastUpdated: formatMaybeDate_(r[COL_LAST_UPDATED]),
    // ★要件：相手側からの未読メッセージ／変更がある案件は一目でわかるように
    needsAction: isNeedsAction(r)
  }));

  // ★要件：まず要対応（未読あり）を最優先で上に、その中・その他はそれぞれ撮影日FIXが「今日に近い順」
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  list.sort((a, b) => {
    if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
    return dateDistanceMsFromToday_(a.confirmedDate, todayStr) - dateDistanceMsFromToday_(b.confirmedDate, todayStr);
  });

  const result = { ok: true, role: session.role, branchCode: session.branchCode, branchName: session.branchName, team: session.team, reservations: list };
  if (session.role === JP_ROLE) {
    result.branches = listBranchesRaw_().filter(b => b.role === BRANCH_ROLE);
    result.teams = JP_TEAMS;
  } else if (session.role === SHOP_ROLE) {
    // ★機能追加：新規依頼フォーム用に、選択できる支店（＝都市）と手配課の一覧を返す
    result.branches = listBranchesRaw_().filter(b => b.role === BRANCH_ROLE && b.active);
    result.teams = JP_TEAMS;
  }
  return result;
}

// --- 「要対応（未読）」フラグの読み書き -------------------------------------
// そのロールから見た未読フラグの列名
function unreadColFor_(role) {
  if (role === JP_ROLE) return COL_UNREAD_JP;
  if (role === SHOP_ROLE) return COL_UNREAD_SHOP;
  return COL_UNREAD_BRANCH;
}

// 予約一覧（または過去一覧）の1行に、指定ロール側の未読フラグを立てる／下ろす。
// 列が無い旧シートでは何もしない（呼び出し側が履歴走査にフォールバックする）。
function setUnreadFlag_(sheet, headers, rowIndex, targetRole, value) {
  const idx = headers.indexOf(unreadColFor_(targetRole));
  if (idx === -1) return;
  sheet.getRange(rowIndex, idx + 1).setValue(!!value);
}

// ★機能追加：店舗ロールが起票した案件は、相手が「支店」か「日本の手配課」かが固定の
// 2択ではなくなる（通常はJP、支店マスタの「店舗直接やり取り許可」がONなら支店）ため、
// 送信者ロールだけからは相手が決められない。メッセージ送信のたびに resolveMessageDirection_ で
// 実際の宛先（'JP_TO_BRANCH' 等の向き）を確定させ、その結果を使って未読フラグを立てる。
// 起票元店舗が無い通常の案件では、従来どおりJP⇔支店の単純な向きになる。
function recipientRoleForDirection_(direction) {
  const map = {
    JP_TO_BRANCH: BRANCH_ROLE, BRANCH_TO_JP: JP_ROLE,
    JP_TO_SHOP: SHOP_ROLE, SHOP_TO_JP: JP_ROLE,
    BRANCH_TO_SHOP: SHOP_ROLE, SHOP_TO_BRANCH: BRANCH_ROLE
  };
  return map[direction] || null;
}
function markUnreadForDirection_(sheet, headers, rowIndex, direction) {
  const role = recipientRoleForDirection_(direction);
  if (!role) return;
  setUnreadFlag_(sheet, headers, rowIndex, role, true);
}

// 案件の行データから、通常の送信者ロール判定に「店舗」を加味した向き（direction）を決める。
// - 起票元店舗が無い案件：従来どおり JP_TO_BRANCH／BRANCH_TO_JP のみ（挙動は一切変わらない）。
// - 起票元店舗がある案件：
//   ・店舗からの送信 → 支店マスタの「店舗直接やり取り許可」がONならSHOP_TO_BRANCH、OFFならSHOP_TO_JP
//                       （店舗はrecipientを選べない。相手は常に1つに固定）
//   ・支店からの送信 → 通常（OFF）は従来どおりBRANCH_TO_JP。ONの直結モードでは既定でBRANCH_TO_SHOP
//                       だが、recipient='JP'を明示すれば料金相談などのためBRANCH_TO_JPを選べる
//                       （このメッセージは店舗には見えない。現地支店・手配課のみの専用チャネル）。
//   ・JPからの送信   → recipient='SHOP'を明示すればJP_TO_SHOP（直結モードでも、直結モードで
//                       現地とやり取りした具体的な料金を店舗へ伝える、といった用途で使う）。
//                       それ以外（recipient未指定）は、直結モードならJP_TO_BRANCH、
//                       OFFなら従来どおりJP_TO_BRANCH。
// ★要件変更：以前は直結モード（ON）だとJP・支店どちらもrecipientの指定を無視して固定の相手
// （支店↔店舗）にしか送れなかったが、「普段は店舗と支店が直接やり取りする案件でも、
// 現地支店側または手配課が必要と判断したら手配課／現地支店にもメッセージを送れるようにしたい」
// との要望により、direct指定に関わらずrecipientの明示指定を優先するよう変更した。
function resolveMessageDirection_(session, headers, rowData, recipient) {
  const originShop = String(rowData[headers.indexOf(COL_ORIGIN_SHOP)] || '').trim();
  if (!originShop) {
    return session.role === JP_ROLE ? 'JP_TO_BRANCH' : 'BRANCH_TO_JP';
  }
  const branchCode = String(rowData[headers.indexOf(COL_BRANCH_CODE)] || '').toUpperCase();
  const direct = !!(branchMetaMap_()[branchCode] || {}).shopDirect;

  if (session.role === SHOP_ROLE) return direct ? 'SHOP_TO_BRANCH' : 'SHOP_TO_JP';
  if (session.role === BRANCH_ROLE) {
    if (direct && recipient === 'JP') return 'BRANCH_TO_JP'; // 直結モードでも手配課へ相談できる専用チャネル
    return direct ? 'BRANCH_TO_SHOP' : 'BRANCH_TO_JP';
  }
  // JPロール
  if (recipient === 'SHOP') return 'JP_TO_SHOP'; // 直結モードでも、確定した料金等を店舗へ伝えたい時に使う
  return 'JP_TO_BRANCH';
}

// 旧データ（宛先ロール列が無かった頃）は必ずJP⇔支店の2者間だったので、送信者ロールから
// 相手側を推定する。新しいデータは宛先ロールをそのまま使う。
function effectiveRecipientRole_(senderRole, recipientRoleRaw) {
  if (recipientRoleRaw) return recipientRoleRaw;
  if (senderRole === JP_ROLE) return BRANCH_ROLE;
  if (senderRole === BRANCH_ROLE) return JP_ROLE;
  return '';
}

// あるメッセージ（送信者ロール・宛先ロール）が viewerRole から見えてよいかどうか。
// JPは常に全て閲覧可（横断的な監督役のため）。それ以外は「自分が送った、または自分宛」のものだけ。
// 起票元店舗が無い通常の案件では宛先ロールが常にJP／BRANCHのどちらかになるため、
// BRANCH視点では全件が「自分が送った、または自分宛」に該当し、従来どおり全件見える。
function visibleToRole_(viewerRole, senderRole, recipientRoleRaw) {
  if (viewerRole === JP_ROLE) return true;
  if (senderRole === viewerRole) return true;
  const recip = String(recipientRoleRaw || '').trim().toUpperCase();
  // ★機能追加：店舗が新規依頼を起票した直後の通知だけは宛先を1つに絞らず、
  // 日本の手配課・現地支店の両方に見せる（apiShopCreateRequest 参照）
  if (senderRole === SHOP_ROLE && !recip) return viewerRole === BRANCH_ROLE;
  return effectiveRecipientRole_(senderRole, recip) === viewerRole;
}

// 店舗ロール向けの案件詳細：一般の項目（請求先・ホテル等）は含めず、依頼状況の確認と
// メッセージのやり取りに必要な最小限の情報だけを返す。
function buildShopReservationDetail_(session, kanriNo, headers, rowData) {
  const getV = (name) => rowData[headers.indexOf(name)];
  const meta = branchMetaMap_()[getV(COL_BRANCH_CODE)] || {};
  const ownMeta = branchMetaMap_()[session.branchCode] || {};
  const detail = {
    [COL_BRANCH_CODE]: getV(COL_BRANCH_CODE),
    [COL_KANRI_NO]: getV(COL_KANRI_NO),
    [COL_CHALLENGE_NO]: getV(COL_CHALLENGE_NO),
    [COL_STATUS_JP]: getV(COL_STATUS_JP),
    [COL_STATUS_BRANCH]: getV(COL_STATUS_BRANCH),
    [COL_CONFIRMED_DATE]: formatDateForInput_(getV(COL_CONFIRMED_DATE)),
    [COL_CEREMONY_DATE]: formatDateForInput_(getV(COL_CEREMONY_DATE)),
    [COL_GROOM_LAST_NAME]: getV(COL_GROOM_LAST_NAME),
    [COL_GROOM_NAME]: getV(COL_GROOM_NAME),
    [COL_BRIDE_LAST_NAME]: getV(COL_BRIDE_LAST_NAME),
    [COL_BRIDE_NAME]: getV(COL_BRIDE_NAME),
    [COL_GROOM_AGE]: getV(COL_GROOM_AGE),
    [COL_BRIDE_AGE]: getV(COL_BRIDE_AGE),
    [COL_PLAN]: getV(COL_PLAN),
    [COL_SALE_NAME]: getV(COL_SALE_NAME),
    [COL_LOCATION]: getV(COL_LOCATION),
    [COL_PREP]: getV(COL_PREP),
    [COL_HOPE1]: getV(COL_HOPE1),
    [COL_HOPE2]: getV(COL_HOPE2),
    [COL_HOPE3]: getV(COL_HOPE3),
    [COL_HOPE4]: getV(COL_HOPE4),
    [COL_HOPE5]: getV(COL_HOPE5),
    [COL_AREA]: getV(COL_AREA),
    branchName: meta.name || getV(COL_BRANCH_CODE),
    // ★機能追加：希望日ごとの空き確認ステータス（現地未確認ST→RQ→OK/UC）は店舗にも見せる（読み取り専用）
    country: meta.country || '',
    city: meta.city || '',
    originShop: getV(COL_ORIGIN_SHOP) || '',
    // ★要件：パスポート番号欄・準備場所は、対象支店の表示条件をそのまま踏襲する
    passportRequired: !!meta.passportRequired,
    isItaly: meta.country === ITALY_COUNTRY_NAME,
    // ★要件：店舗発の案件の請求先表示は、店舗自身の支店マスタ行の「請求先」（営業本部）を使う
    shopBilling: ownMeta.shopBilling || ''
  };
  // ★要件：パスポート番号欄は「日本の店舗画面」では支店の必須設定に関わらず常に表示する
  // （※ISWのみ必要、という注記を添えて店舗自身に判断してもらう運用に変更したため）。
  detail[COL_PASSPORT_NO] = getV(COL_PASSPORT_NO);

  // ★機能追加：希望日ごとの空き確認ステータス（現地未確認ST→RQ→OK/UC）は店舗にも見せる（読み取り専用）
  for (let n = 1; n <= HOPE_COLS.length; n++) {
    detail[hopeStsJpCol_(n)] = getV(hopeStsJpCol_(n));
    detail[hopeStsBranchCol_(n)] = getV(hopeStsBranchCol_(n));
  }

  // ★機能追加（拡張要望9章）：必要書類チェックリストは店舗側にも見せる（双方向でチェックできる）
  detail.checklist = CHECKLIST_ITEMS.map(item => ({ item, checked: isActiveFlag_(getV(checklistCol_(item))) }));
  detail.shopUploadFolderUrl = getV(COL_SHOP_UPLOAD_FOLDER_URL) || '';

  detail.options = [];
  for (let n = 1; n <= OPTION_COUNT; n++) {
    detail.options.push({
      n, name: getV(opNameCol_(n)) || '',
      stsJp: getV(opStsJpCol_(n)),
      stsBranch: getV(opStsBranchCol_(n))
    });
  }

  // ★要件：店舗が追加できる「共有メモ」は自分でも見えるようにする（メモ（現地用）・
  // アンケート回答は支店・手配課側の運用情報のため店舗には見せない）
  detail.memoLog = getMemoLog_(kanriNo).filter(m => m.type === MEMO_TYPE_SHARED);

  const hSheet = getSpreadsheet_().getSheetByName(HISTORY_SHEET_NAME);
  let hRows = getRowsAsObjects_(hSheet).filter(r => String(r[H_COL_KANRI]) === String(kanriNo));
  hRows = hRows.filter(r => visibleToRole_(session.role, r[H_COL_SENDER_ROLE], r[H_COL_RECIPIENT_ROLE]));
  hRows.sort((a, b) => new Date(b[H_COL_DATETIME]) - new Date(a[H_COL_DATETIME]));
  detail.history = hRows.map(r => ({
    id: r[H_COL_ID],
    datetime: formatMaybeDate_(r[H_COL_DATETIME]),
    sender: r[H_COL_SENDER],
    senderRole: r[H_COL_SENDER_ROLE],
    body: r[H_COL_BODY],
    // ★画面側が「自分宛でまだ未読のものだけ」既読チェックを送ればよいようにしておく
    checkShop: isActiveFlag_(r[H_COL_CHECK_SHOP])
  }));

  return { ok: true, role: session.role, detail };
}

// 「自分側からみて未読の、相手側から来たメッセージ・変更」がある管理番号の集合を作る。
// BRANCH側セッション → 送信者ロールがJPで、CHECK 支店が未チェックのものがあれば要対応
// JP側セッション     → 送信者ロールがBRANCHで、CHECK JPが未チェックのものがあれば要対応
//
// ★注意：これは履歴シートの全件走査を伴う重い処理。通常は予約一覧の未読フラグ列を使い、
// この関数は「フラグ列がまだ無い旧シート」でのフォールバック、および
// rebuildUnreadFlags() による一括再計算のときだけ使う。
function needsActionMap_(session) {
  const hSheet = getSpreadsheet_().getSheetByName(HISTORY_SHEET_NAME);
  const hRows = getRowsAsObjects_(hSheet);
  const map = {};
  const counterpartRole = session.role === BRANCH_ROLE ? JP_ROLE : BRANCH_ROLE;
  const checkCol = session.role === BRANCH_ROLE ? H_COL_CHECK_BRANCH : H_COL_CHECK_JP;
  hRows.forEach(r => {
    if (r[H_COL_SENDER_ROLE] !== counterpartRole) return;
    if (isActiveFlag_(r[checkCol])) return;
    map[String(r[H_COL_KANRI])] = true;
  });
  return map;
}

// ★性能改善に伴う移行用：やり取り履歴から全案件の未読フラグを一括で計算し直す。
// 既存スプレッドシートに未読フラグ列を追加した直後は全て空欄（＝未読なし）になってしまうため、
// setupPortal() の最後に呼んで実態に合わせる。単体でも安全に再実行できる。
// 書き込みは列ごとに setValues で一括して行い、行単位の書き込みを避けている。
function rebuildUnreadFlags() {
  const ss = getSpreadsheet_();
  const jpUnread = {};
  const branchUnread = {};

  const hSheet = ss.getSheetByName(HISTORY_SHEET_NAME);
  if (hSheet && hSheet.getLastRow() >= 2) {
    const hHeaders = hSheet.getRange(1, 1, 1, hSheet.getLastColumn()).getValues()[0];
    const hValues = hSheet.getRange(2, 1, hSheet.getLastRow() - 1, hHeaders.length).getValues();
    const kanriIdx = hHeaders.indexOf(H_COL_KANRI);
    const roleIdx = hHeaders.indexOf(H_COL_SENDER_ROLE);
    const jpCheckIdx = hHeaders.indexOf(H_COL_CHECK_JP);
    const brCheckIdx = hHeaders.indexOf(H_COL_CHECK_BRANCH);
    if (kanriIdx !== -1 && roleIdx !== -1 && jpCheckIdx !== -1 && brCheckIdx !== -1) {
      hValues.forEach(v => {
        const kanri = String(v[kanriIdx]);
        if (!kanri) return;
        const role = String(v[roleIdx]).trim().toUpperCase();
        // 支店が送ったものが日本側で未チェック → 日本側に未読あり
        if (role === BRANCH_ROLE && !isActiveFlag_(v[jpCheckIdx])) jpUnread[kanri] = true;
        // 日本側が送ったものが支店側で未チェック → 支店側に未読あり
        if (role === JP_ROLE && !isActiveFlag_(v[brCheckIdx])) branchUnread[kanri] = true;
      });
    }
  }

  let updated = 0;
  [RESERVATION_SHEET_NAME, ARCHIVE_SHEET_NAME].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const jpIdx = headers.indexOf(COL_UNREAD_JP);
    const brIdx = headers.indexOf(COL_UNREAD_BRANCH);
    const kanriIdx = headers.indexOf(COL_KANRI_NO);
    if (jpIdx === -1 || brIdx === -1 || kanriIdx === -1) return;

    const n = sheet.getLastRow() - 1;
    const kanris = sheet.getRange(2, kanriIdx + 1, n, 1).getValues();
    sheet.getRange(2, jpIdx + 1, n, 1).setValues(kanris.map(k => [!!jpUnread[String(k[0])]]));
    sheet.getRange(2, brIdx + 1, n, 1).setValues(kanris.map(k => [!!branchUnread[String(k[0])]]));
    updated += n;
  });
  console.log(`[rebuildUnreadFlags] ${updated} 行の未読フラグを再計算しました`);
  return { ok: true, rows: updated };
}

function branchMetaMap_() {
  const map = {};
  listBranchesRaw_().forEach(b => { map[b.code] = b; });
  return map;
}

function rowInScope_(session, scope, row) {
  if (session.role === SHOP_ROLE) {
    // ★機能追加：店舗ロールは自分が起票した案件だけが対象（一覧・検索・納品待ち等、共通で使う）
    return String(row[COL_ORIGIN_SHOP] || '').toUpperCase() === session.branchCode;
  }
  if (session.role === BRANCH_ROLE) {
    return String(row[COL_BRANCH_CODE]).toUpperCase() === session.branchCode;
  }
  // JPロール
  if (!scope || scope.showAll) return true;
  const teams = scope.teams || [];
  const branches = scope.branches || [];
  if (teams.length === 0 && branches.length === 0) return true; // 何も選択されていない場合は全件表示
  const matchesTeam = teams.includes(row[COL_AREA]);
  const matchesBranch = branches.map(b => String(b).toUpperCase()).includes(String(row[COL_BRANCH_CODE]).toUpperCase());
  return matchesTeam || matchesBranch;
}

// =====================================================
// ⑤-2 統計ダッシュボード（JPのみ）
// =====================================================
// ★要件：日本側だけの統計タブ。「現在進行中（まだ生きている）」の案件だけを対象に、
// 今月から12ヶ月分を月別に「未対応／RQ／OK／FN」の内訳付きで表示する（直近3ヶ月は大きく、
// 残り9ヶ月は小さく）。その下に国別件数・日本側店舗別件数も表示する。
// 「現在進行中」＝過去一覧（アーカイブ済み）に移っていない、かつ STS(JP側)・STS(支店側)ともに
// CW（キャンセル成立）ではない案件。これとは別に、アーカイブ済みも含めた「累計」件数も返す
// （「あと何件残っているか」が主目的だが、累計もわかるとよい、という要望のため）。
// 関東／関西のチェックで絞り込み可能（ダッシュボードのスコープ選択と同じ仕組みを流用）。
function apiGetStats(token, scope) {
  const session = requireSession_(token);
  assertJp_(session);
  const branchMeta = branchMetaMap_();

  const ss = getSpreadsheet_();
  const currentRows = getRowsAsObjects_(ss.getSheetByName(RESERVATION_SHEET_NAME)).filter(r => rowInScope_(session, scope, r));
  const archiveRows = getRowsAsObjects_(ss.getSheetByName(ARCHIVE_SHEET_NAME)).filter(r => rowInScope_(session, scope, r));

  // 「現在進行中」＝予約一覧に載っている、かつキャンセル成立（CW）でないもの
  const liveRows = currentRows.filter(r => r[COL_STATUS_JP] !== 'CW' && r[COL_STATUS_BRANCH] !== 'CW');

  // 1件につき「未対応／RQ／OK／FN」のいずれか1つだけに分類する（合計＝件数になるように排他的に判定）。
  // 優先順位：①相手側からの未読メッセージ・変更があれば「未対応」／②FNで確定していれば「FN」／
  // ③OKまで進んでいれば「OK」／④それ以外（RQ・CHK・CR・NC・UC・CFなど）はまとめて「RQ」
  // ★性能改善：未読判定はダッシュボードと同じく予約一覧の列を使う（履歴の全件走査をやめた）
  const unreadCol = unreadColFor_(session.role);
  const hasUnreadCol = currentRows.length > 0 && Object.prototype.hasOwnProperty.call(currentRows[0], unreadCol);
  const fallbackMap = hasUnreadCol ? null : needsActionMap_(session);

  function bucketOf_(r) {
    const unread = hasUnreadCol ? isActiveFlag_(r[unreadCol]) : !!fallbackMap[String(r[COL_KANRI_NO])];
    if (unread) return 'needsAction';
    if (r[COL_STATUS_JP] === 'FN' || r[COL_STATUS_BRANCH] === 'FN') return 'FN';
    if (r[COL_STATUS_JP] === 'OK' || r[COL_STATUS_BRANCH] === 'OK') return 'OK';
    return 'RQ';
  }
  function emptyBucket_() { return { total: 0, needsAction: 0, rq: 0, ok: 0, fn: 0 }; }
  function addToBucket_(bucket, kind) {
    bucket.total++;
    if (kind === 'needsAction') bucket.needsAction++;
    else if (kind === 'RQ') bucket.rq++;
    else if (kind === 'OK') bucket.ok++;
    else if (kind === 'FN') bucket.fn++;
  }

  // 今月から12ヶ月分の器を先に用意しておく（データが0件の月も表示するため）
  const monthBuckets = {};
  const monthOrder = [];
  const tz = 'Asia/Tokyo';
  const base = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const key = Utilities.formatDate(d, tz, 'yyyy/MM');
    monthOrder.push(key);
    monthBuckets[key] = Object.assign({ key, label: `${d.getMonth() + 1}月` }, emptyBucket_());
  }
  const undated = Object.assign({ label: '撮影日未定' }, emptyBucket_());

  const byCountry = {};
  const byJpShop = {};

  liveRows.forEach(r => {
    const meta = branchMeta[r[COL_BRANCH_CODE]] || {};
    const country = meta.country || r[COL_BRANCH_CODE] || '(不明)';
    byCountry[country] = (byCountry[country] || 0) + 1;

    const jpShop = r[COL_JP_SHOP] || '(未設定)';
    byJpShop[jpShop] = (byJpShop[jpShop] || 0) + 1;

    const dVal = r[COL_CONFIRMED_DATE];
    let monthKey = null;
    if (dVal instanceof Date) {
      monthKey = Utilities.formatDate(dVal, tz, 'yyyy/MM');
    } else {
      const m = String(dVal || '').match(/^(\d{4}\/\d{1,2})\//);
      if (m) monthKey = m[1].replace(/\/(\d)$/, '/0$1');
    }

    const kind = bucketOf_(r);
    if (monthKey && monthBuckets[monthKey]) {
      addToBucket_(monthBuckets[monthKey], kind);
    } else {
      // 今月より前の月、13ヶ月より先、または日付未定はまとめて「撮影日未定／対象期間外」として扱う
      addToBucket_(undated, kind);
    }
  });

  const sortEntriesByCountDesc = (obj) => Object.keys(obj).map(k => ({ key: k, count: obj[k] }))
    .sort((a, b) => b.count - a.count);

  return {
    ok: true,
    total: liveRows.length, // 現在進行中（生きている）件数
    cumulativeTotal: currentRows.length + archiveRows.length, // 累計（アーカイブ済み・キャンセル済みも含む全期間）
    months: monthOrder.map(k => monthBuckets[k]), // 今月から12ヶ月分（先頭3件が「直近3ヶ月」）
    undated,
    byCountry: sortEntriesByCountDesc(byCountry),
    byJpShop: sortEntriesByCountDesc(byJpShop),
    teams: JP_TEAMS,
    branches: listBranchesRaw_().filter(b => b.role === BRANCH_ROLE)
  };
}

// =====================================================
// ⑤-3 納品待ち一覧（機能④）
// =====================================================
// ★機能追加：納品期限アラートは日本側へのメールだけだったため、支店は自分の納品が
// 遅れていることをポータル上で確認できなかった。撮影日を過ぎた案件は翌日に過去一覧へ移るので、
// 予約一覧と過去一覧の両方から「撮影済み・未納品」を集めて表示する。
// 一覧を開くたびの処理ではなく、専用画面を開いたときだけ実行する（過去一覧は増え続けるため）。
function apiGetPendingDeliveries(token, scope) {
  const session = requireSession_(token);
  const ss = getSpreadsheet_();
  const branchMeta = branchMetaMap_();
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const results = [];
  [RESERVATION_SHEET_NAME, ARCHIVE_SHEET_NAME].forEach(sheetName => {
    getRowsAsObjects_(ss.getSheetByName(sheetName)).forEach(r => {
      if (!rowInScope_(session, scope, r)) return;
      const info = deliveryOverdueInfo_({
        driveUrl: r[COL_DRIVE_URL], stsJp: r[COL_STATUS_JP], stsBranch: r[COL_STATUS_BRANCH],
        confirmedDate: r[COL_CONFIRMED_DATE], branchCode: r[COL_BRANCH_CODE]
      }, branchMeta, todayMidnight);
      if (!info || !info.overdue) return;
      const meta = branchMeta[r[COL_BRANCH_CODE]] || {};
      results.push({
        kanriNo: r[COL_KANRI_NO],
        challengeNo: r[COL_CHALLENGE_NO],
        branchCode: r[COL_BRANCH_CODE],
        branchName: meta.name || r[COL_BRANCH_CODE],
        country: meta.country || '',
        groomName: fullName_(r[COL_GROOM_LAST_NAME], r[COL_GROOM_NAME]),
        brideName: fullName_(r[COL_BRIDE_LAST_NAME], r[COL_BRIDE_NAME]),
        area: r[COL_AREA],
        confirmedDate: formatMaybeDate_(r[COL_CONFIRMED_DATE]),
        daysPast: info.daysPast,
        limitDays: info.limitDays,
        overdueDays: info.daysPast - info.firstAlertDay,
        source: sheetName === ARCHIVE_SHEET_NAME ? '過去一覧' : '予約一覧'
      });
    });
  });
  // 遅れが大きい順
  results.sort((a, b) => b.daysPast - a.daysPast);
  return { ok: true, role: session.role, results };
}

// =====================================================
// ⑤-4 当日スケジュール表（機能⑤）
// =====================================================
// ★機能追加：現地記入欄は案件を1件ずつ開かないと見えなかったため、
// 撮影日を指定してその日の全案件の現地情報を1画面にまとめる。
function apiGetDaySchedule(token, dateStr, scope) {
  const session = requireSession_(token);
  const target = toComparableDate_(String(dateStr || '').replace(/-/g, '/')) || String(dateStr || '').trim();
  if (!target) throw new Error('日付を指定してください。');

  const ss = getSpreadsheet_();
  const branchMeta = branchMetaMap_();
  const results = [];
  // 撮影日の翌日には過去一覧へ移るため、当日ぶんを見たい場合も両方を対象にする
  [RESERVATION_SHEET_NAME, ARCHIVE_SHEET_NAME].forEach(sheetName => {
    getRowsAsObjects_(ss.getSheetByName(sheetName)).forEach(r => {
      if (!rowInScope_(session, scope, r)) return;
      if (toComparableDate_(r[COL_CONFIRMED_DATE]) !== target) return;
      // キャンセル成立の案件は当日表に出さない
      if (r[COL_STATUS_JP] === 'CW' || r[COL_STATUS_BRANCH] === 'CW') return;
      const meta = branchMeta[r[COL_BRANCH_CODE]] || {};
      results.push({
        kanriNo: r[COL_KANRI_NO],
        branchCode: r[COL_BRANCH_CODE],
        branchName: meta.name || r[COL_BRANCH_CODE],
        groomName: fullName_(r[COL_GROOM_LAST_NAME], r[COL_GROOM_NAME]),
        brideName: fullName_(r[COL_BRIDE_LAST_NAME], r[COL_BRIDE_NAME]),
        plan: r[COL_PLAN],
        saleName: r[COL_SALE_NAME] || '',
        // ★要件：同意書は撮影当日までに回収されている必要があるため、当日表でも状態が分かるようにする。
        // 必須の支店（例：ローマ）で未回収の場合は画面側で警告表示する
        consent: r[COL_CONSENT] || '',
        consentRequired: !!meta.consentRequired,
        location: r[COL_LOCATION],
        prep: r[COL_PREP],
        hotel: r[COL_HOTEL],
        pickupTime: r[COL_PICKUP_TIME],
        dayStaff: r[COL_DAY_STAFF],
        hairMakeup: r[COL_HAIR_MAKEUP],
        photographer: r[COL_PHOTOGRAPHER],
        assistant: r[COL_ASSISTANT],
        localMemo: latestLocalMemo_(r[COL_KANRI_NO], r[COL_LOCAL_MEMO]),
        statusJp: r[COL_STATUS_JP],
        statusBranch: r[COL_STATUS_BRANCH]
      });
    });
  });
  // 配車時間の昇順（未入力は末尾）
  results.sort((a, b) => String(a.pickupTime || '9999').localeCompare(String(b.pickupTime || '9999')));
  return { ok: true, date: target.replace(/-/g, '/'), results };
}

// =====================================================
// ⑤-5 スタッフのダブルブッキング検知（機能⑧）
// =====================================================
// ★機能追加：カメラマン・ヘアメイクは自由入力のため、同じ日に同じ人を2案件へ
// 割り当てても気づけなかった。保存を止めはせず「警告」として返す。
// staffNames: { '当日の担当': 'x', 'ヘアメイク': 'y', ... }
function apiCheckStaffConflict(token, kanriNo, dateStr, staffNames) {
  const session = requireSession_(token);
  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  assertRowVisible_(session, headers, rowData);

  const branchCode = String(rowData[headers.indexOf(COL_BRANCH_CODE)]).toUpperCase();
  const target = toComparableDate_(String(dateStr || '').replace(/-/g, '/'));
  const names = staffNames || {};
  const wanted = {};
  Object.keys(names).forEach(field => {
    const v = String(names[field] || '').trim();
    if (v) wanted[normalizeStaffName_(v)] = { field, raw: v };
  });
  if (!target || Object.keys(wanted).length === 0) return { ok: true, conflicts: [] };

  const staffCols = [COL_DAY_STAFF, COL_HAIR_MAKEUP, COL_PHOTOGRAPHER, COL_ASSISTANT];
  const conflicts = [];
  const ss = getSpreadsheet_();
  [RESERVATION_SHEET_NAME, ARCHIVE_SHEET_NAME].forEach(sheetName => {
    getRowsAsObjects_(ss.getSheetByName(sheetName)).forEach(r => {
      if (String(r[COL_KANRI_NO]) === String(kanriNo)) return;              // 自分自身は除く
      if (String(r[COL_BRANCH_CODE]).toUpperCase() !== branchCode) return;  // 同一支店のみ
      if (r[COL_STATUS_JP] === 'CW' || r[COL_STATUS_BRANCH] === 'CW') return;
      if (toComparableDate_(r[COL_CONFIRMED_DATE]) !== target) return;
      staffCols.forEach(col => {
        const key = normalizeStaffName_(r[col]);
        if (!key || !wanted[key]) return;
        conflicts.push({
          staff: wanted[key].raw,
          field: wanted[key].field,
          conflictField: col,
          kanriNo: r[COL_KANRI_NO],
          groomName: fullName_(r[COL_GROOM_LAST_NAME], r[COL_GROOM_NAME]),
          brideName: fullName_(r[COL_BRIDE_LAST_NAME], r[COL_BRIDE_NAME])
        });
      });
    });
  });
  return { ok: true, conflicts };
}

// スタッフ名の表記ゆれをある程度吸収する（大文字小文字・空白・記号を無視して比較）。
// 完全ではないため、精度を上げたい場合は「スタッフマスタ」から選んで表記を揃える運用を推奨。
function normalizeStaffName_(v) {
  return String(v || '').trim().toLowerCase().replace(/[\s.,・\-_]/g, '');
}

// =====================================================
// ⑤-6 案件タイムライン（機能⑦）
// =====================================================
// ★機能追加：ステータス変更履歴はフィールド単位でしか見られず、やり取り履歴とも画面が分かれていた。
// 両方を時系列にマージして「この案件で何が起きたか」を1本の流れで見せる。
function apiGetCaseTimeline(token, kanriNo) {
  const session = requireSession_(token);
  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  assertRowVisible_(session, headers, rowData);

  const ss = getSpreadsheet_();
  const items = [];

  getRowsAsObjects_(ss.getSheetByName(HISTORY_SHEET_NAME))
    .filter(r => String(r[H_COL_KANRI]) === String(kanriNo))
    .forEach(r => {
      items.push({
        type: 'message',
        at: r[H_COL_DATETIME] instanceof Date ? r[H_COL_DATETIME].getTime() : Date.parse(r[H_COL_DATETIME]) || 0,
        datetime: formatDateTime_(r[H_COL_DATETIME]),
        who: r[H_COL_SENDER],
        role: r[H_COL_SENDER_ROLE],
        body: r[H_COL_BODY]
      });
    });

  getRowsAsObjects_(ss.getSheetByName(STATUS_LOG_SHEET_NAME))
    .filter(r => String(r[SL_COL_KANRI]) === String(kanriNo))
    .forEach(r => {
      items.push({
        type: 'status',
        at: r[SL_COL_WHEN] instanceof Date ? r[SL_COL_WHEN].getTime() : Date.parse(r[SL_COL_WHEN]) || 0,
        datetime: formatDateTime_(r[SL_COL_WHEN]),
        who: r[SL_COL_WHO],
        field: r[SL_COL_FIELD],
        oldValue: r[SL_COL_OLD],
        newValue: r[SL_COL_NEW]
      });
    });

  items.sort((a, b) => b.at - a.at);   // 新しい順
  return { ok: true, items };
}

function formatDateTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  return String(v || '');
}

// =====================================================
// ⑤-7 請求不備チェック（機能⑥・JPのみ）
// =====================================================
// ★機能追加：請求先・請求番号・日本支店名は入力欄があるだけで、未入力を検出する仕組みが無かった。
// 月を指定して「撮影済みなのに必須項目が空」の案件を洗い出す。
function apiGetBillingGaps(token, month) {
  const session = requireSession_(token);
  assertJp_(session);
  const m = String(month || '').trim().replace(/\//g, '-');   // 'yyyy-MM' を想定
  // 月は01〜12のみ受け付ける（`\d{2}` だけだと 2026-13 のような値が通ってしまう）
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) {
    throw new Error('対象月は yyyy-MM の形式（月は01〜12）で指定してください。');
  }

  const ss = getSpreadsheet_();
  const branchMeta = branchMetaMap_();
  const today = new Date();
  const todayIso = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd');

  const results = [];
  [RESERVATION_SHEET_NAME, ARCHIVE_SHEET_NAME].forEach(sheetName => {
    getRowsAsObjects_(ss.getSheetByName(sheetName)).forEach(r => {
      // ★GAS制約：過去一覧は増え続けるため、まず対象月で絞ってから中身を評価する
      const iso = toComparableDate_(r[COL_CONFIRMED_DATE]);
      if (!iso || iso.slice(0, 7) !== m) return;
      if (iso > todayIso) return;                                          // 未実施はまだ不備ではない
      if (r[COL_STATUS_JP] === 'CW' || r[COL_STATUS_BRANCH] === 'CW') return;

      const missing = [];
      if (!String(r[COL_BILLING_REGION] || '').trim()) missing.push(COL_BILLING_REGION);
      if (!String(r[COL_JP_SHOP] || '').trim()) missing.push(COL_JP_SHOP);
      if (!String(r[COL_INVOICE_NO] || '').trim()) missing.push(COL_INVOICE_NO);
      if (!String(r[COL_DRIVE_URL] || '').trim()) missing.push(COL_DRIVE_URL);
      if (missing.length === 0) return;

      const meta = branchMeta[r[COL_BRANCH_CODE]] || {};
      results.push({
        kanriNo: r[COL_KANRI_NO],
        branchCode: r[COL_BRANCH_CODE],
        branchName: meta.name || r[COL_BRANCH_CODE],
        groomName: fullName_(r[COL_GROOM_LAST_NAME], r[COL_GROOM_NAME]),
        brideName: fullName_(r[COL_BRIDE_LAST_NAME], r[COL_BRIDE_NAME]),
        area: r[COL_AREA],
        confirmedDate: formatMaybeDate_(r[COL_CONFIRMED_DATE]),
        missing
      });
    });
  });
  results.sort((a, b) => String(a.confirmedDate).localeCompare(String(b.confirmedDate)));
  return { ok: true, month: m, results };
}

// =====================================================
// ⑤-8 実績データの書き出し（機能⑩・JPのみ）
// =====================================================
// ★機能追加：統計は画面表示のみで、経理へ渡すには手作業の転記が必要だった。
// 検索と同じ条件指定で、同じスプレッドシート内の新規シートへ明細を書き出す。
function apiExportReservations(token, criteria) {
  const session = requireSession_(token);
  assertJp_(session);
  criteria = criteria || {};
  const branchMeta = branchMetaMap_();

  const sheetNames = [RESERVATION_SHEET_NAME];
  if (criteria.includeArchive) sheetNames.push(ARCHIVE_SHEET_NAME);

  const ss = getSpreadsheet_();
  const picked = [];
  sheetNames.forEach(sheetName => {
    getRowsAsObjects_(ss.getSheetByName(sheetName)).forEach(r => {
      if (!rowInScope_(session, criteria.scope, r)) return;
      if (!matchesSearch_(r, criteria, branchMeta)) return;      // 検索と同じ判定を再利用
      picked.push({ row: r, source: sheetName === ARCHIVE_SHEET_NAME ? '過去一覧' : '予約一覧' });
    });
  });
  if (picked.length === 0) throw new Error('条件に一致する案件がありません。');
  if (picked.length > EXPORT_MAX_ROWS) {
    throw new Error(`対象が${picked.length}件と多すぎます（上限${EXPORT_MAX_ROWS}件）。期間や支店で絞り込んでください。`);
  }

  const exportHeaders = ['区分', '支店名', '国'].concat(RESERVATION_HEADERS);
  const values = picked.map(p => {
    const meta = branchMeta[p.row[COL_BRANCH_CODE]] || {};
    const base = [p.source, meta.name || p.row[COL_BRANCH_CODE], meta.country || ''];
    return base.concat(RESERVATION_HEADERS.map(h => {
      const v = p.row[h];
      return v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd') : (v === undefined ? '' : v);
    }));
  });

  const stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  const outName = `書き出し_${stamp}`;
  const out = ss.insertSheet(outName);
  // ★GAS制約：1行ずつ appendRow すると件数に比例して遅くなり6分制限に達するため、必ず一括で書き込む
  out.getRange(1, 1, 1, exportHeaders.length).setValues([exportHeaders]);
  out.getRange(2, 1, values.length, exportHeaders.length).setValues(values);
  formatHeaderRow_(out);

  return { ok: true, sheetName: outName, count: values.length };
}

// =====================================================
// ⑥ 予約詳細
// =====================================================
function apiGetReservationDetail(token, kanriNo) {
  const session = requireSession_(token);
  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');

  if (session.role === SHOP_ROLE) {
    assertShopOwnRow_(session, headers, rowData);
    return buildShopReservationDetail_(session, kanriNo, headers, rowData);
  }
  assertRowVisible_(session, headers, rowData);

  const getV = (name) => rowData[headers.indexOf(name)];
  const detail = {};
  headers.forEach((h, i) => {
    // ★機能追加：日本側専用の社内進行管理欄（フォトブリッジ登録・AI加工など）は、
    // 支店ロールのレスポンスには一切含めない（画面を作り込むだけでなく、値そのものを渡さない）
    if (session.role !== JP_ROLE && JP_INTERNAL_FIELDS.includes(h)) return;
    // ★要件：フォトブリッジ登録・データアップロードのチェック日時は「日付」ではなく
    // 「日時（時刻まで）」を見せたいため、他の日付欄（撮影日FIX等）と別扱いにする
    if (DATETIME_FIELDS.includes(h)) { detail[h] = formatDateTime_(rowData[i]); return; }
    detail[h] = DATE_FIELDS.includes(h) ? formatDateForInput_(rowData[i]) : formatMaybeDate_(rowData[i]);
  });
  const meta = branchMetaMap_()[getV(COL_BRANCH_CODE)] || {};
  detail.branchName = meta.name || getV(COL_BRANCH_CODE);
  detail.country = meta.country || '';
  detail.city = meta.city || '';
  // ★要件：請求番号の欄名称は支店ごとに変えられる（支店マスタの「請求番号欄名称」、未設定なら「請求番号」）
  detail.invoiceLabel = meta.invoiceLabel || '請求番号';
  // ★機能追加：同意書必須の支店（例：ローマ）かどうか。画面側で未回収を目立たせるために使う
  detail.consentRequired = !!meta.consentRequired;
  // ★要件：パスポート番号欄はこのフラグが立っている支店（例：イスタンブール）だけ表示する
  detail.passportRequired = !!meta.passportRequired;
  // ★要件：準備場所の選択式表示・同意書欄の表示はイタリアの支店だけに絞る
  detail.isItaly = detail.country === ITALY_COUNTRY_NAME;
  // ★機能追加：店舗が起票した案件かどうか（支店・JP双方の画面で「店舗発の依頼」であることを示す）。
  // 現地とのやり取りが直結モードかどうかも合わせて返す（JPの「宛先」選択、支店側の案内表示に使う）。
  detail.originShop = getV(COL_ORIGIN_SHOP) || '';
  detail.originShopName = detail.originShop ? ((branchMetaMap_()[detail.originShop] || {}).name || detail.originShop) : '';
  detail.shopDirect = !!meta.shopDirect;
  // ★機能追加（拡張要望6章）：店舗発の案件の請求先表示は、起票した店舗自身の支店マスタ行の
  // 「請求先」（＝店舗の営業本部）を使う。店舗発でない案件では常に空欄。
  detail.shopBilling = detail.originShop ? ((branchMetaMap_()[detail.originShop] || {}).shopBilling || '') : '';
  // ★機能追加（拡張要望9章）：必要書類チェックリストの現在値を、画面が扱いやすい配列でも返す
  // （個々の値は上のheaders.forEachループでdetail['必要書類チェック:◯◯']としても入っている）。
  detail.checklist = CHECKLIST_ITEMS.map(item => ({ item, checked: isActiveFlag_(getV(checklistCol_(item))) }));
  detail.shopUploadFolderUrl = getV(COL_SHOP_UPLOAD_FOLDER_URL) || '';

  const options = [];
  for (let n = 1; n <= OPTION_COUNT; n++) {
    const name = getV(opNameCol_(n));
    options.push({
      n, name: name || '',
      stsJp: getV(opStsJpCol_(n)),
      stsBranch: getV(opStsBranchCol_(n))
    });
  }
  detail.options = options;

  const hSheet = getSpreadsheet_().getSheetByName(HISTORY_SHEET_NAME);
  let hRows = getRowsAsObjects_(hSheet).filter(r => String(r[H_COL_KANRI]) === String(kanriNo));
  // ★機能追加：店舗が起票した案件は、日本側（JP）以外には「自分が送った、または自分宛の」
  // メッセージだけを見せる（支店には店舗↔JPのやり取りを、店舗には支店↔JPのやり取りを見せない）。
  // 起票元店舗が無い通常の案件では visibleToRole_ は常にtrueを返すため、挙動は一切変わらない。
  hRows = hRows.filter(r => visibleToRole_(session.role, r[H_COL_SENDER_ROLE], r[H_COL_RECIPIENT_ROLE]));
  // ★要件：メッセージは新しい日付が上（降順）
  hRows.sort((a, b) => new Date(b[H_COL_DATETIME]) - new Date(a[H_COL_DATETIME]));
  detail.history = hRows.map(r => ({
    id: r[H_COL_ID],
    datetime: formatMaybeDate_(r[H_COL_DATETIME]),
    sender: r[H_COL_SENDER],
    senderRole: r[H_COL_SENDER_ROLE],
    body: r[H_COL_BODY],
    checkJp: isActiveFlag_(r[H_COL_CHECK_JP]),
    checkedByJp: r[H_COL_CHECKED_BY_JP] || '',
    dateJp: formatMaybeDate_(r[H_COL_DATE_JP]),
    checkBranch: isActiveFlag_(r[H_COL_CHECK_BRANCH]),
    checkedByBranch: r[H_COL_CHECKED_BY_BRANCH] || '',
    dateBranch: formatMaybeDate_(r[H_COL_DATE_BRANCH])
  }));

  // ★機能追加：共有メモ／メモ（現地用）／アンケート回答（積み上げ式）
  detail.memoLog = getMemoLog_(kanriNo);

  // ★機能追加：現地スタッフ手配メール。宛先メールアドレス自体はここでは返さない
  // （送信時に改ざんできないよう、下書き作成・送信の両方でサーバー側が都度解決するため）。
  // 画面側はボタンの有効／無効の判定にだけ使う。
  const arrMeta = getArrangementMeta_(getV(COL_BRANCH_CODE));
  detail.arrangementEnabled = arrMeta.enabled;
  detail.arrangementCategories = arrMeta.categories.map(c => ({ key: c.key, label: c.label, available: !!c.email }));
  detail.arrangementLog = getArrangementLog_(kanriNo);

  return { ok: true, role: session.role, detail };
}

// ★セキュリティ：店舗ロールは既定で「拒否」にする（許可は例外的に個別のAPIだけで与える）。
// 通常の予約項目編集・現地スタッフ手配・社内進行管理欄など、店舗が使う想定の無い既存APIの
// 大半はこの関数を経由しているため、ここでJPロール・BRANCHロールと同列にSHOPロールも
// 「自分の案件なら通す」形にしてしまうと、そうした既存APIまで意図せず店舗に開いてしまう。
// 店舗に見せてよい範囲（案件詳細の閲覧・メッセージ送受信）は assertShopOwnRow_ を個別に使う。
function assertRowVisible_(session, headers, rowData) {
  if (session.role === JP_ROLE) return;
  if (session.role === SHOP_ROLE) {
    throw new Error('この案件を閲覧・操作する権限がありません。');
  }
  const branchOfRow = String(rowData[headers.indexOf(COL_BRANCH_CODE)]).toUpperCase();
  if (branchOfRow !== session.branchCode) {
    throw new Error('この案件を閲覧・操作する権限がありません。');
  }
}

// ★機能追加：店舗ロールに個別に許可するAPI（案件詳細の閲覧、メッセージ送受信、既読チェック）専用の
// 可視性チェック。「自分（自店舗）が起票した案件か」だけを見る。
function assertShopOwnRow_(session, headers, rowData) {
  const origin = String(rowData[headers.indexOf(COL_ORIGIN_SHOP)] || '').toUpperCase();
  if (session.role !== SHOP_ROLE || !origin || origin !== session.branchCode) {
    throw new Error('この案件を閲覧・操作する権限がありません。');
  }
}

// 現行の「予約一覧」だけでなく「過去一覧」（アーカイブ済み案件）も横断して探す。
// これにより、アーカイブ後の案件でも検索・詳細閲覧・修正ができる。
function findReservationRow_(kanriNo) {
  const ss = getSpreadsheet_();
  for (const sheetName of [RESERVATION_SHEET_NAME, ARCHIVE_SHEET_NAME]) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const kanriColIdx = headers.indexOf(COL_KANRI_NO);
    const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][kanriColIdx]) === String(kanriNo)) {
        return { sheet, headers, rowIndex: i + 2, rowData: values[i] };
      }
    }
  }
  return { sheet: null, headers: [], rowIndex: -1, rowData: null };
}

// =====================================================
// ⑦ 予約フィールドの変更
// =====================================================
// 既存予約内の項目（ステータス・撮影日・ホテル・共有メモ…ほぼ全項目）は、その場で自動保存せず、
// まとめて次の3通りのいずれかで確定する：
//   (a) apiSaveFieldsQuiet   … 保存のみ（履歴・メール通知なし）
//   (b) apiCommitChanges（changes空）… メッセージのみ送信
//   (c) apiCommitChanges（changes＋message）… 変更内容とメッセージをまとめて1回で相手に通知
// changes は { フィールド名: 新しい値 } の集合（例: { "STS JP": "RQ", "OP3": "ドローン撮影" }）。

// (a) 保存のみ：通知（履歴・メール）を発生させずに保存する
function apiSaveFieldsQuiet(token, kanriNo, changes) {
  const session = requireSession_(token);
  if (!changes || Object.keys(changes).length === 0) throw new Error('保存する変更がありません。');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    if (session.role === SHOP_ROLE) assertShopOwnRow_(session, headers, rowData);
    else assertRowVisible_(session, headers, rowData);
    changes = withInquiryOnlyCascade_(session, headers, rowData, changes);

    const writes = Object.keys(changes).map(field => prepareFieldWrite_(session, headers, rowData, field, changes[field]));
    writes.forEach(w => sheet.getRange(rowIndex, w.colIdx).setValue(w.valueToStore));
    sheet.getRange(rowIndex, colIndexOrThrow_(headers, COL_LAST_UPDATED)).setValue(new Date());

    const who = senderLabel_(session);
    writes.forEach(w => logStatusChangeIfApplicable_(kanriNo, w, who));
    applyStatusCascade_(sheet, headers, rowIndex, kanriNo, writes);
    const hopeDateChanged = applyHopeStatusCascade_(sheet, headers, rowIndex, kanriNo, writes, who);

    if (hopeDateChanged || Object.keys(changes).includes(COL_CONFIRMED_DATE)) sortReservationSheet_(sheet);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// (b)/(c) メッセージのみ、または「変更内容＋メッセージ」をまとめて1回で相手に通知する。
// changesが空ならメッセージのみの送信として扱う（履歴1件・メール1通）。
// recipient：店舗が起票した案件で、日本側（JP）が「支店へ」／「店舗へ」のどちらに送るかを
// 明示するためだけの引数（'SHOP' を指定すると店舗へ中継。それ以外・省略時は従来どおり支店へ）。
// 通常の案件・JP以外のロールでは無視される。
function apiCommitChanges(token, kanriNo, changes, message, recipient) {
  const session = requireSession_(token);
  changes = changes || {};
  message = String(message || '').trim();
  if (Object.keys(changes).length === 0 && !message) {
    throw new Error('送信するメッセージまたは変更内容がありません。');
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    if (session.role === SHOP_ROLE) assertShopOwnRow_(session, headers, rowData);
    else assertRowVisible_(session, headers, rowData);
    changes = withInquiryOnlyCascade_(session, headers, rowData, changes);

    const summaryLines = [];
    const writes = [];
    let dateChanged = false;

    Object.keys(changes).forEach(field => {
      const prepared = prepareFieldWrite_(session, headers, rowData, field, changes[field]);
      if (prepared.changed) summaryLines.push(prepared.summaryLine);
      writes.push(prepared);
      if (field === COL_CONFIRMED_DATE) dateChanged = true;
    });

    if (summaryLines.length === 0 && !message) {
      return { ok: true, noChange: true };
    }

    const who = senderLabel_(session);
    if (writes.length > 0) {
      writes.forEach(w => sheet.getRange(rowIndex, w.colIdx).setValue(w.valueToStore));
      sheet.getRange(rowIndex, colIndexOrThrow_(headers, COL_LAST_UPDATED)).setValue(new Date());
      writes.forEach(w => logStatusChangeIfApplicable_(kanriNo, w, who));
      applyStatusCascade_(sheet, headers, rowIndex, kanriNo, writes);
      if (applyHopeStatusCascade_(sheet, headers, rowIndex, kanriNo, writes, who)) dateChanged = true;
    }
    // ★不具合修正（重大）：以前はここで先に sortReservationSheet_() を呼んでいた。
    // 並べ替えを行うと行の位置が変わるため、直後に rowIndex で読み直していた freshRow が
    // 「別の案件の行」になってしまい、
    //   ・やり取り履歴が別案件の管理番号で記録される
    //   ・変更通知メールが別支店へ送られる（＝他支店に案件情報が漏れる）
    // という事故が起きていた（撮影日FIXを変更したときに発生）。
    // 行の位置に依存する読み取りを全て終えてから、最後に並べ替える。
    const freshRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    // ★機能追加：ネームチェンジは専用のステータスを持たない代わりに、新郎名・新婦名欄の変更が
    // 含まれる送信を検知して、通知そのものを「ネームチェンジのお知らせ」として分かりやすくする
    // （お客様が旧姓から新姓に変える等、名前を打ち替えて送信するだけで現地に伝わるようにする）。
    const nameChanged = writes.some(w => w.changed && CUSTOMER_NAME_FIELDS.includes(w.field));
    const bodyParts = [];
    if (nameChanged) bodyParts.push('［ネームチェンジのお知らせ］\nお客様のお名前が変更されました。');
    if (summaryLines.length > 0) bodyParts.push(`[変更内容]\n${summaryLines.join('\n')}`);
    if (message) bodyParts.push(`[メッセージ]\n${message}`);
    const body = bodyParts.join('\n\n');
    const direction = resolveMessageDirection_(session, headers, freshRow, recipient);
    const kind = nameChanged ? 'ネームチェンジ'
      : (summaryLines.length > 0 && message ? '変更＋メッセージ' : (summaryLines.length > 0 ? '変更内容' : 'メッセージ'));

    appendHistory_(headers, freshRow, who, body, session.role, recipientRoleForDirection_(direction));
    markUnreadForDirection_(sheet, headers, rowIndex, direction);
    sendDirectionalMail_(headers, freshRow, direction, session, body, kind);

    if (dateChanged) sortReservationSheet_(sheet);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// シート上の列位置（1始まり）を返す。列が無ければ「原因と対処」が分かるエラーにする。
// ★不具合修正：以前は indexOf の -1 をそのまま使っていたため、列が存在しないと
// getRange(row, 0) という不正な呼び出しになり、Apps Scriptの意味不明な内部エラーで落ちていた。
// （機能追加で増えた列が既存スプレッドシートに無いときに実際に発生する）
function colIndexOrThrow_(headers, name) {
  const i = headers.indexOf(name);
  if (i === -1) {
    throw new Error(`スプレッドシートに「${name}」列がありません。スプレッドシートのメニューから setupPortal を一度実行して、不足している列を追加してください。`);
  }
  return i + 1;
}

// 1フィールド分の検証・保存準備（役割チェック・STSゲート・列挙値チェック・日付変換）を共通化したもの
function prepareFieldWrite_(session, headers, rowData, field, value) {
  // ★機能追加（店舗拡張）：店舗ロールは自分が起票した案件について、SHOP_EDITABLE_FIELDS と
  // STS(JP側)（案件全体・各オプションいずれも。許可される値は validateFieldPermission_ 側でチェック）
  // だけ変更できる。それ以外（請求先・支店側のSTS・現地記入欄など）は従来どおり変更できない。
  if (session.role === SHOP_ROLE && !isJpStatusField_(field) && !SHOP_EDITABLE_FIELDS.includes(field)) {
    throw new Error(`「${field}」は店舗ロールでは変更できません。`);
  }
  if (!COMMITTABLE_FIELDS.includes(field)) {
    throw new Error(`「${field}」はこの方法では変更できません。`);
  }
  validateFieldPermission_(session, headers, rowData, field, value);

  const colIdx = colIndexOrThrow_(headers, field) - 1;
  const isDateField = DATE_FIELDS.includes(field);
  const rawOld = rowData[colIdx];
  const oldDisplay = isDateField ? (formatMaybeDate_(rawOld) || '未定') : (rawOld || '(未設定)');
  // ★要件：新郎新婦の姓・名は常に大文字で保存する（誰が変更しても揃う）
  const valueToStore = isDateField ? parseDateFromInput_(value)
    : (CUSTOMER_NAME_FIELDS.includes(field) ? normalizeNameValue_(value) : (value || ''));
  const newDisplay = isDateField ? (formatMaybeDate_(valueToStore) || '未定') : (valueToStore || '(未設定)');
  const changed = isDateField ? (oldDisplay !== newDisplay) : (String(rawOld || '') !== String(valueToStore));

  return { field, colIdx: colIdx + 1, valueToStore, changed, oldDisplay, newDisplay, summaryLine: `${field}: ${oldDisplay} → ${newDisplay}` };
}

// STS(JP側)／STS(支店側)（メイン・オプション共通）の変更を「誰が・いつ・何から何に」変更したか記録する
function logStatusChangeIfApplicable_(kanriNo, prepared, who) {
  if (!prepared.changed) return;
  if (!isJpStatusField_(prepared.field) && !isBranchStatusField_(prepared.field)) return;
  const sheet = getSpreadsheet_().getSheetByName(STATUS_LOG_SHEET_NAME);
  if (!sheet) return;
  sheet.appendRow([kanriNo, prepared.field, prepared.oldDisplay, prepared.newDisplay, who, new Date()]);
}

// ★要件：「空き確認のみ」にチェックを入れて確定すると、STS JPを自動でCHK（確認依頼中）にする。
// 呼び出し側（JP）がSTS JPを別途明示していれば、そちらを優先して何もしない。
// すでにチェック済みの案件を再送しても何度もSTS JPを巻き戻さないよう、チェックが「新たに入った」時だけ動く。
function withInquiryOnlyCascade_(session, headers, rowData, changes) {
  if (session.role !== JP_ROLE) return changes; // 支店側の操作では連動しない
  if (changes[COL_INQUIRY_ONLY] !== '済') return changes;
  if (COL_STATUS_JP in changes) return changes;
  const before = rowData[headers.indexOf(COL_INQUIRY_ONLY)];
  if (before === '済') return changes; // 既にチェック済み（再送）なら何もしない
  return Object.assign({}, changes, { [COL_STATUS_JP]: 'CHK' });
}

// ★要件：支店が「CR（キャンセル依頼中）」にCWで回答したら日本側も自動でCWにする。
// 「RQ（依頼中）」にUC（空きなし）で回答したら日本側も自動でUCにする。
// 支店が正しく回答しているのに日本側のSTSだけ古いまま気づかれない、という事故を防ぐための自動連動。
// ★機能追加（店舗拡張）：DC（日付変更依頼）・PC（プラン・式場変更依頼）は、支店側の回答
// （OK／UC）がそのままSTS(JP側)にも反映される仕様（通常は支店側はSTS(支店側)しか
// 変更できないが、この2コードの回答に限り例外）。setJpTo が branchValue と同じ＝
// 「支店が入れた値をそのままJP側にも映す」ことを表す。
const STATUS_AUTO_CASCADE = [
  { whenJpIs: 'CR', branchValue: 'CW', setJpTo: 'CW' },
  // ★不具合修正：CWだけキャンセル成立を自動反映していたが、キャンセルチャージが発生するCFの
  // 回答だけJP側に反映されず「支店側はCFなのにJP側はCRのまま」という食い違いが起きていた。
  { whenJpIs: 'CR', branchValue: 'CF', setJpTo: 'CF' },
  { whenJpIs: 'RQ', branchValue: 'UC', setJpTo: 'UC' },
  { whenJpIs: 'DC', branchValue: 'OK', setJpTo: 'OK' },
  { whenJpIs: 'DC', branchValue: 'UC', setJpTo: 'UC' },
  { whenJpIs: 'PC', branchValue: 'OK', setJpTo: 'OK' },
  { whenJpIs: 'PC', branchValue: 'UC', setJpTo: 'UC' }
];
function applyStatusCascade_(sheet, headers, rowIndex, kanriNo, writes) {
  const branchWrite = writes.find(w => w.field === COL_STATUS_BRANCH);
  if (!branchWrite || !branchWrite.changed) return;
  if (writes.some(w => w.field === COL_STATUS_JP)) return; // 同時にJP側も明示変更しているなら自動連動しない
  const jpColIdx = colIndexOrThrow_(headers, COL_STATUS_JP);
  const currentJp = sheet.getRange(rowIndex, jpColIdx).getValue();
  const rule = STATUS_AUTO_CASCADE.find(r => r.whenJpIs === currentJp && r.branchValue === branchWrite.valueToStore);
  if (!rule || rule.setJpTo === currentJp) return;
  sheet.getRange(rowIndex, jpColIdx).setValue(rule.setJpTo);
  const logSheet = getSpreadsheet_().getSheetByName(STATUS_LOG_SHEET_NAME);
  if (logSheet) logSheet.appendRow([kanriNo, COL_STATUS_JP, currentJp, rule.setJpTo, '自動反映（ステータス連動）', new Date()]);
}

// ★機能追加：希望日ごとの空き確認ステータス（hopeStsBranchCol_/hopeStsJpCol_）専用の自動連動。
//   1. 現地側がある希望日のSTS(支店側)をOK／UCに変えたら、対になる希望日のSTS(JP側)にも同じ値を
//      反映する（DC/PCの回答と同じ「支店側の回答がJP側にも映る」例外パターン）
//   2. OKになった場合は、撮影日FIX（COL_CONFIRMED_DATE）へその希望日の日付を反映し、
//      他の入力済みの希望日（まだOK/UCでないもの）を自動でUC／UCにする
//      （複数の希望日が同時にOKになることは無い前提のため）
//   3. 案件全体のSTS(JP側)がまだ初期値のRQのままなら、案件全体のSTS(JP側)・STS(支店側)もOKにする
//      （CHK＝空き確認のみの案件や、既にDC/PC/CR/NC等へ手動で進めている案件は巻き戻さない）
// 戻り値：撮影日FIXを更新したかどうか（呼び出し元でsortReservationSheet_を呼ぶ判断に使う）
function applyHopeStatusCascade_(sheet, headers, rowIndex, kanriNo, writes, who) {
  const label = who || '自動反映（ステータス連動）';
  const logSheet = getSpreadsheet_().getSheetByName(STATUS_LOG_SHEET_NAME);
  const logChange = (field, oldVal, newVal) => { if (logSheet) logSheet.appendRow([kanriNo, field, oldVal, newVal, label, new Date()]); };
  let dateChanged = false;

  for (let n = 1; n <= HOPE_COLS.length; n++) {
    const branchField = hopeStsBranchCol_(n);
    const write = writes.find(w => w.field === branchField);
    if (!write || !write.changed) continue;
    const newVal = write.valueToStore;
    if (newVal !== 'OK' && newVal !== 'UC') continue; // ST/RQへの変更はそれ単体で完結（連動なし）

    const jpField = hopeStsJpCol_(n);
    const jpColIdx = colIndexOrThrow_(headers, jpField);
    const currentJp = sheet.getRange(rowIndex, jpColIdx).getValue();
    if (currentJp !== newVal) {
      sheet.getRange(rowIndex, jpColIdx).setValue(newVal);
      logChange(jpField, currentJp, newVal);
    }
    if (newVal !== 'OK') continue;

    // この希望日の日付を撮影日FIXへ反映する（希望日が日付として認識できない形式でも、ステータス連動自体は止めない）
    const dateVal = sheet.getRange(rowIndex, colIndexOrThrow_(headers, HOPE_COLS[n - 1])).getValue();
    if (dateVal) {
      try {
        const parsed = parseDateFromInput_(String(dateVal));
        if (parsed) { sheet.getRange(rowIndex, colIndexOrThrow_(headers, COL_CONFIRMED_DATE)).setValue(parsed); dateChanged = true; }
      } catch (e) { /* 無視して続行 */ }
    }

    // 他の希望日（入力済みのもの）は自動でUC／UCにする
    for (let m = 1; m <= HOPE_COLS.length; m++) {
      if (m === n) continue;
      if (!sheet.getRange(rowIndex, colIndexOrThrow_(headers, HOPE_COLS[m - 1])).getValue()) continue;
      const otherBranchIdx = colIndexOrThrow_(headers, hopeStsBranchCol_(m));
      const otherJpIdx = colIndexOrThrow_(headers, hopeStsJpCol_(m));
      const otherBranchVal = sheet.getRange(rowIndex, otherBranchIdx).getValue();
      const otherJpVal = sheet.getRange(rowIndex, otherJpIdx).getValue();
      if (otherBranchVal !== 'OK' && otherBranchVal !== 'UC') {
        sheet.getRange(rowIndex, otherBranchIdx).setValue('UC');
        logChange(hopeStsBranchCol_(m), otherBranchVal, 'UC');
      }
      if (otherJpVal !== 'OK' && otherJpVal !== 'UC') {
        sheet.getRange(rowIndex, otherJpIdx).setValue('UC');
        logChange(hopeStsJpCol_(m), otherJpVal, 'UC');
      }
    }

    // 案件全体のSTS(JP側)がまだ初期値RQのままなら、希望日確定に伴い全体もOKへ進める
    const overallJpIdx = colIndexOrThrow_(headers, COL_STATUS_JP);
    const overallJp = sheet.getRange(rowIndex, overallJpIdx).getValue();
    if (overallJp === 'RQ') {
      sheet.getRange(rowIndex, overallJpIdx).setValue('OK');
      logChange(COL_STATUS_JP, overallJp, 'OK');
      const overallBranchIdx = colIndexOrThrow_(headers, COL_STATUS_BRANCH);
      const overallBranch = sheet.getRange(rowIndex, overallBranchIdx).getValue();
      sheet.getRange(rowIndex, overallBranchIdx).setValue('OK');
      logChange(COL_STATUS_BRANCH, overallBranch, 'OK');
    }
  }
  return dateChanged;
}

function validateFieldPermission_(session, headers, rowData, field, value) {
  if (isJpStatusField_(field)) {
    // ★機能追加（店舗拡張）：店舗は自分の案件のSTS(JP側)（案件全体・各オプションいずれも）を、
    // 決められた値（新規作成後の変更用途：最終確定・キャンセル依頼・
    // 日付変更依頼・プラン/式場変更依頼）に限って変更できる。名前変更（ネームチェンジ）は
    // 専用のステータスを持たず、新郎名・新婦名欄を直接編集して送信するだけでよい。
    // ★要件：専用の「ステータス変更」欄を廃止し、プラン・各オプションの隣に出るSTS(JP側)バッジ
    // から直接変更できるようにしたため、対象を案件全体に限定せず isJpStatusField_ が真になる
    // フィールド（＝案件全体のSTS JPと各オプションのSTS JP）すべてに広げる。
    // FNの前提条件（OKからのみ）は、対象のフィールドそれぞれの現在値で判定する
    // （案件全体をFNにするにはSTS JPがOK、オプション③をFNにするにはオプション③のSTS JPがOK、という具合）。
    if (session.role === SHOP_ROLE) {
      const currentValue = String(rowData[headers.indexOf(field)] || '');
      // ★要件：一度OK（現地確定）になった「各オプション」は、店舗側からRQ・DC・PCへは
      // 戻せないようにする。OKの状態から店舗が選べるのはCR（キャンセル依頼）・FN（最終確定）のみ
      // （RQへ戻す＝依頼前に戻す・DC/PCへ変える＝まだ何も確定していない扱いにする、といった
      // 操作は、現地が既に確定させた後では認めない）。
      // ★対象はオプション（OPn STS JP）のみ：案件全体のSTS(JP側)は、OKになった後もDC（日付変更依頼）・
      // PC（プラン・式場変更依頼）を店舗から出せる仕様（拡張要望3-2）のため、ここでは絞り込まない。
      const isOptionField = /^OP\d+ STS JP$/.test(field);
      const allowedTargets = (isOptionField && currentValue === 'OK') ? SHOP_STATUS_TARGETS_FROM_OK : SHOP_STATUS_TARGETS;
      if (!allowedTargets.includes(value)) {
        throw new Error((isOptionField && currentValue === 'OK')
          ? `OK（現地確定済み）の状態から店舗が設定できるSTS(JP側)は ${SHOP_STATUS_TARGETS_FROM_OK.join('/')} のいずれかです。`
          : `店舗が設定できるSTS(JP側)は ${SHOP_STATUS_TARGETS.join('/')} のいずれかです。`);
      }
      if (value === 'FN' && currentValue !== 'OK') {
        throw new Error('STS(JP側)をFN（最終確定）にできるのはOKの状態からだけです。');
      }
      return;
    }
    if (session.role !== JP_ROLE) throw new Error(`「${field}」は日本側のみ変更できます。`);
    if (value && !STATUS_CODES.includes(value)) throw new Error(`STSの値は ${STATUS_CODES.join('/')} のいずれかにしてください。`);
    return;
  }
  if (isBranchStatusField_(field)) {
    if (session.role !== BRANCH_ROLE) throw new Error(`「${field}」は支店側のみ変更できます。`);
    const pairedField = pairedJpFieldFor_(field);
    const pairedValue = pairedField ? (rowData[headers.indexOf(pairedField)] || '') : '';
    if (!(pairedValue in BRANCH_EDIT_GATE)) {
      throw new Error(`現在の${pairedField}（${pairedValue || '未設定'}）の状態では「${field}」は変更できません。`);
    }
    const allowed = BRANCH_EDIT_GATE[pairedValue];
    if (allowed !== null && value && !allowed.includes(value)) {
      throw new Error(`${pairedField}が${pairedValue}のときは「${field}」は ${allowed.join('/')} のいずれかにしてください。`);
    }
    if (value && !STATUS_CODES.includes(value)) throw new Error(`STSの値は ${STATUS_CODES.join('/')} のいずれかにしてください。`);
    return;
  }
  // オプション名(OPn)欄はどちらの役割でも変更可（ステータスではなく単なるラベルのため）
  // ★要件：管轄（担当手配課）は「日本記入欄」タブに移した内部的な割り当てのため、日本側のみ変更できる
  // （支店側の画面にも「担当：◯◯手配課」として表示はするが、編集用の入力欄は出さない）
  if (field === COL_AREA) {
    if (session.role !== JP_ROLE) throw new Error('管轄は日本側のみ変更できます。');
    if (value && !JP_TEAMS.includes(value)) throw new Error(`管轄は ${JP_TEAMS.join('/')} のいずれかにしてください。`);
  }
  if (field === COL_BILLING_REGION && value && !BILLING_REGIONS.includes(value)) {
    throw new Error(`請求先は ${BILLING_REGIONS.join('/')} のいずれかにしてください。`);
  }
  // ★要件：チャレンジ番号（CHG NO）は英数字11桁固定。通常の3択フローで変更する場合も同じ形式を強制する
  // （新規作成時の必須チェックはapiShopCreateRequest側で行う。ここでは「値を入れるならこの形式のみ」）
  if (field === COL_CHALLENGE_NO && value && !CHALLENGE_NO_PATTERN.test(value)) {
    throw new Error('チャレンジ番号は英数字11桁で入力してください（例：14126000123）。');
  }
}

// ★希望日ごとのSTS(JP側)（"希望日① STS JP"等）は意図的に含めない。誰も直接編集しないフィールドのため
// （作成時の自動初期化と、現地側のOK/UC回答に連動する自動反映だけで値が変わる。上のHOPE_JP_STATUS_FIELDS参照）。
function isJpStatusField_(field) {
  return field === COL_STATUS_JP || /^OP\d+ STS JP$/.test(field);
}
function isBranchStatusField_(field) {
  return field === COL_STATUS_BRANCH || /^OP\d+ STS 支店$/.test(field) || /^希望日[①-⑤] STS 支店$/.test(field);
}
function pairedJpFieldFor_(field) {
  if (field === COL_STATUS_BRANCH) return COL_STATUS_JP;
  const m = field.match(/^(OP\d+) STS 支店$/);
  if (m) return `${m[1]} STS JP`;
  const hm = field.match(/^(希望日[①-⑤]) STS 支店$/);
  return hm ? `${hm[1]} STS JP` : null;
}

// メッセージ単体の送信は apiCommitChanges(token, kanriNo, {}, message) を使う
// （「メッセージのみ送信」「変更内容＋メッセージを送信」「保存のみ」の3択を1つのAPI体系に統一するため）

// =====================================================
// ⑨ DriveフォルダURL通知
// =====================================================
function apiSetDriveUrl(token, kanriNo, url) {
  const session = requireSession_(token);
  const trimmed = String(url).trim();
  if (!trimmed.startsWith('http')) throw new Error('有効なURLを入力してください。');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertRowVisible_(session, headers, rowData);

    sheet.getRange(rowIndex, colIndexOrThrow_(headers, COL_DRIVE_URL)).setValue(trimmed);
    sheet.getRange(rowIndex, colIndexOrThrow_(headers, COL_LAST_UPDATED)).setValue(new Date());

    const freshRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    // ★不具合修正：markUnreadForCounterpart_ はSTS(JP側)未読フラグ実装の見直し（店舗ロール対応）で
    // markUnreadForDirection_ に置き換えたが、この呼び出し箇所だけ更新漏れしていた
    // （どのテストも実際にこの行まで到達する成功パスを通していなかったため気づけなかった）。
    const direction = resolveMessageDirection_(session, headers, freshRow);
    appendHistory_(headers, freshRow, senderLabel_(session), `[DriveフォルダURL更新]\n${trimmed}`, session.role, recipientRoleForDirection_(direction));
    markUnreadForDirection_(sheet, headers, rowIndex, direction);
    sendDirectionalMail_(headers, freshRow, 'BOTH', session, trimmed, 'DriveフォルダURL');
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑨-2 ドライブ連携（お客様提供画像・指示書のアップロード／機能：拡張要望8章）
// =====================================================
// 店舗スタッフが、ヘアメイク画像・衣裳画像・撮影指示書・着付け指示書等をアップロードするための機能。
// ★8-4（要望書に明記された未検証事項）：このWebアプリが「実行するユーザー：アクセスしたユーザー」で
// デプロイされている場合、フォルダ作成・ファイル追加は「アップロード操作をした店舗スタッフ自身の
// Googleアカウント」の権限で行われる。そのアカウントが共有ドライブへフォルダを作成できるかは
// 実際の運用環境でしか確認できない（このリポジトリの開発環境では検証不可）ため、
// Driveの操作は必ずtry/catchで囲み、失敗しても案件そのものの作成・表示は絶対に壊さない設計にしている。
const SHOP_UPLOAD_DOC_TYPES = ['ヘアメイク画像', '衣裳画像', '撮影指示書', '着付け指示書'];

// DriveのURL文字列からフォルダIDを取り出す。
// 「.../folders/<ID>」「?id=<ID>」の代表的な2形式を優先的に拾い、
// どちらにも当てはまらない場合は末尾のパスセグメントをIDとみなす（多少形式が違っても大体拾える簡易実装）。
function driveFolderIdFromUrl_(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  let m = s.match(/\/folders\/([^/?#]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([^&#]+)/);
  if (m) return m[1];
  const parts = s.split(/[/?#]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

// 案件の店舗アップロード用フォルダを取得（無ければ作成）する。
// ★要件（8-1・8-2）：フォルダ名にチャレンジ番号・予約番号(管理番号)の両方を含める。
// 既にDriveフォルダURL（最終的な撮影データ納品先）が登録済みならその直下に作る。
// 未登録なら、このフォルダ自体を新規作成し、以後の最終データ納品用フォルダとしてもそのまま使い回す
// （DriveフォルダURL欄にも同じURLを反映する＝「同じ親フォルダを使う」という要件を、
// 　実質「同じフォルダをそのまま両方の用途に使う」形で満たす）。
function ensureShopUploadFolder_(sheet, headers, rowIndex, rowData) {
  const getV = (name) => rowData[headers.indexOf(name)];
  const existingFolderUrl = String(getV(COL_SHOP_UPLOAD_FOLDER_URL) || '').trim();
  if (existingFolderUrl) {
    const id = driveFolderIdFromUrl_(existingFolderUrl);
    if (id) return DriveApp.getFolderById(id);
  }
  const kanriNo = getV(COL_KANRI_NO);
  const challengeNo = getV(COL_CHALLENGE_NO) || 'NoCH';
  const folderName = `${challengeNo}_${kanriNo}`;
  const existingDriveUrl = String(getV(COL_DRIVE_URL) || '').trim();
  let parent = null;
  if (existingDriveUrl) {
    const pid = driveFolderIdFromUrl_(existingDriveUrl);
    if (pid) { try { parent = DriveApp.getFolderById(pid); } catch (e) { parent = null; } }
  }
  const folder = parent ? parent.createFolder(folderName) : DriveApp.createFolder(folderName);
  SHOP_UPLOAD_DOC_TYPES.forEach(t => folder.createFolder(t));
  const url = folder.getUrl();
  sheet.getRange(rowIndex, colIndexOrThrow_(headers, COL_SHOP_UPLOAD_FOLDER_URL)).setValue(url);
  if (!existingDriveUrl) sheet.getRange(rowIndex, colIndexOrThrow_(headers, COL_DRIVE_URL)).setValue(url);
  return folder;
}

// 店舗が、お客様提供の画像・指示書を1件アップロードする。
// base64Data: ブラウザ側でFileReader.readAsDataURLしたものからヘッダを除いたBase64文字列を渡す想定。
function apiShopUploadDocument(token, kanriNo, docType, filename, mimeType, base64Data) {
  const session = requireSession_(token);
  if (session.role !== SHOP_ROLE) throw new Error('この操作は店舗ロールのみ実行できます。');
  if (!SHOP_UPLOAD_DOC_TYPES.includes(docType)) {
    throw new Error(`書類種別は ${SHOP_UPLOAD_DOC_TYPES.join('/')} のいずれかにしてください。`);
  }
  const trimmedName = String(filename || '').trim();
  if (!trimmedName) throw new Error('ファイル名を指定してください。');
  if (!base64Data) throw new Error('アップロードするファイルを選択してください。');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertShopOwnRow_(session, headers, rowData);

    const folder = ensureShopUploadFolder_(sheet, headers, rowIndex, rowData);
    const subIter = folder.getFoldersByName(docType);
    const targetFolder = subIter.hasNext() ? subIter.next() : folder.createFolder(docType);
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType || 'application/octet-stream', trimmedName);
    const file = targetFolder.createFile(blob);

    const freshRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    const direction = resolveMessageDirection_(session, headers, freshRow);
    appendHistory_(headers, freshRow, senderLabel_(session), `[お客様提供データのアップロード]\n${docType}: ${trimmedName}`, SHOP_ROLE, recipientRoleForDirection_(direction));
    markUnreadForDirection_(sheet, headers, rowIndex, direction);

    return { ok: true, fileUrl: file.getUrl(), folderUrl: folder.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

// アップロード済みの書類一覧を取得する。
// ★要件（8-3）：既定では手配課のみ閲覧可。支店マスタ「店舗アップロードの現地公開」がONの支店だけ
// 現地(支店)にも見せる（店舗自身は常に自分の案件について閲覧できる）。
function apiListShopUploadedDocuments(token, kanriNo) {
  const session = requireSession_(token);
  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  if (session.role === SHOP_ROLE) assertShopOwnRow_(session, headers, rowData);
  else assertRowVisible_(session, headers, rowData);

  if (session.role === BRANCH_ROLE) {
    const targetMeta = branchMetaMap_()[String(rowData[headers.indexOf(COL_BRANCH_CODE)] || '').toUpperCase()] || {};
    const originShop = String(rowData[headers.indexOf(COL_ORIGIN_SHOP)] || '').trim();
    if (!originShop || !targetMeta.shopUploadVisibleToBranch) {
      return { ok: true, visible: false, folders: [] };
    }
  }

  const folderUrl = String(rowData[headers.indexOf(COL_SHOP_UPLOAD_FOLDER_URL)] || '').trim();
  if (!folderUrl) return { ok: true, visible: true, folderUrl: '', folders: [] };
  const id = driveFolderIdFromUrl_(folderUrl);
  if (!id) return { ok: true, visible: true, folderUrl, folders: [] };

  try {
    const root = DriveApp.getFolderById(id);
    const folders = SHOP_UPLOAD_DOC_TYPES.map(docType => {
      const files = [];
      const subIter = root.getFoldersByName(docType);
      if (subIter.hasNext()) {
        const sub = subIter.next();
        const fIter = sub.getFiles();
        while (fIter.hasNext()) {
          const f = fIter.next();
          files.push({ name: f.getName(), url: f.getUrl(), updatedAt: formatMaybeDate_(f.getLastUpdated()) });
        }
      }
      return { docType, files };
    });
    return { ok: true, visible: true, folderUrl, folders };
  } catch (e) {
    // ★フォルダが削除された・権限を失った等の場合もエラーで落とさず、空リストで返す
    return { ok: true, visible: true, folderUrl, folders: [], error: errorMessage_(e) };
  }
}

// =====================================================
// ⑨-2 日本記入欄（フォトブリッジ登録・AI加工・データアップロード・納品先メールアドレス・早期納品）
// =====================================================
// ★要件：日本の手配課側のみが見る項目。通常の3択（保存のみ／メッセージのみ／変更＋メッセージ）には
// 乗せず、専用APIで直接保存する（支店に見える履歴・通知メールへは絶対に混ざらない設計にするため）。
// フォトブリッジ登録・データアップロードはチェックした担当者名を自動で記録する。
function apiSetInternalFlag(token, kanriNo, field, checked) {
  const session = requireSession_(token);
  assertJp_(session); // ★この関数自体が「日本側専用」の境界。支店ロールはここで必ず拒否される
  const spec = INTERNAL_FLAG_SPECS[String(field)];
  if (!spec) throw new Error(`「${field}」はこの方法では変更できません。`);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertRowVisible_(session, headers, rowData);

    sheet.getRange(rowIndex, colIndexOrThrow_(headers, field)).setValue(checked ? spec.doneValue : '');
    if (spec.byField) {
      // ベースは未（未チェック）。チェックを入れた瞬間の担当者名を自動反映し、外したら空に戻す
      sheet.getRange(rowIndex, colIndexOrThrow_(headers, spec.byField))
        .setValue(checked ? senderLabel_(session) : '');
    }
    if (spec.atField) {
      // ★要件：担当者名だけでなく、チェックした日時も自動で記録する
      sheet.getRange(rowIndex, colIndexOrThrow_(headers, spec.atField))
        .setValue(checked ? new Date() : '');
    }
    sheet.getRange(rowIndex, colIndexOrThrow_(headers, COL_LAST_UPDATED)).setValue(new Date());
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// ★要件：AI加工（加工内容の選択）・納品先メールアドレス（自由入力）など、チェックボックスではなく
// 値そのものを持つ日本記入欄の項目を保存する。apiSetInternalFlagと同じく即時保存・日本側専用。
function apiSetInternalValue(token, kanriNo, field, value) {
  const session = requireSession_(token);
  assertJp_(session);
  const spec = INTERNAL_VALUE_SPECS[String(field)];
  if (!spec) throw new Error(`「${field}」はこの方法では変更できません。`);

  const text = String(value || '').trim();
  if (spec.type === 'select' && text && !spec.options.includes(text)) {
    throw new Error(`「${field}」は ${spec.options.join('/')} のいずれかにしてください。`);
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertRowVisible_(session, headers, rowData);

    sheet.getRange(rowIndex, colIndexOrThrow_(headers, field)).setValue(text);
    sheet.getRange(rowIndex, colIndexOrThrow_(headers, COL_LAST_UPDATED)).setValue(new Date());
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑨-3 メモ履歴（共有メモ・メモ（現地用）・アンケート回答を積み上げ式で記録）
// =====================================================
// ★要件：共有メモ／メモ（現地用）は「上書き」ではなく「追記」にする。日付・担当者は自動、
// 内容だけ手入力。3択保存（保存のみ／メッセージ／変更＋メッセージ）の対象外で、即時保存する
// （社内進行管理欄のチェックボックスと同じ考え方）。
function getMemoLog_(kanriNo) {
  const sheet = getSpreadsheet_().getSheetByName(MEMO_LOG_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet)
    .filter(r => String(r[ML_COL_KANRI]) === String(kanriNo))
    .map(r => ({
      type: r[ML_COL_TYPE],
      body: r[ML_COL_BODY],
      who: r[ML_COL_WHO],
      at: r[ML_COL_WHEN] instanceof Date ? r[ML_COL_WHEN].getTime() : (Date.parse(r[ML_COL_WHEN]) || 0),
      datetime: formatDateTime_(r[ML_COL_WHEN])
    }));
  // 新しい順。短時間に連続で追加すると同じ日時（ミリ秒まで一致）になり得るため、
  // 先にシート内の並び順（＝追記順）を反転させてから安定ソートし、同時刻は後から追記した方を先に出す
  rows.reverse();
  rows.sort((a, b) => b.at - a.at);
  return rows;
}

// 現地スタッフ手配メールの下書きに、直近のメモ（現地用）を1件添えるための小さなヘルパー。
// メモ履歴に1件も無い（＝この機能を追加する前からある案件）場合は、旧・単一項目の値にフォールバックする。
function latestLocalMemo_(kanriNo, legacyValue) {
  const found = getMemoLog_(kanriNo).find(m => m.type === MEMO_TYPE_LOCAL);
  return found ? found.body : (legacyValue || '');
}

function apiAddMemo(token, kanriNo, memoType, body) {
  const session = requireSession_(token);
  if (memoType !== MEMO_TYPE_SHARED && memoType !== MEMO_TYPE_LOCAL) {
    throw new Error('種別が正しくありません。');
  }
  // ★機能追加（店舗拡張）：店舗が使えるのは共有メモだけ（メモ（現地用）は支店の内部運用メモのため）
  if (session.role === SHOP_ROLE && memoType !== MEMO_TYPE_SHARED) {
    throw new Error('店舗が追加できるのは共有メモだけです。');
  }
  const text = String(body || '').trim();
  if (!text) throw new Error('内容を入力してください。');

  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  if (session.role === SHOP_ROLE) assertShopOwnRow_(session, headers, rowData);
  else assertRowVisible_(session, headers, rowData);

  const sheet = getSpreadsheet_().getSheetByName(MEMO_LOG_SHEET_NAME);
  sheet.appendRow([kanriNo, memoType, text, senderLabel_(session), new Date()]);
  return { ok: true };
}

// =====================================================
// ⑨-4 現地スタッフ手配メール（機能：スタッフ手配）
// =====================================================
// ★要件：カメラマン・ヘアメイク・アシスタント・花屋さん・送迎車のカテゴリごとに、
// 支店マスタへ事前登録した宛先へ手配メールの下書きを自動生成し、担当者は内容を確認・
// 必要なら編集してから送信する（宛先は下書き作成時にサーバー側で確定させ、送信APIでは
// クライアントから任意の宛先を指定できないようにしている＝送信先の改ざん防止）。
// 同じ宛先を複数カテゴリに設定すれば「1件の委託先にまとめて依頼」にも対応できる。
// 支店ごとに使う／使わないを選べる（支店マスタの「手配メール機能」列。既定は無効）。
function getArrangementMeta_(branchCode) {
  const code = String(branchCode || '').trim().toUpperCase();
  const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
  const row = getRowsAsObjects_(sheet).find(r => String(r[BM_COL_CODE] || '').trim().toUpperCase() === code);
  const categoriesOf = (r) => ARRANGEMENT_CATEGORIES.map(c => ({
    key: c.key, label: c.label,
    name: r ? (r[arrNameCol_(c.label)] || '') : '',
    email: r ? (r[arrEmailCol_(c.label)] || '') : ''
  }));
  return { enabled: row ? isActiveFlag_(row[BM_COL_ARRANGEMENT_ENABLED]) : false, categories: categoriesOf(row) };
}

function getArrangementLog_(kanriNo) {
  const sheet = getSpreadsheet_().getSheetByName(ARRANGEMENT_LOG_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet)
    .filter(r => String(r[AL_COL_KANRI]) === String(kanriNo))
    .map(r => ({
      category: r[AL_COL_CATEGORY],
      toName: r[AL_COL_TO_NAME],
      toEmail: r[AL_COL_TO_EMAIL],
      subject: r[AL_COL_SUBJECT],
      body: r[AL_COL_BODY],
      who: r[AL_COL_WHO],
      at: r[AL_COL_WHEN] instanceof Date ? r[AL_COL_WHEN].getTime() : (Date.parse(r[AL_COL_WHEN]) || 0),
      datetime: formatDateTime_(r[AL_COL_WHEN])
    }));
  // 新しい順（同時刻のタイブレークは getMemoLog_ と同じ考え方）
  rows.reverse();
  rows.sort((a, b) => b.at - a.at);
  return rows;
}

// 設定の閲覧・保存は「自支店 or JP」（プラン／オプションマスタと同じ運用）：
// 現地側でウェブアプリ上から編集できるのが基本だが、難しければ日本側からも設定できる。
function apiGetArrangementSettings(token, branchCode) {
  const session = requireSession_(token);
  const target = session.role === BRANCH_ROLE ? session.branchCode : String(branchCode || '').trim().toUpperCase();
  assertBranchAccess_(session, target);
  const meta = getArrangementMeta_(target);
  return { ok: true, branchCode: target, enabled: meta.enabled, categories: meta.categories };
}

function apiSaveArrangementSettings(token, branchCode, settings) {
  const session = requireSession_(token);
  // ★不具合防止：読み取り系（apiGetArrangementSettings等）と違い、書き込みは「支店ロールなら
  // 渡されたbranchCodeを黙って自分の支店へ読み替える」のではなく、他支店を指定したこと自体を
  // 明確に拒否する（apiSaveStaffItem等の他の書き込みAPIと同じ方針。誤って他支店を指定した操作を
  // こちらの支店へ静かにすり替えて保存してしまうのを防ぐため）。
  assertBranchAccess_(session, branchCode);
  const target = String(branchCode || '').trim().toUpperCase();
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('設定内容が正しく送信されませんでした。');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastRow = sheet.getLastRow();
    const codeColIdx = headers.indexOf(BM_COL_CODE);
    let targetRow = -1;
    if (lastRow > 1) {
      const codes = sheet.getRange(2, codeColIdx + 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < codes.length; i++) {
        if (String(codes[i][0]).trim().toUpperCase() === target) { targetRow = i + 2; break; }
      }
    }
    if (targetRow === -1) throw new Error('対象の支店が見つかりません。');

    sheet.getRange(targetRow, colIndexOrThrow_(headers, BM_COL_ARRANGEMENT_ENABLED)).setValue(!!settings.enabled);
    const categories = (settings.categories && typeof settings.categories === 'object') ? settings.categories : {};
    ARRANGEMENT_CATEGORIES.forEach(c => {
      const v = categories[c.key] || {};
      sheet.getRange(targetRow, colIndexOrThrow_(headers, arrNameCol_(c.label))).setValue(String(v.name || '').trim());
      sheet.getRange(targetRow, colIndexOrThrow_(headers, arrEmailCol_(c.label))).setValue(String(v.email || '').trim());
    });
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// 下書きを作る（宛先はここでサーバー側が確定する。クライアントは件名・本文だけを編集できる）
function apiBuildArrangementDraft(token, kanriNo, categoryKey) {
  const session = requireSession_(token);
  const category = ARRANGEMENT_CATEGORIES.find(c => c.key === categoryKey);
  if (!category) throw new Error('手配カテゴリが正しくありません。');

  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  assertRowVisible_(session, headers, rowData);

  const getV = (name) => rowData[headers.indexOf(name)] || '';
  const branchCode = getV(COL_BRANCH_CODE);
  const arr = getArrangementMeta_(branchCode);
  if (!arr.enabled) throw new Error('この支店では現地スタッフ手配メール機能が無効になっています。設定画面から有効にしてください。');
  const contact = arr.categories.find(c => c.key === categoryKey);
  if (!contact || !contact.email) {
    throw new Error(`「${category.label}」の手配先メールアドレスが設定されていません。設定画面から登録してください。`);
  }

  const kanri = getV(COL_KANRI_NO);
  const chgNo = getV(COL_CHALLENGE_NO) || 'なし';
  const groom = fullName_(getV(COL_GROOM_LAST_NAME), getV(COL_GROOM_NAME));
  const bride = fullName_(getV(COL_BRIDE_LAST_NAME), getV(COL_BRIDE_NAME));
  const hopeDates = [getV(COL_HOPE1), getV(COL_HOPE2), getV(COL_HOPE3), getV(COL_HOPE4), getV(COL_HOPE5)].filter(Boolean);
  const dateDisplay = formatMaybeDate_(getV(COL_CONFIRMED_DATE)) ||
    (hopeDates.length ? `未定（希望日: ${hopeDates.join(' / ')}）` : '未定');
  const branchMeta = branchMetaMap_()[branchCode] || {};
  const localMemo = latestLocalMemo_(kanri, getV(COL_LOCAL_MEMO));

  const bodyLines = [
    `${contact.name ? contact.name + ' 様' : 'ご担当者様'}`,
    '',
    `いつもお世話になっております。${branchMeta.name || branchCode}です。`,
    `以下の内容で${category.label}の手配をお願いいたします。`,
    '',
    `お客様名: ${groom}${bride ? ' ／ ' + bride : ''}`,
    `管理番号: ${kanri}（CHG: ${chgNo}）`,
    `撮影希望日: ${dateDisplay}`,
    getV(COL_LOCATION) ? `撮影希望場所: ${getV(COL_LOCATION)}` : '',
    getV(COL_HOTEL) ? `ホテル: ${getV(COL_HOTEL)}` : '',
    getV(COL_PLAN) ? `プラン: ${getV(COL_PLAN)}` : '',
    localMemo ? `現地メモ: ${localMemo}` : '',
    '',
    'お手数をおかけしますが、可否のご連絡をお願いいたします。'
  ].filter(line => line !== '');

  return {
    ok: true,
    category: category.label,
    recipientName: contact.name || '',
    recipientEmail: contact.email,
    subject: `[WEDLINK][${branchCode}] ${category.label}手配のお願い（${kanri}）`,
    body: bodyLines.join('\n')
  };
}

// 送信する（宛先はクライアントから受け取らず、ここで再度サーバー側の設定から解決し直す）
function apiSendArrangementRequest(token, kanriNo, categoryKey, subject, body) {
  const session = requireSession_(token);
  const category = ARRANGEMENT_CATEGORIES.find(c => c.key === categoryKey);
  if (!category) throw new Error('手配カテゴリが正しくありません。');

  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  assertRowVisible_(session, headers, rowData);

  const getV = (name) => rowData[headers.indexOf(name)] || '';
  const branchCode = getV(COL_BRANCH_CODE);
  const arr = getArrangementMeta_(branchCode);
  if (!arr.enabled) throw new Error('この支店では現地スタッフ手配メール機能が無効になっています。');
  const contact = arr.categories.find(c => c.key === categoryKey);
  if (!contact || !contact.email) {
    throw new Error(`「${category.label}」の手配先メールアドレスが設定されていません。`);
  }

  const subj = String(subject || '').trim() || `${category.label}手配のお願い（${kanriNo}）`;
  const text = String(body || '').trim();
  if (!text) throw new Error('本文を入力してください。');

  const mailOptions = { to: contact.email, subject: subj, body: text };
  const branchEmail = getBranchEmail_(branchCode);
  if (branchEmail) mailOptions.replyTo = branchEmail;
  MailApp.sendEmail(mailOptions);

  const logSheet = getSpreadsheet_().getSheetByName(ARRANGEMENT_LOG_SHEET_NAME);
  logSheet.appendRow([kanriNo, category.label, contact.name || '', contact.email, subj, text, senderLabel_(session), new Date()]);

  return { ok: true };
}

// =====================================================
// ⑩ 新規案件作成（貼り付けテキストからの自動解析）
// =====================================================
// ★機能追加：新規案件作成時、日付が入っている希望日だけ自動でSTS(JP側)=RQ／STS(支店側)=ST
// （現地未確認）で初期化する（第二希望までしか無い等、入っているところまでで良い）。
// JP・支店どちらの新規作成経路（apiCreateReservation／apiShopCreateRequest）でも共通して使う。
function seedHopeStatuses_(headers, newRowData) {
  for (let n = 1; n <= HOPE_COLS.length; n++) {
    const dateIdx = headers.indexOf(HOPE_COLS[n - 1]);
    if (dateIdx === -1 || !newRowData[dateIdx]) continue;
    const jpIdx = headers.indexOf(hopeStsJpCol_(n));
    const branchIdx = headers.indexOf(hopeStsBranchCol_(n));
    if (jpIdx !== -1) newRowData[jpIdx] = 'RQ';
    if (branchIdx !== -1) newRowData[branchIdx] = 'ST';
  }
}

function apiCreateReservation(token, branchCode, rawText) {
  const session = requireSession_(token);
  const targetBranch = session.role === JP_ROLE ? String(branchCode || '').trim().toUpperCase() : session.branchCode;
  if (!targetBranch) throw new Error('支店コードを指定してください。');
  // ★不具合修正：以前は支店コードの実在チェックが無かったため、存在しないコードでも案件を作れてしまい、
  // その案件は「どの支店からもログインして見られない・通知先メールも無い」迷子データになっていた。
  const targetMeta = branchMetaMap_()[targetBranch];
  if (!targetMeta || targetMeta.role !== BRANCH_ROLE || !targetMeta.active) {
    throw new Error(`支店コード「${targetBranch}」は支店マスタに存在しないか、無効になっています。`);
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newNo = nextKanriNo_(targetBranch);
    const newRowIndex = sheet.getLastRow() + 1;

    const parsed = parseReservationText_(rawText);

    const newRowData = new Array(headers.length).fill('');
    const setV = (name, val) => { const i = headers.indexOf(name); if (i !== -1 && val) newRowData[i] = val; };
    setV(COL_BRANCH_CODE, targetBranch);
    setV(COL_KANRI_NO, newNo);
    setV(COL_LAST_UPDATED, new Date());
    setV(COL_STATUS_JP, 'RQ');
    // ★不具合修正：STS(支店側)の初期値に「NC」を流用していたが、NCは今後ネームチェンジ専用の
    // コードのため、名前を変える予定が無い新規案件で最初から「NC」と表示されるのは紛らわしい。
    // 未着手を表す値は不要（空欄のまま。支店側はSTS(JP側)=RQの間は自由に編集できる）。
    setV(COL_CHALLENGE_NO, parsed.challengeNo);
    setV(COL_GROOM_NAME, parsed.groomName);
    setV(COL_BRIDE_NAME, parsed.brideName);
    setV(COL_HOPE1, parsed.hopeDates && parsed.hopeDates[0]);
    setV(COL_HOPE2, parsed.hopeDates && parsed.hopeDates[1]);
    setV(COL_HOPE3, parsed.hopeDates && parsed.hopeDates[2]);
    setV(COL_AREA, parsed.area);
    seedHopeStatuses_(headers, newRowData);

    sheet.getRange(newRowIndex, 1, 1, headers.length).setValues([newRowData]);

    const initMsg = parsed.remarks ? `新規手配依頼が追加されました。\n【備考】\n${parsed.remarks}` : '新規手配依頼が追加されました。';
    // ★不具合修正：以前は作成者が誰であっても 'BRANCH_TO_JP'（＝日本側へ通知）で固定していたため、
    // 日本側が支店の案件を新規作成した場合、通知が自分たち宛てに飛ぶだけで
    // 肝心の支店には新規案件が来たことが一切通知されなかった。
    // メッセージ送信と同じく「相手側へ通知する」ルールに揃える。
    // ★このAPIは店舗ロールでは呼べない（下のtargetMetaチェックで必ず拒否される）ため、
    // resolveMessageDirection_ を通しても常にJP⇔支店の2択にしかならない。
    const newCaseDirection = resolveMessageDirection_(session, headers, newRowData);
    appendHistory_(headers, newRowData, senderLabel_(session), `[新規案件作成]\n${initMsg}`, session.role, recipientRoleForDirection_(newCaseDirection));
    markUnreadForDirection_(sheet, headers, newRowIndex, newCaseDirection);
    sendDirectionalMail_(headers, newRowData, newCaseDirection, session, initMsg, '新規案件');

    sortReservationSheet_(sheet);
    return { ok: true, kanriNo: newNo };
  } finally {
    lock.releaseLock();
  }
}

// =====================================================
// ⑩-2 店舗発の新規依頼（機能：店舗スタッフからの起票）
// =====================================================
// ★機能追加：日本の店舗スタッフが、希望日・お客様名・支店（＝都市）・プラン・該当の手配課を
// 選んで送信すると、新規案件として作成され、日本の該当手配課と現地支店の両方に通知が届く。
// 店舗が起票したことが分かるよう起票元店舗（COL_ORIGIN_SHOP）を記録し、以後のメッセージは
// 支店マスタの「店舗直接やり取り許可」がONの支店なら現地と直接、OFFなら日本の手配課を介して行う
// （resolveMessageDirection_ が案件ごとに毎回この設定を見て向きを決める）。
// ★機能追加（拡張要望2章）：店舗発の新規依頼フォームを拡張。
// ・お客様名は「新郎名（ローマ字）」「新婦名（ローマ字）」の2項目に分離
// ・セール名／撮影希望場所／準備場所／オプション(5件)を新規作成時から入力できる
// ・希望日は1件→最大5件（第一〜第五希望）
// ・パスポート番号は対象支店がパスポート必須の場合のみ受け付ける（表示条件を作成時にも踏襲）
// ・新規作成時のSTS(JP側)は店舗が RQ（予約依頼）／CHK（空き確認のみ）から選べる（既定はRQ）
const SHOP_CREATE_INITIAL_STATUS_CHOICES = ['RQ', 'CHK'];
function apiShopCreateRequest(token, payload) {
  const session = requireSession_(token);
  if (session.role !== SHOP_ROLE) throw new Error('この操作は店舗ロールのみ実行できます。');
  payload = payload || {};

  const branchCode = String(payload.branchCode || '').trim().toUpperCase();
  if (!branchCode) throw new Error('支店（都市）を選択してください。');
  const targetMeta = branchMetaMap_()[branchCode];
  if (!targetMeta || targetMeta.role !== BRANCH_ROLE || !targetMeta.active) {
    throw new Error(`支店コード「${branchCode}」は支店マスタに存在しないか、無効になっています。`);
  }
  const team = String(payload.team || '').trim();
  if (!JP_TEAMS.includes(team)) throw new Error(`該当の手配課は ${JP_TEAMS.join('/')} のいずれかにしてください。`);
  // ★要件：チャレンジ番号は任意ではなく必須。英数字11桁固定（0やアルファベットから始まる場合もある）。
  const challengeNo = String(payload.challengeNo || '').trim();
  if (!challengeNo) throw new Error('チャレンジ番号を入力してください。');
  if (!CHALLENGE_NO_PATTERN.test(challengeNo)) {
    throw new Error('チャレンジ番号は英数字11桁で入力してください（例：14126000123）。');
  }
  // ★要件変更：新規予約作成時は新郎新婦の姓・名すべて必須（以前は新郎の名だけ必須だったが、
  // 「名前も任意入力じゃなくてmust」との要望により全4項目を必須化）。姓・名は常に大文字で保存する
  // （例：YAMADA TARO / YAMADA HANAKO）。既存案件の更新（3択フロー）では従来どおり
  // 必須化はしない（prepareFieldWrite_のnormalizeNameValue_で大文字化だけは常に行う）。
  const groomLastName = normalizeNameValue_(payload.groomLastName);
  const groomName = normalizeNameValue_(payload.groomName || payload.customerName);
  if (!groomLastName) throw new Error('新郎姓（ローマ字）を入力してください。');
  if (!groomName) throw new Error('新郎名（ローマ字）を入力してください。');
  const brideLastName = normalizeNameValue_(payload.brideLastName);
  const brideName = normalizeNameValue_(payload.brideName);
  if (!brideLastName) throw new Error('新婦姓（ローマ字）を入力してください。');
  if (!brideName) throw new Error('新婦名（ローマ字）を入力してください。');
  // ★要件：日本の店舗画面に新郎新婦それぞれの年齢欄を追加（※ISWのみ必要。任意入力）
  const groomAge = String(payload.groomAge || '').trim();
  const brideAge = String(payload.brideAge || '').trim();
  const plan = String(payload.plan || '').trim();
  const saleName = String(payload.saleName || '').trim();
  const location = String(payload.location || '').trim();
  const prep = String(payload.prep || '').trim();
  const hopes = [1, 2, 3, 4, 5].map(n => String(payload['hope' + n] || (n === 1 ? payload.hopeDate : '') || '').trim());
  if (!hopes[0]) throw new Error('希望日（第一希望）を入力してください。');
  const options = [1, 2, 3, 4, 5].map(n => String(payload['option' + n] || '').trim());
  // ★要件：パスポート番号欄は支店の必須設定に関わらず常に入力できる（※ISWのみ必要。任意入力）
  const passportNumber = String(payload.passportNumber || '').trim();
  const initialStatus = String(payload.initialStatus || 'RQ').trim().toUpperCase() || 'RQ';
  if (!SHOP_CREATE_INITIAL_STATUS_CHOICES.includes(initialStatus)) {
    throw new Error(`新規作成時のSTS(JP側)は ${SHOP_CREATE_INITIAL_STATUS_CHOICES.join('/')} のいずれかにしてください。`);
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newNo = nextKanriNo_(branchCode);
    const newRowIndex = sheet.getLastRow() + 1;

    const newRowData = new Array(headers.length).fill('');
    const setV = (name, val) => { const i = headers.indexOf(name); if (i !== -1 && val) newRowData[i] = val; };
    setV(COL_BRANCH_CODE, branchCode);
    setV(COL_KANRI_NO, newNo);
    setV(COL_LAST_UPDATED, new Date());
    setV(COL_STATUS_JP, initialStatus);
    // ★不具合修正：STS(支店側)の初期値に「NC」を流用していたが、NCは今後ネームチェンジ専用の
    // コードのため、名前を変える予定が無い新規案件で最初から「NC」と表示されるのは紛らわしい。
    // 未着手を表す値は不要（空欄のまま。支店側はSTS(JP側)=RQ/CHKの間は自由に編集できる）。
    setV(COL_CHALLENGE_NO, challengeNo);
    setV(COL_GROOM_LAST_NAME, groomLastName);
    setV(COL_GROOM_NAME, groomName);
    setV(COL_BRIDE_LAST_NAME, brideLastName);
    setV(COL_BRIDE_NAME, brideName);
    setV(COL_GROOM_AGE, groomAge);
    setV(COL_BRIDE_AGE, brideAge);
    setV(COL_HOPE1, hopes[0]);
    setV(COL_HOPE2, hopes[1]);
    setV(COL_HOPE3, hopes[2]);
    setV(COL_HOPE4, hopes[3]);
    setV(COL_HOPE5, hopes[4]);
    setV(COL_PLAN, plan);
    setV(COL_SALE_NAME, saleName);
    setV(COL_LOCATION, location);
    setV(COL_PREP, prep);
    options.forEach((name, i) => setV(opNameCol_(i + 1), name));
    // ★要件変更：パスポート番号は支店の必須設定に関わらず、入力があれば常に保存する
    // （日本の店舗画面では常に入力欄を表示し、「※ISWのみ必要」という注記で運用する方針に変更したため）
    setV(COL_PASSPORT_NO, passportNumber);
    setV(COL_AREA, team);
    setV(COL_ORIGIN_SHOP, session.branchCode);
    seedHopeStatuses_(headers, newRowData);

    sheet.getRange(newRowIndex, 1, 1, headers.length).setValues([newRowData]);

    const initialStatusLabel = initialStatus === 'CHK' ? 'CHK（空き確認のみ）' : 'RQ（予約依頼）';
    const initMsg = [
      `店舗（${session.branchName}）からの新規依頼です。（${initialStatusLabel}）`,
      challengeNo ? `チャレンジ番号: ${challengeNo}` : '',
      `新郎名: ${fullName_(groomLastName, groomName)}`,
      `新婦名: ${fullName_(brideLastName, brideName)}`,
      `希望日: ${[hopes[0], hopes[1], hopes[2], hopes[3], hopes[4]].filter(Boolean).join(' / ')}`,
      plan ? `プラン: ${plan}` : '',
      saleName ? `セール名: ${saleName}` : '',
      location ? `撮影希望場所: ${location}` : '',
      prep ? `準備場所: ${prep}` : '',
      `該当の手配課: ${team}手配課`
    ].filter(Boolean).join('\n');

    // ★店舗自身の送信という扱いにする（appendHistory_のsenderRoleにSHOPを記録）。
    appendHistory_(headers, newRowData, senderLabel_(session), `[新規依頼（店舗より）]\n${initMsg}`, SHOP_ROLE, '');
    setUnreadFlag_(sheet, headers, newRowIndex, JP_ROLE, true);
    setUnreadFlag_(sheet, headers, newRowIndex, BRANCH_ROLE, true);
    // ★機能追加（拡張要望5章）：支店マスタ「店舗依頼の手配課通知」がOFF（明示的にFALSE）の
    // 直結支店については、手配課宛のメール通知だけを止める（手配課からの閲覧・監視は妨げない。
    // 上のsetUnreadFlag_(JP_ROLE, true)は変えないため、手配課側の未読表示・一覧上の可視性は従来通り）。
    sendDirectionalMail_(headers, newRowData, targetMeta.shopNotifyHq === false ? 'SHOP_NEW_CASE_BRANCH_ONLY' : 'SHOP_NEW_CASE', session, initMsg, '店舗からの新規依頼');

    // ★要件：請求先は先にマスタ登録しておく運用（支店マスタの「請求先」列）。万が一この店舗の
    // 請求先が未登録（空欄）のまま新規依頼が来た場合は、店舗直接やり取り許可がONの支店であっても
    // 必ず手配課へアラートが届くようにする。店舗には見せず、現地支店・手配課のみ閲覧できる
    // 専用チャネル（BRANCH→JP）で送る（appendHistory_のrecipientRoleにJP_ROLEを明示）。
    const ownShopMeta = branchMetaMap_()[session.branchCode] || {};
    if (!ownShopMeta.shopBilling) {
      appendHistory_(headers, newRowData, 'システム（自動通知）',
        `［請求先未登録アラート］\n店舗「${session.branchName}」の請求先が支店マスタに未登録です。手配課にてご確認・ご登録をお願いします。`,
        BRANCH_ROLE, JP_ROLE);
    }

    sortReservationSheet_(sheet);
    return { ok: true, kanriNo: newNo };
  } finally {
    lock.releaseLock();
  }
}

// 支店ごとに独立して連番採番（プレフィックスが将来変わっても、支店コードで数えるので破綻しない）。
// アーカイブ済み（過去一覧）分も含めて最大値を見るため、アーカイブ後に番号が再利用されて衝突することもない。
function nextKanriNo_(branchCode) {
  const prefix = getBranchPrefix_(branchCode);
  let max = 0;
  const ss = getSpreadsheet_();
  [RESERVATION_SHEET_NAME, ARCHIVE_SHEET_NAME].forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const branchColIdx = headers.indexOf(COL_BRANCH_CODE);
    const kanriColIdx = headers.indexOf(COL_KANRI_NO);
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    values.forEach(row => {
      if (String(row[branchColIdx]).toUpperCase() !== branchCode) return;
      const m = String(row[kanriColIdx]).match(/-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  });
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

function getBranchPrefix_(branchCode) {
  const meta = branchMetaMap_()[branchCode];
  return (meta && meta.prefix) ? meta.prefix : branchCode;
}

// 手配依頼テキストの解析（元ROWスクリプトのロジックを踏襲・全支店共通で利用）
function parseReservationText_(rawText) {
  let challengeNo = '', groomName = '', brideName = '', area = '';
  let hopeDates = [];

  // ★文字列以外（未入力・数値・オブジェクト等）が渡ってもGAS内部の英語エラーにならないようにする。
  // 解析できる情報が無いだけなので、空の解析結果として扱い、案件自体は作れるようにする。
  rawText = (rawText === null || rawText === undefined) ? '' : String(rawText);

  const splitIndex = rawText.search(/^\s*(備考|ATTN:|＜NBINFO＞|お客様からの質問です|第1希望：)/m);
  const remarksText = splitIndex !== -1 ? rawText.substring(splitIndex).trim() : '';
  const mainText = splitIndex !== -1 ? rawText.substring(0, splitIndex) : rawText;

  const areaMatch = rawText.match(/担当者：\s*(.+)/);
  if (areaMatch) area = areaMatch[1].includes('アバンティ＆オアシス業務チーム') ? '関東' : '関西';

  const chMatch = rawText.match(/([A-Za-z0-9]{11})/);
  challengeNo = chMatch ? chMatch[1] : '';

  const groomMatch = mainText.match(/^\s*01\s+(.*?)(?:\(|$)/m);
  if (groomMatch) groomName = groomMatch[1].trim();
  const brideMatch = mainText.match(/^\s*02\s+(.*?)(?:\(|$)/m);
  if (brideMatch) brideName = brideMatch[1].trim();

  const rqLines = mainText.matchAll(/RQ\s+(\d{2,4}\/\d{1,2}\/\d{1,2})/g);
  for (const m of rqLines) hopeDates.push(m[1]);

  return { challengeNo, groomName, brideName, area, hopeDates, remarks: remarksText };
}

// =====================================================
// ⑪ 履歴の既読チェック
// =====================================================
function apiToggleHistoryCheck(token, historyId, checked) {
  const session = requireSession_(token);
  const checkCol = session.role === JP_ROLE ? H_COL_CHECK_JP
    : session.role === SHOP_ROLE ? H_COL_CHECK_SHOP : H_COL_CHECK_BRANCH;
  const dateCol = session.role === JP_ROLE ? H_COL_DATE_JP
    : session.role === SHOP_ROLE ? H_COL_DATE_SHOP : H_COL_DATE_BRANCH;
  const checkedByCol = session.role === JP_ROLE ? H_COL_CHECKED_BY_JP
    : session.role === SHOP_ROLE ? H_COL_CHECKED_BY_SHOP : H_COL_CHECKED_BY_BRANCH;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(HISTORY_SHEET_NAME);
    const lastRow = sheet.getLastRow();
    // ★不具合修正：履歴が1件もない（ヘッダーのみ）状態で呼ばれると、以前は
    // getRange(2, ..., 0, 1) がApps Script側の「範囲の行数は1以上」エラーで落ちていた。
    // 存在しない履歴IDへの操作として、分かりやすいエラーメッセージを返すようにする。
    if (lastRow < 2) throw new Error('対象の履歴が見つかりません。');
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    // 履歴の読み取りはこの1回だけ。対象行の特定と、更新後に「その案件に自分側の未読が
    // まだ残っているか」の判定を、同じ読み取り結果から行う。
    const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const idColIdx = headers.indexOf(H_COL_ID);
    const kanriColIdx = headers.indexOf(H_COL_KANRI);
    const roleColIdx = headers.indexOf(H_COL_SENDER_ROLE);
    const checkColIdx = headers.indexOf(checkCol);

    let targetIdx = -1;
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][idColIdx]) === String(historyId)) { targetIdx = i; break; }
    }
    if (targetIdx === -1) throw new Error('対象の履歴が見つかりません。');
    const targetRow = targetIdx + 2;

    // ★不具合修正（認可漏れ）：以前はセッションの有無しか見ておらず、履歴IDさえ分かれば
    // 他支店のメッセージにも既読チェックを付けられた。既読にすると相手側の「要対応」表示が
    // 消えるため、他支店が対応すべき案件を見落とす原因になり得る。
    // 支店ロールの場合は、その履歴が自支店の案件のものかを必ず確認する。
    if (session.role === BRANCH_ROLE) {
      const branchColIdx = headers.indexOf(H_COL_BRANCH_CODE);
      const rowBranch = branchColIdx === -1
        ? '' : String(values[targetIdx][branchColIdx]).trim().toUpperCase();
      if (rowBranch !== session.branchCode) {
        throw new Error('この履歴を操作する権限がありません。');
      }
    }
    // ★機能追加：店舗ロールは、自分が起票した案件の履歴だけを操作できる
    if (session.role === SHOP_ROLE) {
      const originColIdx = headers.indexOf(H_COL_ORIGIN_SHOP);
      const rowOrigin = originColIdx === -1
        ? '' : String(values[targetIdx][originColIdx]).trim().toUpperCase();
      if (!rowOrigin || rowOrigin !== session.branchCode) {
        throw new Error('この履歴を操作する権限がありません。');
      }
    }

    sheet.getRange(targetRow, colIndexOrThrow_(headers, checkCol)).setValue(checked);
    if (checked) {
      // ★要件：既読チェックは「誰が・いつ」確認したかも記録する
      const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
      sheet.getRange(targetRow, colIndexOrThrow_(headers, dateCol)).setValue(ts);
      sheet.getRange(targetRow, colIndexOrThrow_(headers, checkedByCol)).setValue(senderLabel_(session));
    } else {
      sheet.getRange(targetRow, colIndexOrThrow_(headers, dateCol)).setValue('');
      sheet.getRange(targetRow, colIndexOrThrow_(headers, checkedByCol)).setValue('');
    }

    // ★性能改善：予約一覧の未読フラグを更新する。
    // この案件について「相手側が送った未読のメッセージ」がまだ残っているかを、
    // 上で読んだ履歴データ（メモリ上で今回の変更を反映）から判定する。
    if (kanriColIdx !== -1 && roleColIdx !== -1 && checkColIdx !== -1) {
      values[targetIdx][checkColIdx] = checked;
      const kanriNo = String(values[targetIdx][kanriColIdx]);
      const recipColIdx = headers.indexOf(H_COL_RECIPIENT_ROLE);
      let stillUnread = false;
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][kanriColIdx]) !== kanriNo) continue;
        const senderRole = String(values[i][roleColIdx]).trim().toUpperCase();
        if (senderRole === session.role) continue; // 自分が送ったものは対象外
        const recipRaw = recipColIdx === -1 ? '' : String(values[i][recipColIdx]).trim().toUpperCase();
        if (effectiveRecipientRole_(senderRole, recipRaw) !== session.role) continue;
        if (!isActiveFlag_(values[i][checkColIdx])) { stillUnread = true; break; }
      }
      const target = findReservationRow_(kanriNo);
      if (target.rowIndex !== -1) {
        setUnreadFlag_(target.sheet, target.headers, target.rowIndex, session.role, stillUnread);
      }
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// ★要件：STSの値（OK/RQ等）をタップしたら「誰が・いつ・何から何に変更したか」を確認できるようにする
function apiGetFieldHistory(token, kanriNo, field) {
  const session = requireSession_(token);
  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  // ★機能追加：オプション・プランの名前のすぐ隣にSTSバッジを置き、店舗の画面からもクリックで
  // 履歴を見られるようにしたため、店舗ロールでも自分の起票した案件だけは閲覧できるようにする。
  if (session.role === SHOP_ROLE) assertShopOwnRow_(session, headers, rowData);
  else assertRowVisible_(session, headers, rowData);

  const sheet = getSpreadsheet_().getSheetByName(STATUS_LOG_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet).filter(r =>
    String(r[SL_COL_KANRI]) === String(kanriNo) && r[SL_COL_FIELD] === field
  );
  rows.sort((a, b) => new Date(b[SL_COL_WHEN]) - new Date(a[SL_COL_WHEN]));
  return rows.map(r => ({
    oldValue: r[SL_COL_OLD],
    newValue: r[SL_COL_NEW],
    who: r[SL_COL_WHO],
    datetime: r[SL_COL_WHEN] instanceof Date ? Utilities.formatDate(r[SL_COL_WHEN], 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') : r[SL_COL_WHEN]
  }));
}

// =====================================================
// ⑫ 検索
// =====================================================
// criteria: { kanriNo, challengeNo, name, dateField('shoot'|'ceremony'|'either'),
//             dateFrom, dateTo, country, city, statusJp, statusBranch, scope, includeArchive }
function apiSearchReservations(token, criteria) {
  const session = requireSession_(token);
  criteria = criteria || {};
  const branchMeta = branchMetaMap_();

  const sheetNames = [RESERVATION_SHEET_NAME];
  if (criteria.includeArchive) sheetNames.push(ARCHIVE_SHEET_NAME);

  let results = [];
  sheetNames.forEach(sheetName => {
    const sheet = getSpreadsheet_().getSheetByName(sheetName);
    const rows = getRowsAsObjects_(sheet);
    rows.forEach(r => {
      if (!rowInScope_(session, criteria.scope, r)) return;
      if (!matchesSearch_(r, criteria, branchMeta)) return;
      results.push(toSearchResult_(r, branchMeta, sheetName === ARCHIVE_SHEET_NAME ? '過去一覧' : '予約一覧'));
    });
  });

  results.sort((a, b) => String(a.confirmedDateRaw || '9999').localeCompare(String(b.confirmedDateRaw || '9999')));
  return { ok: true, results };
}

function matchesSearch_(r, c, branchMeta) {
  const norm = (s) => String(s || '').trim().toLowerCase();

  if (c.kanriNo && !norm(r[COL_KANRI_NO]).includes(norm(c.kanriNo))) return false;
  if (c.challengeNo && !norm(r[COL_CHALLENGE_NO]).includes(norm(c.challengeNo))) return false;
  if (c.name) {
    const hay = norm(fullName_(r[COL_GROOM_LAST_NAME], r[COL_GROOM_NAME])) + ' ' + norm(fullName_(r[COL_BRIDE_LAST_NAME], r[COL_BRIDE_NAME]));
    if (!hay.includes(norm(c.name))) return false;
  }
  const meta = branchMeta[r[COL_BRANCH_CODE]] || {};
  if (c.country && !norm(meta.country).includes(norm(c.country))) return false;
  if (c.city && !norm(meta.city).includes(norm(c.city))) return false;
  if (c.statusJp && r[COL_STATUS_JP] !== c.statusJp) return false;
  if (c.statusBranch && r[COL_STATUS_BRANCH] !== c.statusBranch) return false;

  if (c.dateFrom || c.dateTo) {
    const shoot = toComparableDate_(r[COL_CONFIRMED_DATE]);
    const ceremony = toComparableDate_(r[COL_CEREMONY_DATE]);
    const field = c.dateField || 'either';
    const inRange = (d) => d && (!c.dateFrom || d >= c.dateFrom) && (!c.dateTo || d <= c.dateTo);
    if (field === 'shoot' && !inRange(shoot)) return false;
    if (field === 'ceremony' && !inRange(ceremony)) return false;
    if (field === 'either' && !inRange(shoot) && !inRange(ceremony)) return false;
  }
  return true;
}

function toComparableDate_(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  const m = String(val || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return null;
}

// ★命名修正：戻り値は「日数」ではなくミリ秒差。並べ替えの比較にしか使わないため動作は正しいが、
// 名前とコメントが実態とずれていて誤読を招くため、単位が分かる名前に改めた。
// "yyyy/MM/dd"形式の日付文字列と今日との差（ミリ秒の絶対値）を返す。未定・不正な値はInfinity（末尾に回す）
function dateDistanceMsFromToday_(dateStr, todayStr) {
  const m1 = String(dateStr || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m1) return Infinity;
  const m2 = String(todayStr || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  const d1 = new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
  const d2 = m2 ? new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3])) : new Date();
  return Math.abs(d1.getTime() - d2.getTime());
}

function toSearchResult_(r, branchMeta, source) {
  const meta = branchMeta[r[COL_BRANCH_CODE]] || {};
  return {
    source,
    branchCode: r[COL_BRANCH_CODE],
    branchName: meta.name || r[COL_BRANCH_CODE],
    country: meta.country || '',
    city: meta.city || '',
    kanriNo: r[COL_KANRI_NO],
    challengeNo: r[COL_CHALLENGE_NO],
    groomName: fullName_(r[COL_GROOM_LAST_NAME], r[COL_GROOM_NAME]),
    brideName: fullName_(r[COL_BRIDE_LAST_NAME], r[COL_BRIDE_NAME]),
    statusJp: r[COL_STATUS_JP],
    statusBranch: r[COL_STATUS_BRANCH],
    area: r[COL_AREA],
    confirmedDate: formatMaybeDate_(r[COL_CONFIRMED_DATE]),
    confirmedDateRaw: toComparableDate_(r[COL_CONFIRMED_DATE]),
    ceremonyDate: formatMaybeDate_(r[COL_CEREMONY_DATE])
  };
}

// =====================================================
// ⑬ 履歴追加・メール送信の共通処理
// =====================================================
function appendHistory_(headers, rowData, sender, body, senderRole, recipientRole) {
  const h = getSpreadsheet_().getSheetByName(HISTORY_SHEET_NAME);
  const getV = (name) => rowData[headers.indexOf(name)];
  const dateVal = getV(COL_CONFIRMED_DATE);
  const dateStr = dateVal instanceof Date
    ? Utilities.formatDate(dateVal, 'Asia/Tokyo', 'yyyy/MM/dd')
    : (dateVal || '未定');

  // ★不具合修正：以前は定数HISTORY_HEADERSの並び順で行を組み立てて追記していたため、
  // 実際のシートの列順・列数がコード側の定数と少しでも食い違うと、値が別の列に書き込まれて
  // 履歴データが壊れていた（列を追加した直後などに発生）。実シートのヘッダーを読んで
  // 「列名で」書き込み位置を決めるようにする。
  const hLastCol = h.getLastColumn();
  const hHeaders = hLastCol > 0
    ? h.getRange(1, 1, 1, hLastCol).getValues()[0].map(x => String(x).trim())
    : HISTORY_HEADERS.slice();
  const row = new Array(hHeaders.length).fill('');
  const set = (name, val) => { const i = hHeaders.indexOf(name); if (i !== -1) row[i] = val; };
  set(H_COL_ID, Utilities.getUuid());
  set(H_COL_BRANCH_CODE, getV(COL_BRANCH_CODE));
  set(H_COL_KANRI, getV(COL_KANRI_NO));
  set(H_COL_CHALLENGE_NO, getV(COL_CHALLENGE_NO));
  set(H_COL_CONFIRMED_DATE, dateStr);
  set(H_COL_GROOM_NAME, fullName_(getV(COL_GROOM_LAST_NAME), getV(COL_GROOM_NAME)));
  set(H_COL_BRIDE_NAME, fullName_(getV(COL_BRIDE_LAST_NAME), getV(COL_BRIDE_NAME)));
  set(H_COL_DATETIME, new Date());
  set(H_COL_SENDER, sender);
  // ★要件：どちら側（JP／BRANCH／SHOP）からのメッセージかを記録し、ダッシュボードの「要対応」判定に使う
  set(H_COL_SENDER_ROLE, senderRole || '');
  set(H_COL_BODY, body);
  // ★機能追加：店舗が絡む案件の宛先ロール・起票元店舗（可視性フィルタ・既読チェックの認可に使う）
  set(H_COL_RECIPIENT_ROLE, recipientRole || '');
  set(H_COL_ORIGIN_SHOP, getV(COL_ORIGIN_SHOP) || '');

  h.appendRow(row);
}

function sendDirectionalMail_(headers, rowData, direction, session, message, kind) {
  const getV = (name) => rowData[headers.indexOf(name)] || '';
  const branchCode = getV(COL_BRANCH_CODE);
  const area = getV(COL_AREA);
  const kanri = getV(COL_KANRI_NO);
  const chgNo = getV(COL_CHALLENGE_NO) || 'No CH';
  const groom = fullName_(getV(COL_GROOM_LAST_NAME), getV(COL_GROOM_NAME));
  const bride = fullName_(getV(COL_BRIDE_LAST_NAME), getV(COL_BRIDE_NAME));

  const jpEmail = getJpTeamEmail_(area);
  const branchEmail = getBranchEmail_(branchCode);
  // ★機能追加：起票元店舗が絡む案件だけで使う（それ以外の案件では起票元店舗が空欄のため常に空文字）
  const shopEmail = getShopEmail_(getV(COL_ORIGIN_SHOP));

  let recipients;
  if (direction === 'JP_TO_BRANCH') recipients = branchEmail;
  else if (direction === 'BRANCH_TO_JP') recipients = jpEmail;
  else if (direction === 'JP_TO_SHOP') recipients = shopEmail;
  else if (direction === 'SHOP_TO_JP') recipients = jpEmail;
  else if (direction === 'BRANCH_TO_SHOP') recipients = shopEmail;
  else if (direction === 'SHOP_TO_BRANCH') recipients = branchEmail;
  // ★機能追加（拡張要望5章）：直結支店で「店舗依頼の手配課通知」がOFFの場合、
  // 新規依頼通知は現地支店のみに送る（手配課の閲覧権限自体は変えない）
  else if (direction === 'SHOP_NEW_CASE_BRANCH_ONLY') recipients = branchEmail;
  // 新規案件通知など：日本の該当手配課・現地支店の両方に知らせる
  else recipients = [jpEmail, branchEmail].filter(Boolean).join(',');

  if (!recipients) return;

  const subj = `[WEDLINK][${branchCode}] 【${kanri} ｜ ${chgNo}】${kind}のお知らせ`;
  const body = `${senderLabel_(session)} から更新がありました。\n\n` +
               `管理番号: ${kanri}\nChallenge No: ${chgNo}\n新郎: ${groom}\n新婦: ${bride}\n\n` +
               `--- ${kind} ---\n${message}\n\n` +
               `ポータルで確認する: (Webアプリのデプロイ後のURLをここに記載してください)`;

  MailApp.sendEmail(recipients, subj, body);
}

function getBranchEmail_(branchCode) {
  const meta = branchMetaMap_()[branchCode];
  return meta ? meta.email : '';
}

// ★機能追加：起票元店舗コードから通知先メールを引く（支店マスタの ロール=SHOP の行）
function getShopEmail_(shopCode) {
  if (!shopCode) return '';
  const meta = branchMetaMap_()[String(shopCode).toUpperCase()];
  return meta ? meta.email : '';
}

function getJpTeamEmail_(teamLabel) {
  const rows = listBranchesRaw_();
  const found = rows.find(r => r.role === JP_ROLE && r.team === teamLabel);
  if (found) return found.email;
  // "管轄"が未設定・不明な場合は関東手配課へフォールバック
  const fallback = rows.find(r => r.role === JP_ROLE && r.team === '関東');
  return fallback ? fallback.email : SYSTEM_ALERT_EMAIL;
}

// =====================================================
// ⑭ 定期処理の共通ランナー（ログ・例外通知）
// =====================================================
// ★改善：以前は定期処理に例外処理もログ出力も無く、
//   ・1行でも不正なデータがあるとその時点で処理が止まり、以降の案件のアラートが送られない
//   ・失敗しても誰にも通知されず、アラートが止まったことに気づけない
// という状態だった。ここで全体を包み、失敗を SYSTEM_ALERT_EMAIL へ通知する。
// あわせて各処理の中では「行単位」でも例外を捕まえ、1件の異常で全体が止まらないようにする。
function runTrigger_(name, coreFn) {
  const startedAt = new Date();
  const errors = [];
  try {
    coreFn(errors);
  } catch (e) {
    errors.push({ where: '処理全体', message: errorMessage_(e), stack: e && e.stack ? String(e.stack) : '' });
  }
  const elapsedMs = new Date().getTime() - startedAt.getTime();
  if (errors.length > 0) {
    console.error(`[${name}] ${errors.length}件のエラーで終了（${elapsedMs}ms）`);
    errors.forEach(er => console.error(`[${name}] ${er.where}: ${er.message}`));
    notifySystemError_(name, errors, elapsedMs);
  } else {
    console.log(`[${name}] 正常終了（${elapsedMs}ms）`);
  }
  return { ok: errors.length === 0, errors: errors.length };
}

function errorMessage_(e) {
  return (e && e.message) ? e.message : String(e);
}

// システム管理者へ障害を通知する。通知自体の失敗で定期処理を落とさないよう内側でも捕捉する。
function notifySystemError_(name, errors, elapsedMs) {
  try {
    if (!SYSTEM_ALERT_EMAIL) return;
    const shown = errors.slice(0, 20)
      .map((er, i) => `${i + 1}. [${er.where}] ${er.message}`).join('\n');
    const rest = errors.length > 20 ? `\n…ほか ${errors.length - 20} 件` : '';
    const firstStack = errors[0] && errors[0].stack
      ? `\n--- 先頭のスタックトレース ---\n${errors[0].stack}\n` : '';
    MailApp.sendEmail(
      SYSTEM_ALERT_EMAIL,
      `[WEDLINK][システムエラー] ${name}：${errors.length}件`,
      `定期処理「${name}」でエラーが発生しました。\n` +
      `他の案件の処理は続行しています（1件の異常で全体を止めない設計です）。\n\n` +
      `発生日時: ${Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')}\n` +
      `処理時間: ${elapsedMs} ms\n` +
      `エラー件数: ${errors.length}\n\n` +
      `--- 内容 ---\n${shown}${rest}\n${firstStack}`
    );
  } catch (e) {
    console.error(`[${name}] システムエラー通知の送信に失敗: ${errorMessage_(e)}`);
  }
}

// =====================================================
// ⑮ アラート・アーカイブ（全支店横断・支店マスタのメールへ自動振り分け）
// =====================================================
function checkAlerts() { return runTrigger_('checkAlerts', checkAlertsCore_); }

function checkAlertsCore_(errors) {
  const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const targetDateStr = Utilities.formatDate(new Date(Date.now() + ALERT_DAYS_BEFORE * 86400000), 'Asia/Tokyo', 'yyyy/MM/dd');

  const statusCols = [COL_STATUS_JP, COL_STATUS_BRANCH];
  for (let n = 1; n <= OPTION_COUNT; n++) statusCols.push(opStsJpCol_(n), opStsBranchCol_(n));

  let sent = 0;
  data.forEach((row, i) => {
    // 1件の異常で以降の案件が処理されなくならないよう、行単位で捕捉する
    try {
      const dVal = row[headers.indexOf(COL_CONFIRMED_DATE)];
      if (!(dVal instanceof Date)) return;
      if (Utilities.formatDate(dVal, 'Asia/Tokyo', 'yyyy/MM/dd') !== targetDateStr) return;
      const incomplete = statusCols.filter(c => {
        const v = row[headers.indexOf(c)];
        return v && v !== ALERT_COMPLETED_STATUS;
      });
      if (incomplete.length === 0) return;
      const area = row[headers.indexOf(COL_AREA)];
      const recipient = getJpTeamEmail_(area);
      MailApp.sendEmail(
        recipient,
        `[要確認] 撮影${ALERT_DAYS_BEFORE}日前：${row[headers.indexOf(COL_KANRI_NO)]}（${row[headers.indexOf(COL_BRANCH_CODE)]}支店）`,
        '未完了ステータスがあります。ポータルをご確認ください。'
      );
      sent++;
    } catch (e) {
      errors.push({
        where: `${RESERVATION_SHEET_NAME} ${i + 2}行目（${row[headers.indexOf(COL_KANRI_NO)] || '管理番号不明'}）`,
        message: errorMessage_(e), stack: e && e.stack ? String(e.stack) : ''
      });
    }
  });
  console.log(`[checkAlerts] ${data.length}件を確認、${sent}件を通知`);
}

// ★要件：撮影日から一定日数（国・支店ごとに支店マスタ「納品期限日数」で設定、未設定なら既定30日）過ぎても
// DriveフォルダURL（納品）が未登録の案件を日本側へメール通知する。
//
// ★不具合修正（重大）：以前はこの関数が「予約一覧」しか見ていなかったため、アラートが1通も飛ばなかった。
// archivePastReservations() は撮影日を過ぎた案件を「翌日」には過去一覧へ移動させる仕様のため、
// 「撮影日から30日後」を判定しようとした時点で、その案件はとっくに予約一覧から消えている。
// 納品状況は撮影後（＝アーカイブ後）に確定するものなので、必ず過去一覧も走査する必要がある。
// 納品遅延の判定を1箇所にまとめる。納品期限アラート（メール）と
// 「納品待ち」画面の両方で同じ基準を使うため。
// 返り値 null = 判定対象外（納品済み／キャンセル／撮影日未定／撮影日が未来）
function deliveryOverdueInfo_(o, branchMeta, todayMidnight) {
  if (String(o.driveUrl || '').trim()) return null;                       // 既に納品済み
  const stsJp = String(o.stsJp || '').trim();
  const stsBranch = String(o.stsBranch || '').trim();
  if (stsJp === 'CW' || stsBranch === 'CW') return null;                  // キャンセルは納品自体が無い
  const dVal = o.confirmedDate;
  if (!(dVal instanceof Date)) return null;
  const shootMidnight = new Date(dVal.getFullYear(), dVal.getMonth(), dVal.getDate());
  const daysPast = Math.round((todayMidnight.getTime() - shootMidnight.getTime()) / 86400000);
  if (daysPast <= 0) return null;                                          // 未来日・当日
  const meta = branchMeta[o.branchCode] || {};
  // ★不具合修正：`meta.deliveryDays || DEFAULT` だと0（即日設定）が消えるため、未設定のときだけ既定値を使う
  const limitDays = (meta.deliveryDays === null || meta.deliveryDays === undefined)
    ? DELIVERY_ALERT_DEFAULT_DAYS : meta.deliveryDays;
  // 納品期限日数に0（＝撮影当日納品）を設定した場合でも、初回通知は最短で撮影翌日になるよう下限を1日に揃える
  const firstAlertDay = Math.max(limitDays, 1);
  return { daysPast, limitDays, firstAlertDay, overdue: daysPast >= firstAlertDay };
}

function checkDeliveryAlerts() { return runTrigger_('checkDeliveryAlerts', checkDeliveryAlertsCore_); }

function checkDeliveryAlertsCore_(errors) {
  const ss = getSpreadsheet_();
  const branchMeta = branchMetaMap_();
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let sent = 0;

  [RESERVATION_SHEET_NAME, ARCHIVE_SHEET_NAME].forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();

    data.forEach((row, i) => {
     try {
      const info = deliveryOverdueInfo_({
        driveUrl: row[headers.indexOf(COL_DRIVE_URL)],
        stsJp: row[headers.indexOf(COL_STATUS_JP)],
        stsBranch: row[headers.indexOf(COL_STATUS_BRANCH)],
        confirmedDate: row[headers.indexOf(COL_CONFIRMED_DATE)],
        branchCode: row[headers.indexOf(COL_BRANCH_CODE)]
      }, branchMeta, todayMidnight);
      if (!info || !info.overdue) return;
      const daysPast = info.daysPast;
      const limitDays = info.limitDays;
      const dVal = row[headers.indexOf(COL_CONFIRMED_DATE)];

      // 期限日に1通。その後も未納品が続く場合は7日おきに再通知する
      // （期限当日にトリガーが実行できなかった場合でもアラートが消えないようにするため）。
      // ただし無期限に送り続けると、過去の未納品案件から延々とメールが飛ぶので上限を設ける。
      const over = daysPast - info.firstAlertDay;
      if (over > DELIVERY_ALERT_REMIND_UNTIL_DAYS) return;
      if (over % DELIVERY_ALERT_REMIND_INTERVAL_DAYS !== 0) return;

      const shootStr = Utilities.formatDate(dVal, 'Asia/Tokyo', 'yyyy/MM/dd');
      const area = row[headers.indexOf(COL_AREA)];
      const recipient = getJpTeamEmail_(area);
      const kanri = row[headers.indexOf(COL_KANRI_NO)];
      const branchCode = row[headers.indexOf(COL_BRANCH_CODE)];
      MailApp.sendEmail(
        recipient,
        `[要確認] 納品未登録：${kanri}（${branchCode}支店・撮影日から${daysPast}日経過）`,
        `撮影日から${daysPast}日が経過していますが、DriveフォルダURL（納品）が未登録です。ポータルをご確認ください。\n\n` +
        `管理番号: ${kanri}\n撮影日: ${shootStr}\nこの支店の納品期限: 撮影日から${limitDays}日`
      );
      sent++;
     } catch (e) {
      errors.push({
        where: `${sheetName} ${i + 2}行目（${row[headers.indexOf(COL_KANRI_NO)] || '管理番号不明'}）`,
        message: errorMessage_(e), stack: e && e.stack ? String(e.stack) : ''
      });
     }
    });
  });
  console.log(`[checkDeliveryAlerts] ${sent}件を通知`);
}

// ★機能追加：未返信リマインド（放置案件の自動督促）
// 「要対応」は画面のハイライトだけで、ポータルを開かない限り誰も気づかなかった。
// メール通知も送信の瞬間の1通だけで、読まれず放置された場合の再通知が無かった。
// 相手からのメッセージが一定日数まだ未読の案件を毎朝集計し、
// 支店ごと・手配課ごとに「1通のダイジェスト」で督促する（案件ごとに送ると受信箱が埋まるため）。
function checkUnansweredAlerts() { return runTrigger_('checkUnansweredAlerts', checkUnansweredAlertsCore_); }

function checkUnansweredAlertsCore_(errors) {
  const ss = getSpreadsheet_();
  const branchMeta = branchMetaMap_();
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // 1) 履歴を1回だけ読み、案件ごと・受け手側ごとに「最も古い未読の日時」を求める
  //    （日次トリガーのため全件走査は許容範囲。画面表示では未読フラグ列を使っている）
  const oldestUnread = {};   // `${kanriNo}\t${受け手ロール}` -> Date
  const hSheet = ss.getSheetByName(HISTORY_SHEET_NAME);
  if (hSheet && hSheet.getLastRow() >= 2) {
    const hHeaders = hSheet.getRange(1, 1, 1, hSheet.getLastColumn()).getValues()[0];
    const hValues = hSheet.getRange(2, 1, hSheet.getLastRow() - 1, hHeaders.length).getValues();
    const kanriIdx = hHeaders.indexOf(H_COL_KANRI);
    const roleIdx = hHeaders.indexOf(H_COL_SENDER_ROLE);
    const whenIdx = hHeaders.indexOf(H_COL_DATETIME);
    const jpCheckIdx = hHeaders.indexOf(H_COL_CHECK_JP);
    const brCheckIdx = hHeaders.indexOf(H_COL_CHECK_BRANCH);
    if (kanriIdx !== -1 && roleIdx !== -1 && whenIdx !== -1 && jpCheckIdx !== -1 && brCheckIdx !== -1) {
      hValues.forEach(v => {
        const kanri = String(v[kanriIdx]);
        if (!kanri) return;
        const senderRole = String(v[roleIdx]).trim().toUpperCase();
        const when = v[whenIdx] instanceof Date ? v[whenIdx] : null;
        if (!when) return;
        // 支店が送った未読 → 受け手は日本側 ／ 日本側が送った未読 → 受け手は支店
        let receiver = null;
        if (senderRole === BRANCH_ROLE && !isActiveFlag_(v[jpCheckIdx])) receiver = JP_ROLE;
        else if (senderRole === JP_ROLE && !isActiveFlag_(v[brCheckIdx])) receiver = BRANCH_ROLE;
        if (!receiver) return;
        const key = `${kanri}\t${receiver}`;
        if (!oldestUnread[key] || when < oldestUnread[key]) oldestUnread[key] = when;
      });
    }
  }

  // 2) 進行中の案件だけを対象に、未読フラグが立っていて放置日数を超えたものを集める
  const digests = {};   // 宛先メール -> { label, items: [] }
  const addItem = (email, label, item) => {
    if (!email) return;
    if (!digests[email]) digests[email] = { label, items: [] };
    digests[email].items.push(item);
  };

  const sheet = ss.getSheetByName(RESERVATION_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();

  data.forEach((row, i) => {
    try {
      const stsJp = String(row[headers.indexOf(COL_STATUS_JP)] || '').trim();
      const stsBranch = String(row[headers.indexOf(COL_STATUS_BRANCH)] || '').trim();
      if (stsJp === 'CW' || stsBranch === 'CW') return;   // キャンセル済みは督促しない

      const kanri = String(row[headers.indexOf(COL_KANRI_NO)] || '');
      if (!kanri) return;
      const branchCode = String(row[headers.indexOf(COL_BRANCH_CODE)] || '').toUpperCase();
      const area = row[headers.indexOf(COL_AREA)];
      const meta = branchMeta[branchCode] || {};

      [JP_ROLE, BRANCH_ROLE].forEach(receiver => {
        const flagIdx = headers.indexOf(unreadColFor_(receiver));
        if (flagIdx === -1 || !isActiveFlag_(row[flagIdx])) return;

        const when = oldestUnread[`${kanri}\t${receiver}`];
        if (!when) return;   // フラグはあるが履歴が見つからない（整合が取れるまで待つ）
        const whenMidnight = new Date(when.getFullYear(), when.getMonth(), when.getDate());
        const waitingDays = Math.round((todayMidnight.getTime() - whenMidnight.getTime()) / 86400000);

        // 督促日数：受け手が支店ならその支店の設定、日本側なら担当チームの設定を使う
        const settingRow = receiver === BRANCH_ROLE ? meta : (jpTeamMeta_(area) || {});
        const remindDays = (settingRow.remindDays === null || settingRow.remindDays === undefined)
          ? UNANSWERED_REMIND_DEFAULT_DAYS : settingRow.remindDays;
        if (waitingDays < Math.max(remindDays, 1)) return;

        const item = {
          kanriNo: kanri,
          names: `${fullName_(row[headers.indexOf(COL_GROOM_LAST_NAME)], row[headers.indexOf(COL_GROOM_NAME)])} / ${fullName_(row[headers.indexOf(COL_BRIDE_LAST_NAME)], row[headers.indexOf(COL_BRIDE_NAME)])}`,
          branchName: meta.name || branchCode,
          waitingDays,
          shootDate: formatMaybeDate_(row[headers.indexOf(COL_CONFIRMED_DATE)]) || '撮影日未定'
        };
        if (receiver === BRANCH_ROLE) {
          addItem(getBranchEmail_(branchCode), meta.name || branchCode, item);
        } else {
          addItem(getJpTeamEmail_(area), `${area || ''}手配課`, item);
        }
      });
    } catch (e) {
      errors.push({
        where: `${RESERVATION_SHEET_NAME} ${i + 2}行目（${row[headers.indexOf(COL_KANRI_NO)] || '管理番号不明'}）`,
        message: errorMessage_(e), stack: e && e.stack ? String(e.stack) : ''
      });
    }
  });

  // 3) 宛先ごとに1通ずつ送る
  let sent = 0;
  Object.keys(digests).forEach(email => {
    try {
      const d = digests[email];
      d.items.sort((a, b) => b.waitingDays - a.waitingDays);
      const lines = d.items.map(it =>
        `・${it.kanriNo}（${it.branchName}）${it.names}　撮影日: ${it.shootDate}　※${it.waitingDays}日 未確認`
      ).join('\n');
      MailApp.sendEmail(
        email,
        `[WEDLINK] 未返信のお知らせ：${d.items.length}件`,
        `${d.label} ご担当者さま\n\n` +
        `相手側から届いたメッセージ・変更のうち、まだ確認（既読チェック）されていない案件が ${d.items.length} 件あります。\n` +
        `ポータルで内容をご確認のうえ、ご対応をお願いします。\n\n` +
        `--- 対象案件 ---\n${lines}\n\n` +
        `※このメールは未確認の案件がある間、毎日お送りします。ポータルで既読にすると対象から外れます。`
      );
      sent++;
    } catch (e) {
      errors.push({ where: `督促メール送信（${email}）`, message: errorMessage_(e), stack: e && e.stack ? String(e.stack) : '' });
    }
  });
  console.log(`[checkUnansweredAlerts] ${sent}通のダイジェストを送信`);
}

// 管轄（関東/関西）に対応する日本側チームの支店マスタ行を返す
function jpTeamMeta_(teamLabel) {
  const rows = listBranchesRaw_();
  return rows.find(r => r.role === JP_ROLE && r.team === teamLabel)
      || rows.find(r => r.role === JP_ROLE && r.team === '関東')
      || null;
}

function archivePastReservations() { return runTrigger_('archivePastReservations', archivePastReservationsCore_); }

function archivePastReservationsCore_(errors) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(RESERVATION_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  // 過去一覧が無い／ヘッダーが未作成の場合もここで必ず整える（列ずれ防止のため）
  const archive = ensureSheetWithHeaders_(ss, ARCHIVE_SHEET_NAME, RESERVATION_HEADERS);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');

  // ★不具合修正：以前は予約一覧の行をそのまま archive.appendRow(row) していたため、
  // 予約一覧と過去一覧で列の並び・数が少しでも違うと、値が別の列に入って静かにデータが壊れていた。
  // 過去一覧側のヘッダーを読み、「列名で」対応付けてから書き込む。
  const archiveHeaders = archive.getRange(1, 1, 1, archive.getLastColumn()).getValues()[0]
    .map(h => String(h).trim());

  const asDateStr = (v) => v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd') : '';

  let moved = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    // ★性能：1行ずつ deleteRow するため件数に比例して遅くなる。実行時間制限に達しないよう
    // 1回あたりの上限で打ち切り、残りは翌日の実行に回す（取りこぼしにはならない）。
    if (moved >= ARCHIVE_MAX_ROWS_PER_RUN) {
      console.log(`[archivePastReservations] 上限${ARCHIVE_MAX_ROWS_PER_RUN}件に達したため中断。残りは次回実行で処理します。`);
      break;
    }
    const row = values[i];
    // 1件の異常で以降の行が処理されなくならないよう、行単位で捕捉する
    try {
      const shootStr = asDateStr(row[headers.indexOf(COL_CONFIRMED_DATE)]);
      const ceremonyStr = asDateStr(row[headers.indexOf(COL_CEREMONY_DATE)]);
      const stsJp = String(row[headers.indexOf(COL_STATUS_JP)]).trim();
      const stsBranch = String(row[headers.indexOf(COL_STATUS_BRANCH)]).trim();
      const isCW = (stsJp === 'CW' || stsBranch === 'CW');
      // ★要件：ステータスに関わらず、撮影日または挙式日が過ぎたら過去一覧へ移動する
      const isPastDate = (shootStr && shootStr < todayStr) || (ceremonyStr && ceremonyStr < todayStr);
      if (!(isCW || isPastDate)) continue;

      const mapped = archiveHeaders.map(h => {
        const idx = headers.indexOf(h);
        return idx === -1 ? '' : row[idx];
      });
      archive.appendRow(mapped);
      sheet.deleteRow(i + 2);
      moved++;
    } catch (e) {
      errors.push({
        where: `${RESERVATION_SHEET_NAME} ${i + 2}行目（${row[headers.indexOf(COL_KANRI_NO)] || '管理番号不明'}）`,
        message: errorMessage_(e), stack: e && e.stack ? String(e.stack) : ''
      });
    }
  }
  console.log(`[archivePastReservations] ${moved}件を過去一覧へ移動`);
}

function sortReservationSheet_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(COL_CONFIRMED_DATE) + 1;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).sort({ column: idx, ascending: true });
}

// =====================================================
// ⑮ ユーティリティ
// =====================================================
function getRowsAsObjects_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function formatMaybeDate_(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy/MM/dd');
  return val;
}

// <input type="date"> はISO形式(yyyy-MM-dd)でしか値を受け付けないため、Dateフィールド専用に変換する
function formatDateForInput_(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  const m = String(val || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return val || '';
}

// <input type="date"> から届くISO形式(yyyy-MM-dd)の文字列を、シートに保存する実Dateへ変換する。
// 空欄（日付クリア）はそのまま空文字として保存する。
// ★不具合修正：以前は解析に失敗した値を「そのまま文字列で」保存していた。
// 撮影日FIX・挙式日FIXは checkAlerts／archivePastReservations／当日表／統計のすべてが
// `instanceof Date` を前提にしているため、文字列で入ってしまうと
// 「画面には日付が入っているように見えるのに、アラートも過去一覧への移動も当日表も
// 一切効かない案件」が静かに生まれてしまう（気づきようがない）。
// 受け付けられない形式は保存せずエラーにして、その場で気づけるようにする。
function parseDateFromInput_(val) {
  const trimmed = String(val === null || val === undefined ? '' : val).trim();
  if (!trimmed) return ''; // 空欄＝日付のクリアは許可する
  // <input type="date"> は必ず yyyy-MM-dd。手入力・貼り付けを考慮し yyyy/MM/dd も受ける。
  const m = trimmed.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      try {
        const parsed = Utilities.parseDate(iso, 'Asia/Tokyo', 'yyyy-MM-dd');
        // 2026-02-31 のような存在しない日付は繰り上がってしまうため、往復させて確認する
        if (parsed instanceof Date &&
            Utilities.formatDate(parsed, 'Asia/Tokyo', 'yyyy-MM-dd') === iso) {
          return parsed;
        }
      } catch (e) { /* 下のエラーで通知する */ }
    }
  }
  throw new Error(`日付「${trimmed}」を認識できませんでした。カレンダーから選ぶか、2026-09-05 の形式で入力してください。`);
}

// =====================================================
// ⑯ トリガー設定
// =====================================================
// ★不具合修正：以前は無条件に全トリガーを削除していたため、setupConsentFormTriggerで
// 設定した『同意書』フォームの自動反映トリガーも、setupTriggersを再実行すると消えてしまっていた。
// このスクリプトが管理する日次トリガーだけを削除・再作成し、他のトリガーには触れないようにする。
const MANAGED_DAILY_TRIGGERS = ['archivePastReservations', 'checkAlerts', 'checkDeliveryAlerts', 'checkUnansweredAlerts'];
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (MANAGED_DAILY_TRIGGERS.includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('archivePastReservations').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('checkAlerts').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('checkDeliveryAlerts').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('checkUnansweredAlerts').timeBased().everyDays(1).atHour(9).create();
  SpreadsheetApp.getUi().alert('日次トリガー（アーカイブ・撮影前アラート・納品期限アラート・未返信リマインド）を再設定しました。\n（同意書フォームのトリガーを設定済みの場合はそのまま残ります）');
}

// =====================================================
// ⑰ 同意書フォーム連携（機能④）
// =====================================================
// お客様がGoogleフォームで記入する『同意書』の回答結果を、案件の「同意書」欄へ自動反映する。
// ★要件：ローマ支店など一部支店では必須。他支店は任意だが、日本側も可能なら把握したい。
//
// 事前準備（スプレッドシート管理者が1回だけ行う）：
//   1. Googleフォームを作成し、質問の1つに管理番号を入力してもらう項目を用意する
//      （質問文はCONSENT_FORM_KANRI_QUESTIONの値と完全に一致させること。既定は「管理番号」）
//   2. フォームの「回答」タブ → スプレッドシートのアイコン →
//      「既存のスプレッドシートを選択」で、このポータルのスプレッドシートを選ぶ
//      （回答用の新しいシートが自動追加されるが、シート名は何でもよい。ここでは読まない）
//   3. スプレッドシートのメニュー「拡張機能 → Apps Script」からこのプロジェクトを開き、
//      関数一覧から setupConsentFormTrigger を選んで実行する（以後、フォーム送信時に自動反映される）
//   4. 支店ごとに必須にしたい場合は、支店マスタの「同意書必須」列にTRUEを入れる（例：ローマ支店）
//
// フォーム側で管理番号の入力ミスがあった場合は自動反映できないため、その場合は画面の
// 「予約内容」タブから同意書欄を手動でチェックしてください（通常の3択保存の対象に含まれます）。
const CONSENT_FORM_KANRI_QUESTION = '管理番号';
// 同意書が取得済みであることを表す値（画面のチェックボックスもこの値で保存する）
const CONSENT_DONE_VALUE = '済';
// ★機能追加：このスプレッドシートに『アンケート』フォーム（機能：アンケート回答の反映）など
// 他のGoogleフォームも連携する場合のみ設定する。回答が届いたシート名がここと一致する時だけ
// 同意書として処理する（他フォームの回答で誤って「同意書＝済」にしてしまう事故を防ぐ）。
// 1つのフォームしか連携しない場合は空欄のままでよい（従来どおり全ての回答を対象にする）。
const CONSENT_FORM_RESPONSE_SHEET_NAME = '';

function setupConsentFormTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onConsentFormSubmit_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onConsentFormSubmit_')
    .forSpreadsheet(getSpreadsheet_())
    .onFormSubmit()
    .create();
  SpreadsheetApp.getUi().alert('同意書フォームの自動反映トリガーを設定しました。以後、フォーム回答時に「同意書」欄が自動で更新されます。');
}

function onConsentFormSubmit_(e) {
  const errors = [];
  try {
    onConsentFormSubmitCore_(e, errors);
  } catch (err) {
    errors.push({ where: '処理全体', message: errorMessage_(err), stack: err && err.stack ? String(err.stack) : '' });
  }
  if (errors.length > 0) {
    console.error(`[onConsentFormSubmit] ${errors.length}件のエラー`);
    errors.forEach(er => console.error(`[onConsentFormSubmit] ${er.where}: ${er.message}`));
    notifySystemError_('onConsentFormSubmit', errors, 0);
  }
}

function onConsentFormSubmitCore_(e, errors) {
  // 他のGoogleフォーム（アンケート等）とこのスプレッドシートを共有している場合、回答が届いた
  // シート名で「自分（同意書）宛の回答か」を判定する（CONSENT_FORM_RESPONSE_SHEET_NAME未設定なら判定しない＝従来どおり）
  if (CONSENT_FORM_RESPONSE_SHEET_NAME && e && e.range && typeof e.range.getSheet === 'function' &&
      e.range.getSheet().getName() !== CONSENT_FORM_RESPONSE_SHEET_NAME) {
    return;
  }
  const named = e && e.namedValues;
  if (!named || !named[CONSENT_FORM_KANRI_QUESTION]) {
    errors.push({ where: 'onConsentFormSubmit', message: `フォームの回答に「${CONSENT_FORM_KANRI_QUESTION}」という質問が見つかりません。質問文を確認してください。` });
    return;
  }
  const kanri = String(named[CONSENT_FORM_KANRI_QUESTION][0] || '').trim();
  if (!kanri) {
    errors.push({ where: 'onConsentFormSubmit', message: '管理番号が空欄で送信されました。' });
    return;
  }
  // ★重要：ロックを取ってから行を探して書く。
  // 撮影日FIXが変更されると sortReservationSheet_ で行の並びが変わるため、
  // ロックなしで「行を探す → その行番号へ書く」を行うと、その隙に別の案件が
  // その行番号に来て、まったく無関係な案件へ「同意書=済」を書き込む危険がある。
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    errors.push({ where: 'onConsentFormSubmit', message: `他の処理と競合したため、管理番号「${kanri}」の同意書を反映できませんでした。画面から手動でチェックしてください。` });
    return;
  }
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanri);
    if (rowIndex === -1) {
      errors.push({ where: 'onConsentFormSubmit', message: `管理番号「${kanri}」の案件が見つかりません（入力ミスの可能性があります）。` });
      return;
    }
    // 同じお客様がフォームを2回送信しても、履歴が二重に増えないようにする
    const before = String(rowData[headers.indexOf(COL_CONSENT)] || '').trim();
    if (before === CONSENT_DONE_VALUE) return;

    sheet.getRange(rowIndex, colIndexOrThrow_(headers, COL_CONSENT)).setValue(CONSENT_DONE_VALUE);
    const lastUpdatedIdx = headers.indexOf(COL_LAST_UPDATED);
    if (lastUpdatedIdx !== -1) sheet.getRange(rowIndex, lastUpdatedIdx + 1).setValue(new Date());

    // ★日本側・支店側の双方が「いつ同意書が取れたか」を追えるように、案件タイムラインへ残す。
    // メール通知や未読（要対応）にはしない：同意書の回収は定常業務で、件数も多いため、
    // 通知にすると本当に対応が必要な案件が埋もれてしまう。
    const logSheet = getSpreadsheet_().getSheetByName(STATUS_LOG_SHEET_NAME);
    if (logSheet) {
      logSheet.appendRow([kanri, COL_CONSENT, before || '(未回収)', CONSENT_DONE_VALUE, 'お客様（Googleフォーム）', new Date()]);
    }
  } finally {
    lock.releaseLock();
  }
}

// =====================================================
// ⑱ アンケートフォーム連携（機能：アンケート回答の反映）
// =====================================================
// 挙式・撮影当日の髪型やメイクの希望、参考写真などをお客様がGoogleフォームで回答する運用向け。
// 回答内容を、質問と回答のペアのまま案件の「メモ履歴」（種別＝アンケート回答）へ自動で積み上げる。
// 質問文をこちらで決め打ちにしていないため、フォームの質問を後から増減・変更しても
// コード側の修正なしにそのまま反映される。
//
// 事前準備（スプレッドシート管理者が1回だけ行う）：
//   1. Googleフォームを作成し、質問の1つに管理番号を入力してもらう項目を用意する
//      （質問文はSURVEY_FORM_KANRI_QUESTIONの値と完全に一致させること。既定は「管理番号」）
//   2. フォームの「回答」タブ → スプレッドシートのアイコン →
//      「既存のスプレッドシートを選択」で、このポータルのスプレッドシートを選ぶ
//   3. スプレッドシートのメニュー「拡張機能 → Apps Script」からこのプロジェクトを開き、
//      関数一覧から setupSurveyFormTrigger を選んで実行する（以後、フォーム送信時に自動反映される）
//   4. 【重要】このスプレッドシートに『同意書』フォームなど他のGoogleフォームも連携している場合、
//      片方の回答でもう片方のハンドラが誤発火しないよう、下記2つの定数にそれぞれの回答用シート名
//      （フォーム連携時に自動追加されるシートの名前）を設定してください：
//        ・CONSENT_FORM_RESPONSE_SHEET_NAME（このファイルの少し上）… 同意書フォームの回答シート名
//        ・SURVEY_FORM_RESPONSE_SHEET_NAME（すぐ下）… このアンケートフォームの回答シート名
//      1つのフォームしか連携しない場合はどちらも空欄のままで構いません。
//
// フォーム側で管理番号の入力ミスがあった場合は自動反映できません（システムエラー通知が飛びます）。
const SURVEY_FORM_KANRI_QUESTION = '管理番号';
// 上記4.参照。他フォームと共有しない場合は空欄のままでよい
const SURVEY_FORM_RESPONSE_SHEET_NAME = '';

function setupSurveyFormTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onSurveyFormSubmit_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSurveyFormSubmit_')
    .forSpreadsheet(getSpreadsheet_())
    .onFormSubmit()
    .create();
  SpreadsheetApp.getUi().alert('アンケートフォームの自動反映トリガーを設定しました。以後、フォーム回答時に案件の「メモ履歴」（アンケート回答）へ自動で追記されます。');
}

function onSurveyFormSubmit_(e) {
  const errors = [];
  try {
    onSurveyFormSubmitCore_(e, errors);
  } catch (err) {
    errors.push({ where: '処理全体', message: errorMessage_(err), stack: err && err.stack ? String(err.stack) : '' });
  }
  if (errors.length > 0) {
    console.error(`[onSurveyFormSubmit] ${errors.length}件のエラー`);
    errors.forEach(er => console.error(`[onSurveyFormSubmit] ${er.where}: ${er.message}`));
    notifySystemError_('onSurveyFormSubmit', errors, 0);
  }
}

function onSurveyFormSubmitCore_(e, errors) {
  // 他のGoogleフォーム（同意書等）とこのスプレッドシートを共有している場合、回答が届いたシート名で
  // 「自分（アンケート）宛の回答か」を判定する（SURVEY_FORM_RESPONSE_SHEET_NAME未設定なら判定しない）
  if (SURVEY_FORM_RESPONSE_SHEET_NAME && e && e.range && typeof e.range.getSheet === 'function' &&
      e.range.getSheet().getName() !== SURVEY_FORM_RESPONSE_SHEET_NAME) {
    return;
  }
  const named = e && e.namedValues;
  if (!named || !named[SURVEY_FORM_KANRI_QUESTION]) {
    errors.push({ where: 'onSurveyFormSubmit', message: `フォームの回答に「${SURVEY_FORM_KANRI_QUESTION}」という質問が見つかりません。質問文を確認してください。` });
    return;
  }
  const kanri = String(named[SURVEY_FORM_KANRI_QUESTION][0] || '').trim();
  if (!kanri) {
    errors.push({ where: 'onSurveyFormSubmit', message: '管理番号が空欄で送信されました。' });
    return;
  }
  const { rowIndex } = findReservationRow_(kanri);
  if (rowIndex === -1) {
    errors.push({ where: 'onSurveyFormSubmit', message: `管理番号「${kanri}」の案件が見つかりません（入力ミスの可能性があります）。` });
    return;
  }

  // 管理番号の質問以外を「質問: 回答」の形でそのまま記録する（フォームの質問構成が変わっても追従できる）
  const lines = Object.keys(named)
    .filter(q => q !== SURVEY_FORM_KANRI_QUESTION)
    .map(q => `${q}: ${(named[q] || []).join(', ')}`);
  if (lines.length === 0) {
    errors.push({ where: 'onSurveyFormSubmit', message: `管理番号「${kanri}」：管理番号以外の回答が無いフォーム送信でした。` });
    return;
  }

  const sheet = getSpreadsheet_().getSheetByName(MEMO_LOG_SHEET_NAME);
  sheet.appendRow([kanri, MEMO_TYPE_SURVEY, lines.join('\n'), MEMO_AUTHOR_CUSTOMER, new Date()]);
}

// =====================================================
// ⑲ 同意書・アンケートフォームの事前入力済みURL（機能：拡張要望10章）
// =====================================================
// ★背景：これまでお客様はフォームの「管理番号」欄を自分で手入力する必要があり、
// お客様が管理番号を把握していないため機能していなかった。
// Googleフォームの「事前入力済みのリンク」機能を使い、管理番号を埋め込んだURLを店舗が
// お客様に送るだけで済むようにする（フォームを作り直す必要は無い）。
//
// 事前準備（スプレッドシート管理者が1回だけ行う。同意書・アンケートフォームそれぞれで実施）：
//   1. 対象のGoogleフォームを開く → 右上の「⋮」（その他の設定） → 「事前入力したリンクを取得」
//   2. 「管理番号」欄に何かダミー値（例：TEST123）を入力して「リンクを取得」
//   3. 表示されたURLの中に `entry.123456789=TEST123` のようなパラメータが含まれるので、
//      `entry.123456789` の部分（数字はフォームごとに異なる）を下記の ENTRY_ID 定数にコピーする
//   4. URLのうち `entry.` より前の部分（`https://docs.google.com/forms/d/e/.../viewform` まで）を
//      下記の FORM_URL 定数にコピーする
//   5. 未設定（空欄）のままだと apiGetPrefilledFormUrls は空文字を返す＝画面側はURLを案内しない
//      （設定前でも他の機能には一切影響しない）。
//
// ★フォームのURL自体はご提供いただいたものを設定済み（イタリアの支店だけ別のフォームを使う）。
// ⚠️ ENTRY_ID（「管理番号」の質問が何番目のentryかを表す値）は、このサンドボックス環境からは
// forms.gle・docs.google.com への外部アクセスが組織のネットワークポリシーで遮断されており
// 自動取得できなかったため、空欄のままにしている。上記の手順1〜3で実際の値を調べて
// 埋めてください（埋めるまでは apiGetPrefilledFormUrls は空文字を返し、画面側はURLを案内しない
// だけで、他の機能には一切影響しない）。
const CONSENT_FORM_URL = 'https://forms.gle/D45veRz2svQVSnc16'; // 同意書フォーム（通常）
const CONSENT_FORM_KANRI_ENTRY_ID = ''; // 例: 'entry.123456789'（要設定）
// ★要件：イタリアの支店（ローマ支店等）だけ別の同意書フォームを使う
const ITALY_CONSENT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfWEeaiQmvt3ffV1giA3Cc2b5rPmcSxazZP2fZdveDQhGPT0A/viewform';
const ITALY_CONSENT_FORM_KANRI_ENTRY_ID = ''; // 例: 'entry.123456789'（要設定。通常フォームとは別の値になる）
const SURVEY_FORM_URL = '';
const SURVEY_FORM_KANRI_ENTRY_ID = '';

function buildPrefilledFormUrl_(baseUrl, entryId, kanriNo) {
  const base = String(baseUrl || '').trim();
  if (!base) return '';
  // ★要件：entry ID（管理番号を事前入力するためのフォーム側の質問ID）が未設定でも、
  // フォームのURL自体は既に分かっているので、その素のURL（管理番号は自動入力されない）を
  // 案内できるようにする。以前はentry ID未設定の間は空文字を返し、画面に何も表示されなかった。
  const entry = String(entryId || '').trim();
  if (!entry) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${entry}=${encodeURIComponent(kanriNo)}`;
}

// 案件の管理番号を埋め込んだ同意書・アンケートフォームのURLを返す（未設定の場合は空文字）。
// ★要件：イタリアの支店の案件だけ、同意書はイタリア専用フォームのURLを使う。
function apiGetPrefilledFormUrls(token, kanriNo) {
  const session = requireSession_(token);
  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  if (session.role === SHOP_ROLE) assertShopOwnRow_(session, headers, rowData);
  else assertRowVisible_(session, headers, rowData);

  const branchCode = String(rowData[headers.indexOf(COL_BRANCH_CODE)] || '').toUpperCase();
  const meta = branchMetaMap_()[branchCode] || {};
  const isItaly = meta.country === ITALY_COUNTRY_NAME;
  const consentUrl = isItaly ? ITALY_CONSENT_FORM_URL : CONSENT_FORM_URL;
  const consentEntryId = isItaly ? ITALY_CONSENT_FORM_KANRI_ENTRY_ID : CONSENT_FORM_KANRI_ENTRY_ID;

  return {
    ok: true,
    consentFormUrl: buildPrefilledFormUrl_(consentUrl, consentEntryId, kanriNo),
    surveyFormUrl: buildPrefilledFormUrl_(SURVEY_FORM_URL, SURVEY_FORM_KANRI_ENTRY_ID, kanriNo)
  };
}
