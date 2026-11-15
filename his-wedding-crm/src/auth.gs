/**
 * auth.gs
 * ログインユーザーの特定、ロール・スコープ判定を担当する（第6章）。
 *
 * 第6章2章：
 *  - ログインはGoogle Workspaceのアカウント認証をそのまま利用する（Session.getActiveUser().getEmail()）。
 *    IDやパスワードを独自に管理しない。
 *  - 取得したメールアドレスをStaffマスタと突合し、STORE_ID（所属店舗）とロールを特定する。
 *  - Staffマスタに存在しないメールアドレス、または「在籍」フラグがOFFの場合は、
 *    いかなる機能も実行させずアクセス拒否とする。
 */

const ROLES = {
  ADMIN: 'ADMIN',
  HQ: 'HQ',
  ARRANGE: 'ARRANGE',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF'
};

/** 第6章3章：共通スコープの定義 */
const SCOPES = {
  ALL: 'ALL',
  OWN_STORE: 'OWN_STORE',
  OWN_STORE_SUMMARY_ONLY: 'OWN_STORE_SUMMARY_ONLY',
  CONTRACTED_ONLY: 'CONTRACTED_ONLY',
  OWN_TASK: 'OWN_TASK',
  MASTER_OWN_STORE: 'MASTER_OWN_STORE'
};

/**
 * 現在のログインユーザーのコンテキスト（メール・STAFF_ID・所属店舗・ロール）を取得する。
 * Staffマスタに存在しない、または在籍フラグOFFの場合はAppError(PERMISSION)を投げる。
 */
function getCurrentUserContext() {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    throw permissionDeniedError_();
  }
  const staff = staffRepo_getByEmail(email);
  if (!staff) {
    throw permissionDeniedError_();
  }
  const zaiseki = staff.在籍;
  if (zaiseki === false || zaiseki === 'FALSE' || zaiseki === '' || zaiseki === undefined) {
    // 在籍列が未入力（レガシーデータ）の場合はサインアップ直後の想定として許可し、
    // 明示的にFALSEが入っている場合のみ拒否する。
    if (zaiseki === false || zaiseki === 'FALSE') {
      throw permissionDeniedError_();
    }
  }
  const role = String(staff.権限 || '').toUpperCase();
  if (Object.values(ROLES).indexOf(role) === -1) {
    throw permissionDeniedError_();
  }
  return {
    email: email,
    staffId: staff.STAFF_ID,
    name: staff.氏名,
    storeId: staff.店舗ID,
    role: role
  };
}

/** 指定ロールのいずれかでなければ権限エラーを投げる */
function requireRole_(ctx, allowedRoles) {
  if (allowedRoles.indexOf(ctx.role) === -1) {
    throw permissionDeniedError_();
  }
}

/**
 * 第5章1章：メニュー項目の表示可否をロールごとに定義する（画面出し分け用）。
 * サーバー側のこの定義がクライアントの信頼できる唯一の情報源であり、
 * クライアントは受け取った結果をそのまま表示に使う（第6章1章：見た目の制御はサーバー判定に従う）。
 */
// 手配課（ARRANGE）・本部（HQ）・管理者（ADMIN）は完全に同格の1グループとして扱う
// （Q&A三巡目：「手配課と本部と管理者は一つにまとめてOK」）。以降この3ロールは常に同じ判定にする。
const BACKOFFICE_ROLES_ = [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN];
function isBackofficeRole_(role) { return BACKOFFICE_ROLES_.indexOf(role) !== -1; }

function getMenuVisibility_(role) {
  const backoffice = isBackofficeRole_(role);
  const menus = {
    dashboard: true,
    // 日報（週次サマリー・担当者別・プランランキング・エリア進捗・通期推移）は全ロールに表示するが、
    // 全国店舗×方面集計だけはページ内でHQ・ARRANGE・ADMIN限定にする（Q&A八巡目）
    nippo: true,
    caseList: true,
    // タスク一覧は店舗側（STAFF・MANAGER）にのみ必要。手配課・本部・管理者（同格グループ）は
    // 案件詳細に埋め込まれたタスクで足りるため一覧メニューは表示せず、代わりに手配一覧を主要導線にする
    // （Q&A三巡目：「手配課の下のタブでタスクはいらなくて、代わりに手配一覧にして」）。
    tasks: (role === ROLES.STAFF || role === ROLES.MANAGER),
    operations: backoffice,
    masters: (role === ROLES.MANAGER || backoffice),
    targets: (role === ROLES.MANAGER || backoffice),
    settings: backoffice
  };
  return menus;
}
