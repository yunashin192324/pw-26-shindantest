// 第1巡目：権限管理・担当者マスタの「保存」を素早く2回押したときに、同じ行が2回登録されないか（通信を遅らせて再現）。
const path = require('path');
const { createBackend, buildPage, launch } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
(async () => {
  const be = createBackend(); const S = be.sandbox;
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 1, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限']]);
  const htmlPath = path.join(__dirname, 'r1_double.html'); buildPage(htmlPath);
  const { browser, page } = await launch(be, htmlPath);
  // サーバーの応答を遅らせる（実際のGASも1〜数秒かかる）
  for (const fn of ['addStaffAccess', 'addStaffName']) { const orig = S[fn]; S[fn] = function () { const end = Date.now() + 800; while (Date.now() < end) {} return orig.apply(null, arguments); }; }
  page.on('dialog', d => d.accept());
  await page.waitForFunction(() => STATE.ready === true);
  await page.click('button[data-tab="admin"]');
  await page.click('#btn-open-staff-modal');
  await page.fill('#staff-form-email', 'new@example.com');
  await page.selectOption('#staff-form-role', '社員');
  await page.evaluate(() => { const f = document.getElementById('staff-form'); f.requestSubmit(); f.requestSubmit(); });
  await page.waitForTimeout(2500);
  const n = be.sheets[S.STAFF_SHEET_NAME].data.filter(r => r && r[0] === 'new@example.com').length;
  assert(n === 1, 'アカウントの追加を2回続けて押しても1行だけ登録される（登録数=' + n + '）');
  await page.click('#btn-open-staff-name-modal').catch(() => {});
  await page.fill('#staff-name-form-code', 'Z9');
  await page.fill('#staff-name-form-name', '二重');
  await page.evaluate(() => { const f = document.getElementById('staff-name-form'); f.requestSubmit(); f.requestSubmit(); });
  await page.waitForTimeout(2500);
  const m = be.sheets[S.STAFF_NAME_SHEET_NAME].data.filter(r => r && r[0] === 'Z9').length;
  assert(m === 1, '担当者マスタの追加を2回続けて押しても1行だけ登録される（登録数=' + m + '）');
  await browser.close();
  console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
})().catch(e => { console.error(e); process.exit(1); });
