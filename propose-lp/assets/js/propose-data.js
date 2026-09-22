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
      hue: ["#2c5f74", "#e08a4f"], base: 128000, motif: "palm"
    },
    {
      id: "miyakojima", name: "MIYAKOJIMA", nameJa: "宮古島", popular: true,
      tagline: "どこまでも続く青の中で。",
      lede: "国内最高峰の透明度を誇る海。パスポートなしで行ける特別な舞台。",
      meetingPoint: "与那覇前浜ビーチ", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#1c7f9c", "#7fd8d0"], base: 108000, motif: "wave"
    },
    {
      id: "santorini", name: "SANTORINI", nameJa: "サントリーニ島", popular: true,
      tagline: "白と青の街で。",
      lede: "断崖に広がる白亜の街並みとエーゲ海。世界一有名な夕日の舞台。",
      meetingPoint: "イア地区 展望テラス", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#1e4d8c", "#f4f1ea"], base: 168000, motif: "dome"
    },
    {
      id: "italy", name: "ITALY", nameJa: "イタリア", popular: false,
      tagline: "憧れの街並みを、ふたりの記念日に。",
      lede: "石畳とクラシックな街並み。歴史ある街角がふたりの物語の舞台になる。",
      meetingPoint: "ヴェネツィア／フィレンツェ 市内（要相談）", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#7a5230", "#d9b979"], base: 178000, motif: "arch"
    },
    {
      id: "paris", name: "PARIS", nameJa: "パリ", popular: true,
      tagline: "憧れの街を、ふたりの記念日に。",
      lede: "エッフェル塔とセーヌ川。誰もが憧れる「愛の街」で伝える言葉。",
      meetingPoint: "トロカデロ広場", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#4a4e69", "#c9ada7"], base: 158000, motif: "tower"
    },
    {
      id: "cappadocia", name: "CAPPADOCIA", nameJa: "カッパドキア", popular: false,
      tagline: "地平線を染める朝焼けの中で。",
      lede: "奇岩と気球が浮かぶ非日常の絶景。忘れられない朝を演出する舞台。",
      meetingPoint: "ローズバレー展望ポイント", duration: "約2時間（早朝撮影30分＋前後準備）",
      hue: ["#b5651d", "#f2c078"], base: 188000, motif: "balloon"
    },
    {
      id: "maldives", name: "MALDIVES", nameJa: "モルディブ", popular: false,
      tagline: "水平線の上に浮かぶ楽園で。",
      lede: "コバルトブルーの海に浮かぶ水上ヴィラ。ふたりだけの楽園が舞台になる。",
      meetingPoint: "宿泊リゾート内（要事前確認）", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#0f6e8c", "#bfe6dd"], base: 198000, motif: "villa"
    },
    {
      id: "bali", name: "BALI", nameJa: "バリ島", popular: false,
      tagline: "南国の風と緑に包まれて。",
      lede: "棚田と海、寺院が織りなす南国の景色。開放的な自然の中で伝える。",
      meetingPoint: "ウルワツ／タナロット周辺（要相談）", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#2f6e4f", "#f4d35e"], base: 118000, motif: "gate"
    },
    {
      id: "cancun", name: "CANCUN", nameJa: "カンクン", popular: false,
      tagline: "カリブ海の白い砂浜で。",
      lede: "エメラルドグリーンの海と白砂のビーチ。リゾート感あふれる舞台。",
      meetingPoint: "ホテルゾーン ビーチフロント", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#0a9396", "#e9d8a6"], base: 148000, motif: "palm"
    },
    {
      id: "ayersrock", name: "AYERS ROCK", nameJa: "エアーズロック", popular: false,
      tagline: "大地が赤く染まる瞬間に。",
      lede: "世界遺産ウルルが夕陽で赤く染まる、地球規模のスケール感が舞台になる。",
      meetingPoint: "サンセットビューイングエリア", duration: "約2時間（撮影30分＋前後準備）",
      hue: ["#a4462f", "#e8c07d"], base: 168000, motif: "rock"
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

  /* ---- Illustrated placeholder scenes (inline SVG, fully offline) ----
     No real photography exists yet, so every ".ph" slot gets a small
     hand-built travel-poster illustration instead of a flat colour
     swatch: a sky/sea gradient, a sun glow, a horizon line, and a
     silhouette matching the destination's motif. Swap for real photos
     later — the aspect ratios and cropping already match. Shared by
     propose.js / propose-location.js / propose-booking.js via
     ProposeData.paintPH(root). */
  function silhouettePath(motif) {
    switch (motif) {
      case "palm":
        return '<path d="M52 100 L54 58 Q42 52 36 42 Q47 46 54 52 Q51 36 40 27 Q53 31 56 45 Q60 29 73 23 Q63 34 58 47 Q69 40 80 42 Q68 46 57 54 Q60 58 58 68 L57 100 Z" fill="rgba(20,15,10,.5)"/>';
      case "wave":
        return (
          '<path d="M0 82 Q12 74 24 82 T48 82 T72 82 T96 82 T120 82 V100 H0 Z" fill="rgba(20,15,10,.32)"/>' +
          '<path d="M0 90 Q14 84 28 90 T56 90 T84 90 T112 90 V100 H0 Z" fill="rgba(20,15,10,.22)"/>'
        );
      case "dome":
        return (
          '<rect x="30" y="72" width="12" height="16" fill="rgba(20,15,10,.5)"/>' +
          '<rect x="46" y="66" width="14" height="22" fill="rgba(20,15,10,.5)"/>' +
          '<circle cx="53" cy="62" r="8" fill="rgba(20,15,10,.5)"/>' +
          '<rect x="64" y="76" width="10" height="12" fill="rgba(20,15,10,.5)"/>'
        );
      case "arch":
        return (
          '<path d="M28 88 V64 Q28 52 40 52 Q52 52 52 64 V88 Z M32 88 V66 Q32 58 40 58 Q48 58 48 66 V88 Z" fill="rgba(20,15,10,.5)" fill-rule="evenodd"/>' +
          '<path d="M56 88 V70 Q56 60 66 60 Q76 60 76 70 V88 Z M60 88 V71 Q60 65 66 65 Q72 65 72 71 V88 Z" fill="rgba(20,15,10,.4)" fill-rule="evenodd"/>'
        );
      case "tower":
        return '<path d="M50 22 L56 40 L52 40 L60 62 L54 62 L64 90 L36 90 L46 62 L40 62 L48 40 L44 40 Z" fill="rgba(20,15,10,.5)"/>';
      case "balloon":
        return (
          '<ellipse cx="38" cy="34" rx="11" ry="14" fill="rgba(20,15,10,.42)"/><rect x="35" y="47" width="6" height="5" fill="rgba(20,15,10,.42)"/>' +
          '<ellipse cx="66" cy="24" rx="14" ry="18" fill="rgba(20,15,10,.5)"/><rect x="62" y="40" width="8" height="6" fill="rgba(20,15,10,.5)"/>' +
          '<ellipse cx="82" cy="42" rx="8" ry="10" fill="rgba(20,15,10,.34)"/><rect x="79" y="51" width="5" height="4" fill="rgba(20,15,10,.34)"/>'
        );
      case "villa":
        return (
          '<path d="M18 92 L18 80 L30 74 L42 80 L42 92 Z" fill="rgba(20,15,10,.4)"/>' +
          '<path d="M46 90 L46 76 L60 68 L74 76 L74 90 Z" fill="rgba(20,15,10,.5)"/>' +
          '<rect x="0" y="92" width="100" height="3" fill="rgba(20,15,10,.3)"/>'
        );
      case "gate":
        return (
          '<path d="M22 90 V52 L34 40 V90 Z M40 90 V52 L28 40" fill="rgba(20,15,10,.5)"/>' +
          '<path d="M60 90 V56 L72 46 V90 Z M76 90 V56 L64 46" fill="rgba(20,15,10,.5)"/>'
        );
      case "rock":
        return '<path d="M6 92 Q22 54 44 60 Q58 48 74 58 Q90 52 96 92 Z" fill="rgba(20,15,10,.5)"/>';
      default:
        return "";
    }
  }

  function sceneSVG(c1, c2, motif) {
    var gid = "phg" + Math.random().toString(36).slice(2, 9);
    return (
      '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + c1 + '"/><stop offset="58%" stop-color="' + c1 + '"/><stop offset="100%" stop-color="' + c2 + '"/>' +
      "</linearGradient></defs>" +
      '<rect width="100" height="100" fill="url(#' + gid + ')"/>' +
      '<circle cx="70" cy="28" r="16" fill="#fff" opacity=".16"/>' +
      '<circle cx="70" cy="28" r="8" fill="#fff" opacity=".5"/>' +
      '<line x1="0" y1="58" x2="100" y2="58" stroke="#fff" stroke-opacity=".3" stroke-width="0.6"/>' +
      silhouettePath(motif) +
      "</svg>"
    );
  }

  function paintPH(root) {
    root.querySelectorAll(".ph[data-hue]").forEach(function (el) {
      var parts = el.getAttribute("data-hue").split(",");
      var c1 = (parts[0] || "#333").trim();
      var c2 = (parts[1] || "#999").trim();
      var motif = el.getAttribute("data-motif") || "none";
      el.innerHTML = sceneSVG(c1, c2, motif);
    });
  }

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
    },
    paintPH: paintPH
  };
})(window);
