// 無料の公開データ取得。APIキー不要のサービスだけを使い、失敗時は過剰に再試行しない。
(function (g) {
  const PSF = (g.PSF = g.PSF || {});

  const SERVICES = {
    osm: { label: '公開地図データ（OpenStreetMap / Overpass API）', short: '地図データ' },
    wikipedia: { label: 'Wikipedia 日本語版（位置情報つき記事）', short: 'Wikipedia' },
    wikidata: { label: 'Wikidata（文化財指定・設置年などの構造化データ）', short: 'Wikidata' },
    nominatim: { label: '地名の取得（OpenStreetMap Nominatim）', short: '地名' },
  };

  const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

  class SourceError extends Error {
    constructor(code, service, detail) {
      super(code);
      this.code = code;
      this.service = service;
      this.detail = detail || '';
    }
    get userMessage() {
      return errorMessage(this.code, this.service, this.detail);
    }
  }

  function errorMessage(code, service, detail) {
    const name = (SERVICES[service] && SERVICES[service].short) || service;
    switch (code) {
      case 'offline':
        return 'インターネットに接続されていません。接続を確認してから「候補を探す」を押してください。取得済みのデータはそのまま使えます。';
      case 'timeout':
        return `${name}の応答が時間内に返りませんでした。公開サーバーが混雑している可能性があります。数分おいてから再度お試しください。`;
      case 'rate':
        return `${name}の利用制限に達しました。公開サーバーを公平に使うため、自動での再試行はしません。10分ほどおいてから再度お試しください。`;
      case 'server':
        return `${name}のサーバーが一時的に応答できない状態です（${detail}）。時間をおいて再度お試しください。`;
      case 'network':
        return `${name}に接続できませんでした。通信環境、または広告ブロックなどの拡張機能による遮断が考えられます。`;
      case 'partial':
        return `${name}の処理がサーバー側の制限で途中で打ち切られました。結果は一部だけの可能性があります。`;
      case 'parse':
        return `${name}から想定外の形式のデータが返されました。時間をおいて再度お試しください。`;
      default:
        return `${name}が要求を受け付けませんでした（${detail || code}）。`;
    }
  }

  async function request(service, url, init, opts) {
    const f = (opts && opts.fetch) || g.fetch.bind(g);
    const timeoutMs = (opts && opts.timeoutMs) || 30000;
    if (g.navigator && g.navigator.onLine === false) throw new SourceError('offline', service);
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await f(url, Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {}));
    } catch (e) {
      throw new SourceError(e && e.name === 'AbortError' ? 'timeout' : 'network', service, String(e && e.message));
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 429) throw new SourceError('rate', service, 'HTTP 429');
    if (res.status === 504 || res.status === 503 || res.status >= 500) throw new SourceError('server', service, `HTTP ${res.status}`);
    if (!res.ok) throw new SourceError('http', service, `HTTP ${res.status}`);
    try {
      return await res.json();
    } catch (e) {
      throw new SourceError('parse', service);
    }
  }

  const CANDIDATE_FILTERS = [
    'nwr["leisure"~"^(park|garden|playground|fitness_station|pitch|sports_centre|track|bandstand)$"]',
    'nwr["tourism"~"^(artwork|viewpoint|attraction|museum|gallery)$"]',
    'nwr["tourism"="information"]["information"~"^(board|map|guidepost)$"]',
    'nwr["historic"]',
    'nwr["heritage"]',
    'nwr["memorial"]',
    'nwr["amenity"~"^(place_of_worship|library|community_centre|arts_centre|theatre|fountain|clock|public_bookcase|townhall)$"]',
    'nwr["man_made"~"^(tower|lighthouse|obelisk|torii)$"]',
    'nwr["natural"="tree"]["name"]',
    // 申請上の懸念を判定するための周辺情報（候補にはしない）
    'way["amenity"~"^(school|kindergarten|childcare)$"]',
    'rel["amenity"~"^(school|kindergarten|childcare)$"]',
  ];

  function overpassQuery(b, center) {
    const bb = [b.s, b.w, b.n, b.e].map((v) => v.toFixed(7)).join(',');
    return [
      '[out:json][timeout:25];',
      '(',
      ...CANDIDATE_FILTERS.map((f) => `  ${f}(${bb});`),
      ')->.c;',
      'node.c;out body qt;',
      'way.c;out geom qt;',
      'rel.c;out tags center qt;',
      `is_in(${center[0].toFixed(7)},${center[1].toFixed(7)})->.ia;`,
      '(area.ia["leisure"~"^(park|garden)$"];area.ia["amenity"~"^(school|kindergarten|childcare)$"];);',
      'out tags;',
    ].join('\n');
  }

  async function fetchOsm(bounds, center, opts) {
    const query = overpassQuery(bounds, center);
    let lastErr = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const data = await request('osm', endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: 'data=' + encodeURIComponent(query),
        }, Object.assign({ timeoutMs: 40000 }, opts));
        if (!data || !Array.isArray(data.elements)) throw new SourceError('parse', 'osm');
        const remark = data.remark && /error|timed out|out of memory/i.test(data.remark) ? data.remark : null;
        return { elements: data.elements, endpoint, partial: !!remark, remark };
      } catch (e) {
        lastErr = e;
        // 利用制限・オフライン・要求の誤りでは別サーバーに切り替えない（負荷を増やさないため）
        if (!(e instanceof SourceError) || !['server', 'timeout', 'network'].includes(e.code)) break;
      }
    }
    throw lastErr;
  }

  async function fetchWikipedia(b, opts) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*',
      generator: 'geosearch', ggsbbox: [b.n, b.w, b.s, b.e].map((v) => v.toFixed(6)).join('|'), ggslimit: '30',
      prop: 'coordinates|pageprops|extracts', ppprop: 'wikibase_item', exintro: '1', explaintext: '1', exsentences: '2', exlimit: 'max',
    });
    const data = await request('wikipedia', 'https://ja.wikipedia.org/w/api.php?' + params.toString(), {}, opts);
    if (data.error) throw new SourceError('http', 'wikipedia', data.error.info || data.error.code);
    const pages = (data.query && data.query.pages) || [];
    return pages
      .filter((p) => p.coordinates && p.coordinates.length)
      .map((p) => ({
        pageid: p.pageid,
        title: p.title,
        lat: p.coordinates[0].lat,
        lng: p.coordinates[0].lon,
        wikidata: (p.pageprops && p.pageprops.wikibase_item) || null,
        extract: p.extract || '',
        url: 'https://ja.wikipedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_')),
      }));
  }

  function wikidataQuery(b, ids) {
    const box = `SERVICE wikibase:box { ?item wdt:P625 ?coord. bd:serviceParam wikibase:cornerSouthWest "Point(${b.w.toFixed(6)} ${b.s.toFixed(6)})"^^geo:wktLiteral. bd:serviceParam wikibase:cornerNorthEast "Point(${b.e.toFixed(6)} ${b.n.toFixed(6)})"^^geo:wktLiteral. }`;
    const where = ids.length
      ? `{ ${box} } UNION { VALUES ?item { ${ids.map((q) => 'wd:' + q).join(' ')} } ?item wdt:P625 ?coord. }`
      : box;
    return `SELECT ?item ?itemLabel ?coord ?typeLabel ?heritageLabel ?inception ?prec ?image ?article WHERE {
  ${where}
  OPTIONAL { ?item wdt:P31 ?type. }
  OPTIONAL { ?item wdt:P1435 ?heritage. }
  OPTIONAL { ?item p:P571/psv:P571 [ wikibase:timeValue ?inception; wikibase:timePrecision ?prec ]. }
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://ja.wikipedia.org/>. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
} LIMIT 300`;
  }

  function parseWikidataRows(rows) {
    const items = new Map();
    for (const r of rows) {
      const q = r.item.value.replace(/^.*\//, '');
      let it = items.get(q);
      if (!it) {
        const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coord ? r.coord.value : '');
        const label = r.itemLabel && !/^Q\d+$/.test(r.itemLabel.value) ? r.itemLabel.value : null;
        it = { qid: q, label, lat: m ? +m[2] : null, lng: m ? +m[1] : null, types: [], heritage: [], inceptionYear: null, image: null, article: null };
        items.set(q, it);
      }
      const push = (arr, v) => { if (v && !/^Q\d+$/.test(v) && !arr.includes(v)) arr.push(v); };
      push(it.types, r.typeLabel && r.typeLabel.value);
      push(it.heritage, r.heritageLabel && r.heritageLabel.value);
      // 精度が「年」以上の日付だけを使う（世紀単位などの粗い値は年として扱わない）
      if (r.inception && r.prec && +r.prec.value >= 9 && !it.inceptionYear) {
        const y = /^(-?\d{1,4})-/.exec(r.inception.value);
        if (y) it.inceptionYear = parseInt(y[1], 10);
      }
      if (r.image && !it.image) it.image = decodeURIComponent(r.image.value.replace(/^.*Special:FilePath\//, ''));
      if (r.article && !it.article) it.article = r.article.value;
    }
    return [...items.values()].filter((it) => it.lat != null);
  }

  async function fetchWikidata(b, ids, opts) {
    const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(wikidataQuery(b, ids || []));
    const data = await request('wikidata', url, { headers: { Accept: 'application/sparql-results+json' } }, opts);
    if (!data || !data.results || !Array.isArray(data.results.bindings)) throw new SourceError('parse', 'wikidata');
    return parseWikidataRows(data.results.bindings);
  }

  async function fetchPlaceName(lat, lng, opts) {
    const params = new URLSearchParams({ format: 'jsonv2', lat: lat.toFixed(6), lon: lng.toFixed(6), zoom: '16', 'accept-language': 'ja' });
    const data = await request('nominatim', 'https://nominatim.openstreetmap.org/reverse?' + params.toString(), {}, opts);
    const a = (data && data.address) || {};
    const pref = a.province || a.state || '';
    const city = a.city || a.town || a.village || a.county || '';
    const ward = a.city_district || '';
    const town = a.suburb || a.quarter || a.neighbourhood || '';
    return { pref, city, ward, town, municipality: [city, ward].filter(Boolean).join('') || pref, label: [pref, city, ward, town].filter(Boolean).join(' ') };
  }

  PSF.sources = {
    SERVICES, SourceError, errorMessage, overpassQuery, wikidataQuery, parseWikidataRows,
    fetchOsm, fetchWikipedia, fetchWikidata, fetchPlaceName,
  };
})(typeof window !== 'undefined' ? window : globalThis);
