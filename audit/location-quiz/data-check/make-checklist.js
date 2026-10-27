// 商品担当者が撮影地データの正しさを確認するためのチェック表（CSV）を作る。
// 使い方: node make-checklist.js ../fixed.txt
// 出力: checklist-features.csv（撮影地×景色・演出）、checklist-areas.csv（撮影地ごとの基本情報・予算・日数）
'use strict';
const fs = require('fs');
const path = require('path');
const { load } = require('../test/harness');

const file = process.argv[2] || path.join(__dirname, '..', 'fixed.txt');
const A = load(file);
const { DEST, QS, BUDGET_KEYS, DAYS_KEYS } = A;
const src = fs.readFileSync(file, 'utf8');
const list = name => { const m = new RegExp('var ' + name + ' = (\\{[\\s\\S]*?\\n\\});').exec(src.replace(/\r/g, '')); return m ? eval('(' + m[1] + ')') : {}; }; // 一本化後は一覧なし
const SL = list('SCENE_LIST'), ML = list('MOMENT_LIST');
const hasLists = Object.keys(SL).length + Object.keys(ML).length > 0;

const ITEMS = QS[2].opts.map(o => [o.v, '景色', o.text]).concat(QS[3].opts.filter(o => o.v !== 'none').map(o => [o.v, '演出', o.text]));
// 推薦文・タグ・主な撮影都市に、その項目を思わせる語があるか（機械的な目安。判断は人が行う）
const WORDS = {
  beach: ['ビーチ', '海'], nature: ['大自然', '自然', '草原', '森', '山', 'サバンナ', 'フィヨルド'], landscape: ['奇岩', '砂漠', '絶景地形', '塩湖', '鏡張り', '地形'],
  street: ['街並み', '路地', '旧市街', '路面電車'], castle: ['城', '宮殿'], architecture: ['建築', '美術館', '大聖堂', '修道院'],
  ruins: ['遺跡', 'ピラミッド', '寺院'], chapel: ['チャペル', '教会', '大聖堂'], garden: ['花畑', '庭園', 'チューリップ', 'ラベンダー'],
  villa: ['ヴィラ', 'ホテル'], sunset: ['サンセット', '夕日'], starry: ['星空'], nightview: ['夜景'], balloon: ['気球'],
  animal: ['動物', 'ゾウ', 'コアラ', '馬', 'ラクダ'], morning: ['早朝', '朝日'],
};
const BL = { 1: '60万円未満', 2: '60~100万円', 3: '100~140万円', 4: '140~180万円', 5: '180~250万円', 6: '250万円以上' };
const DL = { short: '2~3日', medium: '4~5日', long: '6~7日', verylong: '8~10日', ultra: '11日以上' };

const csv = rows => '﻿' + rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n') + '\r\n';

const feat = [['撮影地キー', '撮影地名', '区分', '項目', '診断での現在の判定', '登録元', '推薦文・タグ・撮影都市の該当語', '要確認の理由',
  '正しい判定（○か×を記入）', '根拠（商品ページURLなど）', '確認者', '確認日', 'メモ']];
for (const k of Object.keys(DEST)) {
  const d = DEST[k];
  const text = [d.reason].concat(d.tags, d.subCities || []).join(' ');
  for (const [v, kind, label] of ITEMS) {
    const inD = !!d[v], inL = ((SL[v] || ML[v]) || []).includes(k);
    const on = inD || inL;
    const hits = (WORDS[v] || []).filter(w => text.includes(w));
    let why = '';
    if (on && !hits.length) why = '対応にしているが、推薦文・タグに記述がない';
    else if (!on && hits.length) why = '推薦文・タグに記述があるが、非対応';
    else if (on && inD !== inL && hasLists) why = '2か所の登録が食い違う（片方だけ対応）';
    feat.push([k, d.name, kind, label, on ? '○' : '×', on ? (!hasLists ? '撮影地データ' : inD && inL ? '両方' : inD ? '撮影地データのみ' : '対応一覧のみ') : '', hits.join('・'), why, '', '', '', '', '']);
  }
}

const areas = [['撮影地キー', '撮影地名', '英語名', '国内/海外', '推薦文', 'タグ', '主な撮影都市', 'リンク', '画像',
  '登録されている予算区分（この区分以上の予算で候補になる）', '候補になる旅行日数',
  '推薦文は正しいか（○×）', 'リンク・画像は正しいか（○×）', '最低予算は正しいか（○×）', '日数は正しいか（○×）', '確認者', 'メモ']];
for (const k of Object.keys(DEST)) {
  const d = DEST[k];
  const bands = Object.keys(BUDGET_KEYS).filter(b => BUDGET_KEYS[b].includes(k));
  const days = Object.keys(DAYS_KEYS).filter(x => DAYS_KEYS[x] === 'all' || DAYS_KEYS[x].includes(k));
  areas.push([k, d.name, d.en, d.domestic ? '国内' : '海外', d.reason, d.tags.join('・'), (d.subCities || []).join('・'), d.link, d.img,
    bands.map(b => BL[b]).join('・') + '（最低: ' + BL[bands[0]] + '）', days.map(x => DL[x]).join('・'), '', '', '', '', '', '']);
}

fs.writeFileSync(path.join(__dirname, 'checklist-features.csv'), csv(feat));
fs.writeFileSync(path.join(__dirname, 'checklist-areas.csv'), csv(areas));
const need = feat.slice(1).filter(r => r[7]).length;
console.log('checklist-features.csv', feat.length - 1, '行（うち要確認', need, '行）');
console.log('checklist-areas.csv', areas.length - 1, '行');
