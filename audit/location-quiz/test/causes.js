// 「結果なし」の原因分類（予算画面で選択可能な予算のみ。同行者・過ごし方は結果の有無に影響しないので固定）
const {load}=require('./harness');
const api=load(process.argv[2]||'../original.txt');const {QS,DEST}=api;
const SC=QS[2].opts.map(o=>o.v), MO=QS[3].opts.map(o=>o.v).filter(v=>v!=='none');
const sub=a=>{const r=[];for(let m=1;m<(1<<a.length);m++)r.push(a.filter((_,i)=>m&(1<<i)));return r;};
const H={domestic:{s:['castle','architecture','villa'],m:['balloon','animal']},overseas:{s:[],m:[]}};
const c={total:0,empty:0,elig0:0,hard0:0,scene0:0,beachOnlyLike:0,byRegionBudget:{}};const exs={};
for(const region of ['domestic','overseas'])for(const days of QS[1].opts.map(o=>o.v))for(const scene of sub(SC.filter(s=>!H[region].s.includes(s))))for(const moment of [['none']].concat(sub(MO.filter(s=>!H[region].m.includes(s))))){
  const base={region,days,scene,moment,style:'resort',who:'couple'};
  api.answers=Object.assign({},base);api.curQIdx=6;api.renderQ();const bt=api.els['opts-single'].children;
  let en=bt.length?QS[6].opts.filter((o,i)=>!bt[i].disabled).map(o=>o.v):[api.answers.budget];api.advance(1000);
  for(const budget of en){const a=Object.assign({},base,{budget});c.total++;
    const r=api.score(a); if(r.length)continue; c.empty++;
    const k=region+'/b'+budget; c.byRegionBudget[k]=(c.byRegionBudget[k]||0)+1;
    const el=api.getEligible(a); let cause;
    if(!el.length) cause='elig0';
    else{const hm=moment.filter(m=>['starry','balloon','animal'].includes(m));
      const mu=hm.length?el.filter(k=>hm.some(h=>DEST[k][h])):el;
      if(!mu.length) cause='hard0'; else cause='scene0';}
    c[cause]++; (exs[cause]=exs[cause]||[]).length<4&&exs[cause].push(a);
  }}
console.log(JSON.stringify(c,null,1));console.log(JSON.stringify(exs));
// 単独の景色を選んだときに結果が出るか（地域・日数・予算を問わず1件でも出るか）
for(const region of ['domestic','overseas'])for(const s of SC){if(H[region].s.includes(s))continue;let ok=0,n=0;
 for(const days of QS[1].opts.map(o=>o.v))for(let b=1;b<=6;b++){n++;if(api.score({region,days,scene:[s],moment:['none'],style:'resort',who:'couple',budget:b}).length)ok++;}
 console.log('single scene',region,s,'結果あり',ok,'/',n);}
