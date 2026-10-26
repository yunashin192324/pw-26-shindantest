// どの予算を選んでも結果が出ない回答経路（予算以外の回答の組み合わせ）を、日数と必須演出の有無で分類
const {load}=require('./harness');const A=load(process.argv[2]||'../fixed.txt');const {QS,DEST}=A;
const SC=QS[2].opts.map(o=>o.v),MO=QS[3].opts.map(o=>o.v).filter(v=>v!=='none');
const sub=a=>{const r=[];for(let m=1;m<(1<<a.length);m++)r.push(a.filter((_,i)=>m&(1<<i)));return r;};
const H={domestic:{s:['landscape','castle','architecture','villa'],m:['balloon','animal']},overseas:{s:[],m:[]}};
const g={};let tot=0,none=0;
for(const region of ['domestic','overseas'])for(const days of QS[1].opts.map(o=>o.v))for(const scene of sub(SC.filter(s=>!H[region].s.includes(s))))for(const moment of [['none']].concat(sub(MO.filter(s=>!H[region].m.includes(s))))){
 tot++;let ok=false;for(let b=1;b<=6&&!ok;b++)if(A.score({region,days,scene,moment,style:'resort',who:'couple',budget:b}).length)ok=true;
 const hard=moment.filter(m=>['starry','balloon','animal'].includes(m)).join('+')||'必須演出なし';
 const k=region+' '+days+' '+hard;g[k]=g[k]||[0,0];g[k][1]++;if(!ok){none++;g[k][0]++;}}
console.log('回答経路',tot,'どの予算でも結果なし',none,(none/tot*100).toFixed(1)+'%');
for(const k of Object.keys(g).sort())if(g[k][0])console.log(k.padEnd(40),g[k][0]+'/'+g[k][1]);
