// 商品マスター。
// 現行「HIS決算大感謝SALE」(https://www.his-wedding.com/sp/fair/kessan/) の FIND YOUR STAGE 8カテゴリーを土台にする。
//
// ⚠ 本ファイルの作成時、現行ページへ接続できなかった（実行環境の通信制限）。
//   そのため price / discount / limited / venue / catchcopy / description / title は未確認。
//   架空の値は入れず、すべて TODO にしている。現行ページから転記して差し替えること。
//   - 値が TODO（または null）の項目は画面上に「TODO」と表示される。
//   - 1カテゴリーに複数商品がある場合は、この配列に商品を追加するだけでよい（スコア計算・表示は自動対応）。
//
// tags は仕様書 §26 のとおり。

export const TODO = "TODO";

const SOURCE = "https://www.his-wedding.com/sp/fair/kessan/";

export const categories = [
  { id: "okinawa", group: "WEDDING", ja: "沖縄", en: "OKINAWA" },
  { id: "hawaii", group: "WEDDING", ja: "ハワイ", en: "HAWAII" },
  { id: "guam", group: "WEDDING", ja: "グアム", en: "GUAM" },
  { id: "europe", group: "WEDDING", ja: "ヨーロッパ", en: "EUROPE" },
  { id: "bali", group: "WEDDING", ja: "バリ島", en: "BALI" },
  { id: "australia", group: "WEDDING", ja: "オーストラリア", en: "AUSTRALIA" },
  { id: "premium", group: "PREMIUM", ja: "内容充実プラン", en: "PREMIUM" },
  { id: "photo", group: "PHOTO", ja: "フォトウェディング", en: "PHOTO WEDDING" },
];

const base = {
  title: null, // TODO: 商品名
  catchcopy: TODO,
  image: null, // TODO: 現行ページ掲載素材 → images/products/xxx.jpg
  price: TODO,
  discount: TODO,
  limited: TODO,
  venue: TODO,
  description: TODO,
  sourceUrl: SOURCE, // TODO: 商品個別URL
};

export const products = [
  { ...base, id: "hawaii_01", category: "wedding", destination: "hawaii", tone: ["#bfe4ea", "#6fbfc9", "#f0d9b3"],
    tags: ["beach", "resort", "travel", "photo", "relax", "honeymoon"] },
  { ...base, id: "okinawa_01", category: "wedding", destination: "okinawa", tone: ["#c9ece6", "#7ccdc1", "#f3e4c4"],
    tags: ["beach", "resort", "family", "budget", "short_trip"] },
  { ...base, id: "guam_01", category: "wedding", destination: "guam", tone: ["#cdeaf0", "#7bc3d6", "#f1e2c2"],
    tags: ["beach", "budget", "family", "short_trip"] },
  { ...base, id: "europe_01", category: "wedding", destination: "europe", tone: ["#ddd2c4", "#a89782", "#4f4238"],
    tags: ["city", "culture", "location", "travel", "original"] },
  { ...base, id: "bali_01", category: "wedding", destination: "bali", tone: ["#c6dcba", "#74a37a", "#2d4b3a"],
    tags: ["beach", "nature", "resort", "relax", "original"] },
  { ...base, id: "australia_01", category: "wedding", destination: "australia", tone: ["#d8dcc2", "#9aab86", "#46583f"],
    tags: ["nature", "travel", "location", "original"] },
  { ...base, id: "premium_01", category: "premium", destination: null, tone: ["#f1e6d2", "#cdb084", "#6d5636"],
    tags: ["premium", "dress", "photo_quality", "original"] },
  { ...base, id: "photo_01", category: "photo", destination: null, tone: ["#efe6dc", "#c8b7a3", "#6c5c4f"],
    tags: ["photo", "photo_quality", "location", "original"] },
];

export const categoryOf = (p) => categories.find((c) => c.id === (p.destination || p.category));

export const productName = (p) => p.title || `${categoryOf(p).ja}`;
