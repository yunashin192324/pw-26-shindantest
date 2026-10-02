import { welcome, questions } from "./data/questions.js";
import { products, categories, categoryOf, productName, TODO } from "./data/products.js";
import { resultCopy, links } from "./data/copy.js";
import { recommend, matchBreakdown, reasonLabels, userTopLabels, buildUserTags } from "./utils/scoring.js";
import { load, save, clear } from "./utils/storage.js";

// ---------- 状態 ----------
const FLOW = ["intro", "welcome", ...questions.map((q) => q.id), "analyzing", "favorites", "result"];
const saved = load();
const state = {
  screen: FLOW.includes(saved.screen) || saved.screen === "list" ? saved.screen : "intro",
  answers: saved.answers || {},
  who: saved.who || null,
  filter: "all",
};
if (state.screen === "analyzing") state.screen = "favorites";
if (state.screen === "result" && !allAnswered()) state.screen = "intro";
const persist = () => save({ screen: state.screen, answers: state.answers, who: state.who });

function allAnswered() {
  return questions.every((q) => state.answers[q.id]);
}

// ---------- DOM ヘルパー ----------
const $ = (s, r = document) => r.querySelector(s);
const stage = $("#stage");
const nav = $("#nav");
const navBack = $("#navBack");
const navNext = $("#navNext");
const modal = $("#modal");

const gradient = (t) => (Array.isArray(t) ? `linear-gradient(165deg, ${t[0]} 0%, ${t[1]} 55%, ${t[2]} 100%)` : t);
const CHECK = `<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5"/></svg>`;

function photo({ image, tone, cls = "", label = true }) {
  return `<div class="photo ${cls}"><div class="photo__tone" style="background:${gradient(tone)}"></div>${
    image ? `<img class="photo__img" src="${image}" alt="" loading="lazy">` : ""
  }${label ? `<span class="photo__todo">PHOTO</span>` : ""}</div>`;
}

// 画像ファイルがあればフェードインで重ねる。無ければグラデーション枠のまま
function hydratePhotos(root) {
  root.querySelectorAll(".photo__img").forEach((img) => {
    const ok = () => img.naturalWidth > 0 && img.classList.add("is-loaded");
    if (img.complete) ok();
    img.addEventListener("load", ok);
    img.addEventListener("error", () => img.remove());
  });
}

const val = (v) => (v && v !== TODO ? v : `<span class="todo">TODO</span>`);

// ---------- 画面 ----------
const screens = {
  intro() {
    return `<section class="screen intro">
      <div class="intro__photo">${photo({ image: "images/hero.jpg", tone: ["#bfe4ea", "#e9d9bd", "#d9a98a"], label: false })}<div class="intro__veil"></div></div>
      <div class="intro__body">
        <div class="intro__logo"><div class="logo">HIS WEDDING</div><div class="eyebrow eyebrow--gold">初夢フェア</div></div>
        <div class="intro__main">
          <h1 class="h1">ふたりの理想から、\nぴったりのウェディングを。</h1>
          <p class="lead">どこで結婚するかではなく、\nどんな一日にしたいか。\n\n写真を選びながら、\nふたりに合うウェディングを\n見つけてみませんか？</p>
          <p class="small">約2〜3分</p>
        </div>
        <div class="intro__cta">
          <button class="pill pill--solid pill--block" data-action="start">診断をはじめる</button>
          <button class="link-quiet" data-action="list">SALE商品を一覧で見る</button>
        </div>
      </div>
    </section>`;
  },

  welcome() {
    return `<section class="screen has-nav"><div class="wrap">
      ${header("WELCOME")}
      <div class="q-title"><h1 class="h1">ふたりにぴったりの\nウェディングを探しましょう。</h1><p class="lead" style="margin-top:12px">まずは教えてください。（選ばなくても進めます）</p></div>
      ${photo({ image: "images/welcome.jpg", tone: ["#f2d9c6", "#d9a98f", "#7a5d62"], cls: "welcome-photo" })}
      <div class="welcome-choices">${welcome.choices
        .map((c) => `<button class="pill-choice ${state.who === c.id ? "is-selected" : ""}" data-action="who" data-id="${c.id}">${c.title}</button>`)
        .join("")}</div>
    </div></section>`;
  },

  question(q) {
    const n = questions.indexOf(q) + 1;
    const sel = state.answers[q.id];
    return `<section class="screen has-nav"><div class="wrap">
      <div class="q-head">
        <div class="q-head__row"><span class="eyebrow">FIND YOUR WEDDING</span><span class="eyebrow">QUESTION ${String(n).padStart(2, "0")} / ${String(questions.length).padStart(2, "0")}</span></div>
        <div class="progress"><div class="progress__bar" style="width:${((n - 1) / questions.length) * 100}%"></div></div>
      </div>
      <div class="q-title"><h1 class="h1">${q.label}</h1></div>
      <div class="choices ${sel ? "is-dim" : ""}" data-q="${q.id}">${q.choices
        .map(
          (c) => `<button class="choice ${sel === c.id ? "is-selected" : ""}" data-action="choose" data-q="${q.id}" data-id="${c.id}" aria-pressed="${sel === c.id}">
            ${photo({ image: c.image, tone: c.tone })}
            <div class="scrim"></div><div class="choice__veil"></div><div class="choice__ring"></div>
            <span class="choice__check">${CHECK}</span>
            <div class="choice__body"><div class="choice__en">${c.en}</div><div class="choice__title">${c.title}</div>${c.note ? `<div class="choice__note">${c.note}</div>` : ""}</div>
          </button>`
        )
        .join("")}</div>
    </div></section>`;
  },

  analyzing() {
    const picks = ["q02", "q05", "q01"].map((id) => choiceOf(id)).filter(Boolean);
    return `<section class="screen analyzing">
      <div class="analyzing__bg">${picks.map((c, i) => photo({ image: c.image, tone: c.tone, cls: i === 0 ? "on" : "", label: false })).join("")}</div>
      <div class="analyzing__veil"></div>
      <div class="analyzing__text"><h1 class="h1">ふたりの回答を\n分析しています。</h1><div class="dots"><i></i><i></i><i></i></div></div>
    </section>`;
  },

  favorites() {
    const picks = ["q01", "q02", "q03", "q05"].map((id) => choiceOf(id)).filter(Boolean);
    return `<section class="screen has-nav"><div class="wrap">
      <div class="fav-title"><div class="eyebrow eyebrow--gold">YOUR FAVORITES</div><h1 class="h1" style="margin-top:12px">ふたりが選んだ\nウェディング</h1></div>
      <div class="fav-grid">${picks
        .map((c) => `<div class="fav">${photo({ image: c.image, tone: c.tone })}<div class="scrim"></div><div class="fav__body"><div class="en">${c.en}</div><span>${c.note || c.title.replace(/\n/g, "")}</span></div></div>`)
        .join("")}</div>
      <p class="lead fav-note">ふたりが選んだものを重ねると、\nこんなウェディングが見えてきます。</p>
    </div></section>`;
  },

  result() {
    const r = recommend(state.answers, products);
    const best = r.best.product;
    const cat = categoryOf(best);
    const copy = resultCopy[cat.id];
    const reasons = reasonLabels(r.weights, best);
    const combo = userTopLabels(r.weights, 3).join(" × ");
    const recs = [
      { row: r.best, no: "01", kind: "BEST MATCH", cls: "rec--best", btn: "詳細を見る" },
      { row: r.second, no: "02", kind: "ANOTHER CHOICE", cls: "", btn: "詳細を見る" },
      { row: r.discovery, no: "03", kind: "DISCOVERY", cls: "", btn: "見てみる", discovery: true },
    ];
    return `<section class="screen"><div class="wrap result-wrap">
      <div class="result-top"><div class="eyebrow eyebrow--gold">YOUR WEDDING</div></div>
      <div class="result-hero">${photo({ image: best.image, tone: best.tone, label: false })}<div class="scrim"></div>
        <div class="result-hero__body">
          <div class="eyebrow">ふたりに一番近いのは</div>
          <div class="result-hero__name" ${cat.en.length > 9 ? 'style="font-size:38px"' : ""}>${cat.en}</div>
          <div class="result-hero__x">${combo}</div>
        </div></div>
      <div class="result-body">
        <div class="result-line">
          <div class="eyebrow">ふたりの答えから見えてきたのは</div>
          <h2 class="h2" style="margin-top:14px">${copy.line}</h2>
          <p class="lead" style="margin-top:16px">${copy.body}</p>
          <div class="eyebrow" style="margin-top:28px">ふたりが選んだ理由</div>
          <div class="tags">${reasons.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
        </div>

        <div class="section">
          <div class="section__head"><div class="eyebrow eyebrow--gold">初夢フェア</div><h2 class="h2">ふたりにおすすめの\n初夢SALE</h2><p class="small" style="margin-top:10px">ひとつに決めなくても大丈夫です。気になる順にご覧ください。</p></div>
          ${recs
            .map(
              (x) => `${x.discovery ? `<div class="disc"><div class="eyebrow">DISCOVERY</div><h3 class="h2">ふたりが選ばなかった、\nもうひとつの候補。</h3><p>回答を見ると、\n実はこのウェディングも相性が良さそうです。</p></div>` : ""}
              <div class="${x.discovery ? "rec-wrap--disc" : ""}">${recCard(x.row.product, { no: x.no, kind: x.kind, cls: x.cls, btn: x.btn })}</div>`
            )
            .join("")}
          <div class="center" style="margin-top:8px"><button class="pill pill--line" data-action="list">初夢SALEの商品をすべて見る</button></div>
        </div>
      </div>
      ${consultBlock()}
      <div class="foot"><button class="link-quiet" data-action="reset">もう一度診断する</button>
        <p class="mock-note">モックアップです。写真は仮のイメージ枠、価格・割引・限定組数は未確認のため TODO と表示しています。</p></div>
    </div></section>`;
  },

  list() {
    const f = state.filter;
    const items = products.filter((p) => f === "all" || (p.destination || p.category) === f);
    return `<section class="screen">
      <div class="wrap"><div class="list-head"><div class="eyebrow eyebrow--gold">初夢フェア</div><h1 class="h1" style="margin-top:10px">SALE商品</h1>
        <p class="small" style="margin-top:10px">FIND YOUR STAGE ― 沖縄・ハワイ・グアム・ヨーロッパ・バリ島・オーストラリア・内容充実プラン・フォトウェディング</p>
        <div style="margin-top:16px"><button class="link-quiet" data-action="home">トップへ戻る</button></div></div></div>
      <div class="filters"><div class="filters__scroll">
        ${[{ id: "all", ja: "すべて" }, ...categories].map((c) => `<button class="chip ${f === c.id ? "is-on" : ""}" data-action="filter" data-id="${c.id}">${c.ja}</button>`).join("")}
      </div></div>
      <div class="wrap list">${items.map((p) => recCard(p, { kind: categoryOf(p).group, btn: "詳細を見る" })).join("")}
        <div class="center" style="padding:8px 0 56px"><button class="pill pill--solid" data-action="start">診断して探す</button></div></div>
      <div class="wrap">${consultBlock()}</div>
    </section>`;
  },
};

function header(en) {
  return `<div class="q-head"><div class="q-head__row"><span class="eyebrow">FIND YOUR WEDDING</span><span class="eyebrow">${en}</span></div><div class="progress"><div class="progress__bar" style="width:0%"></div></div></div>`;
}

function recCard(p, { no, kind, cls = "", btn }) {
  const cat = categoryOf(p);
  return `<article class="rec ${cls}">
    <div class="rec__photo" data-action="detail" data-id="${p.id}" role="button" tabindex="0">
      ${photo({ image: p.image, tone: p.tone })}<div class="scrim"></div>
      <div class="rec__badge">${no ? `<span class="rec__no">${no}</span>` : ""}<span class="rec__kind">${kind}</span></div>
      <div class="rec__tags"><span class="mini">SALE</span><span class="mini">LIMITED</span></div>
    </div>
    <div class="rec__info">
      <div class="rec__area">${cat.en}</div>
      <h3 class="rec__name">${productName(p)}</h3>
      <p class="rec__catch">${val(p.catchcopy)}</p>
      <div class="rec__price">
        <div class="kv">価格<b>${val(p.price)}</b></div><div class="kv">割引<b>${val(p.discount)}</b></div><div class="kv">限定<b>${val(p.limited)}</b></div>
      </div>
      <button class="pill pill--line" data-action="detail" data-id="${p.id}">${btn}</button>
    </div></article>`;
}

function consultBlock() {
  return `<div class="consult">
    <div class="eyebrow eyebrow--gold">CONSULTATION</div>
    <h2 class="h2" style="margin-top:10px">まだ決めなくても大丈夫。</h2>
    <p class="lead">気になったウェディングを、\nHISのスタッフと一緒に比較してみませんか？</p>
    <div class="stack"><a class="pill pill--solid" href="${links.visit}" target="_blank" rel="noopener">来店相談</a><a class="pill pill--line" href="${links.online}" target="_blank" rel="noopener">オンライン相談</a></div>
  </div>`;
}

function choiceOf(qid) {
  const q = questions.find((x) => x.id === qid);
  return q && q.choices.find((c) => c.id === state.answers[qid]);
}

// ---------- 画面遷移 ----------
const EASE = "cubic-bezier(.22,.8,.3,1)";

function build(name) {
  const q = questions.find((x) => x.id === name);
  const html = q ? screens.question(q) : screens[name]();
  const t = document.createElement("div");
  t.innerHTML = html.trim();
  return t.firstElementChild;
}

function show(name, dir = "forward", { instant = false } = {}) {
  const old = stage.firstElementChild;
  state.screen = name;
  persist();
  const el = build(name);
  stage.appendChild(el);
  hydratePhotos(el);
  window.scrollTo(0, 0);
  updateNav();

  if (old && !instant) {
    old.classList.add("leaving");
    let inKf, outKf, dur = 340;
    if (dir === "forward") { outKf = [{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(-18%)", opacity: 0 }]; inKf = [{ transform: "translateX(18%)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }]; }
    else if (dir === "back") { outKf = [{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(18%)", opacity: 0 }]; inKf = [{ transform: "translateX(-18%)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }]; }
    else { dur = 700; outKf = [{ opacity: 1 }, { opacity: 0 }]; inKf = [{ opacity: 0, transform: "scale(1.03)" }, { opacity: 1, transform: "scale(1)" }]; }
    old.animate(outKf, { duration: dur, easing: EASE, fill: "forwards" }).finished.then(() => old.remove());
    el.animate(inKf, { duration: dur, easing: EASE });
  } else if (old) old.remove();

  if (name === "analyzing") runAnalyzing(el);
}

function runAnalyzing(el) {
  const slides = [...el.querySelectorAll(".analyzing__bg .photo")];
  slides.forEach((s, i) => setTimeout(() => state.screen === "analyzing" && (slides.forEach((x) => x.classList.remove("on")), s.classList.add("on")), 900 * i));
  setTimeout(() => state.screen === "analyzing" && show("favorites", "fade"), 900 * slides.length + 400);
}

function updateNav() {
  const s = state.screen;
  const q = questions.find((x) => x.id === s);
  const visible = s === "welcome" || !!q || s === "favorites";
  nav.hidden = !visible;
  if (!visible) return;
  navNext.textContent = s === "favorites" ? "結果を見る" : q && q.id === questions[questions.length - 1].id ? "結果を見る" : "次へ";
  navNext.disabled = !!q && !state.answers[q.id];
}

function go(delta) {
  const i = FLOW.indexOf(state.screen);
  const next = FLOW[i + delta];
  if (!next) return;
  if (next === "analyzing") return show("analyzing", "fade");
  if (next === "result") return show("result", "fade");
  if (delta > 0 && state.screen === "favorites") return;
  show(next, delta > 0 ? "forward" : "back");
}

navNext.addEventListener("click", () => {
  if (state.screen === "favorites") return show("result", "fade");
  go(1);
});
navBack.addEventListener("click", () => {
  if (state.screen === "favorites") return show(questions[questions.length - 1].id, "back");
  go(-1);
});

// ---------- 商品詳細 ----------
let lastFocus = null;
function openDetail(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  const cat = categoryOf(p);
  const { weights } = buildUserTags(state.answers);
  const rows = Object.keys(weights).length ? matchBreakdown(weights, p) : [];
  const stars = (n) => "★".repeat(n) + `<i>${"★".repeat(5 - n)}</i>`;
  lastFocus = document.activeElement;
  modal.innerHTML = `<button class="modal__close" data-action="close" aria-label="閉じる"><svg viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13"/></svg></button>
  <div class="modal__panel">
    <div class="detail__photo" style="position:relative">${photo({ image: p.image, tone: p.tone })}<div class="scrim"></div></div>
    <div class="detail__body">
      <div class="rec__area">${cat.en}</div>
      <h2 class="detail__name">${productName(p)}</h2>
      <p class="lead">${val(p.catchcopy)}</p>
      <dl class="spec">
        <div class="spec__row"><dt>エリア</dt><dd>${cat.ja}</dd></div>
        <div class="spec__row"><dt>価格</dt><dd>${val(p.price)}</dd></div>
        <div class="spec__row"><dt>割引</dt><dd>${val(p.discount)}</dd></div>
        <div class="spec__row"><dt>限定組数</dt><dd>${val(p.limited)}</dd></div>
        <div class="spec__row"><dt>挙式会場</dt><dd>${val(p.venue)}</dd></div>
        <div class="spec__row"><dt>商品内容</dt><dd>${val(p.description)}</dd></div>
      </dl>
      ${rows.length ? `<div class="match"><div class="eyebrow eyebrow--gold">YOUR MATCH</div><p class="small" style="margin:4px 0 10px">ふたりの回答との一致度です（商品の評価ではありません）</p>
        ${rows.map((r) => `<div class="match__row"><span>${r.label}</span><span class="stars" aria-label="${r.stars} / 5">${stars(r.stars)}</span></div>`).join("")}</div>` : ""}
    </div>
    <div class="consult">
      <h2 class="h2">このウェディング、\nもう少し詳しく見てみる？</h2>
      <div class="stack"><a class="pill pill--solid" href="${p.sourceUrl}" target="_blank" rel="noopener">商品詳細を見る</a>
        <a class="pill pill--line" href="${links.visit}" target="_blank" rel="noopener">来店相談を予約する</a>
        <a class="pill pill--line" href="${links.online}" target="_blank" rel="noopener">オンライン相談を予約する</a></div>
    </div>
  </div>`;
  modal.hidden = false;
  modal.scrollTop = 0;
  document.body.style.overflow = "hidden";
  hydratePhotos(modal);
  modal.animate([{ opacity: 0, transform: "translateY(28px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 360, easing: EASE });
}
function closeDetail() {
  if (modal.hidden) return;
  modal.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: EASE }).finished.then(() => {
    modal.hidden = true;
    modal.innerHTML = "";
    document.body.style.overflow = "";
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  });
}
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDetail());

// ---------- 操作 ----------
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const { action, id, q } = t.dataset;
  switch (action) {
    case "start": return show("welcome", "forward");
    case "home": return show("intro", "back");
    case "list": return closeDetail(), show("list", "forward");
    case "who": {
      state.who = id; persist();
      document.querySelectorAll(".pill-choice").forEach((b) => b.classList.toggle("is-selected", b.dataset.id === id));
      return;
    }
    case "choose": {
      state.answers[q] = id; persist();
      const box = t.closest(".choices");
      box.classList.add("is-dim");
      box.querySelectorAll(".choice").forEach((b) => { const on = b === t; b.classList.toggle("is-selected", on); b.setAttribute("aria-pressed", on); });
      updateNav();
      return;
    }
    case "filter": { state.filter = id; const y = window.scrollY; const cur = stage.firstElementChild; const el = build("list"); stage.appendChild(el); hydratePhotos(el); cur.remove(); window.scrollTo(0, y); return; }
    case "detail": return openDetail(id);
    case "close": return closeDetail();
    case "reset": clear(); state.answers = {}; state.who = null; state.filter = "all"; return show("intro", "back");
  }
});
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[role="button"][data-action]')) { e.preventDefault(); e.target.click(); }
});

// ---------- 起動 ----------
show(state.screen, "forward", { instant: true });
