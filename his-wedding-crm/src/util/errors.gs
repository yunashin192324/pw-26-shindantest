/**
 * errors.gs
 * 第9章3章：エラー処理の共通パターン。
 * AppErrorに type（VALIDATION / PERMISSION / SYSTEM）を持たせ、
 * Controller層でtypeに応じたメッセージへ変換してクライアントへ返す。
 */

class AppError extends Error {
  /**
   * @param {'VALIDATION'|'PERMISSION'|'SYSTEM'} type
   * @param {string} message
   * @param {Object=} detail 開発者向け詳細（SystemLogsに残す。クライアントには返さない）
   */
  constructor(type, message, detail) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.detail = detail || null;
  }
}

/**
 * 第6章7章：権限外の呼び出しは、理由の詳細を返さず一律「権限がありません」を返す。
 */
function permissionDeniedError_() {
  return new AppError('PERMISSION', '権限がありません。');
}

/**
 * Controller層の共通catchハンドラ。
 * PERMISSIONは詳細を返さない、SYSTEMはSystemLogsに詳細を記録した上で汎用メッセージのみ返す（第9章3章）。
 */
function handleControllerError_(e, context) {
  if (e instanceof AppError) {
    if (e.type === 'SYSTEM') {
      try {
        writeSystemLog_({
          日時: new Date(),
          実行者: safeGetCurrentUserEmail_(),
          操作種別: 'ERROR:' + (context || ''),
          対象CASE_ID: '',
          変更前後の値の要約: e.message + (e.detail ? ' detail=' + JSON.stringify(e.detail) : '')
        });
      } catch (logErr) {
        // ログ書き込み自体の失敗はここでは握りつぶす（元エラーを優先して返す）
      }
      return { ok: false, type: 'SYSTEM', message: '一時的にデータを処理できませんでした。時間をおいて再度お試しください。' };
    }
    if (e.type === 'PERMISSION') {
      return { ok: false, type: 'PERMISSION', message: '権限がありません。' };
    }
    // VALIDATION
    return { ok: false, type: 'VALIDATION', message: e.message };
  }
  // 想定外の例外もSYSTEM扱いにする
  try {
    writeSystemLog_({
      日時: new Date(),
      実行者: safeGetCurrentUserEmail_(),
      操作種別: 'ERROR:' + (context || ''),
      対象CASE_ID: '',
      変更前後の値の要約: String(e && e.message ? e.message : e)
    });
  } catch (logErr) {
    // ignore
  }
  return { ok: false, type: 'SYSTEM', message: '一時的にデータを処理できませんでした。時間をおいて再度お試しください。' };
}

function safeGetCurrentUserEmail_() {
  try {
    return Session.getActiveUser().getEmail();
  } catch (e) {
    return 'unknown';
  }
}
