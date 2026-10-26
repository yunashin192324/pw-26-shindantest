const {run}=require('./driver');
const f=process.argv[2]||'../original.txt';
const cases=[
 {region:'domestic',days:'short',scene:['beach'],moment:['none'],style:'resort',who:'couple',budget:1},
 {region:'domestic',days:'short',scene:['nature'],moment:['none'],style:'resort',who:'couple',budget:1},
 {region:'domestic',days:'short',scene:['nature'],moment:['none'],style:'resort',who:'couple',budget:4},
 {region:'overseas',days:'short',scene:['street'],moment:['none'],style:'shopping',who:'couple',budget:1},
 {region:'overseas',days:'long',scene:['castle'],moment:['sunset'],style:'sightseeing',who:'couple',budget:3},
];
for(const c of cases){const r=run(f,c);console.log(JSON.stringify(c),'\n  =>',r.result.name,r.result.rate,r.result.altNames.join(','),'| budgets:',r.log.budgetState&&r.log.budgetState.filter(b=>b.disabled).map(b=>b.v).join(''),r.log.autoBudget?'AUTO':'');}
