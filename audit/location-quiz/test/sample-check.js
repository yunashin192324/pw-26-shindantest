// 無作為抽出による簡易点検（総当たりの前の確認用）
const {load}=require('./harness');const A=load(process.argv[2]||'../fixed.txt');const {QS}=A;
let seed=11;const r=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};const p=a=>a[Math.floor(r()*a.length)];
const SC=QS[2].opts.map(o=>o.v),MO=QS[3].opts.map(o=>o.v).filter(v=>v!=='none'),H=['starry','balloon','animal'];
const c={n:0,shown:0,altBeatsTop:0,noSceneNoHard:0,betterHardBelow:0,betterSceneBelow:0,zeroAlt:0};const ex={};
for(let i=0;i<60000;i++){const region=p(['domestic','overseas']);const hs=region==='domestic'?['landscape','castle','architecture','villa']:[];const hm=region==='domestic'?['balloon','animal']:[];
 const scene=SC.filter(s=>!hs.includes(s)&&r()<0.25);if(!scene.length)scene.push(p(SC.filter(s=>!hs.includes(s))));let moment=MO.filter(s=>!hm.includes(s)&&r()<0.2);if(!moment.length)moment=['none'];
 const a={region,days:p(['short','medium','long','verylong','ultra']),scene,moment,style:p(['resort','sightseeing','shopping','active']),who:p(['couple','family_kids','family_elder','group']),budget:1+Math.floor(r()*6)};
 c.n++;const R=A.score(a);if(!R.length)continue;c.shown++;
 const rate=k=>A.calcMatching(k,a).rate;const wh=moment.filter(m=>H.includes(m));
 const hn=k=>A.calcMatching(k,{moment:wh}).matched.length, sh=k=>A.calcMatching(k,{scene}).matched.length?1:0;
 const alts=R.slice(1).filter(k=>rate(k)>0).slice(0,4);
 if(alts.some(k=>rate(k)>rate(R[0]))){c.altBeatsTop++;(ex.alt=ex.alt||[]).push([a,R[0],alts]);}
 if(!wh.length&&!sh(R[0]))c.noSceneNoHard++;
 if(R.some(k=>hn(k)>hn(R[0])))c.betterHardBelow++;
 if(R.some(k=>hn(k)===hn(R[0])&&sh(k)>sh(R[0])))c.betterSceneBelow++;
 if(R.slice(1,5).some(k=>rate(k)===0))c.zeroAlt++;}
console.log(JSON.stringify(c));if(ex.alt)console.log(JSON.stringify(ex.alt.slice(0,3)));
