/* =====================================================================
   propose-data.js
   -----------------------------------------------------------------
   Single source of truth for every location / plan / option shown in
   this mockup. In the real Shopify build this object is NOT hand
   written like this — it is assembled at render time by Liquid from:
     - Page metafields (namespace "propose")  → location copy, photos,
       meeting point, duration, FAQ, blocked/limited dates
     - Products + Variants                     → plan names & prices
     - Small standalone Products                → add-on options
   See /shopify-theme/PROPOSE-README.md for the exact field mapping.

   Everything under `demo: true` below (availability calendars) is
   SAMPLE data generated deterministically from the date, clearly
   labelled in the UI as a mock, and never presented as a real,
   bookable inventory feed.
   ===================================================================== */
(function (global) {
  "use strict";

  var OPTION_CATALOG = [
    { id: "flower", name: "花束", nameEn: "FLOWER", price: 15000, desc: "プロポーズの瞬間に贈る花束をご用意します。" },
    { id: "transfer", name: "専用送迎", nameEn: "PRIVATE TRANSFER", price: 30000, desc: "ホテル⇄撮影地の専用車での送迎。" },
    { id: "extra-photo", name: "追加撮影30分", nameEn: "EXTRA PHOTO", price: 20000, desc: "撮影時間を30分延長し、カット数を追加します。" },
    { id: "sunset", name: "サンセットタイム指定", nameEn: "SUNSET TIME", price: 10000, desc: "日没時刻に合わせた時間帯を確保します。" }
  ];

  function optionsFor(includedIds) {
    return OPTION_CATALOG.map(function (opt) {
      return Object.assign({}, opt, { included: includedIds.indexOf(opt.id) > -1 });
    });
  }

  function plansFor(base) {
    return [
      {
        id: "basic",
        name: "BASIC",
        nameJa: "ベーシック",
        price: base,
        includes: ["プロカメラマンによる撮影（約30分）", "写真データ30カット〜（オンライン納品）", "現地日本語サポート"],
        includedOptionIds: []
      },
      {
        id: "flower",
        name: "FLOWER",
        nameJa: "フラワー",
        price: base + 15000,
        includes: ["BASICの内容すべて", "プロポーズ用花束"],
        includedOptionIds: ["flower"]
      },
      {
        id: "premium",
        name: "PREMIUM",
        nameJa: "プレミアム",
        price: base + 45000,
        includes: ["FLOWERの内容すべて", "専用送迎（ホテル⇄撮影地）"],
        includedOptionIds: ["flower", "transfer"]
      }
    ];
  }

  var TIME_SLOTS = ["15:00", "16:00", "17:00", "17:30", "18:00"];
  var BEST_TIME = "17:30";

  // Deterministic pseudo-random availability so the demo calendar is
  // stable across reloads without pretending to be a live feed.
  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function availabilityFor(locationId, dateStr) {
    var day = new Date(dateStr).getDay();
    if (day === 2) return "closed"; // 火曜定休（デモ設定）
    var v = hash(locationId + dateStr) % 10;
    if (v < 5) return "available";
    if (v < 8) return "few";
    return "soldout";
  }

  var LOCATIONS = [
    {
      id: "hawaii", name: "HAWAII", nameJa: "ハワイ", popular: true,
      tagline: "海に沈む夕日と、ふたりだけの時間。",
      lede: "定番のロマンティックな海。夕暮れのビーチで、想いを伝える王道の舞台。",
      meetingPoint: "ワイキキ ハレクラニ前ビーチ", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#2c5f74", "#e08a4f"], base: 128000
    },
    {
      id: "miyakojima", name: "MIYAKOJIMA", nameJa: "宮古島", popular: true,
      tagline: "どこまでも続く青の中で。",
      lede: "国内最高峰の透明度を誇る海。パスポートなしで行ける特別な舞台。",
      meetingPoint: "与那覇前浜ビーチ", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#1c7f9c", "#7fd8d0"], base: 108000
    },
    {
      id: "santorini", name: "SANTORINI", nameJa: "サントリーニ島", popular: true,
      tagline: "白と青の街で。",
      lede: "断崖に広がる白亜の街並みとエーゲ海。世界一有名な夕日の舞台。",
      meetingPoint: "イア地区 展望テラス", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#1e4d8c", "#f4f1ea"], base: 168000
    },
    {
      id: "italy", name: "ITALY", nameJa: "イタリア", popular: false,
      tagline: "憧れの街並みを、ふたりの記念日に。",
      lede: "石畳とクラシックな街並み。歴史ある街角がふたりの物語の舞台になる。",
      meetingPoint: "ヴェネツィア／フィレンツェ 市内（要相談）", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#7a5230", "#d9b979"], base: 178000
    },
    {
      id: "paris", name: "PARIS", nameJa: "パリ", popular: true,
      tagline: "憧れの街を、ふたりの記念日に。",
      lede: "エッフェル塔とセーヌ川。誰もが憧れる「愛の街」で伝える言葉。",
      meetingPoint: "トロカデロ広場", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#4a4e69", "#c9ada7"], base: 158000
    },
    {
      id: "cappadocia", name: "CAPPADOCIA", nameJa: "カッパドキア", popular: false,
      tagline: "地平線を染める朝焼けの中で。",
      lede: "奇岩と気球が浮かぶ非日常の絶景。忘れられない朝を演出する舞台。",
      meetingPoint: "ローズバレー展望ポイント", duration: "約2時間（早朝撮影30分＋前後準備）",
      hue: ["#b5651d", "#f2c078"], base: 188000
    },
    {
      id: "maldives", name: "MALDIVES", nameJa: "モルディブ", popular: false,
      tagline: "水平線の上に浮かぶ楽園で。",
      lede: "コバルトブルーの海に浮かぶ水上ヴィラ。ふたりだけの楽園が舞台になる。",
      meetingPoint: "宿泊リゾート内（要事前確認）", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#0f6e8c", "#bfe6dd"], base: 198000
    },
    {
      id: "bali", name: "BALI", nameJa: "バリ島", popular: false,
      tagline: "南国の風と緑に包まれて。",
      lede: "棚田と海、寺院が織りなす南国の景色。開放的な自然の中で伝える。",
      meetingPoint: "ウルワツ／タナロット周辺（要相談）", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#2f6e4f", "#f4d35e"], base: 118000
    },
    {
      id: "cancun", name: "CANCUN", nameJa: "カンクン", popular: false,
      tagline: "カリブ海の白い砂浜で。",
      lede: "エメラルドグリーンの海と白砂のビーチ。リゾート感あふれる舞台。",
      meetingPoint: "ホテルゾーン ビーチフロント", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#0a9396", "#e9d8a6"], base: 148000
    },
    {
      id: "ayersrock", name: "AYERS ROCK", nameJa: "エアーズロック", popular: false,
      tagline: "大地が赤く染まる瞬間に。",
      lede: "世界遺産ウルルが夕陽で赤く染まる、地球規模のスケール感が舞台になる。",
      meetingPoint: "サンセットビューイングエリア", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#a4462f", "#e8c07d"], base: 168000
    }
  ];

  LOCATIONS.forEach(function (loc) {
    loc.plans = plansFor(loc.base);
    loc.fromPrice = loc.plans[0].price;
    loc.timeSlots = TIME_SLOTS;
    loc.bestTime = BEST_TIME;
  });

  var FAQ = [
    { q: "プロポーズ相手にはどう伝えればいいですか？", a: "「夕日を見に行こう」「ホテルの送迎で少し出かけよう」など、旅行中の自然な誘い方の例をロケーションページでご紹介しています。詳しくは各ロケーションページの「誘い方のヒント」をご覧ください。" },
    { q: "写真撮影はどのタイミングで行われますか？", a: "カメラマンは離れた場所で自然に待機し、プロポーズの瞬間から撮影を開始します。撮影が始まったことに気づかれにくいよう配慮しています。" },
    { q: "雨天の場合はどうなりますか？", a: "予備日・室内代替プランをご用意できる場合があります。天候によるキャンセル・日程変更の条件は予約確認画面でご案内します。" },
    { q: "予約後にキャンセルはできますか？", a: "予約日の一定期間前まではキャンセル・返金が可能です。詳細な規定は予約確認画面および注文確認メールに記載します。" },
    { q: "日程の変更はできますか？", a: "空き状況によって日程変更が可能です。マイページまたはサポート窓口からご相談ください。" },
    { q: "花束は用意してもらえますか？", a: "FLOWERプラン以上で花束が含まれます。BASICプランでもオプションとして追加できます。" },
    { q: "送迎はありますか？", a: "PREMIUMプランに専用送迎が含まれます。BASIC・FLOWERプランでもオプションとして追加可能です。" },
    { q: "写真はいつ届きますか？", a: "撮影後、順次オンラインで納品します。納品までの目安日数は予約確認画面でご案内します。" },
    { q: "何日前まで予約できますか？", a: "ロケーション・時期によって異なります。予約カレンダー上で予約可能な直近日を確認できます。" },
    { q: "現地で日本語対応はできますか？", a: "現地日本語スタッフによるサポートが含まれます（詳細はプラン内容をご確認ください）。" },
    { q: "プロポーズをする場所は選べますか？", a: "各ロケーションには推奨撮影スポットがありますが、当日の状況に応じてスタッフがご提案します。" }
  ];

  var HOW_IT_WORKS = [
    { step: "01", title: "指定場所へ移動", desc: "集合場所からふたりで撮影ポイントへ向かいます。" },
    { step: "02", title: "フォトグラファーが自然に待機", desc: "気づかれない距離感で、カメラマンがスタンバイします。" },
    { step: "03", title: "ふたりの時間を作る", desc: "景色を眺めながら、自然な会話の時間を過ごします。" },
    { step: "04", title: "プロポーズ", desc: "想いを伝える、その瞬間。" },
    { step: "05", title: "そのまま撮影", desc: "気づかれることなく、瞬間を撮影します。" },
    { step: "06", title: "写真を受け取る", desc: "撮影後、オンラインで写真データをお届けします。" }
  ];

  var INVITE_TIPS = [
    "旅行中に「夕日を見に行こう」と自然に連れ出す",
    "ホテルの送迎・オプショナルツアーとして案内する",
    "記念日や誕生日のディナー前の散歩として誘う"
  ];

  global.ProposeData = {
    locations: LOCATIONS,
    optionCatalog: OPTION_CATALOG,
    optionsFor: optionsFor,
    faq: FAQ,
    howItWorks: HOW_IT_WORKS,
    inviteTips: INVITE_TIPS,
    getLocation: function (id) {
      return LOCATIONS.filter(function (l) { return l.id === id; })[0] || null;
    },
    availabilityFor: availabilityFor,
    formatYen: function (n) {
      return "¥" + Number(n).toLocaleString("ja-JP");
    }
  };
})(window);
