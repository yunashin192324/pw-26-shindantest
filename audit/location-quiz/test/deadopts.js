// 地域×日数ごとに、どの予算でも対応する撮影地が1件もない「景色」「演出」の選択肢を列挙
const {load}=require('./harness');const A=load(process.argv[2]||'../fixed.txt');const {QS,DEST}=A;
const vm=require('vm');
const hidden={domestic:{scene:['landscape','castle','architecture','villa'],moment:['balloon','animal']},overseas:{scene:[],moment:[]}};
const has=(k,x)=>A.calcMatching(k,{scene:[x],moment:[x]}).matched.length>0;
for(const region of ['domestic','overseas'])for(const d of QS[1].opts){
  const el=A.getEligible({region,days:d.v,budget:6});
  const dead=[];
  for(const q of [QS[2],QS[3]])for(const o of q.opts){if(o.v==='none'||hidden[region][q.id].includes(o.v))continue;
    const ks=el.filter(k=>has(k,o.v));if(!ks.length)dead.push(o.text);else if(ks.length===1)dead.push(o.text+'（'+DEST[ks[0]].name+'のみ）');}
  console.log((region==='domestic'?'国内':'海外')+' '+d.main+' 候補'+el.length+'件: '+dead.join('、'));}
