// 端末内（ブラウザの保存領域）への保存と、CSV・JSONの出力。外部には送信しない。
(function (g) {
  const PSF = (g.PSF = g.PSF || {});
  const KEY_PROJECTS = 'psf:v1:projects';
  const KEY_EXISTING = 'psf:v1:existing';
  const KEY_PREFS = 'psf:v1:prefs';

  const CHECK_ITEMS = [
    { key: 'exists', label: '実在する場所・物である' },
    { key: 'position', label: '候補の正確な位置' },
    { key: 'text', label: 'タイトルと説明文が正確' },
    { key: 'photo', label: '現地写真を準備した' },
    { key: 'photoKind', label: '参考写真と申請用写真を区別した' },
    { key: 'safety', label: '安全に近づける' },
    { key: 'access', label: '公開状況・立入条件' },
    { key: 'criteria', label: '公式基準に照らした適格性' },
    { key: 'existing', label: '既存のゲーム内地点との関係' },
  ];
  const CHECK_STATES = {
    unchecked: { label: '未確認', short: '未' },
    ok: { label: '確認済み', short: '済' },
    need: { label: '要確認', short: '要' },
    na: { label: '該当しない', short: '－' },
  };

  function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }

  function create(storage) {
    let st = storage;
    let persistent = true;
    if (!st) {
      try {
        st = g.localStorage;
        st.setItem('psf:probe', '1');
        st.removeItem('psf:probe');
      } catch (e) {
        st = memoryStorage();
        persistent = false;
      }
    }

    function read(key, fallback) {
      try {
        const v = st.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return fallback;
      }
    }
    function write(key, value) {
      try {
        st.setItem(key, JSON.stringify(value));
        return { ok: true };
      } catch (e) {
        return { ok: false, message: '端末の保存領域がいっぱいで保存できませんでした。不要な履歴を削除するか、バックアップを出力してから削除してください。' };
      }
    }

    const api = {
      persistent,
      projects() { return read(KEY_PROJECTS, {}); },
      project(token) { return api.projects()[token] || null; },
      saveProject(p) {
        const all = api.projects();
        p.updatedAt = new Date().toISOString();
        all[p.token] = p;
        return write(KEY_PROJECTS, all);
      },
      deleteProject(token) {
        const all = api.projects();
        delete all[token];
        return write(KEY_PROJECTS, all);
      },
      history() {
        return Object.values(api.projects())
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
          .map((p) => ({ token: p.token, level: p.level, area: p.area, updatedAt: p.updatedAt, fetchedAt: p.fetchedAt, count: (p.candidates || []).filter((c) => c.inCell).length }));
      },
      existing() { return read(KEY_EXISTING, []); },
      saveExisting(list) { return write(KEY_EXISTING, list); },
      prefs() { return read(KEY_PREFS, {}); },
      savePrefs(p) { return write(KEY_PREFS, Object.assign(api.prefs(), p)); },
      backup() {
        return { app: 'pokestop-finder', version: 1, exportedAt: new Date().toISOString(), projects: api.projects(), existing: api.existing() };
      },
      restore(data) {
        if (!data || data.app !== 'pokestop-finder' || typeof data.projects !== 'object') {
          return { ok: false, message: 'このアプリで出力したバックアップ（JSON）ではないようです。' };
        }
        const all = api.projects();
        let added = 0;
        for (const [token, p] of Object.entries(data.projects)) {
          if (!p || !Array.isArray(p.candidates)) continue;
          if (!all[token] || String(p.updatedAt) > String(all[token].updatedAt)) { all[token] = p; added++; }
        }
        const ex = api.existing();
        for (const e of data.existing || []) if (!ex.some((x) => x.id === e.id)) ex.push(e);
        const r1 = write(KEY_PROJECTS, all);
        const r2 = write(KEY_EXISTING, ex);
        return r1.ok && r2.ok ? { ok: true, added } : { ok: false, message: (r1.message || r2.message) };
      },
    };
    return api;
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function draftTexts(p, c) {
    const d = p.drafts && p.drafts[c.id];
    if (!d) return { title: '', description: '', support: '' };
    return Object.assign({}, d.generated && { title: d.generated.title, description: d.generated.description, support: d.generated.support }, d.edited || {});
  }

  function toCsv(projects) {
    const head = ['セル', 'レベル', '候補ID', '名称', '分類', '種類', '緯度', '経度', 'セル内外', 'L17セル', '評価', '懸念', '現地確認事項', 'タイトル', '説明文', '補助文', '情報源', ...CHECK_ITEMS.map((i) => '確認:' + i.label)];
    const rows = [head];
    const cellLabel = { in: 'セル内', edge: '境界付近', partial: '一部セル内', out: 'セル外' };
    for (const p of projects) {
      for (const c of p.candidates || []) {
        const t = draftTexts(p, c);
        const ck = (p.checklist && p.checklist[c.id]) || {};
        rows.push([
          p.token, p.level, c.id, c.name || '', PSF.candidates.CATEGORIES[c.cat].label, c.kind, c.lat.toFixed(7), c.lng.toFixed(7),
          cellLabel[c.cellStatus] || '', c.l17, PSF.candidates.STATUS[c.eval.status].label, c.eval.concerns.join(' / '), c.eval.onsite.join(' / '),
          t.title, t.description, t.support, c.sources.map((s) => s.url || s.label).join(' '),
          ...CHECK_ITEMS.map((i) => CHECK_STATES[ck[i.key] || 'unchecked'].label),
        ]);
      }
    }
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  PSF.store = { create, toCsv, draftTexts, CHECK_ITEMS, CHECK_STATES };
})(typeof window !== 'undefined' ? window : globalThis);
