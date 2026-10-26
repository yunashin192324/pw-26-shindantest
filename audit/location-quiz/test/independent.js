// 独立評価用の代表パターン：修正前後の第1候補と代替候補を並べる
const {load}=require('./harness');
const O=load('../original.txt',{trace:true}),F=load('../fixed.txt',{trace:true});
const P=[
 ['P1 国内・4〜5日・ビーチ＋チャペル・サンセット・リゾート・二人・60〜100万',{region:'domestic',days:'medium',scene:['beach','chapel'],moment:['sunset'],style:'resort',who:'couple',budget:2}],
 ['P2 海外・4〜5日・ビーチ・おまかせ・リゾート・子ども・60〜100万',{region:'overseas',days:'medium',scene:['beach'],moment:['none'],style:'resort',who:'family_kids',budget:2}],
 ['P3 海外・6〜7日・街並み＋歴史建築・夜景・ショッピング・二人・140〜180万',{region:'overseas',days:'long',scene:['street','architecture'],moment:['nightview'],style:'shopping',who:'couple',budget:4}],
 ['P4 海外・8〜10日・大自然・星空・アクティブ・二人・180〜250万',{region:'overseas',days:'verylong',scene:['nature'],moment:['starry'],style:'active',who:'couple',budget:5}],
 ['P5 海外・6〜7日・花畑庭園・おまかせ・観光・両親・100〜140万',{region:'overseas',days:'long',scene:['garden'],moment:['none'],style:'sightseeing',who:'family_elder',budget:3}],
 ['P6 海外・8〜10日・ビーチ＋ヴィラ・サンセット・リゾート・二人・180〜250万',{region:'overseas',days:'verylong',scene:['beach','villa'],moment:['sunset'],style:'resort',who:'couple',budget:5}],
 ['P7 海外・6〜7日・お城・朝日・観光・二人・140〜180万',{region:'overseas',days:'long',scene:['castle'],moment:['morning'],style:'sightseeing',who:'couple',budget:4}],
 ['P8 国内・2〜3日・花畑庭園・おまかせ・観光・子ども・60万未満',{region:'domestic',days:'short',scene:['garden'],moment:['none'],style:'resort',who:'family_kids',budget:1}],
 ['P9 海外・11日以上・奇岩砂漠・気球・アクティブ・二人・250万以上',{region:'overseas',days:'ultra',scene:['landscape'],moment:['balloon'],style:'active',who:'couple',budget:6}],
 ['P10 海外・8〜10日・遺跡・サンセット・観光・二人・140〜180万',{region:'overseas',days:'verylong',scene:['ruins'],moment:['sunset'],style:'sightseeing',who:'couple',budget:4}],
 ['P11 海外・6〜7日・ビーチ・サンセット・リゾート・二人・140〜180万',{region:'overseas',days:'long',scene:['beach'],moment:['sunset'],style:'resort',who:'couple',budget:4}],
];
const show=(A,ans)=>{const r=A.score(ans);if(!r.length)return '結果なし';const t=A.trace();return r.slice(0,5).map(k=>{const s=(t[k]||[]).reduce((a,p)=>a+ +p.replace(/^.*?([+-]\d+)$/,'$1'),0);return A.DEST[k].name+'('+s+'点/'+A.calcMatching(k,ans).rate+'%)';}).join(' > ')+(A.window._lastMaxScore<=0?' ※最高点'+A.window._lastMaxScore+'のため元コードでは「見つかりません」表示':'');};
for(const [t,a] of P){console.log('## '+t);console.log('修正前: '+show(O,a));console.log('修正後: '+show(F,a));}
