/* 質問と選択肢の定義（販売店スタッフの接客の流れに沿った順番）。
   ・categories：選んだときの希望条件。診断.xlsx のカテゴリ、または式場追加情報.xlsx から作る特徴の名前と一致させる。
       式場追加情報から作る特徴：挙式：チャペル／挙式：教会／挙式：ガーデン、内観：白系／内観：茶系、立地：〇〇、
       ワイキキから30分圏内、独立型（ホテル内でない）、ガーデンでパーティができる、撮影：〇〇
   ・categories が空の選択肢は「条件なし」。
   ・filter：選ぶと候補の式場をエリアで絞る（沖縄の島選び）。required：選ぶと、その条件に当てはまる式場だけを候補にする（挙式スタイル）。
   ・tieOrder：選んだとき、同点の式場をこの順に並べる。
   ・regions：その国・地域を選んだときだけ表示。showIf：指定した質問でその答えを選んだときだけ表示。
   ・候補の式場に当てはまるものがない選択肢は自動で表示されず、違いが出ない質問も自動で省略される。
   ・exclusive：複数選択で他と同時に選べない。group：同じ group の選択肢は同時に選べない。 */
(function (root) {
  root.VENUE_DIAG = root.VENUE_DIAG || {};
  var CHAPEL_WHITE = ['挙式：チャペル', '海が見える', '内観：白系'];
  var CHAPEL_BROWN = ['挙式：チャペル', '海が見える', '内観：茶系'];
  root.VENUE_DIAG.QUESTIONS = [
    {
      id: 'region', section: 'DESTINATION', type: 'region',
      title: '挙式したい国・地域は決まっていますか？',
      sub: '決まっていない場合は、日程などからおすすめのエリアをご案内します。',
      undecidedOption: { v: 'undecided', main: 'まだ決めていない', sub: 'おすすめのエリアを知りたい' }
    },
    {
      id: 'kids', section: 'GUESTS', type: 'single',
      title: '結婚式には、お子さまも参列されますか？',
      sub: 'お二人のお子さまや、ご親族・ご友人のお子さまの参列予定をお聞かせください。',
      opts: [
        { v: 'yes', main: 'はい、子どもも参列します', sub: 'お子さまと一緒に参加しやすい式場がいい', categories: ['子供と一緒'] },
        { v: 'no', main: 'いいえ、大人のみです', sub: 'お二人だけ、または大人のゲストのみ', categories: [] }
      ]
    },
    {
      id: 'days', section: 'SCHEDULE', type: 'single', alwaysShow: true,
      showIf: { q: 'region', in: ['undecided'] },
      title: '現地には何日間くらい行けそうですか？',
      sub: '移動日を含めた日数です。',
      opts: [
        { v: 3, main: '3〜5日', sub: '近場でゆったり' },
        { v: 6, main: '6〜7日', sub: '少し遠くも候補に' },
        { v: 8, main: '8日以上', sub: '遠方のリゾートやヨーロッパも' },
        { v: 0, main: 'まだ分からない', sub: 'すべてのエリアから選びたい' }
      ]
    },
    {
      id: 'regionPick', section: 'DESTINATION', type: 'regionPick',
      showIf: { q: 'region', in: ['undecided'] },
      title: 'この日程なら、こちらのエリアがおすすめです',
      sub: '気になるエリアをひとつお選びください。'
    },

    /* ── ハワイ ── */
    {
      id: 'hawaiiStyle', section: 'CEREMONY', type: 'single', regions: ['hawaii'],
      title: 'どんな挙式のスタイルが理想ですか？',
      sub: '一番近いイメージをお選びください。',
      opts: [
        { v: 'chapelWhite', main: '海の見えるチャペル（白系）', sub: '白を基調にした明るいチャペル', categories: CHAPEL_WHITE, required: true },
        { v: 'chapelBrown', main: '海の見えるチャペル（茶系）', sub: '木のぬくもりのあるウッディなチャペル', categories: CHAPEL_BROWN, required: true },
        { v: 'church', main: 'ステンドグラスなど本格的な教会', sub: '歴史ある教会で挙式したい', categories: ['教会・大聖堂'], required: true },
        { v: 'garden', main: 'オープンエアのガーデン', sub: '青空の下で挙式したい', categories: ['挙式：ガーデン'], required: true },
        { v: 'any', main: 'まだ決めていない', sub: '', categories: [] }
      ]
    },
    {
      id: 'hawaiiView', section: 'OCEAN VIEW', type: 'single', regions: ['hawaii'],
      showIf: { q: 'hawaiiStyle', in: ['chapelWhite', 'chapelBrown'] },
      title: '海はどのように見えるのがいいですか？',
      sub: '',
      opts: [
        { v: 'beach', main: '目の前がビーチ', sub: '挙式後すぐビーチに出られる', categories: ['ビーチが目の前'] },
        { v: 'any', main: '高台や少し離れた場所から見えればよい', sub: 'ビーチが目の前でなくてもよい', categories: [] }
      ]
    },
    {
      id: 'hawaiiChurch', section: 'CHURCH', type: 'single', regions: ['hawaii'],
      showIf: { q: 'hawaiiStyle', in: ['church'] },
      title: '教会は、どんな雰囲気がお好みですか？',
      sub: '',
      opts: [
        { v: 'athome', main: 'こじんまりしたアットホームな教会', sub: '', categories: ['アットホーム'] },
        { v: 'glass', main: 'ステンドグラスのある荘厳な教会', sub: '', categories: ['ステンドグラスがある'] },
        { v: 'sea', main: '海が見える教会', sub: '', categories: ['海が見える'] },
        { v: 'any', main: 'こだわらない', sub: '', categories: [] }
      ]
    },
    {
      id: 'hawaiiMove', section: 'ACCESS', type: 'single', regions: ['hawaii'],
      title: '挙式会場への移動について、ご希望はありますか？',
      sub: 'ワイキキからの移動時間の目安です。',
      opts: [
        { v: 'hotel', main: '滞在するホテルの中で挙式したい', sub: '移動の負担なく過ごしたい', categories: ['ホテル内'] },
        { v: 'near', main: '移動は30分以内がいい', sub: 'ワイキキから30分圏内', categories: ['ワイキキから30分圏内'] },
        { v: 'any', main: '60分程度の移動でもよい', sub: '少し離れた静かなエリアも候補に', categories: [] }
      ]
    },

    /* ── 沖縄 ── */
    {
      id: 'okinawaIsland', section: 'ISLAND', type: 'single', regions: ['okinawa'],
      title: '沖縄の旅で、いちばん大切にしたいことは？',
      sub: '目的に合わせて、おすすめの島を選びます。',
      opts: [
        { v: 'main', main: 'ゲストが多い・初めての沖縄・式場重視', sub: '観光やアクティビティも楽しめる「沖縄本島」', filter: { areas: ['沖縄・沖縄本島'] } },
        { v: 'miyako', main: 'ホテルでゆっくり、海の綺麗さを重視', sub: '「宮古島」', filter: { areas: ['沖縄・宮古島'] } },
        { v: 'ishigaki', main: 'いくつかの島をめぐりたい', sub: '「石垣島」', filter: { areas: ['沖縄・石垣島'] } }
      ]
    },
    {
      id: 'okinawaLocation', section: 'LOCATION', type: 'single', regions: ['okinawa'],
      showIf: { q: 'okinawaIsland', in: ['main'] },
      title: '沖縄本島の、どのあたりがいいですか？',
      sub: '',
      opts: [
        { v: 'south', main: '空港から近い南部', sub: 'ゲストが多い方におすすめ', categories: ['立地：南部'] },
        { v: 'resort', main: 'リゾートらしい恩納村・読谷', sub: '初めての沖縄におすすめ', categories: ['立地：恩納村・読谷'] },
        { v: 'north', main: 'プライベート感のある宜野座・名護・北部', sub: '沖縄に何度か来ている方におすすめ', categories: ['立地：宜野座・名護・北部'] },
        { v: 'any', main: 'こだわらない', sub: '', categories: [] }
      ]
    },

    /* ── 沖縄・グアム・バリ島 ── */
    {
      id: 'resortStyle', section: 'CEREMONY', type: 'single', regions: ['okinawa', 'guam', 'bali'],
      title: 'どんな挙式のスタイルが理想ですか？',
      sub: '一番近いイメージをお選びください。',
      opts: [
        { v: 'chapelWhite', main: '海の見えるチャペル（白系）', sub: '白を基調にした明るいチャペル', categories: CHAPEL_WHITE, required: true },
        { v: 'chapelBrown', main: '海の見えるチャペル（茶系）', sub: '木のぬくもりのあるウッディなチャペル', categories: CHAPEL_BROWN, required: true },
        { v: 'garden', main: 'ガーデン（オープンエア）', sub: '青空の下で挙式したい', categories: ['挙式：ガーデン'], required: true },
        { v: 'any', main: 'まだ決めていない', sub: '', categories: [] }
      ]
    },
    {
      id: 'place', section: 'VENUE', type: 'multi', regions: ['okinawa', 'guam', 'bali', 'cairns'],
      title: '式場の場所について、ご希望はありますか？',
      sub: 'あてはまるものをすべてお選びください（複数選択可）。',
      opts: [
        { v: 'beach', text: 'ビーチが目の前の式場', categories: ['ビーチが目の前'] },
        { v: 'hotel', text: '滞在するホテルの中の式場', categories: ['ホテル内'], group: 'place' },
        { v: 'independent', text: 'ホテルから独立した式場', categories: ['独立型'], group: 'place' },
        { v: 'none', text: '特にこだわらない', categories: [], exclusive: true }
      ]
    },

    /* ── バリ島 ── */
    {
      id: 'baliStay', section: 'STAY', type: 'single', regions: ['bali'],
      title: '挙式以外の滞在は、どう過ごしたいですか？',
      sub: '',
      opts: [
        { v: 'marine', main: 'マリンアクティビティを楽しみたい', sub: 'ベノア地区', categories: ['立地：ベノア'] },
        { v: 'relax', main: '綺麗なビーチを眺めてのんびりしたい', sub: 'ヌサドゥア地区', categories: ['立地：ヌサドゥア'] },
        { v: 'any', main: 'こだわらない', sub: '', categories: [] }
      ]
    },

    /* ── ヨーロッパ ── */
    {
      id: 'europeGlass', section: 'STAINED GLASS', type: 'single', regions: ['europe'],
      title: 'ステンドグラスにこだわりたいですか？',
      sub: '',
      opts: [
        { v: 'yes', main: 'はい、こだわりたい', sub: '', categories: ['ステンドグラスがある'], tieOrder: ['セント・ジェームス教会', 'アメリカンチャーチ'] },
        { v: 'no', main: '特にこだわらない', sub: '', categories: [] }
      ]
    },
    {
      id: 'europeSpot', section: 'PHOTO', type: 'single', regions: ['europe'],
      title: 'ロケーションフォトは、どこで撮りたいですか？',
      sub: '',
      opts: [
        { v: 'eiffel', main: 'エッフェル塔と一緒に', sub: 'パリ', categories: ['撮影：エッフェル塔'] },
        { v: 'colosseum', main: 'コロッセオなどの世界遺産と一緒に', sub: 'ローマ', categories: ['撮影：コロッセオなどの世界遺産'] },
        { v: 'florence', main: 'フィレンツェの美しい街並みで', sub: 'フィレンツェ', categories: ['撮影：フィレンツェの街並み'] },
        { v: 'any', main: 'こだわらない', sub: '', categories: [] }
      ]
    },

    /* ── 共通 ── */
    {
      id: 'focus', section: 'YOUR STYLE', type: 'multi',
      title: 'ほかに、こだわりたいことはありますか？',
      sub: 'あてはまるものをすべてお選びください（複数選択可）。',
      opts: [
        { v: 'party', text: '挙式後すぐ、同じ敷地でパーティをしたい', categories: ['パーティ会場併設'] },
        { v: 'gardenParty', text: 'ガーデンでパーティをしたい', categories: ['ガーデンでパーティができる'] },
        { v: 'food', text: '料理のおいしさを大切にしたい', categories: ['食事がおいしい'] },
        { v: 'photo', text: '写真にこだわりたい', categories: ['写真にこだわる'] },
        { v: 'dress', text: 'ドレス・衣裳にこだわりたい', categories: ['衣裳重視'] },
        { v: 'cost', text: '費用を抑えたい（コスパ重視）', categories: ['コスパ重視'] },
        { v: 'villa', text: 'ヴィラ・水上ヴィラに泊まりたい', categories: ['水上ヴィラ又はヴィラ'] },
        { v: 'character', text: 'キャラクターと一緒に過ごしたい', categories: ['キャラクターと一緒'] },
        { v: 'none', text: '特にこだわらない', categories: [], exclusive: true }
      ]
    },
    {
      id: 'priority', section: 'PRIORITY', type: 'priority',
      title: '中でも、いちばん重視したい条件はどれですか？',
      sub: '選んだ条件に当てはまる式場を、最優先でご提案します。',
      noneOption: { v: 'none', main: 'どれも同じくらい大切', sub: '優先順位はつけずに選びたい' }
    }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
