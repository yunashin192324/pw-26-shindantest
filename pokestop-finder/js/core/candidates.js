// 公開データの要素を「候補」に整理し、重複をまとめ、セル内外と申請上の評価を付ける。
(function (g) {
  const PSF = (g.PSF = g.PSF || {});
  const geo = () => PSF.geo;

  // 分類ごとの表示と、探索・運動・交流のどれに関わるか
  const CATEGORIES = {
    art: { label: '公共アート・像', icon: '🎨', base: 25, axes: ['探索'], why: '地域の芸術作品に触れるきっかけになる' },
    memorial: { label: '記念碑・像', icon: '🗿', base: 25, axes: ['探索'], why: '地域の出来事や人物を知るきっかけになる' },
    board: { label: '案内板・解説板', icon: '🪧', base: 22, axes: ['探索'], why: '掲示内容から地域の歴史や地理を知ることができる' },
    historic: { label: '史跡・文化財', icon: '🏯', base: 25, axes: ['探索'], why: '地域の歴史に触れるきっかけになる' },
    worship: { label: '神社・寺院など', icon: '⛩️', base: 20, axes: ['探索', '交流'], why: '地域の文化に触れる場であり、行事などで人が集まる場にもなりうる' },
    view: { label: '展望場所', icon: '🔭', base: 18, axes: ['探索', '運動'], why: '景色を見るために歩いて訪れる場所である' },
    landmark: { label: 'ランドマーク', icon: '📍', base: 15, axes: ['探索'], why: '地域の目印として、歩いて巡る際の手がかりになる' },
    park: { label: '公園・庭園', icon: '🌳', base: 15, axes: ['運動', '交流'], why: '散策や運動、人との交流に使われる公共の空間である' },
    play: { label: '遊具・遊び場', icon: '🛝', base: 18, axes: ['運動', '交流'], why: '体を動かして遊ぶための設備である' },
    sport: { label: '運動設備', icon: '🏃', base: 18, axes: ['運動'], why: '運動するための設備である' },
    facility: { label: '公共・文化施設', icon: '🏛️', base: 15, axes: ['探索', '交流'], why: '地域の情報や文化に触れられる公共の施設である' },
    community: { label: '交流の場', icon: '🤝', base: 15, axes: ['交流'], why: '地域の人が集まり交流する場である' },
    nature: { label: '名木など', icon: '🌲', base: 5, axes: ['探索'], why: '地域で名前が付けられた自然物である' },
    reference: { label: '参考情報のみ', icon: '📖', base: 0, axes: [], why: '' },
    user: { label: '手動で追加', icon: '✏️', base: 10, axes: [], why: '' },
  };

  const MATERIAL = { bronze: '青銅', stone: '石', granite: '花崗岩', marble: '大理石', metal: '金属', steel: '鋼', stainless_steel: 'ステンレス', iron: '鉄', wood: '木', concrete: 'コンクリート', brick: 'れんが', copper: '銅', ceramic: '陶器', glass: 'ガラス', plastic: '樹脂', aluminium: 'アルミニウム' };
  const PLAYGROUND = { slide: 'すべり台', swing: 'ぶらんこ', climbingframe: 'ジャングルジム', sandpit: '砂場', seesaw: 'シーソー', structure: '複合遊具', springy: 'スプリング遊具', horizontal_bar: '鉄棒', roundabout: '回転遊具', playhouse: '小屋形の遊具', climbing_wall: 'クライミング遊具', zipwire: 'ロープ滑車遊具' };
  const SPORT = { baseball: '野球場', soccer: 'サッカー場', tennis: 'テニスコート', basketball: 'バスケットボールコート', multi: '多目的グラウンド', gateball: 'ゲートボール場', volleyball: 'バレーボールコート', skateboard: 'スケートボード場', running: '走路', athletics: '陸上競技場', golf: 'ゴルフ練習場', table_tennis: '卓球台' };
  const SCHOOL_LIKE = /^(school|kindergarten|childcare)$/;

  function nameOf(tags) {
    return (tags && (tags['name:ja'] || tags.name)) || null;
  }

  function normName(s) {
    return String(s || '')
      .normalize('NFKC')
      .replace(/[（(][^）)]*[）)]\s*$/, '')
      .replace(/[\s・･\-‐ー－]/g, '')
      .toLowerCase();
  }

  function similarNames(a, b) {
    const x = normName(a), y = normName(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x));
  }

  function isBronze(t) {
    return /bronze|copper/.test(t.material || '');
  }

  // タグから分類と具体的な種類名を決める。候補にしないものは null
  function classify(t) {
    if (!t) return null;
    if (t.tourism === 'artwork') {
      const map = { statue: isBronze(t) ? '銅像' : '像', bust: '胸像', sculpture: '彫刻', mural: '壁画', relief: 'レリーフ', mosaic: 'モザイク画', installation: '立体作品', fountain: '噴水のアート', stone: '石の作品', painting: '絵画' };
      return { cat: 'art', kind: map[t.artwork_type] || '公共アート' };
    }
    if (t.historic === 'memorial' || t.memorial) {
      const map = { statue: isBronze(t) ? '銅像' : '像', bust: '胸像', stone: '石碑', stele: '石碑', plaque: '記念プレート', blue_plaque: '記念プレート', war_memorial: '慰霊碑', obelisk: 'オベリスク', stolperstein: '記念プレート' };
      return { cat: 'memorial', kind: map[t.memorial] || '記念碑' };
    }
    if (t.historic === 'monument') return { cat: 'memorial', kind: '記念碑' };
    if (t.tourism === 'information') {
      if (t.information === 'map') return { cat: 'board', kind: '案内地図' };
      if (t.information === 'guidepost') return { cat: 'board', kind: '道標' };
      const map = { history: '歴史解説板', nature: '自然解説板', wildlife: '自然解説板', notice: '掲示板', tourism: '観光案内板' };
      return { cat: 'board', kind: map[t.board_type] || '案内板' };
    }
    if (t.amenity === 'place_of_worship') {
      const map = { shinto: '神社', buddhist: '寺院', christian: '教会' };
      return { cat: 'worship', kind: map[t.religion] || '宗教施設' };
    }
    if (t.man_made === 'torii') return { cat: 'worship', kind: '鳥居' };
    if (t.historic) {
      const map = { wayside_shrine: '祠・地蔵', boundary_stone: '境界石', milestone: '道標', archaeological_site: '遺跡', castle: '城・城跡', ruins: '遺構', building: '歴史的建造物', tomb: '墓所', shrine: '祠', city_gate: '門跡', bridge: '歴史的な橋', wayside_cross: '路傍の十字架', memorial: '記念碑' };
      return { cat: 'historic', kind: map[t.historic] || '史跡' };
    }
    if (t.tourism === 'viewpoint') return { cat: 'view', kind: '展望場所' };
    if (t.man_made === 'tower') return t['tower:type'] === 'observation' ? { cat: 'view', kind: '展望塔' } : { cat: 'landmark', kind: '塔' };
    if (t.man_made === 'lighthouse') return { cat: 'landmark', kind: '灯台' };
    if (t.man_made === 'obelisk') return { cat: 'landmark', kind: 'オベリスク' };
    if (t.amenity === 'clock') return { cat: 'landmark', kind: '時計塔・時計' };
    if (t.amenity === 'fountain') return { cat: 'landmark', kind: '噴水' };
    if (t.tourism === 'attraction') return { cat: 'landmark', kind: '見どころ' };
    if (t.leisure === 'park') return { cat: 'park', kind: '公園' };
    if (t.leisure === 'garden') return { cat: 'park', kind: '庭園' };
    if (t.leisure === 'playground') return { cat: 'play', kind: PLAYGROUND[t.playground] || '遊び場' };
    if (t.playground) return { cat: 'play', kind: PLAYGROUND[t.playground] || '遊具' };
    if (t.leisure === 'fitness_station') return { cat: 'sport', kind: '健康遊具・運動器具' };
    if (t.leisure === 'pitch') return { cat: 'sport', kind: SPORT[t.sport] || '運動場' };
    if (t.leisure === 'sports_centre') return { cat: 'sport', kind: '運動施設' };
    if (t.leisure === 'track') return { cat: 'sport', kind: '走路・トラック' };
    if (t.leisure === 'bandstand') return { cat: 'community', kind: '野外ステージ' };
    const fac = { library: ['facility', '図書館'], townhall: ['facility', '庁舎'], arts_centre: ['facility', '文化施設'], theatre: ['facility', '劇場・ホール'], community_centre: ['community', '集会所・コミュニティセンター'], public_bookcase: ['community', 'まちの本棚'] };
    if (fac[t.amenity]) return { cat: fac[t.amenity][0], kind: fac[t.amenity][1] };
    if (t.tourism === 'museum') return { cat: 'facility', kind: '博物館・資料館' };
    if (t.tourism === 'gallery') return { cat: 'facility', kind: 'ギャラリー' };
    if (t.natural === 'tree') return { cat: 'nature', kind: '名木' };
    if (t.heritage) return { cat: 'historic', kind: '文化財' };
    return null;
  }

  function yearOf(s) {
    const m = /^(\d{4})(?:-|$)/.exec(String(s || '').trim());
    return m ? parseInt(m[1], 10) : null;
  }

  function osmUrl(type, id) {
    return `https://www.openstreetmap.org/${type}/${id}`;
  }

  // タグから「確認できた事実」を取り出す。src は根拠の出どころ
  function factsFromTags(t, src) {
    const f = [];
    const add = (key, label, value) => { if (value != null && String(value).trim()) f.push({ key, label, value: String(value).trim(), src }); };
    add('artist', '作者', t['artist_name:ja'] || t['artist:ja'] || t.artist_name || t.artist);
    const y = yearOf(t.start_date);
    if (y) add('year', '設置・建立年', y);
    else add('date_text', '設置時期の記録', t.start_date);
    if (t.material) add('material', '素材', t.material.split(';').map((m) => MATERIAL[m.trim()] || m.trim()).join('・'));
    add('inscription', '刻まれた文字', t['inscription:ja'] || t.inscription);
    add('description', '説明（地図データ）', t['description:ja'] || t.description);
    add('subject', '題材', t['subject:ja'] || t.subject);
    if (t.height && /^\d+(\.\d+)?$/.test(t.height)) add('height', '高さ', t.height + 'm');
    if (t.playground && PLAYGROUND[t.playground]) add('playground', '遊具の種類', PLAYGROUND[t.playground]);
    if (t.sport) add('sport', '種目', t.sport.split(';').map((s) => (SPORT[s] || s).replace(/場$|コート$/, '')).join('・'));
    add('operator', '管理者', t['operator:ja'] || t.operator);
    if (t.heritage) add('heritage_tag', '文化財の記録', t['heritage:operator'] ? `あり（記録元: ${t['heritage:operator']}）` : 'あり（指定の種類は未確認）');
    add('opening_hours', '利用時間（記録）', t.opening_hours);
    return f;
  }

  const DESCRIPTIVE = new Set(['artist', 'year', 'material', 'inscription', 'description', 'subject', 'height', 'playground', 'sport', 'heritage', 'inception', 'wp_extract']);

  function makeId(type, id) {
    return `osm:${type}/${id}`;
  }

  // Overpass の結果を候補と周辺情報に分ける
  function fromOsm(elements, cellCenter) {
    const candidates = [];
    const context = { parks: [], schools: [], enclosing: [] };
    const seen = new Set();
    for (const el of elements) {
      const t = el.tags || {};
      if (el.type === 'area') {
        const isRel = el.id >= 3600000000;
        const type = isRel ? 'relation' : 'way';
        const oid = isRel ? el.id - 3600000000 : el.id - 2400000000;
        context.enclosing.push({ id: makeId(type, oid), type, oid, name: nameOf(t), school: SCHOOL_LIKE.test(t.amenity || ''), park: /^(park|garden)$/.test(t.leisure || ''), tags: t });
        continue;
      }
      const key = makeId(el.type, el.id);
      if (seen.has(key)) continue;
      seen.add(key);
      let lat, lng, posKind = 'point', ring = null;
      if (el.type === 'node') {
        lat = el.lat; lng = el.lon;
      } else if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length) {
        const pts = el.geometry.filter(Boolean).map((p) => [p.lat, p.lon]);
        const closed = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
        if (closed) {
          ring = pts.slice(0, -1);
          [lat, lng] = geo().ringCentroid(ring);
          // 小さな輪郭（像の台座など）は中心で位置を代表できる。広い区域は中心を位置として扱わない
          posKind = geo().ringDiagonalM(ring) <= 25 ? 'point' : 'area';
        } else {
          const b = geo().bounds(pts);
          lat = (b.s + b.n) / 2; lng = (b.w + b.e) / 2;
          posKind = 'line';
        }
      } else if (el.center) {
        lat = el.center.lat; lng = el.center.lon; posKind = 'area';
      } else {
        continue;
      }
      if (SCHOOL_LIKE.test(t.amenity || '')) {
        if (ring) context.schools.push({ id: key, name: nameOf(t), ring });
        continue;
      }
      const cls = classify(t);
      if (!cls) continue;
      if (cls.cat === 'park' && ring) context.parks.push({ id: key, name: nameOf(t), kind: cls.kind, ring });
      const src = { type: 'osm', id: key, label: `OpenStreetMap ${el.type}/${el.id}`, url: osmUrl(el.type, el.id) };
      candidates.push({
        id: key,
        name: nameOf(t),
        cat: cls.cat,
        kind: cls.kind,
        lat, lng, posKind,
        ring: ring && posKind === 'area' ? ring : null,
        facts: factsFromTags(t, key),
        sources: [src],
        links: {
          wikidata: t.wikidata || null,
          wikipedia: t.wikipedia || null,
          website: t.website || t['contact:website'] || t.url || null,
          image: t.wikimedia_commons && /^File:/.test(t.wikimedia_commons) ? t.wikimedia_commons.replace(/^File:/, '') : (t.image && /^File:/.test(t.image) ? t.image.replace(/^File:/, '') : null),
        },
        flagsFromTags: {
          privateAccess: /^(private|no)$/.test(t.access || ''),
          disused: Object.keys(t).some((k) => /^(disused|abandoned|demolished|removed|razed):/.test(k)) || t.disused === 'yes',
          tomb: t.historic === 'tomb' || t.amenity === 'grave_yard',
          nature: cls.cat === 'nature',
        },
        insideOf: [],
        wiki: null,
      });
    }
    // セル中心を含む公園で、輪郭を取得できなかったものは「位置未確定」の候補として残す
    for (const en of context.enclosing) {
      if (!en.park || candidates.some((c) => c.id === en.id)) continue;
      const cls = classify(en.tags);
      candidates.push({
        id: en.id, name: en.name, cat: 'park', kind: cls ? cls.kind : '公園',
        lat: cellCenter[0], lng: cellCenter[1], posKind: 'enclosing', ring: null,
        facts: factsFromTags(en.tags, en.id),
        sources: [{ type: 'osm', id: en.id, label: `OpenStreetMap ${en.type}/${en.oid}`, url: osmUrl(en.type, en.oid) }],
        links: { wikidata: en.tags.wikidata || null, wikipedia: en.tags.wikipedia || null, website: en.tags.website || null, image: null },
        flagsFromTags: {}, insideOf: [], wiki: null,
      });
    }
    return { candidates, context };
  }

  function precise(c) {
    return c.posKind === 'point' || c.posKind === 'user';
  }

  function mergeInto(a, b) {
    for (const s of b.sources) if (!a.sources.some((x) => x.id === s.id)) a.sources.push(s);
    for (const f of b.facts) if (!a.facts.some((x) => x.key === f.key && x.value === f.value)) a.facts.push(f);
    for (const k of Object.keys(b.links || {})) if (!a.links[k] && b.links[k]) a.links[k] = b.links[k];
    a.mergedFrom = (a.mergedFrom || []).concat(b.id, b.mergedFrom || []);
    if (!a.name && b.name) a.name = b.name;
    if (!a.ring && b.ring) a.ring = b.ring;
  }

  // 同じ物が複数の要素として登録されている場合にまとめる
  function dedupe(list) {
    const out = [];
    const sorted = list.slice().sort((x, y) => (precise(y) - precise(x)) || (y.facts.length - x.facts.length));
    for (const c of sorted) {
      const p = [c.lat, c.lng];
      const twin = out.find((o) => {
        const d = geo().distanceM(p, [o.lat, o.lng]);
        if (c.name && o.name) return normName(c.name) === normName(o.name) && d <= 40 && (o.cat === c.cat || o.cat === 'park' || c.cat === 'park');
        return !c.name && !o.name && o.cat === c.cat && o.kind === c.kind && d <= 3;
      });
      if (twin) mergeInto(twin, c);
      else out.push(c);
    }
    return out;
  }

  // Wikipedia・Wikidata の情報を候補に結び付け、結び付かないものは参考候補にする
  function attachWiki(cands, wpPages, wdItems) {
    const wdByQ = new Map((wdItems || []).map((w) => [w.qid, w]));
    const usedQ = new Set();
    const usedWp = new Set();
    const wpByQ = new Map();
    for (const p of wpPages || []) if (p.wikidata) wpByQ.set(p.wikidata, p);

    const link = (c, wd, wp, how) => {
      c.wiki = c.wiki || { match: how };
      if (wd && !c.wiki.wd) { c.wiki.wd = wd; usedQ.add(wd.qid); }
      if (wp && !c.wiki.wp) { c.wiki.wp = wp; usedWp.add(wp.pageid); }
      if (how === 'tag') c.wiki.match = 'tag';
    };

    for (const c of cands) {
      const q = c.links.wikidata;
      const wpTitle = c.links.wikipedia && /^ja:/.test(c.links.wikipedia) ? c.links.wikipedia.slice(3) : null;
      const wd = q ? wdByQ.get(q) : null;
      const wp = (q && wpByQ.get(q)) || (wpTitle ? (wpPages || []).find((p) => p.title === wpTitle) : null);
      if (wd || wp) link(c, wd, wp, 'tag');
    }
    const near = (c, lat, lng, max) => lat != null && geo().distanceM([c.lat, c.lng], [lat, lng]) <= max;
    for (const w of wdItems || []) {
      if (usedQ.has(w.qid) || !w.label) continue;
      const c = cands.find((x) => x.name && similarNames(x.name, w.label) && near(x, w.lat, w.lng, 100));
      if (c) link(c, w, wpByQ.get(w.qid), 'name');
    }
    for (const p of wpPages || []) {
      if (usedWp.has(p.pageid)) continue;
      const c = cands.find((x) => x.name && similarNames(x.name, p.title) && near(x, p.lat, p.lng, 100));
      if (c) link(c, p.wikidata ? wdByQ.get(p.wikidata) : null, p, 'name');
    }
    const extra = [];
    for (const w of wdItems || []) {
      if (usedQ.has(w.qid)) continue;
      const wp = wpByQ.get(w.qid) || null;
      if (wp) usedWp.add(wp.pageid);
      extra.push(referenceCandidate(w.label || (wp && wp.title), w.lat, w.lng, w, wp));
      usedQ.add(w.qid);
    }
    for (const p of wpPages || []) {
      if (usedWp.has(p.pageid)) continue;
      extra.push(referenceCandidate(p.title, p.lat, p.lng, null, p));
    }
    for (const c of cands.concat(extra)) applyWikiFacts(c);
    return cands.concat(extra);
  }

  // Wikidata の種類名から分類を推定する。分からなければ「参考情報」のまま
  const WD_TYPE_CAT = [[/像|彫刻|アート/, 'art'], [/碑|記念/, 'memorial'], [/道標|史跡|遺跡|城|古墳|文化財|建造物|遺構/, 'historic'], [/神社|寺|教会|祠/, 'worship'], [/公園|庭園/, 'park'], [/展望/, 'view'], [/図書館|博物館|美術館|資料館/, 'facility']];

  function referenceCandidate(name, lat, lng, wd, wp) {
    const types = wd ? wd.types : [];
    const hit = types.length ? WD_TYPE_CAT.find(([re]) => re.test(types.join(' '))) : null;
    const c = {
      id: wd ? `wd:${wd.qid}` : `wp:${wp.pageid}`,
      name: name || null, cat: hit ? hit[1] : 'reference', kind: types[0] || '場所', lat, lng, posKind: 'reference', ring: null,
      facts: [], sources: [], links: { wikidata: wd ? wd.qid : null, wikipedia: wp ? 'ja:' + wp.title : null, website: null, image: null },
      flagsFromTags: {}, insideOf: [], wiki: { match: 'self', wd: wd || undefined, wp: wp || undefined },
    };
    if (/学校|幼稚園|保育/.test(types.join(' '))) c.flagsFromTags.school = true;
    return c;
  }

  function applyWikiFacts(c) {
    if (!c.wiki) return;
    const { wd, wp } = c.wiki;
    if (wd) {
      const src = `wd:${wd.qid}`;
      if (!c.sources.some((s) => s.id === src)) c.sources.push({ type: 'wikidata', id: src, label: `Wikidata ${wd.qid}`, url: `https://www.wikidata.org/wiki/${wd.qid}` });
      if (wd.heritage.length && !c.facts.some((f) => f.key === 'heritage')) c.facts.push({ key: 'heritage', label: '文化財の指定', value: wd.heritage.join('、'), src });
      if (wd.inceptionYear && !c.facts.some((f) => f.key === 'year' || f.key === 'inception')) c.facts.push({ key: 'inception', label: '設立・建立年', value: String(wd.inceptionYear), src });
      if (wd.types.length && !c.facts.some((f) => f.key === 'wd_type')) c.facts.push({ key: 'wd_type', label: '種類（Wikidata）', value: wd.types.slice(0, 3).join('、'), src });
      if (wd.image && !c.links.image) c.links.image = wd.image;
    }
    if (wp) {
      const src = `wp:${wp.pageid}`;
      if (!c.sources.some((s) => s.id === src)) c.sources.push({ type: 'wikipedia', id: src, label: `Wikipedia「${wp.title}」`, url: wp.url });
      if (wp.extract && !c.facts.some((f) => f.key === 'wp_extract')) c.facts.push({ key: 'wp_extract', label: 'Wikipediaの要約（参考・転載不可）', value: wp.extract, src, referenceOnly: true });
    }
  }

  // 公園の中にある構造物を関連付ける。学校の敷地内なら懸念として記録する
  function attachContainment(cands, context) {
    for (const c of cands) {
      if (!precise(c)) { c.insideOf = []; c.inSchool = null; continue; }
      const p = [c.lat, c.lng];
      c.insideOf = context.parks.filter((pk) => pk.id !== c.id && !(c.mergedFrom || []).includes(pk.id) && pk.name && geo().pointInRing(p, pk.ring)).map((pk) => ({ id: pk.id, name: pk.name, kind: pk.kind }));
      const sch = context.schools.find((s) => geo().pointInRing(p, s.ring));
      c.inSchool = sch ? (sch.name || '名称不明の学校・保育施設') : null;
    }
  }

  const ONSITE_TEXT = {
    noName: '名称が公開データにありません。現地の銘板や看板で正式な名称を確認してください。',
    area: '位置は区域全体の中心です。申請する地点（名称板・入口の看板など）の位置を現地で確認してください。',
    line: '線状の要素のため、申請する地点の位置を現地で確認してください。',
    enclosing: 'セルを含む区域として見つかりましたが、輪郭と位置を取得できていません。名称板などの位置を現地で確認してください。',
    reference: '位置は百科事典の記事などの参考座標です。実物の正確な位置を現地で確認してください。',
    edge: 'セルの境界から5m以内です。地図データの誤差を考え、実際の位置がセル内かどうかを現地で確認してください。',
    partial: '区域の一部だけがセル内です。申請する地点がセル内に入るかを確認してください。',
    noFacts: '名称以外の情報が公開データにありません。銘板や説明板の内容を現地で確認してください。',
  };

  // セル内外の判定（S2ライブラリによる厳密な判定＋境界付近の区別）
  function locate(cands, cell) {
    for (const c of cands) {
      const cs = c.posKind === 'area' && c.ring ? PSF.cell.classifyArea(cell, c.ring, [c.lat, c.lng]) : PSF.cell.classifyPoint(cell, c.lat, c.lng);
      c.cellStatus = cs.status;
      c.inCell = cs.status === 'in' || cs.status === 'partial' || (cs.status === 'edge' && cs.inside);
      c.edgeDistM = Math.round(cs.edgeDistM * 10) / 10;
      c.l17 = PSF.cell.tokenAt(c.lat, c.lng, 17);
    }
    return cands;
  }

  function evaluate(cands, cell, opts) {
    const existing = (opts && opts.existing) || [];
    const enclosingSchool = opts && opts.enclosingSchool;
    for (const c of cands) {
      const onsite = [];
      const concerns = [];
      const reasons = [];
      if (!c.name) onsite.push(ONSITE_TEXT.noName);
      if (c.posKind === 'area') onsite.push(ONSITE_TEXT.area);
      if (c.posKind === 'line') onsite.push(ONSITE_TEXT.line);
      if (c.posKind === 'enclosing') onsite.push(ONSITE_TEXT.enclosing);
      if (c.posKind === 'reference') onsite.push(ONSITE_TEXT.reference);
      if (c.cellStatus === 'edge') onsite.push(ONSITE_TEXT.edge);
      if (c.cellStatus === 'partial') onsite.push(ONSITE_TEXT.partial);
      const descriptive = c.facts.filter((f) => DESCRIPTIVE.has(f.key) && !f.referenceOnly);
      if (c.name && !descriptive.length && c.cat !== 'reference') onsite.push(ONSITE_TEXT.noFacts);

      const fl = c.flagsFromTags || {};
      if (c.inSchool || fl.school) concerns.push(`学校・保育施設（${c.inSchool || '記事の分類による'}）の敷地内の可能性があります。公式基準では学校の敷地は対象外とされています。`);
      if (fl.privateAccess) concerns.push('地図データに立入制限（私有・立入不可）の記録があります。');
      if (fl.disused) concerns.push('地図データに「使われていない・撤去済み」の記録があります。現存するか確認してください。');
      if (fl.tomb) concerns.push('墓所に関わる場所の可能性があります。公式基準に照らして慎重に判断してください。');
      if (fl.nature) concerns.push('自然物は公式基準で対象外とされる場合があります。人工の説明板などがあるか確認してください。');
      if (enclosingSchool && c.inCell && !c.inSchool) onsite.push(`セルの中心が「${enclosingSchool}」の区域内にあります。候補が学校の敷地内でないか確認してください。`);

      for (const ex of existing) {
        const d = PSF.geo.distanceM([c.lat, c.lng], [ex.lat, ex.lng]);
        if (d <= 20) concerns.push(`登録済みの既存スポット「${ex.label || '名称なし'}」から約${Math.round(d)}mです。すでにゲーム内にある地点と同じか、近すぎる可能性があります（20mの目安は公式発表ではなく利用者間で知られている傾向です）。`);
        else if (ex.l17 === c.l17) concerns.push(`同じL17セルに既存スポット「${ex.label || '名称なし'}」が登録されています。承認されてもポケストップにならない可能性があります（利用者間で知られている傾向で、公式発表ではありません）。`);
      }

      const cat = CATEGORIES[c.cat];
      let score = cat.base;
      if (c.inCell) { score += 30; reasons.push('対象セル内にあります。'); } else if (c.cellStatus === 'out') { score -= 60; reasons.push('対象セルの外です。'); }
      if (c.name) { score += 15; reasons.push(`名称「${c.name}」が公開データに記録されています。`); }
      if (precise(c)) { score += 10; reasons.push('個別の地点として位置が記録されています。'); }
      if (descriptive.length) { score += Math.min(20, descriptive.length * 5); reasons.push(`確認できた情報: ${descriptive.map((f) => f.label).join('、')}。`); }
      const srcTypes = new Set(c.sources.map((s) => s.type));
      if (srcTypes.size > 1) { score += 10; reasons.push(`${srcTypes.size}種類の情報源で確認できます。`); }
      if (c.insideOf.length) reasons.push(`${c.insideOf.map((p) => p.name).join('、')}の中にあります。`);
      if (cat.why) reasons.push(`分類「${c.kind}」は${cat.axes.join('・')}の観点に関わる種類です。`);
      score -= concerns.length * 40;
      score -= onsite.length * 5;

      c.eval = {
        score,
        onsite,
        concerns,
        reasons,
        enough: !!c.name && precise(c) && (descriptive.length > 0 || srcTypes.size > 1),
      };
    }
    markNearby(cands);
    for (const c of cands) c.eval.status = statusOf(c);
    return cands;
  }

  // 20m以内に別の候補がある、または同じL17セルに複数の候補がある場合に印を付ける
  function markNearby(cands) {
    for (const c of cands) { c.eval.dupWith = []; c.eval.sameL17 = 0; }
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        const a = cands[i], b = cands[j];
        if (a.posKind === 'enclosing' || b.posKind === 'enclosing') continue;
        const d = PSF.geo.distanceM([a.lat, a.lng], [b.lat, b.lng]);
        if (d <= 20 && a.posKind !== 'area' && b.posKind !== 'area') {
          a.eval.dupWith.push({ id: b.id, name: b.name, d: Math.round(d) });
          b.eval.dupWith.push({ id: a.id, name: a.name, d: Math.round(d) });
        }
        if (a.l17 === b.l17 && a.inCell && b.inCell) { a.eval.sameL17++; b.eval.sameL17++; }
      }
    }
  }

  function statusOf(c) {
    const e = c.eval;
    if (e.concerns.length) return 'concern';
    if (!c.inCell) return 'out';
    if (e.enough && !e.onsite.length && !e.dupWith.length) return 'top';
    if (e.enough) return 'info';
    return 'onsite';
  }

  const STATUS = {
    top: { label: '有力', mark: '◎', tone: 'good' },
    info: { label: '情報あり', mark: '○', tone: 'info' },
    onsite: { label: '現地確認', mark: '△', tone: 'warn' },
    concern: { label: '懸念あり', mark: '✕', tone: 'bad' },
    out: { label: 'セル外', mark: '－', tone: 'mute' },
  };

  const FILTERS = {
    priority: { label: '優先して確認', test: (c) => c.inCell && c.eval.status !== 'concern' },
    enough: { label: '情報が十分', test: (c) => c.inCell && c.eval.enough },
    onsite: { label: '現地確認が必要', test: (c) => c.inCell && c.eval.onsite.length > 0 },
    concern: { label: '懸念あり', test: (c) => c.eval.concerns.length > 0 },
    dup: { label: '重複の可能性', test: (c) => c.eval.dupWith.length > 0 },
    all: { label: 'すべて（セル外も）', test: () => true },
  };

  function userCandidate(input) {
    const cat = input.cat && CATEGORIES[input.cat] ? input.cat : 'user';
    const facts = [];
    if (input.memo) facts.push({ key: 'description', label: '自分のメモ（現地確認による）', value: input.memo, src: 'user' });
    return {
      id: 'user:' + (input.id || Date.now().toString(36)),
      name: input.name || null, cat, kind: input.kind || CATEGORIES[cat].label,
      lat: input.lat, lng: input.lng, posKind: 'user', ring: null,
      facts, sources: [{ type: 'user', id: 'user', label: '自分で追加（現地確認など）', url: null }],
      links: { wikidata: null, wikipedia: null, website: null, image: null }, flagsFromTags: {}, insideOf: [], wiki: null, userAdded: true,
    };
  }

  // 検索結果一式から候補一覧を作る
  function build(cell, raw, opts) {
    const osm = raw.osm ? fromOsm(raw.osm.elements, cell.center) : { candidates: [], context: { parks: [], schools: [], enclosing: [] } };
    let list = dedupe(osm.candidates);
    list = attachWiki(list, raw.wikipedia || [], raw.wikidata || []);
    const context = {
      parks: osm.context.parks,
      schools: osm.context.schools,
      enclosing: osm.context.enclosing.map(({ tags, ...rest }) => rest),
    };
    return { candidates: refresh(cell, list, context, opts), context };
  }

  // 手動追加・既存スポット登録のあとに評価をやり直す
  function refresh(cell, list, context, opts) {
    const all = list.filter((c) => !c.userAdded).concat((opts && opts.userCandidates) || []);
    attachContainment(all, context);
    locate(all, cell);
    return assess(all, cell, context, opts);
  }

  function assess(all, cell, context, opts) {
    const enc = (context.enclosing || []).find((e) => e.school);
    evaluate(all, cell, { existing: (opts && opts.existing) || [], enclosingSchool: enc ? enc.name || '学校・保育施設' : null });
    all.sort((a, b) => b.eval.score - a.eval.score);
    return all;
  }

  PSF.candidates = { CATEGORIES, STATUS, FILTERS, classify, factsFromTags, fromOsm, dedupe, attachWiki, attachContainment, locate, evaluate, assess, build, refresh, userCandidate, normName, similarNames, precise };
})(typeof window !== 'undefined' ? window : globalThis);
