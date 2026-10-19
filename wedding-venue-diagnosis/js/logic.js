/* 診断ロジック（画面処理を含まない純粋な計算部分）。ブラウザと Node.js の両方で動作します。

   判定方法:
   1. 回答から「希望条件」（= Excel のカテゴリ）を集める。同じカテゴリは1回だけ数える。
   2. 各式場について、希望条件のうち Excel 上で該当しているものを数える。
   3. 次の順に並べる（上の項目ほど優先）。
      (1) 最も重視する条件に該当している式場が上
      (2) 該当した希望条件の数が多い式場が上
      (3) 該当した条件が、より多くの質問にまたがっている式場が上（特定の質問だけに偏った一致より、希望全体に広く合う式場を上にする）
      (4) それでも並ぶ場合は Excel の掲載順（行番号が小さい順）。この場合は画面上「同順位」と表示する。
   4. 希望条件に1つも該当しない式場は、おすすめに含めない。 */
(function (root) {
  'use strict';

  function isSelected(q, answers, v) {
    var a = answers[q.id];
    if (q.type === 'multi') return Array.isArray(a) && a.indexOf(v) !== -1;
    return a === v;
  }

  /* 回答 → 希望条件の一覧 [{category, questionId, optionText}] */
  function collectConditions(questions, answers) {
    var out = [], seen = {};
    questions.forEach(function (q) {
      if (q.type === 'priority' || !q.opts) return;
      q.opts.forEach(function (opt) {
        if (!isSelected(q, answers, opt.v)) return;
        (opt.categories || []).forEach(function (cat) {
          if (seen[cat]) return;
          seen[cat] = true;
          out.push({ category: cat, questionId: q.id, optionText: opt.main || opt.text, label: opt.label || opt.main || opt.text });
        });
      });
    });
    return out;
  }

  function evaluateVenue(venue, conditions, priority) {
    var matched = [], unmatched = [], qids = {};
    conditions.forEach(function (c) {
      if (venue.categories.indexOf(c.category) !== -1) { matched.push(c); qids[c.questionId] = true; }
      else unmatched.push(c);
    });
    return {
      venue: venue,
      matched: matched,
      unmatched: unmatched,
      matchCount: matched.length,
      priorityMatch: !!priority && venue.categories.indexOf(priority) !== -1,
      breadth: Object.keys(qids).length,
      rate: conditions.length ? Math.round(matched.length / conditions.length * 100) : 0
    };
  }

  function compareResults(a, b) {
    return (b.priorityMatch - a.priorityMatch) ||
      (b.matchCount - a.matchCount) ||
      (b.breadth - a.breadth) ||
      (a.venue.row - b.venue.row);
  }

  function sameRank(a, b) {
    return a.priorityMatch === b.priorityMatch && a.matchCount === b.matchCount && a.breadth === b.breadth;
  }

  /* 診断の実行。status: 'ok' | 'no_conditions' | 'no_match' */
  function diagnose(data, questions, answers) {
    var conditions = collectConditions(questions, answers);
    var cats = conditions.map(function (c) { return c.category; });
    var priority = (answers.priority && cats.indexOf(answers.priority) !== -1) ? answers.priority : null;

    if (!conditions.length) {
      return { status: 'no_conditions', conditions: [], priority: null, ranked: [], recommended: [], ties: 0 };
    }

    var ranked = data.venues.map(function (v) { return evaluateVenue(v, conditions, priority); });
    ranked.sort(compareResults);
    ranked.forEach(function (r, i) {
      r.rank = (i > 0 && sameRank(r, ranked[i - 1])) ? ranked[i - 1].rank : i + 1;
    });
    ranked.forEach(function (r) {
      r.tied = ranked.some(function (o) { return o !== r && o.rank === r.rank && o.matchCount > 0; });
    });

    var recommended = ranked.filter(function (r) { return r.matchCount > 0; });
    var priorityCount = priority ? ranked.filter(function (r) { return r.priorityMatch; }).length : 0;
    return {
      status: recommended.length ? 'ok' : 'no_match',
      conditions: conditions,
      priority: priority,
      priorityCount: priorityCount,
      ranked: ranked,
      recommended: recommended
    };
  }

  /* おすすめ理由の文章（配列）。文中のカテゴリ名は Excel の表記そのまま。 */
  function buildReasons(result, diag) {
    var q = function (s) { return '「' + s + '」'; };
    var lines = [];
    var total = diag.conditions.length;
    if (diag.priority) {
      lines.push(result.priorityMatch
        ? '最も重視された' + q(diag.priority) + 'に該当する式場です。'
        : '最も重視された' + q(diag.priority) + 'は、この式場の登録データには含まれていません。');
    }
    lines.push('お選びいただいた希望条件' + total + '件のうち、' + result.matchCount + '件（' +
      result.matched.map(function (c) { return q(c.category); }).join('') + '）に該当しています。');
    var selected = diag.conditions.map(function (c) { return c.category; });
    var others = result.venue.categories.filter(function (c) { return selected.indexOf(c) === -1; });
    if (others.length) lines.push('このほか、' + others.map(q).join('') + 'の特徴も登録されています。');
    return lines;
  }

  /* データと質問定義の整合性チェック。errors があると診断を開始しない。 */
  function validate(data, questions) {
    var errors = [], warnings = [];
    if (!data || !Array.isArray(data.venues) || !Array.isArray(data.categories)) {
      return { errors: ['式場データが読み込めませんでした'], warnings: [] };
    }
    var names = {};
    data.venues.forEach(function (v) {
      if (names[v.name]) errors.push('式場名が重複しています: ' + v.name);
      names[v.name] = true;
      v.categories.forEach(function (c) {
        if (data.categories.indexOf(c) === -1) errors.push(v.name + ' のカテゴリ「' + c + '」がカテゴリ一覧にありません');
      });
    });
    var used = {};
    (questions || []).forEach(function (q) {
      (q.opts || []).forEach(function (o) {
        (o.categories || []).forEach(function (c) {
          if (data.categories.indexOf(c) === -1) errors.push('質問「' + q.id + '」の選択肢が、存在しないカテゴリ「' + c + '」を参照しています');
          if (used[c]) warnings.push('カテゴリ「' + c + '」が複数の選択肢で使われています');
          used[c] = true;
        });
      });
    });
    data.categories.forEach(function (c) {
      if (!used[c]) warnings.push('カテゴリ「' + c + '」は、どの質問でも使われていません');
    });
    return { errors: errors, warnings: warnings.concat(data.warnings || []) };
  }

  var api = {
    collectConditions: collectConditions,
    evaluateVenue: evaluateVenue,
    compareResults: compareResults,
    diagnose: diagnose,
    buildReasons: buildReasons,
    validate: validate
  };
  root.VENUE_DIAG = root.VENUE_DIAG || {};
  root.VENUE_DIAG.logic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
