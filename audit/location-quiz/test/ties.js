// 第1位と第2位が同点になる割合（無作為抽出 20万件、結果が出た入力のみ）
const {load}=require('./harness');const A=load(process.argv[2],{trace:true});const {QS,DEST}=A;
let seed=1;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
const pick=a=>a[Math.floor(rnd()*a.length)];
const SC=QS[2].opts.map(o=>o.v),MO=QS[3].opts.map(o=>o.v).filter(v=>v!=='none');
let n=0,tie=0,tieNoScene=0,ex=[];
for(let i=0;i<200000;i++){const region=pick(['domestic','overseas']);const hs=region==='domestic'?['landscape','castle','architecture','villa']:[];const hm=region==='domestic'?['balloon','animal']:[];
 const scene=SC.filter(s=>!hs.includes(s)&&rnd()<0.25);if(!scene.length)scene.push(pick(SC.filter(s=>!hs.includes(s))));
 let moment=MO.filter(s=>!hm.includes(s)&&rnd()<0.2);if(!moment.length)moment=['none'];
 const a={region,days:pick(['short','medium','long','verylong','ultra']),scene,moment,style:pick(['resort','sightseeing','shopping','active']),who:pick(['couple','family_kids','family_elder','group']),budget:1+Math.floor(rnd()*6)};
 const r=A.score(a);if(r.length<2)continue;n++;const t=A.trace();const sc=k=>(t[k]||[]).reduce((x,p)=>x+ +p.replace(/^.*?([+-]\d+)$/,'$1'),0);
 if(sc(r[0])===sc(r[1])){tie++;ex.length<3&&ex.push([a,DEST[r[0]].name,DEST[r[1]].name,sc(r[0])]);}}
console.log('候補2件以上',n,'第1位同点',tie,(tie/n*100).toFixed(1)+'%');console.log(JSON.stringify(ex));
