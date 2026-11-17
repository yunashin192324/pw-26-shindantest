/* 診断ロジック（画面処理を含まない計算部分）。ブラウザと Node.js の両方で動作します。

   流れ:
   1. 国・地域を決める（決まっていなければ、日数とお子さまの有無からおすすめの地域を出して選んでもらう）。
   2. 選んだ地域の式場だけを候補にし、その地域用の質問をする。
      ・候補の中に当てはまる式場がない選択肢は表示しない。
      ・違いが出ない質問（選べる選択肢がない、候補が1件以下）は出さない。
      ・沖縄の島選びのように、選んだ答えで候補を絞る選択肢もある（filter）。
   3. 回答から「希望条件」を集め、候補の式場を次の順に並べる（上ほど優先）。
      (1) 最も重視する条件に該当している
      (2) 該当した希望条件の数が多い（挙式スタイルのように required の選択肢は、該当する式場だけを候補にする）
      (3) 回答で決まる表示順（例：ステンドグラス重視ならフィレンツェ→パリ）
      (4) 人気順（式場追加情報.xlsx。未入力は後ろ）
      (5) 診断.xlsx の掲載順
      (1)(2)が同じ式場は「同順位」とする。
   4. 希望条件に1つも該当しない式場はおすすめしない。条件が無い・誰も該当しない場合は、
      選んだ地域の式場を人気順で案内する（根拠は「選んだ地域」であることを明示する）。

   式場の特徴（categories）＝ 診断.xlsx のカテゴリ ＋ 式場追加情報.xlsx から作った特徴（features）。 */
(function (root) {
  'use strict';

  function arr(a) { return Array.isArray(a) ? a : (a === undefined || a === null ? [] : [a]); }

  /* 式場データと追加情報をまとめる */
  function prepare(data, extras, config) {
    extras = extras || {};
    var regions = (config && config.regions) || [];
    var venues = data.venues.map(function (v) {
      var ex = extras[v.name] || {};
      var features = arr(ex.features);
      var region = null;
      regions.forEach(function (r) {
        if (!region && ex.area && arr(r.areaPrefixes).some(function (p) { return ex.area.indexOf(p) === 0; })) region = r.id;
      });
      return {
        id: v.id, row: v.row, name: v.name,
        excel: v.categories.slice(),
        features: features,
        categories: v.categories.concat(features.filter(function (f) { return v.categories.indexOf(f) === -1; })),
        area: ex.area || '', region: region,
        order: typeof ex.order === 'number' ? ex.order : Infinity,
        extras: ex
      };
    });
    return { venues: venues, categories: data.categories.slice(), source: data.source, regions: regions, config: config || {} };
  }

  function regionById(model, id) {
    for (var i = 0; i < model.regions.length; i++) if (model.regions[i].id === id) return model.regions[i];
    return null;
  }

  function matchesAll(v, cats) {
    for (var i = 0; i < cats.length; i++) if (v.categories.indexOf(cats[i]) === -1) return false;
    return true;
  }

  function isSelected(q, answers, v) {
    var a = answers[q.id];
    return q.type === 'multi' ? arr(a).indexOf(v) !== -1 : a === v;
  }

  /* 選択肢が「意味を持つ」か（条件・絞り込み・地域のいずれかを持つ） */
  function effective(o) { return arr(o.categories).length > 0 || !!o.filter || !!o.region; }

  function applyFilter(pool, f) {
    if (!f) return pool;
    return pool.filter(function (v) { return !f.areas || f.areas.indexOf(v.area) !== -1; });
  }

  function showIfOk(q, answers, shown) {
    if (!q.showIf) return true;
    var s = q.showIf;
    if (!shown[s.q]) return false;
    var a = arr(answers[s.q]);
    return a.some(function (x) { return arr(s.in).indexOf(x) !== -1; });
  }

  function regionOptions(model, pool) {
    return model.regions.map(function (r) {
      var n = pool.filter(function (v) { return v.region === r.id; }).length;
      return { v: r.id, main: r.label, sub: '式場 ' + n + '件', region: r.id, count: n };
    }).filter(function (o) { return o.count > 0; });
  }

  function regionPickOptions(model, answers) {
    var cfg = model.config || {};
    var days = Number(answers.days) || 0;
    var list = model.regions.filter(function (r) {
      return (!days || (r.minDays || 0) <= days) && model.venues.some(function (v) { return v.region === r.id; });
    });
    var kidsOrder = arr(cfg.kidsRegionOrder);
    if (answers.kids === 'yes' && kidsOrder.length) {
      var rank = function (r) { var i = kidsOrder.indexOf(r.id); return i === -1 ? kidsOrder.length + model.regions.indexOf(r) : i; };
      list = list.slice().sort(function (a, b) { return rank(a) - rank(b); });
    }
    return list.map(function (r) {
      var n = model.venues.filter(function (v) { return v.region === r.id; }).length;
      return { v: r.id, main: r.label, sub: '式場 ' + n + '件', region: r.id };
    });
  }

  /* 回答から、表示する質問と選択肢・候補の式場・希望条件を求める */
  function evaluateFlow(model, questions, answers) {
    var steps = [], shown = {}, pool = model.venues.slice(), region = null, conditions = [], seen = {}, tieOrder = null;
    var priorityQ = null;

    function addConditions(q, opts) {
      opts.forEach(function (o) {
        if (!isSelected(q, answers, o.v)) return;
        if (o.tieOrder) tieOrder = o.tieOrder;
        arr(o.categories).forEach(function (cat) {
          if (seen[cat]) return;
          seen[cat] = true;
          conditions.push({ category: cat, questionId: q.id, optionText: o.main || o.text, required: !!o.required, single: arr(o.categories).length === 1 });
        });
      });
    }

    questions.forEach(function (q) {
      if (q.type === 'priority') { priorityQ = q; return; }
      if (!showIfOk(q, answers, shown)) return;
      if (q.regions && (!region || q.regions.indexOf(region) === -1)) return;

      var opts;
      if (q.type === 'region') {
        opts = (q.undecidedOption ? [q.undecidedOption] : []).concat(regionOptions(model, pool));   // 「まだ決めていない」を先頭に
      } else if (q.type === 'regionPick') {
        opts = regionPickOptions(model, answers);
      } else {
        if (region && pool.length <= 1) return;           // 候補が1件以下なら聞く意味がない
        // 当てはまる式場が無い選択肢と、全候補に当てはまり違いが出ない選択肢は表示しない
        opts = q.opts.filter(function (o) {
          if (!effective(o)) return true;
          var p = applyFilter(pool, o.filter);
          var n = p.filter(function (v) { return matchesAll(v, arr(o.categories)); }).length;
          return n > 0 && (n < pool.length || !!o.filter || !!o.tieOrder);
        });
        if (!q.alwaysShow && !opts.some(effective)) return;  // 違いの出る選択肢がない
      }

      steps.push({ q: q, opts: opts });
      shown[q.id] = true;
      var a = answers[q.id];
      var visible = opts.some(function (o) { return q.type === 'multi' ? arr(a).indexOf(o.v) !== -1 : a === o.v; });
      if (!visible) return;

      if (q.type === 'region' || q.type === 'regionPick') {
        if (!q.undecidedOption || a !== q.undecidedOption.v) {
          region = a;
          pool = pool.filter(function (v) { return v.region === region; });
        }
        return;
      }
      opts.forEach(function (o) {
        if (!isSelected(q, answers, o.v)) return;
        if (o.filter) pool = applyFilter(pool, o.filter);
        if (o.required) pool = pool.filter(function (v) { return matchesAll(v, arr(o.categories)); });
      });
      addConditions(q, opts);
    });

    var free = conditions.filter(function (c) { return !c.required; });   // 絞り込みに使った条件は最重視の対象外
    if (priorityQ && free.length >= 2 && region) {
      var popts = free.map(function (c) { return { v: c.category, main: c.single ? c.optionText : c.category, sub: '条件：' + c.category }; });
      if (priorityQ.noneOption) popts.push(priorityQ.noneOption);
      steps.push({ q: priorityQ, opts: popts });
      shown[priorityQ.id] = true;
    }
    return { steps: steps, pool: pool, region: region, conditions: conditions, tieOrder: tieOrder, shown: shown };
  }

  function evaluateVenue(venue, conditions, priority) {
    var matched = [], unmatched = [];
    conditions.forEach(function (c) { (venue.categories.indexOf(c.category) !== -1 ? matched : unmatched).push(c); });
    return {
      venue: venue, matched: matched, unmatched: unmatched, matchCount: matched.length,
      priorityMatch: !!priority && venue.categories.indexOf(priority) !== -1,
      rate: conditions.length ? Math.round(matched.length / conditions.length * 100) : 0
    };
  }

  function compareResults(a, b) {
    return (b.priorityMatch - a.priorityMatch) ||
      (b.matchCount - a.matchCount) ||
      (a.answerOrder - b.answerOrder || 0) ||
      (a.venue.order - b.venue.order || 0) ||
      (a.venue.row - b.venue.row);
  }

  /* 診断の実行。status: 'ok'（条件に該当あり） | 'region_only'（地域の式場を人気順で案内） | 'no_region' */
  function diagnose(model, questions, answers) {
    var f = evaluateFlow(model, questions, answers);
    var cats = f.conditions.map(function (c) { return c.category; });
    var priority = f.shown.priority && answers.priority && cats.indexOf(answers.priority) !== -1 ? answers.priority : null;
    var base = { conditions: f.conditions, priority: priority, region: f.region, regionLabel: (regionById(model, f.region) || {}).label || '', pool: f.pool };
    if (!f.region) return Object.assign(base, { status: 'no_region', ranked: [], recommended: [] });

    var tie = arr(f.tieOrder);
    var ranked = f.pool.map(function (v) {
      var r = evaluateVenue(v, f.conditions, priority);
      var i = tie.indexOf(v.name);
      r.answerOrder = i === -1 ? Infinity : i;
      return r;
    });
    ranked.sort(compareResults);
    ranked.forEach(function (r, i) {
      var p = ranked[i - 1];
      r.rank = (p && p.priorityMatch === r.priorityMatch && p.matchCount === r.matchCount) ? p.rank : i + 1;
    });
    var recommended = f.conditions.length ? ranked.filter(function (r) { return r.matchCount > 0; }) : [];
    var status = 'ok';
    if (!recommended.length) {
      status = 'region_only';
      recommended = ranked.slice();
      recommended.forEach(function (r, i) { r.rank = i + 1; });
    }
    recommended.forEach(function (r) {
      r.tied = recommended.some(function (o) { return o !== r && o.rank === r.rank; });
    });
    var priorityCount = priority ? f.pool.filter(function (v) { return v.categories.indexOf(priority) !== -1; }).length : 0;
    return Object.assign(base, { status: status, ranked: ranked, recommended: recommended, priorityCount: priorityCount, noMatch: status === 'region_only' && f.conditions.length > 0 });
  }

  /* おすすめ理由の文章（配列） */
  function buildReasons(result, diag) {
    var q = function (s) { return '「' + s + '」'; };
    var lines = [];
    if (diag.regionLabel) lines.push('お選びいただいたエリア（' + diag.regionLabel + '）の式場です。');
    if (diag.status === 'region_only') {
      lines.push(diag.conditions.length
        ? 'ご希望の条件に該当する式場はこのエリアにありませんでした。このエリアで人気の高い順にご案内しています。'
        : 'このエリアで人気の高い順にご案内しています。');
    } else {
      if (diag.priority) {
        lines.push(result.priorityMatch
          ? '最も重視された' + q(diag.priority) + 'に該当します。'
          : '最も重視された' + q(diag.priority) + 'は、この式場の登録データには含まれていません。');
      }
      lines.push('ご希望の条件' + diag.conditions.length + '件のうち、' + result.matchCount + '件（' +
        result.matched.map(function (c) { return q(c.category); }).join('') + '）に該当しています。');
    }
    var selected = diag.conditions.map(function (c) { return c.category; });
    var others = result.venue.excel.filter(function (c) { return selected.indexOf(c) === -1; });
    if (others.length) lines.push('このほか、' + others.map(q).join('') + 'の特徴も登録されています。');
    return lines;
  }

  /* データ・質問・設定の整合性チェック。errors があると診断を開始しない。 */
  function validate(model, questions) {
    var errors = [], warnings = [];
    if (!model || !model.venues || !model.venues.length) return { errors: ['式場データが読み込めませんでした'], warnings: [] };
    var names = {}, known = {};
    model.venues.forEach(function (v) {
      if (names[v.name]) errors.push('式場名が重複しています: ' + v.name);
      names[v.name] = true;
      v.categories.forEach(function (c) { known[c] = true; });
      if (!v.region) warnings.push(v.name + ' のエリアが未設定、または地域の設定に無いため、診断の候補に入りません');
    });
    model.categories.forEach(function (c) { known[c] = true; });
    var used = {};
    (questions || []).forEach(function (q) {
      if (q.showIf && !questions.some(function (x) { return x.id === q.showIf.q; })) errors.push('質問「' + q.id + '」の表示条件が存在しない質問を参照しています');
      (q.opts || []).forEach(function (o) {
        arr(o.categories).forEach(function (c) {
          used[c] = true;
          if (!known[c]) warnings.push('質問「' + q.id + '」の選択肢「' + (o.main || o.text) + '」の条件「' + c + '」に該当する式場がありません（選択肢は表示されません）');
        });
      });
    });
    model.categories.forEach(function (c) { if (!used[c]) warnings.push('診断.xlsx のカテゴリ「' + c + '」は、どの質問でも使われていません'); });
    return { errors: errors, warnings: warnings };
  }

  var api = {
    prepare: prepare, evaluateFlow: evaluateFlow, evaluateVenue: evaluateVenue,
    compareResults: compareResults, diagnose: diagnose, buildReasons: buildReasons, validate: validate
  };
  root.VENUE_DIAG = root.VENUE_DIAG || {};
  root.VENUE_DIAG.logic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
