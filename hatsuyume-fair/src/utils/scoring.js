// 診断ロジック。AIは使わず、タグの一致のみで計算する。
// 優先順位（仕様書 §64）: 回答タグ一致 > エリア選択 > ウェディング/フォト区分 > 旅行スタイル > 予算
// 価格は一切使わない（§65）。

import { questions, TAG_LABELS } from "../data/questions.js";

export const AREA_BONUS = 4;
export const PHOTO_FIRST_BONUS = 4;

// 商品側に無いタグの読み替え（family_trip は商品側では family として扱う）
const ALIAS = { family_trip: "family" };

// 回答 { q01: "relax", ... } → タグ別の重み Map
export function buildUserTags(answers) {
  const weights = {};
  let area = null;
  let mode = null;
  for (const q of questions) {
    const choice = q.choices.find((c) => c.id === answers[q.id]);
    if (!choice) continue;
    if (choice.destination) area = choice.destination;
    if (q.id === "q06") mode = choice.id;
    for (const tag of choice.tags) {
      const key = ALIAS[tag] || tag;
      weights[key] = (weights[key] || 0) + (choice.weight ?? q.weight);
    }
  }
  return { weights, area, mode };
}

export function scoreProducts(answers, products) {
  const { weights, area, mode } = buildUserTags(answers);
  const rows = products.map((product, order) => {
    let tagScore = 0;
    const matched = [];
    for (const tag of product.tags) {
      if (weights[tag]) {
        tagScore += weights[tag];
        matched.push(tag);
      }
    }
    const areaScore = area && product.destination === area ? AREA_BONUS : 0;
    const modeScore = mode === "photo_first" && product.category === "photo" ? PHOTO_FIRST_BONUS : 0;
    return { product, order, score: tagScore + areaScore + modeScore, matched };
  });
  rows.sort((a, b) => b.score - a.score || a.order - b.order);
  return { rows, weights, area, mode };
}

// BEST MATCH / ANOTHER CHOICE / DISCOVERY を決める。
// DISCOVERY は「選んだエリア以外」で、上位2件に入らなかった中の最高スコア（自分では選ばなかった候補）。
export function recommend(answers, products) {
  const { rows, weights, area, mode } = scoreProducts(answers, products);
  const best = rows[0];
  const second = rows[1];
  const rest = rows.slice(2);
  const discovery = rest.find((r) => r.product.destination !== area) || rest[0];
  return { best, second, discovery, rows, weights, area, mode };
}

// ---- 表示用 ----

const AXES = [
  { id: "resort", label: "海・リゾート", tags: ["beach", "resort", "relax", "nature"] },
  { id: "travel", label: "旅行", tags: ["travel", "honeymoon", "city", "culture", "short_trip"] },
  { id: "photo", label: "写真", tags: ["photo", "photo_quality", "location", "dress"] },
  { id: "family", label: "家族", tags: ["family"] },
];

// 商品詳細の YOUR MATCH。「評価」ではなく回答との一致度。回答に含まれない軸は出さない。
export function matchBreakdown(weights, product) {
  const out = [];
  for (const axis of AXES) {
    let total = 0;
    let hit = 0;
    for (const tag of axis.tags) {
      const w = weights[tag] || 0;
      total += w;
      if (product.tags.includes(tag)) hit += w;
    }
    if (total > 0) out.push({ label: axis.label, stars: Math.max(1, Math.round((hit / total) * 5)), none: hit === 0 });
  }
  return out;
}

export function reasonLabels(weights, product, limit = 4) {
  return Object.keys(weights)
    .filter((t) => product.tags.includes(t))
    .sort((a, b) => weights[b] - weights[a])
    .slice(0, limit)
    .map((t) => TAG_LABELS[t]);
}

export function userTopLabels(weights, limit = 4) {
  return Object.keys(weights)
    .sort((a, b) => weights[b] - weights[a])
    .slice(0, limit)
    .map((t) => TAG_LABELS[t]);
}
