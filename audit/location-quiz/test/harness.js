// 診断スクリプトを Node 上で実行するための最小限の疑似 DOM。
// 本物の HTML は監査対象に含まれていないため、スクリプトが参照する要素だけを用意する。
'use strict';
const fs = require('fs');
const vm = require('vm');

function makeEl(id) {
  const el = {
    id, tagName: 'DIV', textContent: '', _html: '', disabled: false, className: '',
    style: {}, children: [], _handlers: {}, onclick: null,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
    },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); if (v === '') this.children = []; },
    appendChild(c) { this.children.push(c); c.parentNode = el; return c; },
    addEventListener(t, f) { (this._handlers[t] = this._handlers[t] || []).push(f); },
    click() {
      if (this.disabled) return;
      (this._handlers.click || []).forEach(f => f({ target: el }));
      if (this.onclick) this.onclick({ target: el });
    },
    querySelectorAll(sel) {
      const cls = sel.replace(/^\./, '');
      return this.children.filter(c => (' ' + c.className + ' ').includes(' ' + cls + ' ') || c.classList.contains(cls));
    },
    querySelector(sel) {
      if (sel === '.opt-multi-text') {
        const m = /<span class="opt-multi-text">([^<]*)<\/span>/.exec(this._html);
        return m ? { textContent: m[1] } : null;
      }
      return this.querySelectorAll(sel)[0] || null;
    },
    get offsetWidth() { return 0; },
  };
  return el;
}

// score() の加点・減点を記録するための書き換え（試験専用。挙動は変えない）
function traceSrc(src) {
  const rep = (a, b) => { if (!src.includes(a)) throw new Error('trace anchor missing: ' + a); src = src.split(a).join(b); };
  rep("function add(ks,p){ for(var i=0;i<ks.length;i++){ if(ks[i] in s) s[ks[i]]+=p; } }",
      "function add(ks,p){ for(var i=0;i<ks.length;i++){ if(ks[i] in s){ s[ks[i]]+=p; __T(ks[i],p); } } }");
  rep("function sub(ks,p){ for(var i=0;i<ks.length;i++){ if(ks[i] in s) s[ks[i]]-=p; } }",
      "function sub(ks,p){ for(var i=0;i<ks.length;i++){ if(ks[i] in s){ s[ks[i]]-=p; __T(ks[i],-p); } } }");
  rep("if(pos.indexOf(k)===-1 && k in s) s[k]-=Math.ceil(p/pd);", "if(pos.indexOf(k)===-1 && k in s){ s[k]-=Math.ceil(p/pd); __T(k,-Math.ceil(p/pd)); }");
  rep("if(mk.indexOf(k)===-1&&k in s) s[k]-=3;", "if(mk.indexOf(k)===-1&&k in s){ s[k]-=3; __T(k,-3); }");
  rep("    if(who==='couple')", "    __L='同行者';\n    if(who==='couple')");
  rep("        var stype=scene[i];", "        var stype=scene[i]; __L='景色:'+stype;");
  rep("            var mtype=moment[i];", "            var mtype=moment[i]; __L='演出:'+mtype;");
  rep("    if(style==='resort')", "    __L='過ごし方';\n    if(style==='resort')");
  if (src.includes("    var euroKeys=")) rep("    var euroKeys=", "    __L='6~7日欧州減点';\n    var euroKeys="); // 削除済みの版では省略
  rep("function score(ans) {", "var __L='',__TR={};function __T(k,d){(__TR[k]=__TR[k]||[]).push(__L+(d>0?'+':'')+d);}\nfunction score(ans) {__TR={};");
  src += "\n;this.__trace=function(){return __TR;};";
  return src;
}

function load(file, opts) {
  opts = opts || {};
  const els = {};
  const timers = [];
  let now = 0;
  const document = {
    getElementById(id) {
      if (opts.missing && opts.missing.includes(id)) return null;
      return els[id] || (els[id] = makeEl(id));
    },
    createElement(t) { const e = makeEl(null); e.tagName = t.toUpperCase(); return e; },
    querySelector(sel) { return els['__q' + sel] || (els['__q' + sel] = makeEl(sel)); },
    querySelectorAll(sel) {
      if (sel === '.screen') return ['screen-start', 'screen-q', 'screen-loading', 'screen-result'].map(i => document.getElementById(i));
      if (sel === '.bg-image') return [];
      if (sel === '.alt-card') return [];
      return [];
    },
  };
  const clipboardLog = [];
  const opened = [];
  const window = {
    location: { href: 'https://example.test/quiz/?a=1' },
    scrollTo() {},
    open(u) { opened.push(u); },
  };
  const ctx = {
    document, window, console,
    navigator: opts.noClipboard ? {} : { clipboard: { writeText(t) { clipboardLog.push(t); return Promise.resolve(); } } },
    setTimeout(f, ms) { timers.push({ f, at: now + (ms || 0) }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].f = null; },
    Object, Array, String, Math, JSON, Set,
  };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(/<\/?script>/g, '');
  if (opts.trace) src = traceSrc(src);
  // const / function 宣言を外から参照できるよう末尾で公開する
  src += '\n;this.__api={DEST:DEST,BUDGET_KEYS:BUDGET_KEYS,DAYS_KEYS:DAYS_KEYS,QS:QS,getEligible:getEligible,score:score,calcMatching:calcMatching,renderQ:renderQ,renderResult:renderResult,showLoading:showLoading,toast:toast,'
    + 'get answers(){return answers;},set answers(v){answers=v;},get multiSel(){return multiSel;},get qFlow(){return qFlow;},get curQIdx(){return curQIdx;},set curQIdx(v){curQIdx=v;}};';
  vm.runInContext(src, ctx, { filename: file });
  const api = ctx.__api;
  if (opts.trace) api.trace = ctx.__trace;
  api.els = els; api.window = ctx.window; api.clipboardLog = clipboardLog; api.opened = opened;
  // 疑似タイマーを時間順に進める
  api.advance = function (ms) {
    const until = now + ms;
    for (;;) {
      let idx = -1;
      for (let i = 0; i < timers.length; i++) if (timers[i].f && timers[i].at <= until && (idx < 0 || timers[i].at < timers[idx].at)) idx = i;
      if (idx < 0) break;
      const t = timers[idx]; now = t.at; const f = t.f; t.f = null; f();
    }
    now = until;
  };
  api.pendingTimers = () => timers.filter(t => t.f).length;
  return api;
}

module.exports = { load };
