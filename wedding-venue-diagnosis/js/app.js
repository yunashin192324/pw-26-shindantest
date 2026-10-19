/* 画面の表示と操作。診断の計算は js/logic.js に分離しています。 */
(function () {
  'use strict';

  var NS = window.VENUE_DIAG || {};
  var DATA = NS.DATA, QUESTIONS = NS.QUESTIONS || [], CONFIG = NS.CONFIG || {}, EXTRAS = NS.EXTRAS || {}, logic = NS.logic;

  var answers = {}, flow = [], curIdx = 0, busy = false, lastDiag = null, loadingTimers = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function extrasOf(v) { return EXTRAS[v.name] || {}; }
  function safeUrl(u) { u = String(u || '').trim(); return u && !/^(javascript|data|vbscript):/i.test(u) ? u : ''; }

  /* ───── 質問の流れ（分岐） ───── */
  function priorityQuestionIndex() {
    for (var i = 0; i < QUESTIONS.length; i++) if (QUESTIONS[i].type === 'priority') return i;
    return -1;
  }
  function computeFlow() {
    var list = [];
    QUESTIONS.forEach(function (q, i) { if (q.type !== 'priority') list.push(i); });
    var pi = priorityQuestionIndex();
    if (pi !== -1 && logic.collectConditions(QUESTIONS, answers).length >= 2) list.push(pi);
    else delete answers.priority;
    return list;
  }
  function currentQ() { return QUESTIONS[flow[curIdx]]; }

  /* 重視条件の質問は、選ばれた条件から選択肢を作る */
  function optionsFor(q) {
    if (q.type !== 'priority') return q.opts;
    var conds = logic.collectConditions(QUESTIONS, answers);
    var opts = conds.map(function (c) { return { v: c.category, main: c.label, sub: '該当カテゴリ：' + c.category }; });
    if (q.noneOption) opts.push(q.noneOption);
    return opts;
  }

  /* ───── 画面切り替え ───── */
  function showScreen(id, anim) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active', 'anim-up', 'anim-right', 'anim-left');
    var el = $(id);
    el.classList.add('active');
    void el.offsetWidth;
    el.classList.add(anim || 'anim-up');
    window.scrollTo(0, 0);
  }

  function setBg(el, src) {
    var old = el.querySelector('img');
    if (old) old.remove();
    src = safeUrl(src);
    if (!src) return;
    var img = document.createElement('img');
    img.alt = '';
    img.onerror = function () { img.remove(); };
    img.src = src;
    el.appendChild(img);
  }

  /* ───── 質問画面 ───── */
  function renderQ(dir) {
    flow = computeFlow();
    if (curIdx >= flow.length) curIdx = flow.length - 1;
    var q = currentQ(), total = flow.length, step = curIdx + 1;
    var opts = optionsFor(q);

    $('q-step').textContent = 'QUESTION ' + pad2(step);
    $('q-frac').textContent = step + ' / ' + total;
    $('q-bar').style.width = (step / total * 100) + '%';
    $('q-progress').setAttribute('aria-valuenow', String(Math.round(step / total * 100)));
    $('q-section').textContent = q.section;
    $('q-title').textContent = q.title;
    $('q-sub').textContent = q.sub || '';
    var bg = $('bg-q');
    bg.setAttribute('data-tone', String((flow[curIdx] % 6) + 1));
    setBg(bg, (CONFIG.sceneImages && CONFIG.sceneImages.question || [])[flow[curIdx]]);

    var $s = $('opts-single'), $m = $('opts-multi'), $n = $('next-btn'), $c = $('multi-count');
    $s.innerHTML = ''; $m.innerHTML = '';

    if (q.type === 'multi') {
      $s.hidden = true; $m.hidden = false; $n.hidden = false; $c.hidden = false;
      var sel = answers[q.id] || [];
      var btns = {};
      opts.forEach(function (opt, k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'opt-multi';
        b.style.animationDelay = (k * 0.04) + 's';
        b.innerHTML = '<span class="chk" aria-hidden="true"></span><span class="opt-multi-text">' + esc(opt.text) + '</span>';
        b.addEventListener('click', function () { toggleMulti(q, opt); refresh(); });
        $m.appendChild(b);
        btns[opt.v] = b;
      });
      var refresh = function () {
        sel = answers[q.id] || [];
        opts.forEach(function (o) {
          var on = sel.indexOf(o.v) !== -1;
          btns[o.v].classList.toggle('selected', on);
          btns[o.v].setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        $n.disabled = sel.length === 0;
        $c.textContent = sel.length ? (sel.length === 1 && isExclusive(q, sel[0]) ? '「' + optText(q, sel[0]) + '」を選択中' : sel.length + '件選択中') : '1つ以上お選びください';
      };
      refresh();
    } else {
      $s.hidden = false; $m.hidden = true; $c.hidden = true;
      var hasAnswer = opts.some(function (o) { return answers[q.id] === o.v; });
      if (q.type === 'priority' && !hasAnswer) delete answers[q.id];
      $n.hidden = !hasAnswer; $n.disabled = !hasAnswer;
      opts.forEach(function (opt, k) {
        var b = document.createElement('button');
        var on = answers[q.id] === opt.v;
        b.type = 'button';
        b.className = 'opt' + (on ? ' selected' : '');
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.style.animationDelay = (k * 0.06) + 's';
        b.innerHTML = '<span class="opt-inner"><span class="opt-texts"><span class="opt-main">' + esc(opt.main) + '</span>' +
          (opt.sub ? '<span class="opt-sub-text">' + esc(opt.sub) + '</span>' : '') + '</span><span class="opt-radio" aria-hidden="true"></span></span>';
        b.addEventListener('click', function (e) {
          if (busy) return;
          busy = true;
          ripple(b, e);
          answers[q.id] = opt.v;
          var all = $s.querySelectorAll('.opt');
          for (var i = 0; i < all.length; i++) { all[i].classList.remove('selected'); all[i].setAttribute('aria-checked', 'false'); }
          b.classList.add('selected'); b.setAttribute('aria-checked', 'true');
          setTimeout(function () { busy = false; goNext(); }, 320);
        });
        $s.appendChild(b);
      });
    }
    $n.textContent = curIdx === flow.length - 1 ? '診断する' : '次へ';
    if (!$('screen-q').classList.contains('active') || dir) showScreen('screen-q', dir === 'left' ? 'anim-left' : 'anim-right');
  }

  function isExclusive(q, v) { return q.opts.some(function (o) { return o.v === v && o.exclusive; }); }
  function optText(q, v) { for (var i = 0; i < q.opts.length; i++) if (q.opts[i].v === v) return q.opts[i].text; return ''; }

  function toggleMulti(q, opt) {
    var sel = (answers[q.id] || []).slice();
    var i = sel.indexOf(opt.v);
    if (i !== -1) sel.splice(i, 1);
    else if (opt.exclusive) sel = [opt.v];
    else {
      sel = sel.filter(function (v) { return !isExclusive(q, v); });
      sel.push(opt.v);
    }
    // 選択肢の並び順で保存（回答の再現性のため）
    answers[q.id] = q.opts.map(function (o) { return o.v; }).filter(function (v) { return sel.indexOf(v) !== -1; });
  }

  function ripple(btn, e) {
    if (!e || e.clientX == null) return;
    var r = document.createElement('span'), rect = btn.getBoundingClientRect(), sz = Math.max(rect.width, rect.height);
    r.className = 'ripple';
    r.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;left:' + (e.clientX - rect.left - sz / 2) + 'px;top:' + (e.clientY - rect.top - sz / 2) + 'px';
    btn.appendChild(r);
    setTimeout(function () { r.remove(); }, 700);
  }

  function answered(q) {
    var a = answers[q.id];
    return q.type === 'multi' ? Array.isArray(a) && a.length > 0 : a !== undefined;
  }

  function goNext() {
    var q = currentQ();
    if (!answered(q)) return;
    flow = computeFlow();
    if (curIdx < flow.length - 1) { curIdx++; renderQ('right'); }
    else showLoading();
  }

  function goBack() {
    if (busy) return;
    if (curIdx > 0) { curIdx--; renderQ('left'); }
    else showScreen('screen-start', 'anim-up');
  }

  var resetArmed = null;
  function onReset() {
    var b = $('reset-btn');
    if (!resetArmed) {
      b.textContent = 'もう一度押すと回答を消去します';
      resetArmed = setTimeout(function () { resetArmed = null; b.textContent = '最初からやり直す'; }, 3000);
      return;
    }
    clearTimeout(resetArmed); resetArmed = null; b.textContent = '最初からやり直す';
    restart();
  }

  function restart() {
    answers = {}; curIdx = 0; lastDiag = null;
    clearLoading();
    closeModal();
    showScreen('screen-start', 'anim-up');
  }

  /* ───── 読み込み中（結果算出の演出） ───── */
  function clearLoading() { loadingTimers.forEach(clearTimeout); loadingTimers = []; }
  function later(fn, ms) { loadingTimers.push(setTimeout(fn, ms)); }

  function showLoading() {
    lastDiag = logic.diagnose(DATA, QUESTIONS, answers);
    showScreen('screen-loading', 'anim-up');
    setBg($('bg-loading'), CONFIG.sceneImages && CONFIG.sceneImages.loading);
    var slot = $('loading-slot'), inner = $('slot-inner'), fin = $('loading-final');
    clearLoading();
    fin.style.display = 'none'; fin.classList.remove('visible'); slot.style.display = 'block';
    inner.style.transform = 'translateY(0)';

    var top = lastDiag.status === 'ok' ? lastDiag.recommended[0].venue.name : '';
    if (!top || reducedMotion()) {
      inner.innerHTML = '';
      later(function () { renderResult(lastDiag); }, top ? 600 : 1200);
      return;
    }
    var names = DATA.venues.map(function (v) { return v.name; });
    var items = names.slice(0, 18).concat([top]);
    inner.innerHTML = items.map(function (n) { return '<div class="loading-slot-item">' + esc(n) + '</div>'; }).join('');
    var idx = 0, max = items.length - 1;
    (function spin() {
      inner.style.transform = 'translateY(-' + (idx * 64) + 'px)';
      if (idx < max) { idx++; later(spin, idx < max * 0.6 ? 70 : idx < max * 0.85 ? 120 : 200); }
      else later(function () {
        slot.style.display = 'none';
        fin.textContent = top; fin.style.display = 'block';
        later(function () { fin.classList.add('visible'); }, 40);
        later(function () { renderResult(lastDiag); }, 1100);
      }, 300);
    })();
  }

  /* ───── 結果画面 ───── */
  function answerSummary(diag) {
    var tags = [];
    flow.forEach(function (qi) {
      var q = QUESTIONS[qi], a = answers[q.id];
      if (q.type === 'priority') {
        if (diag.priority) tags.push({ text: '最重視：' + diag.priority, prio: true });
        return;
      }
      (q.opts || []).forEach(function (o) {
        if (q.type === 'multi' ? (a || []).indexOf(o.v) !== -1 && !o.exclusive : a === o.v) tags.push({ text: o.main || o.text });
      });
    });
    return tags;
  }

  function renderResult(diag) {
    var D = diag;
    $('res-badges').innerHTML = '';
    $('res-notice').innerHTML = '';
    $('res-main').innerHTML = '';
    $('res-alt-wrap').innerHTML = '';
    $('res-trace').innerHTML = '';
    setBg($('bg-result'), CONFIG.sceneImages && CONFIG.sceneImages.result);

    $('res-summary').innerHTML = '<p class="summary-label">あなたの回答</p>' + answerSummary(D).map(function (t) {
      return '<span class="summary-tag' + (t.prio ? ' is-priority' : '') + '">' + esc(t.text) + '</span>';
    }).join('');

    if (D.status !== 'ok') {
      $('res-kicker').textContent = '診断結果';
      $('res-name').textContent = D.status === 'no_conditions' ? '希望条件が選ばれていません' : '条件に合う式場が見つかりませんでした';
      $('res-notice').innerHTML = '<div class="notice">' + (D.status === 'no_conditions'
        ? 'すべての質問で「こだわらない」などを選ばれたため、式場を絞り込む手がかりがありませんでした。根拠のないおすすめは行わないため、順位は表示していません。<br><strong>気になる条件を1つ以上選んで、もう一度お試しください。</strong>'
        : 'お選びいただいた条件に該当する式場は、登録データ上ありませんでした。<br><strong>条件を変えて、もう一度お試しください。</strong>') + '</div>';
      $('res-trace').innerHTML = allVenuesList();
      renderConsult(null);
      $('share-row').hidden = true;
      showScreen('screen-result', 'anim-up');
      return;
    }

    $('share-row').hidden = false;
    var top = D.recommended[0];
    var topTies = D.recommended.filter(function (r) { return r.rank === top.rank; }).length;
    $('res-kicker').textContent = 'お二人におすすめの式場は';
    $('res-name').textContent = top.venue.name;
    var badges = ['一致率 ' + top.rate + '%', '希望条件 ' + D.conditions.length + '件中 ' + top.matchCount + '件に該当'];
    if (D.priority && top.priorityMatch) badges.push('最重視の条件に該当');
    $('res-badges').innerHTML = badges.map(function (b) { return '<span class="result-badge">' + esc(b) + '</span>'; }).join('');

    var notes = [];
    if (topTies > 1) notes.push('同じ評価の式場が<strong>' + topTies + '件</strong>あります。同じ評価の場合は、データの掲載順に表示しています。');
    if (D.recommended.length <= 3) notes.push('お選びいただいた条件に1つでも該当する式場は<strong>' + D.recommended.length + '件</strong>でした。条件を減らすと、候補が広がります。');
    if (D.priority && !D.priorityCount) notes.push('最も重視された「' + esc(D.priority) + '」に該当する式場は、登録データ上ありませんでした。');
    if (notes.length) $('res-notice').innerHTML = '<div class="notice">' + notes.join('<br>') + '</div>';

    $('res-main').innerHTML = mainSection(top, D);
    var alts = D.recommended.slice(1, 1 + (CONFIG.maxAlternatives || 4));
    $('res-alt-wrap').innerHTML = '<div class="section-title"><span>その他のおすすめ式場</span></div>' + (alts.length
      ? '<div class="alt-grid">' + alts.map(function (r) { return altCard(r, D); }).join('') + '</div>'
      : '<p class="notice">ほかに、希望条件に該当する式場はありませんでした。</p>');
    $('res-trace').innerHTML = traceTable(D);
    renderConsult(top);

    showScreen('screen-result', 'anim-up');
    setTimeout(function () {
      var f = document.querySelector('#res-main .matching-fill'); if (f) f.style.width = top.rate + '%';
      var cards = document.querySelectorAll('.venue-card,.alt-card');
      for (var i = 0; i < cards.length; i++) (function (el, k) { setTimeout(function () { el.classList.add('card-visible'); }, 80 + k * 90); })(cards[i], i);
    }, 120);
  }

  function rankLabel(r) { return (r.tied ? '同率 ' : '') + 'No.' + r.rank; }

  function mainSection(r, D) {
    var v = r.venue, ex = extrasOf(v);
    var rows = D.conditions.map(function (c) {
      var hit = v.categories.indexOf(c.category) !== -1;
      return '<tr><td>' + esc(c.category) + (D.priority === c.category ? '<span class="prio-mark">最重視</span>' : '') +
        '<span class="cond-src">回答：' + esc(c.optionText) + '</span></td>' +
        '<td class="res ' + (hit ? 'cond-yes' : 'cond-no') + '">' + (hit ? '○ 該当' : '－ 登録なし') + '</td></tr>';
    }).join('');
    var selected = D.conditions.map(function (c) { return c.category; });
    var img = safeUrl(ex.image);
    var meta = [ex.area, ex.address, ex.price].filter(Boolean).map(esc).join(' ／ ');
    return '<div class="section-title"><span>最もおすすめの式場</span></div>' +
      '<div class="matching"><div class="matching-row"><span class="matching-label">MATCHING SCORE</span><span class="matching-rate">' + r.rate + '%</span></div>' +
      '<div class="matching-track"><div class="matching-fill"></div></div>' +
      '<p class="matching-caption">希望条件 ' + D.conditions.length + '件中 ' + r.matchCount + '件に該当</p></div>' +
      '<table class="cond-table"><caption>希望条件と、この式場の一致状況</caption><thead><tr><th scope="col">希望条件（カテゴリ）</th><th scope="col" style="text-align:right">この式場</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="reason"><p class="reason-title">おすすめの理由</p>' + logic.buildReasons(r, D).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>' +
      '<article class="venue-card">' +
        '<div class="venue-card-band' + (img ? ' has-img' : '') + '">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(ex.imageAlt || v.name) + '" onerror="this.remove()">' : '') +
        '<span class="venue-card-rank">' + esc(rankLabel(r)) + '</span></div>' +
        '<div class="venue-card-body"><h3 class="venue-card-title">' + esc(v.name) + '</h3>' +
        (meta ? '<p class="venue-card-meta">' + meta + '</p>' : '') +
        (ex.description ? '<p class="venue-card-desc">' + esc(ex.description) + '</p>' : '') +
        '<span class="tag-label">この式場の特徴（登録データ）</span><div class="tags">' +
        v.categories.map(function (c) { return '<span class="tag' + (selected.indexOf(c) !== -1 ? ' hit' : '') + '">' + esc(c) + '</span>'; }).join('') + '</div>' +
        '<div class="btn-row"><button type="button" class="btn-outline" data-detail="' + esc(v.id) + '">特徴の一覧を見る</button>' +
        (safeUrl(ex.url) ? '<a class="btn-solid" href="' + esc(safeUrl(ex.url)) + '" target="_blank" rel="noopener">式場の詳細ページへ</a>' : '') +
        '</div></div></article>';
  }

  function altCard(r, D) {
    var hits = r.matched.map(function (c) { return c.category; });
    return '<button type="button" class="alt-card" data-detail="' + esc(r.venue.id) + '">' +
      '<span class="alt-top"><span class="alt-rank">' + esc(rankLabel(r)) + '</span><span class="alt-pct">一致率 ' + r.rate + '%</span></span>' +
      '<span class="alt-name">' + esc(r.venue.name) + '</span>' +
      '<span class="alt-bar"><i style="width:' + r.rate + '%"></i></span>' +
      '<span class="alt-hits"><b>該当：</b>' + esc(hits.join('・')) +
      (D.priority ? '<br>最重視の条件：' + (r.priorityMatch ? '該当' : '登録なし') : '') + '</span>' +
      '<span class="alt-more">特徴の一覧を見る</span></button>';
  }

  function traceTable(D) {
    var head = '<tr><th>順位</th><th>式場名</th>' + (D.priority ? '<th>最重視</th>' : '') + '<th>一致数</th><th>該当した希望条件</th></tr>';
    var body = D.ranked.map(function (r) {
      var zero = r.matchCount === 0;
      return '<tr class="' + (zero ? 'zero' : '') + '"><td class="num">' + (zero ? '対象外' : esc(rankLabel(r))) + '</td><td>' + esc(r.venue.name) + '</td>' +
        (D.priority ? '<td class="num">' + (r.priorityMatch ? '○' : '－') + '</td>' : '') +
        '<td class="num">' + r.matchCount + ' / ' + D.conditions.length + '</td><td>' + esc(r.matched.map(function (c) { return c.category; }).join('・') || '－') + '</td></tr>';
    }).join('');
    return '<details class="trace"><summary>判定の詳細（全' + D.ranked.length + '式場）</summary><div class="trace-body">' +
      '<p class="trace-note">順位の決め方：①最も重視する条件に該当 → ②該当した希望条件の数 → ③該当した条件がまたがる質問の数 の順に比較し、すべて同じ場合は同順位（データの掲載順に表示）。希望条件に1つも該当しない式場は「対象外」とし、おすすめしません。</p>' +
      '<table class="trace-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></details>';
  }

  function allVenuesList() {
    return '<details class="trace"><summary>掲載している式場の一覧（全' + DATA.venues.length + '件・掲載順）</summary><div class="trace-body">' +
      '<p class="trace-note">おすすめ順ではありません。各式場の特徴は「特徴の一覧を見る」で確認できます。</p><div class="alt-grid">' +
      DATA.venues.map(function (v) {
        return '<button type="button" class="alt-card card-visible" data-detail="' + esc(v.id) + '"><span class="alt-name">' + esc(v.name) + '</span><span class="alt-more">特徴の一覧を見る</span></button>';
      }).join('') + '</div></div></details>';
  }

  function renderConsult() {
    var c = CONFIG.consult || {};
    var btns = (c.buttons || []).filter(function (b) { return safeUrl(b.url); });
    if (!btns.length) { $('res-consult').innerHTML = ''; return; }
    $('res-consult').innerHTML = '<div class="consult-block"><span class="consult-label">CONSULTATION</span>' +
      '<p class="consult-title">' + esc(c.title || '') + '</p>' +
      btns.map(function (b) { return '<a class="consult-btn ' + (b.primary ? 'primary' : 'secondary') + '" href="' + esc(b.url) + '" target="_blank" rel="noopener">' + esc(b.label) + '</a>'; }).join('') +
      (c.note ? '<p class="consult-note">' + esc(c.note) + '</p>' : '') + '</div>';
  }

  /* ───── 式場の詳細（全カテゴリの登録状況） ───── */
  var lastFocus = null;
  function openDetail(id) {
    var v = null;
    for (var i = 0; i < DATA.venues.length; i++) if (DATA.venues[i].id === id) v = DATA.venues[i];
    if (!v) return;
    var ex = extrasOf(v);
    var selected = lastDiag && lastDiag.conditions ? lastDiag.conditions.map(function (c) { return c.category; }) : [];
    var info = [['エリア', ex.area], ['住所', ex.address], ['料金の目安', ex.price]].filter(function (p) { return p[1]; });
    var url = safeUrl(ex.url);
    $('modal-box').innerHTML =
      '<div class="modal-head"><h3 class="modal-title" id="modal-title">' + esc(v.name) + '</h3><button type="button" class="modal-close" id="modal-close" aria-label="閉じる">×</button></div>' +
      '<p class="modal-sub">登録されている特徴：' + v.categories.length + ' / ' + DATA.categories.length + 'カテゴリ' + (selected.length ? '（太字はあなたが選んだ条件）' : '') + '</p>' +
      (ex.description ? '<p class="venue-card-desc">' + esc(ex.description) + '</p>' : '') +
      (info.length ? '<div class="extras"><dl>' + info.map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>'; }).join('') + '</dl></div>' : '') +
      '<div class="cat-grid">' + DATA.categories.map(function (c) {
        var on = v.categories.indexOf(c) !== -1;
        return '<div class="cat-item ' + (on ? 'on' : 'off') + (selected.indexOf(c) !== -1 ? ' sel' : '') + '"><span class="mk">' + (on ? '○' : '－') + '</span>' + esc(c) + '</div>';
      }).join('') + '</div>' +
      (url ? '<a class="btn-solid" href="' + esc(url) + '" target="_blank" rel="noopener">式場の詳細ページへ</a>' : '') +
      '<p class="modal-note">○は診断用データ（' + esc(DATA.source && DATA.source.file || '') + '）に登録されている特徴です。「－」は登録がないことを示し、対応していないという意味ではありません。詳しくはスタッフにご確認ください。</p>';
    lastFocus = document.activeElement;
    $('modal').classList.add('open');
    $('modal-close').addEventListener('click', closeModal);
    $('modal-close').focus();
  }
  function closeModal() {
    var m = $('modal');
    if (!m.classList.contains('open')) return;
    m.classList.remove('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ───── シェア ───── */
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  function pageUrl() { return location.href.split('#')[0].split('?')[0]; }
  function shareText() {
    var name = lastDiag && lastDiag.status === 'ok' ? lastDiag.recommended[0].venue.name : '';
    return (CONFIG.shareText || '').replace('{name}', name);
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? 'URLをコピーしました' : 'コピーできませんでした');
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast('URLをコピーしました'); }, fallback);
    else fallback();
  }

  /* ───── 初期化 ───── */
  function init() {
    var check = logic ? logic.validate(DATA, QUESTIONS) : { errors: ['診断プログラムが読み込めませんでした'], warnings: [] };
    if (check.errors.length) {
      var box = $('data-error');
      box.hidden = false;
      box.innerHTML = '診断データに問題があるため、現在診断をご利用いただけません。<br>' + check.errors.map(esc).join('<br>');
      $('start-btn').disabled = true;
      return;
    }
    $('pill-count').textContent = DATA.venues.length + '式場から診断';
    var hl = CONFIG.headerLink;
    if (hl && safeUrl(hl.url)) { $('header-link').href = hl.url; $('header-link-label').textContent = hl.label; $('header-link').hidden = false; }
    setBg($('bg-start'), CONFIG.sceneImages && CONFIG.sceneImages.start);

    $('start-btn').addEventListener('click', function () { answers = {}; curIdx = 0; renderQ('right'); });
    $('next-btn').addEventListener('click', goNext);
    $('back-btn').addEventListener('click', goBack);
    $('reset-btn').addEventListener('click', onReset);
    $('restart-btn').addEventListener('click', restart);
    $('review-btn').addEventListener('click', function () { curIdx = 0; renderQ('left'); });
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-detail]') : null;
      if (t) openDetail(t.getAttribute('data-detail'));
    });
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    $('share-x').addEventListener('click', function () { window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText() + '\n' + pageUrl()), '_blank', 'noopener'); });
    $('share-line').addEventListener('click', function () { window.open('https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(pageUrl()) + '&text=' + encodeURIComponent(shareText()), '_blank', 'noopener'); });
    $('share-copy').addEventListener('click', function () { copyText(pageUrl()); });
    window.addEventListener('scroll', function () { $('siteHeader').classList.toggle('scrolled', window.scrollY > 10); }, { passive: true });
  }

  // テスト・確認用（画面操作には影響しない）
  NS.app = { getAnswers: function () { return JSON.parse(JSON.stringify(answers)); }, getLastDiagnosis: function () { return lastDiag; } };

  init();
})();
