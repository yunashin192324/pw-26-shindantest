/* =====================================================================
   data.js — every location / plan / option / availability rule.
   Field names mirror the Shopify `propose_location` metaobject
   (see shopify-theme/PROPOSE-README.md §3) so the Liquid port is a
   rename, not a redesign.

   DEMO DATA: durations, lead times, rain rules and availability are
   placeholders until operations confirm them. The UI labels them as
   such wherever they appear.
   ===================================================================== */
(function (global) {
  "use strict";

  // ---- Add-on options (Shopify: one small Product each) ----
  var OPTIONS = [
    { id: "transfer", name: "PRIVATE TRANSFER", nameJa: "専用送迎", price: 30000, desc: "ホテルと撮影場所のあいだを専用車で送迎します。" },
    { id: "extra-photo", name: "EXTRA PHOTO", nameJa: "追加撮影30分", price: 20000, desc: "撮影を30分延長し、記念撮影の時間を増やします。", requiresPhoto: true },
    { id: "sunset", name: "SUNSET TIME", nameJa: "ベストタイム確保", price: 10000, desc: "夕日・朝日など一番きれいな光の時間に合わせて開始時刻を調整します。" }
  ];

  // ---- Plans (Shopify: one Product per location, three Variants in this order) ----
  // Every plan includes the bouquet; the tiers differ in what is recorded
  // and how the place is dressed. Prices are DEMO values.
  var PLAN_TIERS = [
    { id: "light", name: "LIGHT PLAN", nameJa: "ライトプラン", summary: "花束のみ", hasPhoto: false,
      includes: ["プロポーズ用の花束", "日本語サポート"] },
    { id: "standard", name: "STANDARD PLAN", nameJa: "スタンダードプラン", summary: "花束＋写真撮影", hasPhoto: true,
      includes: ["プロポーズ用の花束", "プロフォトグラファーによる写真撮影（30分）", "写真データ30枚以上（オンライン納品）", "日本語サポート"] },
    { id: "luxury", name: "LUXURY PLAN", nameJa: "ラグジュアリープラン", summary: "花束＋写真撮影＋動画撮影＋デコレーション", hasPhoto: true,
      includes: ["プロポーズ用の花束", "プロフォトグラファーによる写真撮影（30分）", "写真データ30枚以上（オンライン納品）", "動画撮影", "プロポーズの場所のデコレーション", "日本語サポート"] }
  ];
  function plansFor(base) {
    var prices = { light: Math.round(base * 0.4 / 1000) * 1000, standard: base, luxury: base + 100000 };
    return PLAN_TIERS.map(function (t) {
      return { id: t.id, name: t.name, nameJa: t.nameJa, summary: t.summary, hasPhoto: t.hasPhoto, includes: t.includes, price: prices[t.id] };
    });
  }

  // ---- Booking is request-based: the team checks photographer
  // availability by hand and replies within this window (DEMO value). ----
  var REPLY_HOURS = 24;

  // ---- The day, as the couple experiences it (proposal_steps) ----
  var PROPOSAL_STEPS = [
    { no: "01", title: "待ち合わせ", text: "フォトグラファーがお二人をお迎えします。", photo: "paris" },
    { no: "02", title: "自然に撮影スタート", text: "旅の記念撮影として始めるので、プロポーズだとは気づかれません。", photo: "miyakojima" },
    { no: "03", title: "二人の時間", text: "景色の中を歩く姿や、自然な会話を撮影します。", photo: "bali" },
    { no: "04", title: "プロポーズ", text: "フォトグラファーは少し距離を取り、その瞬間だけを撮影します。", photo: "ayersrock" },
    { no: "05", title: "記念撮影", text: "指輪をつけたお二人を、ゆっくり撮影します。", photo: "cappadocia" }
  ];

  var LOCATIONS = [
    {
      id: "hawaii", name: "HAWAII", nameJa: "ハワイ", popular: true,
      catch: "ハワイで、\n一生忘れない瞬間を。",
      tagline: "夕日のビーチで、ふたりきりに。",
      lede: "ヤシの並木と緑の山々、そして夕暮れの海。オアフ島で、ふたりだけの時間をつくります。",
      photo: "hawaii", photoAlt: "ヤシの並木の先にそびえるオアフ島の緑の山々", photoPos: "50% 45%", hue: ["#2c5f74", "#e08a4f"], motif: "palm",
      base: 128000, duration: "約2時間", meetingPoint: "ワイキキ・ホテル周辺（ご滞在先に合わせてご案内）",
      timeSlots: ["16:00", "16:30", "17:00", "17:30", "18:00"], bestTime: "17:30", bestTimeNote: "夕日の時間",
      leadDays: 3, rainPlan: "雨の場合は、翌日以降の空き枠へ無料で振替できます。", tags: ["sea", "sunset", "resort"],
      hotels: ["ハレクラニ", "ザ・カハラ・ホテル＆リゾート"], chapels: ["キャルバリー・バイ・ザ・シー教会"]
    },
    {
      id: "miyakojima", name: "MIYAKOJIMA", nameJa: "宮古島", popular: true,
      catch: "宮古島で、\n一生忘れない瞬間を。",
      tagline: "どこまでも続く青の中で。",
      lede: "パスポートのいらない、日本でいちばん青い海。遠浅の白い砂浜で伝えます。",
      photo: "miyakojima", photoAlt: "宮古島のエメラルドグリーンの海と白い砂浜", photoPos: "30% 50%", hue: ["#1c7f9c", "#7fd8d0"], motif: "wave",
      base: 108000, duration: "約2時間", meetingPoint: "与那覇前浜ビーチ 駐車場",
      timeSlots: ["16:30", "17:00", "17:30", "18:00", "18:30"], bestTime: "18:30", bestTimeNote: "夕日の時間",
      leadDays: 2, rainPlan: "雨の場合は、翌日以降の空き枠へ無料で振替できます。", tags: ["sea", "resort", "sunset"]
    },
    {
      id: "okinawa", name: "OKINAWA", nameJa: "沖縄本島", popular: true,
      catch: "沖縄で、\n一生忘れない瞬間を。",
      tagline: "ビーチでも、チャペルでも。",
      lede: "青い海と白い砂浜の島で。ビーチはもちろん、チャペルを貸し切ってのプロポーズもできます。",
      photo: null, photoAlt: "", hue: ["#1d6f8f", "#9fdcd3"], motif: "wave",
      base: 108000, duration: "約2時間", meetingPoint: "ご滞在ホテル、またはご希望の会場",
      timeSlots: ["10:00", "16:30", "17:30", "18:30"], bestTime: "18:30", bestTimeNote: "夕日の時間",
      leadDays: 3, rainPlan: "雨の場合は、翌日以降の空き枠へ無料で振替できます。", tags: ["sea", "resort", "sunset"],
      hotels: [], chapels: ["ラソール ガーデン・アリビラ", "ラソール シーリゾート", "ザ・サーフ ビーチサイドテラス", "アートグレイス沖縄", "サザンチャペル"]
    },
    {
      id: "santorini", name: "SANTORINI", nameJa: "サントリーニ島", popular: true,
      catch: "サントリーニで、\n一生忘れない瞬間を。",
      tagline: "白と青の街で。",
      lede: "断崖に広がる白い街と、エーゲ海に沈む夕日。世界でいちばん有名な夕景の中で。",
      photo: "santorini", photoAlt: "イアの青いドームの教会とエーゲ海", photoPos: "60% 58%", hue: ["#1e4d8c", "#f4f1ea"], motif: "dome",
      base: 168000, duration: "約2時間", meetingPoint: "イア地区 展望テラス付近",
      timeSlots: ["17:00", "18:00", "19:00", "19:30"], bestTime: "19:30", bestTimeNote: "イアの夕日",
      leadDays: 5, rainPlan: "天候不良の場合は、翌日以降の空き枠へ無料で振替できます。", tags: ["town", "sunset", "special"]
    },
    {
      id: "italy", name: "ITALY", nameJa: "イタリア", popular: false,
      catch: "イタリアで、\n一生忘れない瞬間を。",
      tagline: "歴史ある街角で。",
      lede: "ローマの石畳と、何百年も変わらない街並み。映画のワンシーンのような一日に。",
      photo: "italy", photoAlt: "上空から見たローマのコロッセオと街並み", photoPos: "50% 55%", hue: ["#7a5230", "#d9b979"], motif: "arch",
      base: 178000, duration: "約2時間", meetingPoint: "ローマ市内（ご滞在先に合わせてご案内）",
      timeSlots: ["08:00", "09:00", "16:00", "17:00"], bestTime: "08:00", bestTimeNote: "人の少ない朝",
      leadDays: 5, rainPlan: "雨の場合は、屋根のある回廊での撮影、または翌日以降へ無料で振替できます。", tags: ["town"]
    },
    {
      id: "paris", name: "PARIS", nameJa: "パリ", popular: true,
      catch: "パリで、\n一生忘れない瞬間を。",
      tagline: "憧れの街を、ふたりの記念日に。",
      lede: "エッフェル塔が見える通りを、ふたりで歩く。誰もが憧れる街で、想いを伝えます。",
      photo: "paris", photoAlt: "エッフェル塔が見えるパリの街並み", photoPos: "50% 40%", hue: ["#4a4e69", "#c9ada7"], motif: "tower",
      base: 158000, duration: "約2時間", meetingPoint: "トロカデロ広場",
      timeSlots: ["08:00", "10:00", "16:00", "18:00"], bestTime: "08:00", bestTimeNote: "人の少ない朝",
      leadDays: 5, rainPlan: "雨の場合は、アーケードやカフェでの撮影、または翌日以降へ無料で振替できます。", tags: ["town"]
    },
    {
      id: "cappadocia", name: "CAPPADOCIA", nameJa: "カッパドキア", popular: false,
      catch: "カッパドキアで、\n一生忘れない瞬間を。",
      tagline: "気球が浮かぶ朝焼けの中で。",
      lede: "夜明けとともに、何十もの気球が空へ。この景色は、朝にしか見られません。",
      photo: "cappadocia", photoAlt: "朝焼けのカッパドキアに浮かぶ気球", photoPos: "50% 45%", hue: ["#b5651d", "#f2c078"], motif: "balloon",
      base: 188000, duration: "約2時間（早朝）", meetingPoint: "ご滞在ホテル（ギョレメ周辺）",
      timeSlots: ["05:30", "06:00", "06:30"], bestTime: "06:00", bestTimeNote: "気球が上がる時間",
      leadDays: 5, rainPlan: "気球が飛ばない天候の場合は、翌朝以降へ無料で振替できます。", tags: ["nature", "special"]
    },
    {
      id: "maldives", name: "MALDIVES", nameJa: "モルディブ", popular: false,
      catch: "モルディブで、\n一生忘れない瞬間を。",
      tagline: "水平線に浮かぶ楽園で。",
      lede: "透き通る海と、水上ヴィラ。滞在中のリゾートの中で、ふたりきりの時間をつくります。",
      photo: "maldives", photoAlt: "上空から見たモルディブの水上ヴィラと海", photoPos: "50% 50%", hue: ["#0f6e8c", "#bfe6dd"], motif: "villa",
      base: 198000, duration: "約2時間", meetingPoint: "ご滞在リゾート内",
      timeSlots: ["16:00", "17:00", "17:30", "18:00"], bestTime: "17:30", bestTimeNote: "夕日の時間",
      leadDays: 7, rainPlan: "雨の場合は、滞在中の別日へ無料で振替できます。", tags: ["sea", "resort"],
      hotels: ["フォーシーズンズ ランダーギラーヴァル", "ギリ ランカンフシ"], chapels: ["フォーシーズンズ ランダーギラーヴァルのチャペル"]
    },
    {
      id: "bali", name: "BALI", nameJa: "バリ島", popular: false,
      catch: "バリ島で、\n一生忘れない瞬間を。",
      tagline: "緑の棚田に包まれて。",
      lede: "ヤシの木と、どこまでも続く棚田。朝の静かな空気の中で、ふたりで歩きます。",
      photo: "bali", photoAlt: "ヤシの木に囲まれたバリ島の棚田を歩くふたり", photoPos: "50% 70%", hue: ["#2f6e4f", "#f4d35e"], motif: "gate",
      base: 118000, duration: "約2時間", meetingPoint: "テガラランの棚田（ウブド）",
      timeSlots: ["07:00", "08:00", "16:00", "17:00"], bestTime: "07:00", bestTimeNote: "朝の静かな棚田",
      leadDays: 4, rainPlan: "雨の場合は、翌日以降の空き枠へ無料で振替できます。", tags: ["nature", "resort"]
    },
    {
      id: "cancun", name: "CANCUN", nameJa: "カンクン", popular: false,
      catch: "カンクンで、\n一生忘れない瞬間を。",
      tagline: "カリブ海の白い砂浜で。",
      lede: "カリブ海から昇る朝日と、真っ白な砂浜。リゾートの朝を、特別な一日の始まりに。",
      photo: "cancun", photoAlt: "上空から見たカンクンのビーチとホテル街", photoPos: "50% 60%", hue: ["#0a9396", "#e9d8a6"], motif: "palm",
      base: 148000, duration: "約2時間", meetingPoint: "ホテルゾーン（ご滞在ホテル前のビーチ）",
      timeSlots: ["06:30", "07:30", "16:00", "17:00"], bestTime: "06:30", bestTimeNote: "カリブ海の朝日",
      leadDays: 5, rainPlan: "雨の場合は、翌日以降の空き枠へ無料で振替できます。", tags: ["sea", "resort"]
    },
    {
      id: "ayersrock", name: "AYERS ROCK", nameJa: "エアーズロック", popular: false,
      catch: "エアーズロックで、\n一生忘れない瞬間を。",
      tagline: "大地が赤く染まる瞬間に。",
      lede: "夕日を浴びて、ウルルが真っ赤に燃える数分間。地球の大きさを感じる場所で。",
      photo: "ayersrock", photoAlt: "夕日で赤く染まるエアーズロック（ウルル）", photoPos: "50% 55%", hue: ["#a4462f", "#e8c07d"], motif: "rock",
      base: 168000, duration: "約2時間", meetingPoint: "サンセットビューイングエリア",
      timeSlots: ["05:30", "17:30"], bestTime: "17:30", bestTimeNote: "赤く染まる夕景",
      leadDays: 5, rainPlan: "雨の場合は、翌日以降の空き枠へ無料で振替できます。", tags: ["nature", "sunset", "special"]
    }
  ];

  LOCATIONS.forEach(function (loc) {
    loc.hotels = loc.hotels || [];
    loc.chapels = loc.chapels || [];
    loc.plans = plansFor(loc.base);
    loc.fromPrice = loc.plans[0].price;
  });

  // ---- Explorer themes for undecided visitors (photo-first, one tap) ----
  var THEMES = [
    { id: "sea", label: "海", en: "SEA", photo: "maldives" },
    { id: "town", label: "街", en: "TOWN", photo: "paris" },
    { id: "sunset", label: "夕日", en: "SUNSET", photo: "ayersrock" },
    { id: "nature", label: "大自然", en: "NATURE", photo: "bali" },
    { id: "resort", label: "リゾート", en: "RESORT", photo: "cancun" },
    { id: "special", label: "特別な景色", en: "SPECIAL", photo: "cappadocia" }
  ];

  var FAQ = [
    { q: "出発の数日前でも予約できますか？", a: "はい。行き先ごとに「最短○日前まで」の受付締切があり、各ページと受付状況カレンダーで確認できます。" },
    { q: "予約はすぐに確定しますか？", a: "予約はリクエスト制です。担当スタッフが手配を確認し、" + REPLY_HOURS + "時間以内に確定可否をメールでご連絡します。お支払いは確定のご連絡のあとです。" },
    { q: "相手にプロポーズだと気づかれませんか？", a: "「旅の記念撮影」として自然に始めます。予約確認の連絡も、控えめな件名を選べます。" },
    { q: "雨が降ったらどうなりますか？", a: "行き先ごとの雨天対応があります。多くの場所で、翌日以降の空き枠へ無料で振替できます。" },
    { q: "現地で日本語は通じますか？", a: "日本語サポートが付いています。当日の連絡も日本語で行えます。" },
    { q: "キャンセルはできますか？", a: "予約日の一定期間前まではキャンセル・返金が可能です。規定は予約確認画面とメールでご案内します。" },
    { q: "写真はいつ届きますか？", a: "撮影後、オンラインで順次お届けします。目安の日数は予約確認メールでご案内します。" },
    { q: "指輪や花束は用意してもらえますか？", a: "花束はすべてのプランに含まれています。指輪はご自身でご用意ください。" },
    { q: "写真撮影なしでも頼めますか？", a: "はい。ライトプランは、花束のご用意のみのプランです。写真や動画を残したい場合は、スタンダードプランかラグジュアリープランをお選びください。" },
    { q: "ホテルやチャペルでもプロポーズできますか？", a: "はい。ハワイのハレクラニやザ・カハラ、モルディブのフォーシーズンズ ランダーギラーヴァル、沖縄のチャペルなど、旅行先ごとに対応できる会場を各ページでご案内しています。会場の使用料や条件は会場ごとに異なるため、確定のご連絡でご案内します。" },
    { q: "撮影場所は変えられますか？", a: "行き先ごとの推奨スポットをもとに、当日の天候や混雑に合わせてフォトグラファーが調整します。" }
  ];

  // ---- Deterministic demo availability (never a live feed) ----
  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }
  function isoDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function today() {
    var d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }
  function daysFromToday(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    return Math.round((d - today()) / 86400000);
  }
  function slotStatus(loc, dateStr, time) {
    if (daysFromToday(dateStr) < loc.leadDays) return "closed";
    var v = hash(loc.id + dateStr + time) % 10;
    if (v < 6) return "available";
    if (v < 8) return "few";
    return "soldout";
  }
  function dateStatus(loc, dateStr) {
    if (daysFromToday(dateStr) < loc.leadDays) return "closed";
    var statuses = loc.timeSlots.map(function (t) { return slotStatus(loc, dateStr, t); });
    if (statuses.indexOf("available") > -1) return "available";
    if (statuses.indexOf("few") > -1) return "few";
    return "soldout";
  }

  // ---- Illustrated fallback for locations without a licensed photo ----
  function silhouettePath(motif) {
    var f = 'fill="rgba(20,15,10,.45)"';
    switch (motif) {
      case "palm": return '<path d="M52 100 L54 58 Q42 52 36 42 Q47 46 54 52 Q51 36 40 27 Q53 31 56 45 Q60 29 73 23 Q63 34 58 47 Q69 40 80 42 Q68 46 57 54 Q60 58 58 68 L57 100 Z" ' + f + '/>';
      case "dome": return '<rect x="30" y="72" width="12" height="16" ' + f + '/><rect x="46" y="66" width="14" height="22" ' + f + '/><circle cx="53" cy="62" r="8" ' + f + '/><rect x="64" y="76" width="10" height="12" ' + f + '/>';
      default: return "";
    }
  }
  function sceneSVG(c1, c2, motif) {
    var gid = "g" + Math.random().toString(36).slice(2, 9);
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset=".58" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<rect width="100" height="100" fill="url(#' + gid + ')"/><circle cx="70" cy="28" r="16" fill="#fff" opacity=".16"/><circle cx="70" cy="28" r="8" fill="#fff" opacity=".5"/>' +
      '<line x1="0" y1="58" x2="100" y2="58" stroke="#fff" stroke-opacity=".3" stroke-width=".6"/>' + silhouettePath(motif) + "</svg>";
  }

  global.ProposeData = {
    locations: LOCATIONS,
    options: OPTIONS,
    planTiers: PLAN_TIERS,
    replyHours: REPLY_HOURS,
    proposalSteps: PROPOSAL_STEPS,
    themes: THEMES,
    faq: FAQ,
    getLocation: function (id) { return LOCATIONS.filter(function (l) { return l.id === id; })[0] || null; },
    minLeadDays: Math.min.apply(null, LOCATIONS.map(function (l) { return l.leadDays; })),
    minPrice: function (tierId) {
      return Math.min.apply(null, LOCATIONS.map(function (l) { return l.plans.filter(function (p) { return p.id === tierId; })[0].price; }));
    },
    slotStatus: slotStatus,
    dateStatus: dateStatus,
    daysFromToday: daysFromToday,
    isoDate: isoDate,
    today: today,
    sceneSVG: sceneSVG,
    yen: function (n) { return "¥" + Number(n).toLocaleString("ja-JP"); }
  };
})(window);
