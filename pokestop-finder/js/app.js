// 画面の動き。計算や文章作成は js/core/ 以下の部品に任せ、ここでは表示と操作だけを扱う。
(function () {
  'use strict';
  const PSF = window.PSF;
  const { cell: Cell, sources: Src, candidates: Cand, writer: Writer, store: Store } = PSF;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const REFETCH_COOLDOWN_MS = 60 * 1000; // 同じセルの再取得は1分あける（公開サーバーへの配慮）
  const store = Store.create();
  const state = {
    level: 17,
    anchor: null, // セルを決めた地点（L17/L14 切り替え時に使う）
    cell: null,
    project: null,
    filter: 'priority',
    mode: 'cell',
    searching: false,
    existing: store.existing(),
    sheet: null,
    map: null,
    layers: {},
  };

  // ---------- 小道具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  let toastTimer = null;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  async function copyText(text, label) {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
    }
    toast(ok ? `${label}をコピーしました` : 'コピーできませんでした。文章を長押しして手動でコピーしてください');
    return ok;
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function persist() {
    if (!state.project) return true;
    const r = store.saveProject(state.project);
    if (!r.ok) toast(r.message);
    return r.ok;
  }
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  // ---------- 手順の表示 ----------
  function updateSteps() {
    let now = 1;
    if (state.cell) now = 2;
    if (state.project && state.project.fetchedAt) now = 3;
    if (state.sheet === 'assist') now = 4;
    $$('.steps li').forEach((li) => {
      const n = +li.dataset.step;
      li.classList.toggle('now', n === now);
      li.classList.toggle('done', n < now);
    });
  }

  // ---------- 地図 ----------
  const TONE_COLOR = { good: '#15803d', info: '#1d4ed8', warn: '#ca8a04', bad: '#dc2626', mute: '#6b7280' };

  function initMap() {
    if (!window.L) {
      const note = $('#map-note');
      note.hidden = false;
      note.textContent = '地図を読み込めませんでした。セルIDや緯度・経度の入力、候補の確認と申請文の作成はこのまま使えます。';
      $('.map-modes').hidden = true;
      return;
    }
    const map = L.map('map', { zoomControl: true, tap: true }).setView([36.2, 138.2], 5);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);
    let tileErrShown = false;
    tiles.on('tileerror', () => {
      if (tileErrShown) return;
      tileErrShown = true;
      const note = $('#map-note');
      note.hidden = false;
      note.textContent = '地図の画像を取得できません（インターネット接続が必要です）。タップによるセル指定や判定はそのまま使えます。';
    });
    map.on('click', (e) => onMapTap(e.latlng.lat, e.latlng.lng));
    state.map = map;
    state.layers.cell = L.layerGroup().addTo(map);
    state.layers.cands = L.layerGroup().addTo(map);
    state.layers.existing = L.layerGroup().addTo(map);
  }

  function drawCell() {
    if (!state.map) return;
    const g = state.layers.cell;
    g.clearLayers();
    const c = state.cell;
    if (!c) return;
    if (c.level < 17) {
      // 中に含まれる L17 セルを細線で表示し、既存スポットのある L17 セルを塗る
      const occupied = new Set(state.existing.map((e) => e.l17));
      for (const kid of Cell.descendants(c.id, 17)) {
        const d = Cell.describe(kid);
        L.polygon(d.vertices, { color: '#0f766e', weight: 1, opacity: 0.35, fill: occupied.has(d.token), fillColor: '#6b7280', fillOpacity: 0.25, interactive: false }).addTo(g);
      }
    }
    L.polygon(c.vertices, { color: '#0f766e', weight: 3, fillColor: '#0f766e', fillOpacity: 0.06, interactive: false }).addTo(g);
    L.circleMarker(c.center, { radius: 3, color: '#0f766e', weight: 1, fillOpacity: 1, interactive: false }).addTo(g);
  }

  function drawCandidates() {
    if (!state.map) return;
    const g = state.layers.cands;
    g.clearLayers();
    const list = (state.project && state.project.candidates) || [];
    for (const c of list) {
      const tone = Cand.STATUS[c.eval.status].tone;
      const m = L.circleMarker([c.lat, c.lng], {
        radius: c.inCell ? 8 : 5,
        color: '#ffffff', weight: 2, fillColor: TONE_COLOR[tone], fillOpacity: c.inCell ? 0.95 : 0.5,
        dashArray: Cand.precise(c) ? null : '3',
      });
      m.bindTooltip(esc(c.name || '【仮】' + c.kind));
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        // 追加・登録の操作中は、目印の上をタップしてもその地点を指定したことにする
        if (state.mode !== 'cell') onMapTap(c.lat, c.lng);
        else openDetail(c.id);
      });
      m.addTo(g);
    }
  }

  function drawExisting() {
    if (!state.map) return;
    const g = state.layers.existing;
    g.clearLayers();
    for (const e of state.existing) {
      const icon = L.divIcon({ className: '', html: `<div style="width:16px;height:16px;border-radius:4px;background:${e.kind === 'gym' ? '#7c3aed' : '#2563eb'};border:2px solid #fff;box-shadow:0 0 2px #000"></div>`, iconSize: [16, 16] });
      const m = L.marker([e.lat, e.lng], { icon, keyboard: false });
      m.bindTooltip(`既存: ${esc(e.label || (e.kind === 'gym' ? 'ジム' : 'ポケストップ'))}`);
      m.addTo(g);
    }
  }

  function fitCell() {
    if (state.map && state.cell) state.map.fitBounds(L.latLngBounds(state.cell.vertices), { padding: [30, 30], maxZoom: 18 });
  }

  function onMapTap(lat, lng) {
    if (state.mode === 'add') return openAddForm(lat, lng);
    if (state.mode === 'existing') return openExistingForm(lat, lng);
    state.anchor = [lat, lng];
    selectCell(Cell.cellAt(lat, lng, state.level), { fit: false });
  }

  function setMode(mode) {
    state.mode = mode;
    $$('.map-modes .mode').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    const note = $('#map-note');
    const text = { add: '地図で候補の位置をタップしてください（現地で見つけた物などを追加できます）', existing: '既存のポケストップ・ジムの位置をタップしてください（L17セルの重なりを判定します）' }[mode];
    if (text) { note.hidden = false; note.textContent = text; } else note.hidden = true;
  }

  // ---------- 1. セルの指定 ----------
  function showCellMsg(text) {
    const m = $('#cell-msg');
    m.hidden = !text;
    m.textContent = text || '';
  }

  function selectCell(id, opts) {
    state.cell = Cell.describe(id);
    state.level = state.cell.level;
    if (!state.anchor) state.anchor = state.cell.center;
    $$('.level-row .seg').forEach((b) => {
      const on = +b.dataset.level === state.level;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    state.project = store.project(state.cell.token);
    state.filter = 'priority';
    showCellMsg('');
    renderCellInfo();
    drawCell();
    if (!opts || opts.fit !== false) fitCell();
    store.savePrefs({ lastToken: state.cell.token });
    $('#intro').hidden = true;
    $('#progress').hidden = true;
    $('#search-msg').hidden = true;
    renderResults();
    updateSearchButton();
    updateSteps();
  }

  function renderCellInfo() {
    const c = state.cell;
    const box = $('#cell-info');
    if (!c) { box.hidden = true; return; }
    const area = state.project && state.project.area && state.project.area.label;
    const sizeLabel = c.areaM2 >= 1e6 ? `約${(c.areaM2 / 1e6).toFixed(2)}km²` : `約${Math.round(c.areaM2).toLocaleString()}m²`;
    box.hidden = false;
    box.innerHTML = `
      <dl class="cell-info" style="margin:0">
        <dt>セル</dt><dd><b>${esc(c.token)}</b>（L${c.level}） <button type="button" class="btn ghost small" id="btn-copy-token">コピー</button></dd>
        <dt>数字ID</dt><dd>${esc(c.decimal)}</dd>
        <dt>中心</dt><dd>${c.center[0].toFixed(6)}, ${c.center[1].toFixed(6)}</dd>
        <dt>広さ</dt><dd>${sizeLabel}${c.level < 17 ? '（中のL17セル64個を地図に細線で表示）' : ''}</dd>
        ${area ? `<dt>地名</dt><dd>${esc(area)}</dd>` : ''}
      </dl>`;
    $('#btn-copy-token').onclick = () => copyText(c.token, 'セルID');
  }

  function onCellSubmit(e) {
    e.preventDefault();
    const r = Cell.parseInput($('#cell-input').value);
    if (r.kind === 'error') return showCellMsg(r.message);
    if (r.kind === 'point') {
      state.anchor = [r.lat, r.lng];
      selectCell(Cell.cellAt(r.lat, r.lng, state.level));
    } else {
      state.anchor = null;
      selectCell(r.id);
    }
    $('#cell-input').blur();
  }

  function setLevel(level) {
    state.level = level;
    $$('.level-row .seg').forEach((b) => {
      const on = +b.dataset.level === level;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    if (state.cell && state.cell.level !== level) {
      const p = state.anchor || state.cell.center;
      selectCell(Cell.cellAt(p[0], p[1], level));
    }
  }

  function useHere() {
    if (!navigator.geolocation) return showCellMsg('この端末・ブラウザでは現在地を取得できません。');
    toast('現在地を取得しています…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.anchor = [pos.coords.latitude, pos.coords.longitude];
        selectCell(Cell.cellAt(pos.coords.latitude, pos.coords.longitude, state.level));
      },
      (err) => {
        const msg = { 1: '位置情報の利用が許可されていません。ブラウザの設定で許可するか、地図をタップしてください。', 2: '現在地を特定できませんでした。地図をタップしてください。', 3: '現在地の取得に時間がかかっています。地図をタップしてください。' }[err.code];
        showCellMsg(msg || '現在地を取得できませんでした。');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  // ---------- 2. 候補を探す ----------
  const STEPS = [
    ['osm', '地図データを取得中'],
    ['wiki', 'Wikipedia・Wikidata の情報を取得中'],
    ['place', '地名を取得中'],
    ['classify', '候補を分類中'],
    ['dedupe', '重複を整理中'],
    ['cell', 'セル内外を判定中'],
    ['assess', '申請候補を整理中'],
  ];
  const STEP_DONE = { osm: '地図データを取得', wiki: 'Wikipedia・Wikidata の情報を取得', place: '地名を取得', classify: '候補を分類', dedupe: '重複を整理', cell: 'セル内外を判定', assess: '申請候補を整理' };

  function setStep(key, status, note) {
    const li = $(`#progress li[data-k="${key}"]`);
    if (!li) return;
    li.className = status;
    const base = status === 'running' ? STEPS.find((s) => s[0] === key)[1] : STEP_DONE[key];
    li.textContent = base + (note ? `（${note}）` : '');
  }

  function updateSearchButton() {
    const b = $('#btn-search');
    b.disabled = !state.cell || state.searching;
    b.innerHTML = state.searching ? '探しています…' : `<span class="num">2</span>${state.project && state.project.fetchedAt ? 'もう一度探す（最新データを取得）' : '候補を探す'}`;
  }

  function showSearchMsg(tone, html) {
    const box = $('#search-msg');
    box.hidden = !html;
    box.className = 'msg-box ' + (tone || '');
    box.innerHTML = html || '';
  }

  function newProject(c) {
    return { token: c.token, level: c.level, decimal: c.decimal, center: c.center, createdAt: new Date().toISOString(), fetchedAt: null, area: null, sources: {}, candidates: [], context: { parks: [], schools: [], enclosing: [] }, userCandidates: [], drafts: {}, checklist: {} };
  }

  async function runSearch() {
    const c = state.cell;
    if (!c || state.searching) return;
    if (c.level < Cell.SEARCH_MIN_LEVEL) {
      return showSearchMsg('warn', `<p>L${c.level}のセルは範囲が広すぎるため検索しません（公開サーバーに大きな負荷がかかるため）。L14かL17を選んでください。</p>`);
    }
    const prev = state.project;
    if (prev && prev.fetchedAt && Date.now() - new Date(prev.fetchedAt).getTime() < REFETCH_COOLDOWN_MS) {
      const sec = Math.ceil((REFETCH_COOLDOWN_MS - (Date.now() - new Date(prev.fetchedAt).getTime())) / 1000);
      return showSearchMsg('', `<p>このセルは直前に取得したばかりです。公開サーバーへの負担を減らすため、${sec}秒後に再取得できます。いまの結果はそのまま使えます。</p>`);
    }
    state.searching = true;
    updateSearchButton();
    showSearchMsg('', '');
    const prog = $('#progress');
    prog.hidden = false;
    prog.innerHTML = STEPS.map(([k, t]) => `<li data-k="${k}">${esc(t.replace(/中$/, ''))}</li>`).join('');

    const bounds = Cell.searchBounds(c, 30); // 境界付近の物も拾うため、セルより30m広く探す
    const srcStatus = {};
    const now = new Date().toISOString();
    let osm = null, wikipedia = null, wikidata = null, area = prev && prev.area;
    try {
      setStep('osm', 'running');
      await nextFrame();
      try {
        osm = await Src.fetchOsm(bounds, c.center);
        srcStatus.osm = { status: osm.partial ? 'partial' : 'ok', count: osm.elements.length, at: now, message: osm.partial ? Src.errorMessage('partial', 'osm') : '' };
        setStep('osm', osm.partial ? 'failed' : 'done', osm.partial ? '一部のみ' : `${osm.elements.length}件`);
      } catch (e) {
        srcStatus.osm = { status: 'fail', at: now, message: e.userMessage || String(e) };
        setStep('osm', 'failed', '失敗');
      }

      setStep('wiki', 'running');
      setStep('place', 'running');
      await nextFrame();
      const ids = osm ? [...new Set(osm.elements.map((el) => el.tags && el.tags.wikidata).filter((q) => /^Q\d+$/.test(q || '')))] : [];
      const [wp, wd, pl] = await Promise.allSettled([Src.fetchWikipedia(bounds), Src.fetchWikidata(bounds, ids.slice(0, 50)), Src.fetchPlaceName(c.center[0], c.center[1])]);
      if (wp.status === 'fulfilled') { wikipedia = wp.value; srcStatus.wikipedia = { status: 'ok', count: wikipedia.length, at: now }; } else srcStatus.wikipedia = { status: 'fail', at: now, message: wp.reason.userMessage || String(wp.reason) };
      if (wd.status === 'fulfilled') { wikidata = wd.value; srcStatus.wikidata = { status: 'ok', count: wikidata.length, at: now }; } else srcStatus.wikidata = { status: 'fail', at: now, message: wd.reason.userMessage || String(wd.reason) };
      setStep('wiki', wp.status === 'fulfilled' && wd.status === 'fulfilled' ? 'done' : 'failed', wp.status === 'fulfilled' || wd.status === 'fulfilled' ? (wp.status === wd.status ? '' : '一部失敗') : '失敗');
      if (pl.status === 'fulfilled') { area = pl.value; srcStatus.nominatim = { status: 'ok', at: now }; setStep('place', 'done', area.label || ''); } else { srcStatus.nominatim = { status: 'fail', at: now, message: pl.reason.userMessage || String(pl.reason) }; setStep('place', 'failed', '失敗'); }

      if (!osm && !wikipedia && !wikidata) {
        ['classify', 'dedupe', 'cell', 'assess'].forEach((k) => setStep(k, 'skipped'));
        const msg = srcStatus.osm.message;
        showSearchMsg('bad', `<p><b>検索に失敗しました。</b>候補がないという意味ではありません。</p><p>${esc(msg)}</p>${prev && prev.fetchedAt ? `<p>前回（${fmtDate(prev.fetchedAt)}）取得した結果を表示しています。</p>` : ''}`);
        $('#search-msg').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      setStep('classify', 'running');
      await nextFrame();
      const fromOsm = osm ? Cand.fromOsm(osm.elements, c.center) : { candidates: [], context: { parks: [], schools: [], enclosing: [] } };
      setStep('classify', 'done', `${fromOsm.candidates.length}件`);

      setStep('dedupe', 'running');
      await nextFrame();
      let list = Cand.dedupe(fromOsm.candidates);
      const merged = fromOsm.candidates.length - list.length;
      list = Cand.attachWiki(list, wikipedia || [], wikidata || []);
      setStep('dedupe', 'done', merged ? `${merged}件をまとめました` : '重複なし');

      const context = { parks: fromOsm.context.parks, schools: fromOsm.context.schools, enclosing: fromOsm.context.enclosing.map(({ tags, ...rest }) => rest) };
      const project = prev || newProject(c);
      const all = list.concat(project.userCandidates || []);
      setStep('cell', 'running');
      await nextFrame();
      Cand.attachContainment(all, context);
      Cand.locate(all, c);
      setStep('cell', 'done', `セル内 ${all.filter((x) => x.inCell).length}件`);

      setStep('assess', 'running');
      await nextFrame();
      Cand.assess(all, c, context, { existing: state.existing });
      setStep('assess', 'done');

      Object.assign(project, { level: c.level, fetchedAt: now, area, sources: srcStatus, candidates: all, context });
      state.project = project;
      persist();

      const inCell = all.filter((x) => x.inCell).length;
      const notes = [];
      if (!osm) notes.push(`<p><b>地図データを取得できなかったため、結果は百科事典の情報だけです。</b>${esc(srcStatus.osm.message)}</p>`);
      else if (osm.partial) notes.push(`<p>${esc(srcStatus.osm.message)}</p>`);
      if (osm && !osm.partial && inCell === 0) notes.push('<p>公開地図データには、このセル内の候補が登録されていませんでした。データに未登録の物が現地にある可能性があります。見つけた物は地図の「候補を追加」から登録できます。</p>');
      else notes.push(`<p>セル内の候補が <b>${inCell}件</b> 見つかりました。下の一覧から確認してください。</p>`);
      showSearchMsg(osm && !osm.partial ? 'good' : 'warn', notes.join(''));
      renderCellInfo();
      renderResults();
      if (state.map) state.map.fitBounds(L.latLngBounds(c.vertices), { padding: [30, 30], maxZoom: 18 });
      $('#sec-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      state.searching = false;
      updateSearchButton();
      updateSteps();
    }
  }

  // ---------- 3. 候補の一覧 ----------
  function miniSvg(c, cand, size) {
    const o = c.center;
    const pts = c.vertices.map((v) => PSF.geo.toLocal(o, v));
    const p = PSF.geo.toLocal(o, [cand.lat, cand.lng]);
    const all = pts.concat([p]);
    const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const pad = span * 0.12;
    const sc = (size - 2) / (span + pad * 2);
    const tx = (q) => [((q[0] - minX + pad) * sc + 1).toFixed(1), ((maxY - q[1] + pad) * sc + 1).toFixed(1)];
    const poly = pts.map((q) => tx(q).join(',')).join(' ');
    const [px, py] = tx(p);
    const tone = TONE_COLOR[Cand.STATUS[cand.eval.status].tone];
    const fuzzy = !Cand.precise(cand);
    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="セルと候補の位置"><polygon points="${poly}" fill="rgba(15,118,110,.10)" stroke="#0f766e" stroke-width="1.5"/>${fuzzy ? `<circle cx="${px}" cy="${py}" r="${size / 7}" fill="none" stroke="${tone}" stroke-dasharray="3 2"/>` : ''}<circle cx="${px}" cy="${py}" r="${size / 16 + 1}" fill="${tone}" stroke="#fff" stroke-width="1.5"/></svg>`;
  }

  function evidenceBadges(cand) {
    const t = new Set(cand.sources.map((s) => s.type));
    const mk = (on, label) => `<span class="${on ? 'y' : ''}">${on ? '✓' : '－'}${label}</span>`;
    return `<div class="evi" aria-label="根拠情報">${mk(t.has('osm'), '地図')}${mk(t.has('wikipedia'), 'Wikipedia')}${mk(t.has('wikidata'), 'Wikidata')}${t.has('user') ? mk(true, '自分で確認') : ''}</div>`;
  }

  const CELL_LABEL = { in: 'セル内', edge: '境界付近', partial: '一部セル内', out: 'セル外' };

  function renderResults() {
    const sec = $('#sec-results');
    const p = state.project;
    if (!p || (!p.fetchedAt && !(p.userCandidates || []).length)) { sec.hidden = true; drawCandidates(); drawExisting(); return; }
    sec.hidden = false;
    renderSources();
    const list = p.candidates || [];
    const chips = Object.entries(Cand.FILTERS).map(([k, f]) => {
      const n = list.filter(f.test).length;
      return `<button type="button" class="chip ${state.filter === k ? 'on' : ''}" data-f="${k}" role="tab" aria-selected="${state.filter === k}">${esc(f.label)}<b>${n}</b></button>`;
    });
    $('#filters').innerHTML = chips.join('');
    const shown = list.filter(Cand.FILTERS[state.filter].test);
    const cards = $('#cards');
    if (!shown.length) {
      const empty = state.filter === 'priority'
        ? (list.length ? 'セル内で優先して確認できる候補はありません。「すべて」で他の候補も確認できます。' : '候補はありません。')
        : 'この条件に当てはまる候補はありません。';
      cards.innerHTML = `<div class="empty">${empty}</div>`;
    } else {
      cards.innerHTML = shown.map((c) => {
        const st = Cand.STATUS[c.eval.status];
        const cat = Cand.CATEGORIES[c.cat];
        const badges = [`<span class="badge ${st.tone}">${st.mark} ${st.label}</span>`];
        if (c.eval.status !== 'out') badges.push(`<span class="badge ${c.cellStatus === 'in' ? '' : 'warn'}">${CELL_LABEL[c.cellStatus]}</span>`);
        if (c.eval.dupWith.length) badges.push('<span class="badge warn">重複の可能性</span>');
        if (p.drafts && p.drafts[c.id]) badges.push('<span class="badge info">下書きあり</span>');
        const where = c.insideOf.length ? `・${esc(c.insideOf[0].name)}内` : '';
        const l17 = state.cell.level < 17 ? `・L17 ${esc(c.l17)}` : '';
        return `<article class="cand tone-${st.tone}" data-id="${esc(c.id)}" tabindex="0">
          <div class="thumb">${miniSvg(state.cell, c, 64)}</div>
          <div><div class="badges">${badges.join('')}</div><h3>${cat.icon} ${esc(c.name || '【名称未確認】')}</h3></div>
          <div><div class="meta">${esc(c.kind)}${where}${l17}</div>${evidenceBadges(c)}</div>
          <div class="row-actions"><span class="muted">詳しく見る ›</span><button type="button" class="btn primary small" data-assist="${esc(c.id)}">申請文を作る</button></div>
        </article>`;
      }).join('');
    }
    drawCandidates();
    drawExisting();
  }

  function renderSources() {
    const p = state.project;
    const s = p.sources || {};
    const row = (key, label) => {
      const v = s[key];
      if (!v) return `<div class="src-row none"><span class="st">未実行</span><span>${esc(label)}</span></div>`;
      if (v.status === 'ok') return `<div class="src-row ok"><span class="st">成功</span><span>${esc(label)}${v.count != null ? `：${v.count}件` : ''}</span></div>`;
      if (v.status === 'partial') return `<div class="src-row partial"><span class="st">一部のみ</span><span>${esc(label)}：${esc(v.message)}</span></div>`;
      return `<div class="src-row fail"><span class="st">失敗</span><span>${esc(label)}：${esc(v.message)}</span></div>`;
    };
    const ex = state.existing.length;
    $('#sources').innerHTML = `
      ${p.fetchedAt ? `<div class="muted">取得日時: ${fmtDate(p.fetchedAt)}（この端末に保存済み）</div>` : '<div class="muted">まだ検索していません。「候補を探す」を押してください。</div>'}
      ${row('osm', '公開地図データ')}
      ${row('wikipedia', 'Wikipedia')}
      ${row('wikidata', 'Wikidata')}
      <details class="more"><summary class="muted">自動では調べていない情報源</summary>
        <div class="src-row none"><span class="st">未検索</span><span>自治体の文化財情報（各候補の詳細にある検索リンクから確認できます）</span></div>
        <div class="src-row none"><span class="st">未検索</span><span>施設の公式案内・現地の掲示（ウェブ検索や現地で確認してください）</span></div>
        <div class="src-row none"><span class="st">未実施</span><span>現地確認（このアプリでは確認できません）</span></div>
        <div class="src-row ${ex ? 'ok' : 'none'}"><span class="st">${ex ? '手動' : '未登録'}</span><span>既存のポケストップ・ジム（公開データがないため、地図の「既存スポット登録」で手動登録：${ex}件）</span></div>
        <p class="muted" style="margin:6px 0 0">公開地図データに登録されていない物は見つかりません。ここに出た候補がすべてではありません。</p>
      </details>`;
  }

  // ---------- シート（詳細・申請文・メニュー） ----------
  function openSheet(kind, title, html) {
    const wasOpen = !!state.sheet;
    state.sheet = kind;
    $('#sheet-title').textContent = title;
    $('#sheet-content').innerHTML = html;
    $('#sheet-content').scrollTop = 0;
    $('#sheet').hidden = false;
    document.body.style.overflow = 'hidden';
    if (!wasOpen) history.pushState({ sheet: true }, '');
    $('.sheet-head [data-close]').focus();
    updateSteps();
  }
  function hideSheet() {
    state.sheet = null;
    $('#sheet').hidden = true;
    document.body.style.overflow = '';
    updateSteps();
  }
  function closeSheet() {
    if (history.state && history.state.sheet) history.back();
    else hideSheet();
  }

  function findCand(id) {
    return state.project && state.project.candidates.find((c) => c.id === id);
  }

  function openDetail(id) {
    const c = findCand(id);
    if (!c) return;
    const st = Cand.STATUS[c.eval.status];
    const facts = c.facts.filter((f) => !f.referenceOnly);
    const extract = c.facts.find((f) => f.key === 'wp_extract');
    const img = c.links.image;
    const links = Writer.generate(c, assistContext(c)).searchLinks;
    const list = (arr) => (arr.length ? `<ul>${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">なし</p>');
    const html = `
      <div class="block">
        <div class="badges"><span class="badge ${st.tone}">${st.mark} ${st.label}</span><span class="badge">${CELL_LABEL[c.cellStatus]}</span>${c.eval.dupWith.length ? '<span class="badge warn">重複の可能性</span>' : ''}</div>
        <h3 style="font-size:1.15rem;margin:6px 0 2px">${Cand.CATEGORIES[c.cat].icon} ${esc(c.name || '【名称未確認】')}</h3>
        <div class="muted">${esc(c.kind)}${c.insideOf.length ? `・${esc(c.insideOf[0].name)}内` : ''}</div>
        <div class="actions"><button type="button" class="btn primary" data-assist="${esc(c.id)}">申請文を作る</button><button type="button" class="btn" data-show-map="${esc(c.id)}">地図で見る</button></div>
      </div>
      ${c.eval.concerns.length ? `<div class="block"><h3>✕ 申請上の懸念</h3>${list(c.eval.concerns)}</div>` : ''}
      <div class="block"><h3>評価の理由</h3>${list(c.eval.reasons)}</div>
      ${c.eval.onsite.length ? `<div class="block"><h3>△ 現地で確認が必要なこと</h3>${list(c.eval.onsite)}</div>` : ''}
      ${c.eval.dupWith.length ? `<div class="block"><h3>近くにある別の候補（20m以内）</h3>${list(c.eval.dupWith.map((d) => `${d.name || '名称未確認'}（約${d.d}m）：同じ物の重複登録か、近すぎる可能性があります`))}</div>` : ''}
      ${c.eval.sameL17 ? `<div class="block"><h3>同じL17セルの候補</h3><p style="margin:0">このL17セル（${esc(c.l17)}）には他に${c.eval.sameL17}件の候補があります。1つのL17セルでポケストップになるのは通常1か所だけとされています（利用者間で知られている傾向で、公式発表ではありません）。</p></div>` : ''}
      <div class="block"><h3>確認できた情報</h3>${facts.length ? `<dl class="facts">${facts.map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl>` : '<p class="muted" style="margin:0">名称と分類以外の情報は公開データにありません。</p>'}
        ${extract ? `<details class="more" style="margin-top:8px"><summary>Wikipediaの要約（参考）</summary><p style="margin:4px 0">${esc(extract.value)}</p><p class="ref-note">Wikipediaの文章は利用条件（CC BY-SA）があるため、申請文には自動で転載していません。内容は自分の言葉で確認・記述してください。</p></details>` : ''}
      </div>
      <div class="block big-svg"><h3>位置</h3>${miniSvg(state.cell, c, 200)}
        <dl class="facts" style="margin-top:8px"><dt>緯度・経度</dt><dd>${c.lat.toFixed(7)}, ${c.lng.toFixed(7)} <button type="button" class="btn ghost small" data-copy-pos="${esc(c.id)}">コピー</button></dd>
        <dt>位置の種類</dt><dd>${esc({ point: '個別の地点（地図データ）', area: '区域の中心（推定）', line: '線の中央（推定）', enclosing: '未確定（セル中心を表示）', reference: '百科事典の参考座標', user: '自分で指定した地点' }[c.posKind])}</dd>
        <dt>境界までの距離</dt><dd>約${c.edgeDistM}m</dd><dt>L17セル</dt><dd>${esc(c.l17)}</dd></dl></div>
      ${img ? `<div class="block ref-photo"><h3>参考写真（申請用ではありません）</h3><img loading="lazy" alt="${esc(c.name || c.kind)}の参考写真" src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img)}?width=480"><p class="ref-note">Wikimedia Commons の画像です（表示時に画像を取得します）。申請には自分で撮影した写真を使ってください。</p></div>` : ''}
      <div class="block"><h3>情報源</h3><ul>${c.sources.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}</li>`).join('')}${links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul></div>
      ${c.userAdded ? `<div class="actions"><button type="button" class="btn danger" data-del-user="${esc(c.id)}">この候補を削除</button></div>` : ''}`;
    openSheet('detail', c.name || c.kind, html);
  }

  function assistContext(c) {
    const p = state.project;
    const contents = c.cat === 'park' ? p.candidates.filter((x) => x.name && x.insideOf.some((pk) => pk.id === c.id || (c.mergedFrom || []).includes(pk.id))) : [];
    return { area: p.area, contents };
  }

  function getDraft(c, regenerate) {
    const p = state.project;
    p.drafts = p.drafts || {};
    let d = p.drafts[c.id];
    if (!d || regenerate) {
      const variant = d ? (d.generated.variant || 0) + 1 : 0;
      d = { generated: Writer.generate(c, Object.assign(assistContext(c), { variant })), edited: null };
      p.drafts[c.id] = d;
      persist();
    }
    return d;
  }

  function currentTexts(d) {
    return Object.assign({ title: d.generated.title, description: d.generated.description, support: d.generated.support }, d.edited || {});
  }

  function defaultChecklist(c) {
    const s = {};
    if (c.eval.onsite.length || !Cand.precise(c)) s.position = 'need';
    if (c.eval.concerns.length) s.criteria = 'need';
    if (c.eval.dupWith.length || c.eval.sameL17) s.existing = 'need';
    if (!c.name) s.text = 'need';
    return s;
  }

  function openAssist(id) {
    const c = findCand(id);
    if (!c) return;
    const d = getDraft(c);
    const p = state.project;
    p.checklist = p.checklist || {};
    if (!p.checklist[c.id]) { p.checklist[c.id] = defaultChecklist(c); persist(); }
    const t = currentTexts(d);
    const g = d.generated;
    const field = (key, label, rows) => `
      <div class="field">
        <div class="field-head"><label for="f-${key}">${label}</label><span class="count" data-count="${key}"></span><button type="button" class="btn small" data-copy-field="${key}">コピー</button></div>
        <textarea id="f-${key}" data-field="${key}" rows="${rows}">${esc(t[key])}</textarea>
      </div>`;
    const evidence = (parts) => parts.map((pt) => `<li>${esc(pt.text)}<br><span class="src">根拠: ${esc(pt.srcs.map(srcLabel(c)).join('、') || 'なし')}</span></li>`).join('');
    const html = `
      <div id="ready" class="ready"></div>
      <div class="block">
        <h3>${Cand.CATEGORIES[c.cat].icon} ${esc(c.name || '【名称未確認】')}<span class="muted">（${esc(c.kind)}）</span></h3>
        ${field('title', 'タイトル', 2)}
        ${field('description', '説明文', 5)}
        ${field('support', '補助文', 7)}
        <p class="ref-note">文字数の上限は公式の申請画面で確認してください（このアプリでは上限を決めていません）。</p>
        <div class="actions">
          <button type="button" class="btn primary" id="btn-copy-all">3つまとめてコピー</button>
          <button type="button" class="btn" id="btn-regen">文章を再生成</button>
          <button type="button" class="btn" id="btn-revert">元の文章に戻す</button>
          <button type="button" class="btn" id="btn-save">保存</button>
        </div>
        <p class="muted" id="save-state" style="margin:6px 0 0"></p>
      </div>
      <div class="block"><h3>文章のチェック</h3><ul class="issues" id="issues"></ul></div>
      <div class="block"><h3>申請前の確認</h3><div id="checklist"></div></div>
      <div class="block"><h3>申請の根拠</h3><ul>${g.basis.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>
      <div class="block"><h3>現地で確認する事項</h3><ul>${g.onsite.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>
      <div class="block"><h3>申請に使える情報源</h3><ul>${g.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('')}${g.searchLinks.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('')}</ul>
        <p class="muted" style="margin:6px 0 0">申請位置: ${c.lat.toFixed(7)}, ${c.lng.toFixed(7)} <button type="button" class="btn ghost small" data-copy-pos="${esc(c.id)}">コピー</button></p></div>
      <div class="block"><details class="more"><summary>文章の根拠を見る</summary>
        <h3 style="margin-top:8px">説明文</h3><ul class="evidence">${evidence(g.evidence.description)}</ul>
        <h3 style="margin-top:8px">補助文</h3><ul class="evidence">${evidence(g.evidence.support)}</ul>
        <p class="ref-note">生成日時: ${fmtDate(g.generatedAt)}。編集した文章の根拠は自分で確認してください。</p></details></div>
      <div class="block"><details class="more"><summary>AIで文章を整える（任意）</summary>
        <p style="margin:6px 0">このアプリはAIを使わずに文章を作っています。お使いのAIサービスで整えたい場合は、事実の追加を禁じる指示つきの文をコピーして貼り付けてください。このアプリから外部には送信しません。有料のAIサービスでは利用料がかかる場合があります。</p>
        <button type="button" class="btn small" id="btn-ai">AIに渡す指示文をコピー</button></details></div>
      <div class="actions"><button type="button" class="btn" id="btn-export-cell">このセルの結果をCSVで保存</button></div>`;
    openSheet('assist', '申請文を作る', html);
    bindAssist(c);
  }

  function srcLabel(c) {
    return (id) => {
      if (id === 'category') return '分類からの説明（事実ではなく分類の性質）';
      if (id === 'pending') return '申請前の確認メモ';
      if (id === 'nominatim') return '地名（OpenStreetMap Nominatim）';
      if (id === 'user') return '自分で追加した情報';
      const s = c.sources.find((x) => x.id === id);
      if (s) return s.label;
      const pk = c.insideOf.find((x) => x.id === id);
      if (pk) return `${pk.name}（OpenStreetMap）`;
      return id;
    };
  }

  function bindAssist(c) {
    const p = state.project;
    const d = p.drafts[c.id];
    const root = $('#sheet-content');
    const read = () => ({ title: $('#f-title').value, description: $('#f-description').value, support: $('#f-support').value });
    let saveTimer = null;

    const refresh = () => {
      const t = read();
      for (const k of ['title', 'description', 'support']) $(`[data-count="${k}"]`, root).textContent = `${t[k].length}文字`;
      const others = p.candidates.filter((x) => x.id !== c.id && p.drafts[x.id]).map((x) => ({ name: x.name, description: currentTexts(p.drafts[x.id]).description }));
      const issues = Writer.check(c, t, others);
      $('#issues').innerHTML = issues.length
        ? issues.map((i) => `<li class="${i.level}">${{ error: '✕', warn: '⚠', info: 'ℹ' }[i.level]} ${esc(i.message)}</li>`).join('')
        : '<li class="ok">✓ 気になる点は見つかりませんでした。最終的な内容は自分で確認してください。</li>';
      renderReady(c, issues);
    };
    const saveNow = (explicit) => {
      const t = read();
      const g = d.generated;
      const changed = t.title !== g.title || t.description !== g.description || t.support !== g.support;
      d.edited = changed ? t : null;
      d.savedAt = new Date().toISOString();
      const ok = persist();
      $('#save-state').textContent = ok ? `この端末に保存済み（${fmtDate(d.savedAt)}）${changed ? '・編集あり' : ''}` : '保存できませんでした';
      if (explicit && ok) toast('保存しました');
    };
    root.addEventListener('input', (e) => {
      if (!e.target.dataset.field) return;
      refresh();
      $('#save-state').textContent = '保存しています…';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveNow(false), 500);
    });
    $$('[data-copy-field]', root).forEach((b) => {
      b.onclick = () => copyText(read()[b.dataset.copyField], { title: 'タイトル', description: '説明文', support: '補助文' }[b.dataset.copyField]);
    });
    $('#btn-copy-all').onclick = () => {
      const t = read();
      copyText(`【タイトル】\n${t.title}\n\n【説明文】\n${t.description}\n\n【補助文】\n${t.support}`, '3つの文章');
    };
    $('#btn-regen').onclick = () => {
      if (d.edited && !confirm('編集した内容は失われます。文章を作り直しますか？')) return;
      getDraft(c, true);
      openAssistInPlace(c.id);
      toast('文章を作り直しました');
    };
    $('#btn-revert').onclick = () => {
      if (!d.edited) return toast('編集はされていません');
      if (!confirm('編集した内容を取り消して、作成時の文章に戻しますか？')) return;
      d.edited = null;
      persist();
      openAssistInPlace(c.id);
      toast('元の文章に戻しました');
    };
    $('#btn-save').onclick = () => { clearTimeout(saveTimer); saveNow(true); };
    $('#btn-ai').onclick = () => copyText(Writer.aiPrompt(c, read()), 'AIへの指示文');
    $('#btn-export-cell').onclick = () => exportCsv([p]);
    renderChecklist(c, refresh);
    $('#save-state').textContent = d.savedAt ? `この端末に保存済み（${fmtDate(d.savedAt)}）${d.edited ? '・編集あり' : ''}` : 'この端末に保存済み';
    refresh();
  }

  function openAssistInPlace(id) {
    const top = $('#sheet-content').scrollTop;
    openAssist(id);
    $('#sheet-content').scrollTop = top;
  }

  function renderChecklist(c, onChange) {
    const p = state.project;
    const ck = p.checklist[c.id];
    const box = $('#checklist');
    box.innerHTML = Store.CHECK_ITEMS.map((it) => {
      const v = ck[it.key] || 'unchecked';
      return `<div class="check-item"><div class="lbl">${esc(it.label)}</div><div class="check-seg" role="radiogroup" aria-label="${esc(it.label)}">${Object.entries(Store.CHECK_STATES).map(([k, s]) => `<button type="button" role="radio" aria-checked="${v === k}" class="${v === k ? 'on' : ''}" data-ck="${it.key}" data-v="${k}">${s.label}</button>`).join('')}</div></div>`;
    }).join('');
    box.onclick = (e) => {
      const b = e.target.closest('[data-ck]');
      if (!b) return;
      ck[b.dataset.ck] = b.dataset.v;
      persist();
      $$(`[data-ck="${b.dataset.ck}"]`, box).forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      onChange();
    };
  }

  function renderReady(c, issues) {
    const ck = state.project.checklist[c.id] || {};
    const pending = Store.CHECK_ITEMS.filter((it) => !['ok', 'na'].includes(ck[it.key] || 'unchecked'));
    const errs = issues.filter((i) => i.level === 'error' || i.level === 'warn');
    const box = $('#ready');
    if (!pending.length && !errs.length) {
      box.className = 'ready ok';
      box.innerHTML = '<b>✓ 申請の準備ができています。</b>公式の申請画面で内容を確認してから申請してください（このアプリから申請は送信しません）。';
    } else {
      box.className = 'ready ng';
      const parts = [];
      if (pending.length) parts.push(`未確認の項目 ${pending.length}件（${pending.slice(0, 3).map((x) => x.label).join('、')}${pending.length > 3 ? 'など' : ''}）`);
      if (errs.length) parts.push(`文章の指摘 ${errs.length}件`);
      box.innerHTML = `<b>申請の準備はまだです。</b>${esc(parts.join('／'))}`;
    }
  }

  // ---------- 候補の手動追加・既存スポット ----------
  function ensureProject() {
    if (!state.project) state.project = newProject(state.cell);
    return state.project;
  }

  function reassess() {
    const p = state.project;
    if (!p) return;
    p.candidates = Cand.refresh(state.cell, p.candidates || [], p.context || { parks: [], schools: [], enclosing: [] }, { existing: state.existing, userCandidates: p.userCandidates || [] });
    persist();
  }

  function openAddForm(lat, lng) {
    if (!state.cell) {
      state.anchor = [lat, lng];
      selectCell(Cell.cellAt(lat, lng, state.level), { fit: false });
    }
    const opts = Object.entries(Cand.CATEGORIES).filter(([k]) => k !== 'reference').map(([k, v]) => `<option value="${k}">${v.icon} ${esc(v.label)}</option>`).join('');
    openSheet('form', '候補を追加', `
      <form class="block form-grid" id="add-form">
        <p style="margin:0" class="muted">位置: ${lat.toFixed(6)}, ${lng.toFixed(6)}（地図でタップした地点）</p>
        <label>名称（銘板などで確認したもの）<input type="text" name="name" placeholder="例: ○○記念碑" required></label>
        <label>分類<select name="cat">${opts}</select></label>
        <label>種類（任意）<input type="text" name="kind" placeholder="例: 石碑、案内板"></label>
        <label>メモ（現地で確認した内容。説明文に使われます）<textarea name="memo" rows="3"></textarea></label>
        <button class="btn primary" type="submit">追加する</button>
      </form>`);
    $('#add-form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const p = ensureProject();
      const u = Cand.userCandidate({ name: String(f.get('name')).trim(), cat: f.get('cat'), kind: String(f.get('kind') || '').trim() || undefined, memo: String(f.get('memo') || '').trim(), lat, lng });
      p.userCandidates = (p.userCandidates || []).concat(u);
      reassess();
      setMode('cell');
      closeSheet();
      renderResults();
      updateSteps();
      toast('候補を追加しました');
    };
  }

  function openExistingForm(lat, lng) {
    openSheet('form', '既存スポットを登録', `
      <form class="block form-grid" id="ex-form">
        <p style="margin:0" class="muted">位置: ${lat.toFixed(6)}, ${lng.toFixed(6)}。ゲーム内にすでにあるポケストップ・ジムを登録すると、同じL17セルや20m以内の候補に注意を表示します。</p>
        <label>名前（任意）<input type="text" name="label" placeholder="例: ○○公園の看板"></label>
        <label>種類<select name="kind"><option value="stop">ポケストップ</option><option value="gym">ジム</option></select></label>
        <button class="btn primary" type="submit">登録する</button>
      </form>`);
    $('#ex-form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      state.existing = state.existing.concat({ id: 'ex' + Date.now().toString(36), lat, lng, label: String(f.get('label') || '').trim(), kind: f.get('kind'), l17: Cell.tokenAt(lat, lng, 17) });
      const r = store.saveExisting(state.existing);
      if (!r.ok) toast(r.message);
      reassess();
      setMode('cell');
      closeSheet();
      drawCell();
      renderResults();
      toast('既存スポットを登録しました');
    };
  }

  // ---------- 履歴・データ ----------
  function exportCsv(projects) {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`stop-candidates-${projects.length === 1 ? projects[0].token : 'all'}-${stamp}.csv`, Store.toCsv(projects), 'text/csv;charset=utf-8');
    toast('CSVを保存しました');
  }

  function openMenu() {
    const hist = store.history();
    const html = `
      <div class="block"><h3>検索の履歴</h3>
        ${hist.length ? `<div>${hist.map((h) => `<div class="hist-item"><div class="grow"><div><b>${esc(h.token)}</b>（L${h.level}）${h.area ? esc(h.area.label || '') : ''}</div><div class="muted">${fmtDate(h.updatedAt)}・セル内 ${h.count}件</div></div><button type="button" class="btn small" data-open="${esc(h.token)}">開く</button><button type="button" class="btn ghost small danger" data-del="${esc(h.token)}" aria-label="削除">削除</button></div>`).join('')}</div>` : '<p class="muted" style="margin:0">まだ履歴はありません。</p>'}
      </div>
      <div class="block"><h3>登録した既存スポット（${state.existing.length}件）</h3>
        ${state.existing.length ? state.existing.map((e) => `<div class="hist-item"><div class="grow"><div>${esc(e.label || '名前なし')}（${e.kind === 'gym' ? 'ジム' : 'ポケストップ'}）</div><div class="muted">${e.lat.toFixed(6)}, ${e.lng.toFixed(6)}</div></div><button type="button" class="btn ghost small danger" data-del-ex="${esc(e.id)}">削除</button></div>`).join('') : '<p class="muted" style="margin:0">地図の「既存スポット登録」を選んで、地図をタップすると登録できます。</p>'}
      </div>
      <div class="block"><h3>出力・バックアップ</h3>
        <div class="actions">
          <button type="button" class="btn" id="m-csv-all">すべてCSVで保存</button>
          <button type="button" class="btn" id="m-json">バックアップ（JSON）を保存</button>
          <label class="btn" style="cursor:pointer">バックアップを読み込む<input type="file" id="m-import" accept="application/json,.json" hidden></label>
        </div>
        <p class="muted" style="margin:6px 0 0">${store.persistent ? 'データはこのブラウザの中に保存されています。ブラウザのデータを消すと失われるため、ときどきバックアップを保存してください。' : 'このブラウザでは保存領域を使えないため、ページを閉じるとデータが消えます。バックアップを保存してください。'}</p>
      </div>
      <div class="block"><details class="more"><summary>このアプリについて（無料の範囲・送信先・出典）</summary>
        <ul>
          <li>利用料はかかりません。APIキー・登録は不要です。有料サービスへの自動切り替えはしません。</li>
          <li>候補の検索は1回につき、公開地図データ（Overpass API）・Wikipedia・Wikidata・地名（Nominatim）にそれぞれ1回問い合わせます。送るのは検索範囲の座標だけです。</li>
          <li>公開サーバーは無料のぶん混雑や利用制限があります。失敗したときは自動で何度も再試行せず、取得済みのデータを使い続けられます。同じセルの再取得は1分あけてください。</li>
          <li>地図の画像は OpenStreetMap のタイルを表示時に取得します。参考写真は詳細を開いたときだけ Wikimedia Commons から取得します。</li>
          <li>申請文・メモ・確認状況は外部に送信しません。申請の送信もしません。</li>
          <li>セルの計算はこの端末内で行います（S2ライブラリ s2js を同梱）。</li>
          <li>地図データ © OpenStreetMap contributors（ODbL）。Wikidata（CC0）、Wikipedia（CC BY-SA）。</li>
          <li>申請基準に関する判定は公式基準の要旨と利用者間で知られている傾向に基づく目安です。最終判断は公式の基準を確認してください。</li>
        </ul></details></div>
      <div class="actions"><button type="button" class="btn danger" id="m-wipe">すべてのデータを削除</button></div>`;
    openSheet('menu', '履歴・データ', html);
    const root = $('#sheet-content');
    root.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => {
      const p = store.project(b.dataset.open);
      closeSheet();
      if (p) { state.anchor = null; selectCell(Cell.fromToken(p.token)); }
    }));
    root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
      if (!confirm('この履歴（候補・申請文・確認状況）を削除しますか？')) return;
      store.deleteProject(b.dataset.del);
      if (state.cell && state.cell.token === b.dataset.del) { state.project = null; renderResults(); updateSearchButton(); }
      openMenu();
    }));
    root.querySelectorAll('[data-del-ex]').forEach((b) => (b.onclick = () => {
      state.existing = state.existing.filter((e) => e.id !== b.dataset.delEx);
      store.saveExisting(state.existing);
      reassess();
      drawCell();
      renderResults();
      openMenu();
    }));
    $('#m-csv-all').onclick = () => {
      const all = Object.values(store.projects());
      if (!all.length) return toast('保存されたデータがありません');
      exportCsv(all);
    };
    $('#m-json').onclick = () => {
      download(`stop-candidates-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.backup(), null, 1), 'application/json');
      toast('バックアップを保存しました');
    };
    $('#m-import').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      let data = null;
      try { data = JSON.parse(await file.text()); } catch (err) { return toast('ファイルを読み込めませんでした（JSON形式ではありません）'); }
      const r = store.restore(data);
      if (!r.ok) return toast(r.message);
      state.existing = store.existing();
      if (state.cell) { state.project = store.project(state.cell.token); renderResults(); }
      toast(`読み込みました（${r.added}件のセルを追加・更新）`);
      openMenu();
    };
    $('#m-wipe').onclick = () => {
      if (!confirm('この端末に保存したすべてのデータ（履歴・申請文・既存スポット）を削除します。元に戻せません。よろしいですか？')) return;
      for (const t of Object.keys(store.projects())) store.deleteProject(t);
      store.saveExisting([]);
      state.existing = [];
      state.project = null;
      closeSheet();
      drawCell();
      renderResults();
      updateSearchButton();
      updateSteps();
      toast('すべてのデータを削除しました');
    };
  }

  // ---------- 起動 ----------
  function bind() {
    $('#cell-form').addEventListener('submit', onCellSubmit);
    $('#btn-here').onclick = useHere;
    $$('.level-row .seg').forEach((b) => (b.onclick = () => setLevel(+b.dataset.level)));
    $$('.map-modes .mode').forEach((b) => (b.onclick = () => setMode(state.mode === b.dataset.mode ? 'cell' : b.dataset.mode)));
    $('#btn-search').onclick = runSearch;
    $('#btn-menu').onclick = openMenu;
    $('#filters').onclick = (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      state.filter = b.dataset.f;
      renderResults();
    };
    const onCardAction = (e) => {
      const a = e.target.closest('[data-assist]');
      if (a) { e.stopPropagation(); return openAssist(a.dataset.assist); }
      const card = e.target.closest('.cand');
      if (card) openDetail(card.dataset.id);
    };
    $('#cards').addEventListener('click', onCardAction);
    $('#cards').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('cand')) openDetail(e.target.dataset.id); });
    $('#sheet').addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return closeSheet();
      const a = e.target.closest('[data-assist]');
      if (a) return openAssist(a.dataset.assist);
      const m = e.target.closest('[data-show-map]');
      if (m) {
        const c = findCand(m.dataset.showMap);
        closeSheet();
        if (state.map && c) { state.map.setView([c.lat, c.lng], 19); $('#map').scrollIntoView({ behavior: 'smooth' }); }
        return;
      }
      const cp = e.target.closest('[data-copy-pos]');
      if (cp) { const c = findCand(cp.dataset.copyPos); return copyText(`${c.lat.toFixed(7)},${c.lng.toFixed(7)}`, '緯度・経度'); }
      const du = e.target.closest('[data-del-user]');
      if (du && confirm('この候補を削除しますか？')) {
        const p = state.project;
        p.userCandidates = (p.userCandidates || []).filter((u) => u.id !== du.dataset.delUser);
        reassess();
        closeSheet();
        renderResults();
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sheet) closeSheet(); });
    window.addEventListener('popstate', () => { if (state.sheet) hideSheet(); });
  }

  function start() {
    initMap();
    bind();
    drawExisting();
    const prefs = store.prefs();
    if (prefs.lastToken) {
      const id = Cell.fromToken(prefs.lastToken);
      if (id) selectCell(id);
    }
    updateSearchButton();
    updateSteps();
  }

  start();
})();
