// 地域×日数ごとに、画面に表示される「景色」「演出」の選択肢のうち、対応する撮影地が0件または1件のものを列挙
const {load}=require('./harness');const A=load(process.argv[2]||'../fixed.txt');const {QS,DEST}=A;
const vm=require('vm');
const hidden={domestic:{scene:['landscape','castle','architecture','villa'],moment:['balloon','animal']},overseas:{scene:[],moment:[]}};
const has=(k,x)=>A.calcMatching(k,{scene:[x],moment:[x]}).matched.length>0;
for(const region of ['domestic','overseas'])for(const d of QS[1].opts){
  const el=A.getEligible({region,days:d.v,budget:6});
  const dead=[];
  const {visibleValues}=require('./driver');for(const q of [QS[2],QS[3]]){const vis=visibleValues(A,region,d.v,q.id);for(const o of q.opts){if(o.v==='none'||!vis.includes(o.v))continue;
    const ks=el.filter(k=>has(k,o.v));if(!ks.length)dead.push(o.text);else if(ks.length===1)dead.push(o.text+'（'+DEST[ks[0]].name+'のみ）');}}
  console.log((region==='domestic'?'国内':'海外')+' '+d.main+' 候補'+el.length+'件: '+dead.join('、'));}
