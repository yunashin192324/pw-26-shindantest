// 申請文のルールベース生成と品質チェック。外部AIを使わず、確認できた事実だけで文章を組み立てる。
// 生成した各文には根拠（facts の src）を付けて保存し、後から確認できるようにする。
(function (g) {
  const PSF = (g.PSF = g.PSF || {});

  const HYPE = ['有名', '人気', '歴史的価値', '価値が高い', '多くの人', '愛され', 'シンボル', '象徴', '最古', '唯一', '日本一', '絶景', '必見', '誰もが', '名所', '老若男女', '親しまれ', '大切にされ'];

  function hash(s) {
    let h = 2166136261;
    for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return h >>> 0;
  }

  function pick(arr, seed) {
    return arr[seed % arr.length];
  }

  function fact(c, key) {
    return c.facts.find((f) => f.key === key && !f.referenceOnly) || null;
  }

  function clip(s, n) {
    const t = String(s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  function place(c, area) {
    if (c.insideOf && c.insideOf.length) return { text: c.insideOf[0].name, src: c.insideOf[0].id, inside: true };
    if (area && area.municipality) return { text: area.municipality, src: 'nominatim', inside: false };
    return null;
  }

  // 文を根拠付きで積み上げる小さな道具
  function composer() {
    const parts = [];
    return {
      add(text, srcs) { if (text) parts.push({ text, srcs: (srcs || []).filter(Boolean) }); },
      text() { return parts.map((p) => p.text).join(''); },
      parts,
    };
  }

  function title(c) {
    if (c.name) return { text: c.name, provisional: false };
    const p = c.insideOf && c.insideOf.length ? c.insideOf[0].name : null;
    return { text: `【仮】${p ? p + 'の' : ''}${c.kind}`, provisional: true };
  }

  function description(c, ctx, seed) {
    const out = composer();
    const nm = c.name;
    const pl = place(c, ctx.area);
    const kind = c.kind;
    const verb = { art: '設置されている', memorial: '建てられた', board: '設置された', historic: '残る' }[c.cat] || 'ある';
    const at = pl ? `${pl.text}${pl.inside ? '内' : ''}に${verb}` : '';
    const variants = [`${at}${kind}です。`, nm ? `${nm}は、${at}${kind}です。` : `${at}${kind}です。`];
    out.add(pick(variants, seed), [pl && pl.src, c.sources[0] && c.sources[0].id]);

    const f = (k) => fact(c, k);
    const subj = f('subject');
    if (subj) out.add(`題材は${subj.value}です。`, [subj.src]);
    const artist = f('artist');
    if (artist) out.add(pick([`作者は${artist.value}です。`, `${artist.value}の作品です。`], seed), [artist.src]);
    const year = f('year') || f('inception');
    if (year) out.add(pick([`記録上は${year.value}年の設置です。`, `${year.value}年に設けられたと記録されています。`], seed), [year.src]);
    const mat = f('material');
    if (mat && !(kind === '銅像' && mat.value === '青銅')) out.add(`${mat.value}でできています。`, [mat.src]);
    const h = f('height');
    if (h) out.add(`高さは約${h.value}です。`, [h.src]);
    const her = f('heritage');
    if (her) out.add(`${her.value}に指定されています。`, [her.src]);
    const ins = f('inscription');
    if (ins) out.add(`「${clip(ins.value, 60)}」と刻まれています。`, [ins.src]);
    const pg = f('playground');
    if (pg && c.cat === 'play' && !kind.includes(pg.value)) out.add(`${pg.value}があります。`, [pg.src]);
    const sp = f('sport');
    if (sp && c.cat === 'sport' && !kind.includes(sp.value)) out.add(`${sp.value}に使われる設備です。`, [sp.src]);
    const desc = f('description');
    if (desc) out.add(clip(desc.value, 120).replace(/([^。．.!！?？])$/, '$1。'), [desc.src]);
    if (c.cat === 'park' && ctx.contents && ctx.contents.length) {
      const names = ctx.contents.slice(0, 3).map((x) => x.name);
      out.add(`園内には${names.join('、')}${ctx.contents.length > 3 ? 'など' : ''}があります。`, ctx.contents.slice(0, 3).map((x) => x.id));
    }
    return out;
  }

  function support(c, ctx, seed) {
    const out = composer();
    const cat = PSF.candidates.CATEGORIES[c.cat];
    const pl = place(c, ctx.area);
    const label = c.name ? `「${c.name}」` : `この${c.kind}`;
    const where = pl ? (pl.inside ? `${pl.text}の中にある` : `${pl.text}にある`) : '';
    out.add(`申請地点は、${where}${c.kind}${c.name ? label : ''}の位置です。`, [pl && pl.src, c.sources[0] && c.sources[0].id]);

    // 説明文で使った事実は繰り返さず、管理者・利用時間など審査で役立つ記録だけを書く
    const op = c.facts.find((f) => f.key === 'operator');
    if (op) out.add(`管理者は${op.value}と記録されています。`, [op.src]);
    const hours = c.facts.find((f) => f.key === 'opening_hours');
    if (hours) out.add(`利用時間は「${hours.value}」と記録されています。`, [hours.src]);

    const evid = [];
    const srcs = [];
    const osmIds = c.sources.filter((s) => s.type === 'osm').map((s) => s.id);
    if (osmIds.length) { evid.push(`OpenStreetMap（${osmIds.map((i) => i.replace('osm:', '')).join('、')}）に${c.name ? `「${c.name}」として` : ''}登録されていること`); srcs.push(...osmIds); }
    for (const s of c.sources) {
      if (s.type === 'wikipedia' && c.wiki && c.wiki.wp) { evid.push(`Wikipedia日本語版に記事「${c.wiki.wp.title}」があること`); srcs.push(s.id); }
      if (s.type === 'wikidata' && c.wiki && c.wiki.wd) { evid.push(`Wikidata（${c.wiki.wd.qid}）に記録があること`); srcs.push(s.id); }
      if (s.type === 'user') { evid.push('申請者が現地で確認したこと'); srcs.push('user'); }
    }
    if (evid.length) out.add(`存在は、${evid.join('、')}で確認しました。`, srcs);
    if (c.wiki && c.wiki.match === 'name') out.add('（百科事典の情報は名称と位置で照合したものです。）', srcs.filter((s) => /^w[dp]:/.test(s)));

    if (cat && cat.why) {
      const axes = cat.axes.map((a) => `「${a}」`).join('と');
      out.add(pick([
        `${c.kind}は${cat.why}ため、${axes}の観点に関わると考えます。`,
        `${axes}の観点では、${c.kind}が${cat.why}点が関係します。`,
      ], seed + 1), ['category']);
    }
    if (c.insideOf && c.insideOf.length) out.add(`${c.insideOf[0].name}の利用者が立ち寄れる場所にあります。`, [c.insideOf[0].id]);

    const pending = (c.eval && c.eval.onsite) || [];
    if (pending.length) out.add(`［申請前に確認して削除：${pending.length}件の現地確認事項が未確認］`, ['pending']);
    return out;
  }

  function onsiteItems(c) {
    const base = {
      art: ['作品名・作者を示す銘板の有無', '作品の全体が写る撮影位置'],
      memorial: ['碑文や銘板の内容', '建立年や建立者の記載'],
      board: ['掲示内容（何について解説しているか）', '文字が判読できる状態か'],
      historic: ['史跡名を示す標柱・説明板の有無', '文化財指定の表示の有無'],
      worship: ['社名・寺名の表示', '一般の参拝者が立ち入れる範囲'],
      view: ['展望できる方向と景色', '安全に立ち止まれる場所か'],
      park: ['公園名の表示板の位置（申請地点の候補）', '開園時間や立入制限の掲示'],
      play: ['遊具が使用可能な状態か', '公園などの公共の場所にあるか'],
      sport: ['一般に開放されているか', '利用時間や予約制の有無'],
      facility: ['施設名の表示の位置', '一般に公開されているか'],
      community: ['施設名の表示の位置', '誰でも利用できる場所か'],
      landmark: ['名称や由来を示す表示の有無'],
      nature: ['名称や由来を示す説明板の有無（人工の表示があるか）'],
      reference: ['実物が現存するか', '実物の正確な位置'],
      user: ['名称・特徴を示す表示の有無'],
    }[c.cat] || [];
    return ((c.eval && c.eval.onsite) || []).concat(base).concat(['歩行者が安全に近づけるか（車道・線路上でないか）', '私有地や立入禁止の区域でないか']);
  }

  function sourceList(c) {
    const list = c.sources.filter((s) => s.url).map((s) => ({ label: s.label, url: s.url }));
    if (c.links.website) list.push({ label: '公式サイトなど（地図データに記録されたURL）', url: c.links.website });
    return list;
  }

  function searchLinks(c, area) {
    const q = [area && area.municipality, c.name || c.kind].filter(Boolean).join(' ');
    const links = [{ label: `「${q}」をウェブで検索`, url: 'https://www.google.com/search?q=' + encodeURIComponent(q) }];
    if (['historic', 'memorial', 'worship', 'art'].includes(c.cat) && area && area.municipality) {
      links.push({ label: `${area.municipality}の文化財情報を検索`, url: 'https://www.google.com/search?q=' + encodeURIComponent(`${area.municipality} 文化財 ${c.name || ''}`.trim()) });
    }
    return links;
  }

  // ctx: { area, contents（公園内の候補）, variant（再生成のたびに増える） }
  function generate(c, ctx) {
    ctx = ctx || {};
    const seed = hash(c.id) + (ctx.variant || 0);
    const t = title(c);
    const d = description(c, ctx, seed);
    const s = support(c, ctx, seed);
    return {
      title: t.text,
      description: d.text(),
      support: s.text(),
      provisional: t.provisional,
      basis: (c.eval && c.eval.reasons) || [],
      onsite: onsiteItems(c),
      sources: sourceList(c),
      searchLinks: searchLinks(c, ctx.area),
      evidence: {
        title: c.name ? [c.sources[0] && c.sources[0].id] : [],
        description: d.parts,
        support: s.parts,
      },
      generatedAt: new Date().toISOString(),
      variant: ctx.variant || 0,
    };
  }

  // 文字単位の2文字組の重なりで、文章同士の似ている度合いを測る
  function similarity(a, b) {
    const grams = (s) => {
      const t = s.replace(/\s/g, '');
      const set = new Set();
      for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
      return set;
    };
    const A = grams(a), B = grams(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / (A.size + B.size - inter);
  }

  // texts: {title, description, support}。others: 同じセルの他候補の説明文
  function check(c, texts, others) {
    const issues = [];
    const add = (level, field, message) => issues.push({ level, field, message });
    const all = `${texts.title}\n${texts.description}\n${texts.support}`;
    for (const k of ['title', 'description', 'support']) {
      if (!String(texts[k] || '').trim()) add('error', k, `${{ title: 'タイトル', description: '説明文', support: '補助文' }[k]}が空です。`);
    }
    if (/【仮】/.test(texts.title)) add('warn', 'title', 'タイトルが仮のままです。現地で正式な名称を確認して書き換えてください。');
    if (c.name && !PSF.candidates.similarNames(texts.title, c.name)) add('warn', 'title', `タイトルが公開データの名称「${c.name}」と一致しません。表記を確認してください。`);

    const evidenceText = c.facts.map((f) => f.value).join(' ') + ' ' + (c.name || '') + ' ' + (c.insideOf || []).map((p) => p.name).join(' ');
    for (const w of HYPE) {
      if (all.includes(w) && !evidenceText.includes(w)) add('warn', 'all', `「${w}」は根拠が示されていない表現の可能性があります。根拠がなければ削除してください。`);
    }
    const years = new Set((all.match(/\d{3,4}(?=年)/g) || []));
    for (const y of years) if (!evidenceText.includes(y)) add('warn', 'all', `「${y}年」の根拠が候補の情報源にありません。`);
    const quoted = all.match(/「([^」]{2,40})」/g) || [];
    for (const q of quoted) {
      const inner = q.slice(1, -1).replace(/…$/, '');
      const known = evidenceText.includes(inner) || (c.wiki && c.wiki.wp && c.wiki.wp.title.includes(inner)) || ['探索', '運動', '交流'].includes(inner);
      if (!known) add('warn', 'all', `「${inner}」の根拠が候補の情報源にありません。`);
    }
    const dy = new Set((texts.description.match(/\d{3,4}(?=年)/g) || []));
    const sy = new Set((texts.support.match(/\d{3,4}(?=年)/g) || []));
    if (dy.size && sy.size && ![...sy].every((y) => dy.has(y))) add('warn', 'support', '説明文と補助文で年が食い違っています。');
    if (texts.description && texts.support && similarity(texts.description, texts.support) > 0.6) add('warn', 'support', '補助文が説明文とほぼ同じ内容です。審査に役立つ確認方法や基準との関係を書いてください。');
    if (!/探索|運動|交流/.test(texts.support)) add('warn', 'support', '補助文に「探索・運動・交流」のどれに関わるかが書かれていません。');
    if (/［申請前に確認/.test(texts.support)) add('warn', 'support', '補助文に申請前の確認用メモが残っています。確認が済んだら削除してください。');
    const sentences = texts.description.split('。').filter((s) => s.trim()).length;
    if (sentences < 2) add('info', 'description', '説明文の情報が少なめです。銘板や説明板の内容、設置の目的などを現地で確認して追記すると具体的になります。');
    if (!c.inCell) add('warn', 'location', '候補の位置が対象セルの外です。');
    else if (c.cellStatus === 'edge') add('warn', 'location', 'セルの境界付近です。申請位置がセル内かを確認してください。');
    if (!PSF.candidates.precise(c)) add('warn', 'location', '候補の位置は推定です。申請する地点を現地で確認してください。');
    for (const o of others || []) {
      if (o.description && texts.description && similarity(o.description.replace(o.name || '', ''), texts.description.replace(c.name || '', '')) > 0.85) {
        add('info', 'description', `説明文が「${o.name || '別の候補'}」とほとんど同じです。この候補ならではの特徴を加えてください。`);
        break;
      }
    }
    return issues;
  }

  // 外部AIを使う場合に渡す指示文（このアプリは送信しない。利用者が自分で貼り付ける）
  function aiPrompt(c, texts) {
    const facts = c.facts.filter((f) => !f.referenceOnly).map((f) => `- ${f.label}: ${f.value}`).join('\n') || '- （名称以外の情報なし）';
    return `次の申請文の日本語を自然に整えてください。
条件:
- 下の「確認済みの事実」にない情報（歴史、由来、評判、公式認定、利用状況など）を追加しないこと
- 「有名」「人気」など根拠のない評価語を使わないこと
- タイトル・説明文・補助文の3つを分けて出力すること

確認済みの事実:
- 名称: ${c.name || '（未確認）'}
- 種類: ${c.kind}
${facts}

タイトル: ${texts.title}
説明文: ${texts.description}
補助文: ${texts.support}`;
  }

  PSF.writer = { HYPE, generate, check, similarity, aiPrompt, onsiteItems };
})(typeof window !== 'undefined' ? window : globalThis);
