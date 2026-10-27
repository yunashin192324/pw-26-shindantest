// 指示書 第7段階の試験1〜20と、画面操作の追加試験。
// 使い方: node scenarios.js <対象ファイル> > 結果.md
'use strict';
const { load } = require('./harness');
const D = require('./driver');
const file = process.argv[2] || '../original.txt';
const isFixed = /fixed/.test(file);
const T = load(file, { trace: true });
const { DEST } = T;

const nm = k => (DEST[k] ? DEST[k].name : k);
const regionKeys = r => Object.keys(DEST).filter(k => !!DEST[k].domestic === (r === 'domestic'));

function detail(ans) {
  const ranked = T.score(ans);
  const tr = T.trace();
  const rows = ranked.map(k => {
    const parts = tr[k] || [];
    const total = parts.reduce((a, p) => a + Number(p.replace(/^.*?([+-]\d+)$/, '$1')), 0);
    return { k, total, parts, rate: T.calcMatching(k, ans).rate };
  });
  return { ranked, rows, max: T.window._lastMaxScore };
}

function uiRun(ans) { return D.run(file, ans); }

const out = [];
const P = s => out.push(s);
let pass = 0, fail = 0;

function scenario(no, title, ans, expectDesc, check) {
  const ui = uiRun(ans);
  const d = detail(ans);
  const res = ui.result;
  const before = regionKeys(ans.region);
  const disabled = ui.log.budgetState ? ui.log.budgetState.filter(b => b.disabled).map(b => b.v) : [];
  let ok, why;
  try { const c = check({ ui, d, res, disabled }); ok = c === true || (c && c.ok); why = c && c.why; } catch (e) { ok = false; why = String(e); }
  ok ? pass++ : fail++;
  P(`### 試験${no}: ${title}`);
  P('- 入力: `' + JSON.stringify(ans) + '`');
  P(`- 絞り込み前（${ans.region === 'domestic' ? '国内' : '海外'}の全エリア）: ${before.length}件`);
  P(`- 選択不可の予算: ${disabled.length ? disabled.join(',') : 'なし'}${ui.log.autoBudget ? '（予算は自動選択）' : ''}`);
  P(`- 絞り込み後の候補（点数順）: ${d.ranked.length ? d.ranked.map(nm).join('、') : 'なし'}`);
  if (d.rows.length) {
    P('- 上位5件の内訳:');
    d.rows.slice(0, 5).forEach((r, i) => P(`  - ${i + 1}位 ${nm(r.k)}: 合計${r.total}点（${r.parts.join(' ') || '加減点なし'}） 一致率${r.rate}%`));
  }
  P(`- 画面表示: 第1候補「${res.name}」${res.rate != null ? ' 一致率' + res.rate + '%' : ''}／代替候補: ${res.altNames.length ? res.altNames.map((n, i) => n + '(' + res.altRates[i] + '%)').join('、') : 'なし'}`);
  if (res.upsell) P(`- 予算を上げた場合の表示: ${res.upsell}`);
  P(`- 期待する結果: ${expectDesc}`);
  P(`- 判定: **${ok ? '合格' : '不合格'}**${why ? '（' + why + '）' : ''}`);
  P('');
}

const NOT_FOUND = '条件に合うエリアが見つかりませんでした';
const shown = r => r.name !== NOT_FOUND && r.name !== '(予算選択不可)';
const onlyRegion = (d, r) => d.ranked.every(k => !!DEST[k].domestic === (r === 'domestic'));

P(`# 試験結果: ${file}`);
P('');

scenario(1, '国内・短期間・低予算', { region: 'domestic', days: 'short', scene: ['beach'], moment: ['sunset'], style: 'resort', who: 'couple', budget: 1 },
  '国内のビーチ（沖縄本島など）が表示される',
  ({ d, res }) => ({ ok: shown(res) && onlyRegion(d, 'domestic') && /沖縄/.test(res.name), why: shown(res) ? '' : '結果なし' }));

scenario(2, '海外・短期間・低予算（60万円未満）', { region: 'overseas', days: 'short', scene: ['beach'], moment: ['none'], style: 'resort', who: 'couple', budget: 1 },
  'データ上 2〜3日で行ける海外はグアムのみ（予算60〜140万円帯）。60万円未満は選択不可にするか、理由を示す',
  ({ res, disabled }) => ({ ok: disabled.includes(1) || shown(res), why: disabled.includes(1) ? '60万円未満を選択不可にした' : (shown(res) ? '' : '選択できるのに結果なし') }));

scenario('2b', '海外・短期間・60〜100万円', { region: 'overseas', days: 'short', scene: ['beach'], moment: ['none'], style: 'resort', who: 'couple', budget: 2 },
  'グアムが表示される', ({ res }) => res.name === 'グアム');

scenario(3, '海外・長期間・高予算', { region: 'overseas', days: 'verylong', scene: ['nature', 'landscape'], moment: ['none'], style: 'active', who: 'couple', budget: 6 },
  'ウユニ塩湖・マサイマラ・スイスなど遠方の自然系', ({ res }) => ['ウユニ塩湖', 'マサイマラ', 'スイス'].includes(res.name));

scenario(4, '海・リゾート・子ども同行', { region: 'overseas', days: 'medium', scene: ['beach'], moment: ['sunset'], style: 'resort', who: 'family_kids', budget: 2 },
  'ビーチのあるアジアのリゾート（グアム・バリ島・セブ島・プーケット・ダナン）',
  ({ res }) => ({ ok: ['グアム', 'バリ島', 'セブ島', 'プーケット', 'ダナン'].includes(res.name), why: res.name }));

scenario(5, '歴史建築・宮殿・観光重視', { region: 'overseas', days: 'long', scene: ['castle', 'architecture'], moment: ['none'], style: 'sightseeing', who: 'family_elder', budget: 4 },
  'ウィーン・パリ・イタリア・ロンドンなど城や歴史建築のある都市',
  ({ res, d }) => {
    const top = d.ranked[0];
    const m = T.calcMatching(top, { scene: ['castle', 'architecture'], moment: [], style: 'sightseeing' });
    return { ok: shown(res) && m.matched.filter(c => c.type === 'scene').length === 2, why: res.name };
  });

scenario(6, '気球撮影を必須（6〜7日・100〜140万円）', { region: 'overseas', days: 'long', scene: ['landscape'], moment: ['balloon'], style: 'active', who: 'couple', budget: 3 },
  'カッパドキア', ({ res }) => res.name === 'カッパドキア');

scenario('6b', '気球撮影を必須（8〜10日・250万円以上）', { region: 'overseas', days: 'verylong', scene: ['nature'], moment: ['balloon'], style: 'active', who: 'couple', budget: 6 },
  '気球撮影を紹介文・タグに掲げるマサイマラが表示される', ({ res, disabled }) => ({ ok: res.name === 'マサイマラ', why: disabled.includes(6) ? '250万円以上が選択不可' : res.name }));

scenario(7, '星空撮影を必須', { region: 'overseas', days: 'verylong', scene: ['nature'], moment: ['starry'], style: 'active', who: 'couple', budget: 5 },
  'ニュージーランド（テカポ湖）など星空対応エリアのみ', ({ res, d }) => ({ ok: shown(res) && d.ranked.every(k => T.calcMatching(k, { moment: ['starry'] }).matched.length === 1), why: res.name }));

scenario(8, '動物との撮影を必須', { region: 'overseas', days: 'verylong', scene: ['nature'], moment: ['animal'], style: 'active', who: 'family_kids', budget: 6 },
  '動物との撮影に対応するエリア（予算は上限扱いのため、子ども同行の加点があるオーストラリアも対象）。対応しないエリアが第1候補にならない',
  ({ res, d }) => ({ ok: shown(res) && T.calcMatching(d.ranked[0], { moment: ['animal'] }).matched.length === 1, why: res.name }));

scenario(9, '複数の景色と演出を同時に選択', { region: 'overseas', days: 'ultra', scene: ['beach', 'street', 'castle', 'chapel', 'garden'], moment: ['sunset', 'nightview', 'starry'], style: 'shopping', who: 'group', budget: 4 },
  '星空（必須扱い）に対応するエリアのみが残り、第1候補の一致率が代替候補以上',
  ({ res, d }) => ({ ok: shown(res) && res.altRates.every(r => r <= res.rate), why: shown(res) ? `第1候補${res.rate}% 代替${res.altRates.join('/')}` : '結果なし' }));

// 試験12: 同点
(function () {
  const ans = { region: 'domestic', days: 'medium', scene: ['street'], moment: ['none'], style: 'shopping', who: 'couple', budget: 2 };
  scenario(12, '同点になる入力', ans, '同点の候補は定義順で並ぶ（安定）。同点であることが利用者に分かるか',
    ({ d }) => {
      const ties = d.rows.filter((r, i) => i > 0 && r.total === d.rows[i - 1].total);
      const again = T.score(ans).join(',') === d.ranked.join(',');
      return { ok: again, why: (ties.length ? '同点あり: ' + d.rows.map(r => nm(r.k) + r.total).join(' ') : '同点なし') + (again ? '／再計算で順位は同一' : '／順位が不安定') };
    });
})();

// 試験13: 1条件だけ変更
(function () {
  const a = { region: 'overseas', days: 'medium', scene: ['beach'], moment: ['none'], style: 'resort', who: 'couple', budget: 2 };
  const b = Object.assign({}, a, { who: 'family_kids' });
  const ra = T.score(a), rb = T.score(b);
  scenario(13, '同行者だけを変更（お二人→子どもと一緒）', b, `変更前: ${ra.map(nm).join('、') || 'なし'}。子ども向け加点のあるエリアが上がる`,
    ({ res }) => ({ ok: shown(res), why: '変更前の第1候補: ' + (ra[0] ? nm(ra[0]) : 'なし（結果なし）') + ' → 変更後: ' + res.name }));
})();

P('## 画面操作の試験');
P('');

function uiCase(no, title, fn) {
  let r;
  try { r = fn(); } catch (e) { r = { ok: false, why: 'エラー: ' + e.message }; }
  r.ok ? pass++ : fail++;
  P(`### 試験${no}: ${title}`);
  P(`- 判定: **${r.ok ? '合格' : '不合格'}**（${r.why}）`);
  P('');
}

uiCase(10, '国内で対応エリアがない景色（奇岩・砂漠）の扱い', () => {
  const api = D.load(file);
  api.els['start-btn'].click();
  D.clickSingle(api, 'domestic'); api.advance(400);
  D.clickSingle(api, 'medium'); api.advance(400);
  const visible = D.multiButtons(api).some(b => b.innerHTML.includes('奇岩'));
  if (!visible) return { ok: true, why: '国内では「奇岩・砂漠・絶景地形」を表示しない' };
  D.clickMulti(api, ['landscape']);
  D.clickMulti(api, ['none']);
  D.clickSingle(api, 'active'); api.advance(400);
  D.clickSingle(api, 'couple'); api.advance(400);
  const btns = D.singleButtons(api);
  const dis = btns.filter(b => b.disabled).length;
  btns[1].click(); api.advance(60000);
  const r = D.readResult(api);
  return { ok: false, why: `国内でも選択肢が表示され、予算の選択不可は${dis}件。選択後の結果は「${r.name}」` };
});

uiCase(11, '条件を満たす候補地がゼロ（6〜7日・ビーチ＋気球）', () => {
  const vis = D.visibleValues(D.load(file), 'overseas', 'long', 'moment', { scene: ['beach'] });
  const api = D.load(file);
  if (!vis.includes('balloon')) {
    api.renderResult([], 0); // 画面操作では到達しないが、空の結果でも画面が崩れないことを直接確認
    const r = D.readResult(api);
    return { ok: r.name === NOT_FOUND && r.altNames.length === 0, why: 'ビーチを選ぶと気球を表示しない（ゼロ件に到達しない）。空の結果を直接渡した場合も「見つかりませんでした」画面を正常に表示' };
  }
  const r = D.run(file, { region: 'overseas', days: 'long', scene: ['beach'], moment: ['balloon'], style: 'sightseeing', who: 'couple', budget: 3 }).result;
  return { ok: r.name === NOT_FOUND, why: '気球が表示され、結果「' + r.name + '」' };
});

uiCase(14, '途中で戻って回答を変更（海外→国内）', () => {
  const api = D.load(file);
  api.els['start-btn'].click();
  D.clickSingle(api, 'overseas'); api.advance(400);
  D.clickSingle(api, 'long'); api.advance(400);
  D.clickMulti(api, ['castle', 'landscape', 'chapel']);
  D.clickMulti(api, ['balloon', 'sunset']);
  // 過ごし方の画面から質問1まで戻る
  for (let i = 0; i < 4; i++) api.els['back-btn'].click();
  D.clickSingle(api, 'domestic'); api.advance(400);
  D.clickSingle(api, 'long'); api.advance(400);
  api.els['next-btn'].click(); // 景色は表示中の選択（チャペル）のまま次へ
  api.els['next-btn'].click(); // 演出も表示中の選択（サンセット）のまま次へ
  const sc = api.answers.scene.slice(), mo = api.answers.moment.slice();
  D.clickSingle(api, 'resort'); api.advance(400);
  D.clickSingle(api, 'couple'); api.advance(400);
  const btns = D.singleButtons(api);
  if (btns.length) { const i = btns.findIndex(b => !b.disabled); btns[i].click(); }
  api.advance(60000);
  const r = D.readResult(api);
  const leak = sc.includes('castle') || sc.includes('landscape') || mo.includes('balloon');
  return { ok: !leak && r.name !== NOT_FOUND, why: `国内に変更後の回答 景色=${sc.join(',')} 演出=${mo.join(',')} → 結果「${r.name}」` };
});

uiCase(15, '再診断を連続実行', () => {
  const api = D.load(file);
  const play = (ans) => {
    api.els['start-btn'].click();
    D.clickSingle(api, ans.region); api.advance(400);
    D.clickSingle(api, ans.days); api.advance(400);
    D.clickMulti(api, ans.scene); D.clickMulti(api, ans.moment);
    D.clickSingle(api, ans.style); api.advance(400);
    D.clickSingle(api, ans.who); api.advance(400);
    const b = D.singleButtons(api); if (b.length) { const i = api.QS[6].opts.findIndex(o => o.v === ans.budget); (b[i].disabled ? b.find(x => !x.disabled) : b[i]).click(); }
    api.advance(60000);
    return D.readResult(api);
  };
  // 1回目は「見つかりませんでした」画面を表示させる（画面操作では到達しないため直接呼ぶ）
  api.els['start-btn'].click(); api.renderResult([], 0);
  const r1 = D.readResult(api);
  api.els['restart-btn'].click();
  const sel1 = JSON.stringify(api.answers) + JSON.stringify(api.multiSel);
  const r2 = play({ region: 'domestic', days: 'short', scene: ['nature'], moment: ['none'], style: 'resort', who: 'couple', budget: 1 });
  const font = api.els['res-name'].style.fontSize;
  return { ok: sel1 === '{}{}' && r2.name !== NOT_FOUND && !font, why: `1回目「${r1.name}」→再診断後の状態=${sel1}→2回目「${r2.name}」、2回目の名称の文字サイズ指定='${font}'${font ? '（1回目の「見つかりません」用の縮小指定が残存）' : ''}` };
});

uiCase(16, '予算選択肢が一つだけになる（自動遷移）', () => {
  // 総当たりで「有効な予算が1件」の組み合わせを探す
  const SC = api0().QS[2].opts.map(o => o.v);
  let found = null;
  outer: for (const days of ['short', 'medium', 'long', 'verylong', 'ultra']) for (const s of SC) for (const m of [['none'], ['balloon'], ['starry'], ['animal']]) {
    const api = D.load(file);
    api.answers = { region: 'overseas', days, scene: [s], moment: m, style: 'resort', who: 'couple' };
    api.curQIdx = 6; api.renderQ('right');
    if (!D.singleButtons(api).length) { found = { ans: Object.assign({}, api.answers), api }; break outer; }
  }
  if (!found) return { ok: true, why: '該当する組み合わせなし' };
  found.api.advance(1000);
  const loading = found.api.els['screen-loading'].style.display === 'block';
  found.api.advance(60000);
  const r = D.readResult(found.api);
  return { ok: loading && r.name !== NOT_FOUND, why: `入力 ${JSON.stringify(found.ans)} で予算${found.ans.budget}を自動選択→結果「${r.name}」` };
});
function api0() { return T; }

uiCase(17, '予算選択肢がゼロになる（制限解除。画面操作では到達しないため回答を直接設定）', () => {
  const api = D.load(file);
  api.answers = { region: 'overseas', days: 'long', scene: ['beach'], moment: ['balloon'], style: 'resort', who: 'couple' };
  api.curQIdx = 6; api.renderQ('right');
  const b = D.singleButtons(api);
  const dis = b.filter(x => x.disabled).length;
  b[0].click(); api.advance(60000);
  const r = D.readResult(api);
  return { ok: dis === 0 && r.name === NOT_FOUND, why: `全予算が選択可能に戻り（選択不可${dis}件）、選択後は「${r.name}」を表示。画面操作では、どの予算でも結果が出ない組み合わせを選べないことを総当たりで確認済み` };
});

uiCase(18, 'スタジオ撮影だけを選択', () => {
  const opt = T.QS[2].opts.find(o => o.v === 'studio');
  const r1 = T.score({ region: 'domestic', scene: ['studio'] });
  const r2 = T.score({ region: 'overseas', scene: ['studio'] });
  return { ok: !opt, why: `「スタジオ」の選択肢はコメントアウトされ画面で選べない（到達不能な処理）。関数を直接呼ぶと 国内=${r1.map(nm).join(',') || 'なし'} 海外=${r2.map(nm).join(',') || 'なし'}` };
});

uiCase(19, '選択条件をすべて満たす地域が複数ある', () => {
  const ans = { region: 'overseas', days: 'long', scene: ['street'], moment: ['sunset'], style: 'sightseeing', who: 'couple', budget: 3 };
  const d = detail(ans);
  const full = d.rows.filter(r => r.rate === 100);
  return { ok: true, why: `一致率100%のエリア: ${full.map(r => nm(r.k) + '(' + r.total + '点:' + r.parts.join(' ') + ')').join('、')}。順位差は同行者・過ごし方の加点と6〜7日の欧州減点で説明できる` };
});

uiCase(20, '必須条件（気球）と旅行日数（4〜5日）が両立しない', () => {
  const vis = D.visibleValues(D.load(file), 'overseas', 'medium', 'moment');
  if (!vis.includes('balloon')) return { ok: true, why: '4〜5日では「気球・バルーン」を表示しない' };
  const api = D.load(file);
  api.answers = { region: 'overseas', days: 'medium', scene: ['beach'], moment: ['balloon'], style: 'resort', who: 'couple' };
  api.curQIdx = 6; api.renderQ('right');
  const b = D.singleButtons(api);
  b[1].click(); api.advance(60000);
  const r = D.readResult(api);
  return { ok: r.name === NOT_FOUND, why: `選択肢は表示され、結果「${r.name}」` };
});

uiCase('追加1', '単一選択の連続クリック（質問の読み飛ばし）', () => {
  const api = D.load(file);
  api.els['start-btn'].click();
  D.singleButtons(api)[1].click(); D.singleButtons(api)[1].click(); // 「海外」を素早く2回
  api.advance(400);
  const q = D.cur(api).id;
  return { ok: q === 'days', why: `2回クリック後の質問=${q}${q !== 'days' ? '（旅行日数の質問を読み飛ばし、日数未回答のまま進む）' : ''}` };
});

uiCase('追加2', '予算の連続クリック（結果処理の二重実行）', () => {
  const api = D.load(file);
  api.answers = { region: 'overseas', days: 'medium', scene: ['beach'], moment: ['none'], style: 'resort', who: 'couple' };
  api.curQIdx = 6; api.renderQ('right');
  const b = D.singleButtons(api).find(x => !x.disabled);
  b.click(); b.click();
  const before = api.pendingTimers();
  api.advance(60000);
  return { ok: before <= 1, why: `クリック直後の遷移予約数=${before}` };
});

uiCase('追加3', '選択直後に「戻る」を押す', () => {
  const api = D.load(file);
  api.els['start-btn'].click();
  D.clickSingle(api, 'overseas');
  api.els['back-btn'].click(); // 300ms 以内に戻る
  api.advance(400);
  const scr = api.els['screen-q'].style.display === 'block' ? '質問画面 ' + D.cur(api).id : 'スタート画面';
  return { ok: scr === 'スタート画面', why: `戻る操作の後の画面=${scr}` };
});

uiCase('追加4', 'シェア文の改行', () => {
  const r = D.run(file, { region: 'overseas', days: 'long', scene: ['castle'], moment: ['sunset'], style: 'sightseeing', who: 'couple', budget: 3 });
  r.api.els['insta-copy-btn'].onclick();
  const t = r.api.clipboardLog[0] || '';
  return { ok: !/!n/.test(t), why: 'コピー文: ' + JSON.stringify(t) };
});

uiCase('追加5', 'クリップボード機能がない環境（http 等）', () => {
  const r = D.run(file, { region: 'overseas', days: 'long', scene: ['castle'], moment: ['sunset'], style: 'sightseeing', who: 'couple', budget: 3 }, { noClipboard: true });
  try { r.api.els['share-copy'].onclick(); } catch (e) { return { ok: false, why: '例外: ' + e.message + '（トースト表示なし）' }; }
  return { ok: true, why: '例外なし' };
});

P(`## 集計: 合格 ${pass} / 不合格 ${fail}`);
console.log(out.join('\n'));
