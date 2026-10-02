// 質問データ。写真は `image` に置けば自動で表示される（無い場合は `tone` のグラデーション枠を表示）。
// image パスは hatsuyume-fair/ からの相対パス。TODO: HIS公式素材に差し替え。

const tone = (a, b, c) => `linear-gradient(165deg, ${a} 0%, ${b} 55%, ${c} 100%)`;

export const welcome = {
  choices: [
    { id: "couple", title: "新郎・新婦" },
    { id: "undecided", title: "まだ何も決まっていない" },
  ],
};

export const questions = [
  {
    id: "q01",
    label: "どんな一日を過ごしたい？",
    weight: 3,
    choices: [
      { id: "relax", en: "RELAX", title: "ふたりきりで、\nゆっくり。", note: "海・サンセット・リゾート", tags: ["relax"], image: "images/q01-relax.jpg", tone: tone("#f1c9a2", "#d58f7c", "#2f4256") },
      { id: "family", en: "TOGETHER", title: "大切な人と、\n一緒に。", note: "家族・ゲスト・挙式", tags: ["family"], image: "images/q01-family.jpg", tone: tone("#f5e6d2", "#dcbb9b", "#8a6a58") },
      { id: "travel", en: "JOURNEY", title: "旅そのものを、\n楽しみたい。", note: "海外の街・観光・ホテル", tags: ["travel"], image: "images/q01-travel.jpg", tone: tone("#d3dde5", "#8fa4b6", "#475a6e") },
      { id: "photo", en: "PHOTOGRAPH", title: "一生残る、\n写真を。", note: "ウェディングフォト", tags: ["photo"], image: "images/q01-photo.jpg", tone: tone("#f0e8de", "#c9b8a5", "#6f5f52") },
    ],
  },
  {
    id: "q02",
    label: "どんな景色に惹かれる？",
    weight: 3,
    choices: [
      { id: "beach", en: "BEACH", title: "海と空", tags: ["beach"], image: "images/q02-beach.jpg", tone: tone("#c4e6e8", "#76c1c6", "#e6d8b8") },
      { id: "city", en: "CITY", title: "海外の街並み", tags: ["city"], image: "images/q02-city.jpg", tone: tone("#dcd1c3", "#a59382", "#54463f") },
      { id: "nature", en: "NATURE", title: "壮大な自然", tags: ["nature"], image: "images/q02-nature.jpg", tone: tone("#bcd4b3", "#6e9a6b", "#2c4838") },
      { id: "culture", en: "CULTURE", title: "教会・宮殿・歴史建築", tags: ["culture"], image: "images/q02-culture.jpg", tone: tone("#e6dccb", "#b9a182", "#5f4e3b") },
    ],
  },
  {
    id: "q03",
    label: "ふたりが一番\n大切にしたいものは？",
    weight: 3,
    choices: [
      { id: "budget", en: "PRICE", title: "賢く、\nお得に。", tags: ["budget"], image: "images/q03-price.jpg", tone: tone("#efe2c3", "#d2b678", "#7d6a3f") },
      { id: "photo_quality", en: "PHOTO", title: "写真に、\nとことんこだわる。", tags: ["photo_quality"], image: "images/q03-photo.jpg", tone: tone("#ece4da", "#bdac9a", "#5f5146") },
      { id: "dress", en: "DRESS", title: "ドレスも、\n自分らしく。", tags: ["dress"], image: "images/q03-dress.jpg", tone: tone("#f4eae8", "#dcc3bf", "#8e7476") },
      { id: "location", en: "LOCATION", title: "ここでしか撮れない、\n景色を。", tags: ["location"], image: "images/q03-location.jpg", tone: tone("#c8d6e2", "#7f99b4", "#33485e") },
    ],
  },
  {
    id: "q04",
    label: "せっかくの旅。\nどう過ごしたい？",
    weight: 3,
    choices: [
      { id: "short_trip", en: "WEDDING FIRST", title: "ウェディングを中心に、\n短めの旅行。", tags: ["short_trip"], weight: 2, image: "images/q04-short.jpg", tone: tone("#e9e2d6", "#bfb09a", "#665a4a") },
      { id: "travel", en: "TRAVEL", title: "挙式だけじゃなく、\n観光も楽しみたい。", tags: ["travel"], image: "images/q04-travel.jpg", tone: tone("#d6e0d4", "#93ae95", "#40584a") },
      { id: "honeymoon", en: "HONEYMOON", title: "結婚式と一緒に、\nハネムーンも楽しみたい。", tags: ["honeymoon"], image: "images/q04-honeymoon.jpg", tone: tone("#f2d7c7", "#d99b8a", "#6e4a4f") },
      { id: "family_trip", en: "FAMILY", title: "家族との時間も\n大切にしたい。", tags: ["family_trip"], image: "images/q04-family.jpg", tone: tone("#f3e6cf", "#dcb98b", "#7f6243") },
    ],
  },
  {
    id: "q05",
    label: "どんなウェディングが好き？",
    weight: 3,
    // 「どの世界観に惹かれるか」。選んだエリアは商品スコアに +4（areaBonus）。
    choices: [
      { id: "hawaii", en: "HAWAII", title: "海・空・リゾート", tags: [], destination: "hawaii", image: "images/q05-hawaii.jpg", tone: tone("#bfe4ea", "#6fbfc9", "#f0d9b3") },
      { id: "europe", en: "EUROPE", title: "街・教会・宮殿・歴史", tags: [], destination: "europe", image: "images/q05-europe.jpg", tone: tone("#ddd2c4", "#a89782", "#4f4238") },
      { id: "okinawa", en: "OKINAWA", title: "海・リゾート・国内旅行", tags: [], destination: "okinawa", image: "images/q05-okinawa.jpg", tone: tone("#c9ece6", "#7ccdc1", "#f3e4c4") },
      { id: "bali", en: "BALI", title: "自然・リゾート・非日常", tags: [], destination: "bali", image: "images/q05-bali.jpg", tone: tone("#c6dcba", "#74a37a", "#2d4b3a") },
    ],
  },
  {
    id: "q06",
    label: "今のふたりに\n一番近いのは？",
    weight: 0,
    // 補正のみ（タグ加点なし）。補正内容は utils/scoring.js
    choices: [
      { id: "ready", en: "READY", title: "もう具体的に探したい", tags: [], image: "images/q06-ready.jpg", tone: tone("#e8dccb", "#c3a77f", "#6b5438") },
      { id: "exploring", en: "EXPLORING", title: "まだ何も決まっていない", tags: [], image: "images/q06-exploring.jpg", tone: tone("#dde6ea", "#9db4c0", "#4a6272") },
      { id: "compare", en: "COMPARE", title: "いろいろ比較して決めたい", tags: [], image: "images/q06-compare.jpg", tone: tone("#e6e0e8", "#b5a8bd", "#5c5066") },
      { id: "photo_first", en: "PHOTO FIRST", title: "挙式より写真を重視したい", tags: [], image: "images/q06-photo-first.jpg", tone: tone("#efe6dc", "#c8b7a3", "#6c5c4f") },
    ],
  },
];

// 予算質問（モックでは無効）。有効化する場合は enabled を true にし、scoring.js の budget 補正を実装する。
// 予算だけで商品を除外しない（順位の補正のみ）。
export const budgetQuestion = {
  id: "q07",
  enabled: false,
  label: "予算感",
  choices: [
    { id: "under100", title: "100万円未満" },
    { id: "100to150", title: "100〜150万円" },
    { id: "150to200", title: "150〜200万円" },
    { id: "over200", title: "200万円以上" },
    { id: "undecided", title: "まだ決めていない" },
  ],
};

export const TAG_LABELS = {
  relax: "ゆったり",
  family: "家族",
  travel: "旅行",
  photo: "写真",
  beach: "海",
  city: "街並み",
  nature: "自然",
  culture: "歴史・建築",
  budget: "お得さ",
  photo_quality: "写真のこだわり",
  dress: "ドレス",
  location: "ここだけの景色",
  short_trip: "短めの旅",
  honeymoon: "ハネムーン",
  family_trip: "家族との時間",
  resort: "リゾート",
  premium: "内容充実",
  original: "ふたりらしさ",
};
