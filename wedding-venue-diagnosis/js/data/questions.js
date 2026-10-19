/* 質問と選択肢の定義。
   各選択肢の categories が、Excel（シート2）のカテゴリ名との対応です。
   ・categories は Excel のカテゴリ名と完全一致させてください（起動時に自動チェックします）。
   ・categories が空の選択肢は「条件なし」です（順位に影響しません）。
   ・exclusive: true の選択肢は、複数選択の質問で他の選択肢と同時に選べません。
   ・label は「いちばん重視したい条件」の質問で表示する短い表現です（省略時は選択肢の文言）。
   ・type: 'priority' の質問は、それまでに選ばれた条件が2つ以上ある場合のみ表示されます。 */
(function (root) {
  root.VENUE_DIAG = root.VENUE_DIAG || {};
  root.VENUE_DIAG.QUESTIONS = [
    {
      id: 'kids', section: 'GUESTS', type: 'single',
      title: 'お子さまと一緒に、結婚式を迎えますか？',
      sub: 'お二人のお子さまや、ご親族のお子さまの参列予定をお聞かせください。',
      opts: [
        { v: 'yes', main: 'はい、子どもも一緒です', sub: 'お子さまと一緒に過ごせる式場を探したい', categories: ['子供と一緒'], label: 'お子さまと一緒に過ごせること' },
        { v: 'no', main: 'いいえ、大人のみです', sub: 'お二人だけ、または大人のゲストのみ', categories: [] }
      ]
    },
    {
      id: 'access', section: 'ACCESS', type: 'single',
      title: '式場までの移動について、ご希望はありますか？',
      sub: '日本からの移動時間や時差について、近いものをお選びください。',
      opts: [
        { v: 'nojetlag', main: '時差のない場所がいい', sub: '到着してすぐ、いつもの調子で過ごしたい', categories: ['時差がない'], label: '時差がないこと' },
        { v: 'short', main: 'フライト時間が短い場所がいい', sub: '多少の時差は気にしない', categories: ['フライト時間が短い'], label: 'フライト時間が短いこと' },
        { v: 'any', main: '移動時間や時差は気にしない', sub: '遠くの式場も候補に入れたい', categories: [] }
      ]
    },
    {
      id: 'scenery', section: 'LOCATION', type: 'multi',
      title: 'どんな景色の中で、誓いの瞬間を迎えたいですか？',
      sub: '心惹かれるものをすべてお選びください（複数選択可）。',
      opts: [
        { v: 'seaview', text: '海が見える式場', categories: ['海が見える'] },
        { v: 'beach', text: 'ビーチが目の前の式場', categories: ['ビーチが目の前'] },
        { v: 'garden', text: '緑あふれるガーデン', categories: ['ガーデンがある'] },
        { v: 'nature', text: '豊かな自然に囲まれた場所', categories: ['自然豊か'] },
        { v: 'heritage', text: '世界遺産のある場所', categories: ['世界遺産'] },
        { v: 'none', text: '特にこだわらない', categories: [], exclusive: true }
      ]
    },
    {
      id: 'space', section: 'CEREMONY', type: 'multi',
      title: '挙式の空間は、どんな雰囲気に惹かれますか？',
      sub: '理想に近いものをすべてお選びください（複数選択可）。',
      opts: [
        { v: 'church', text: '歴史ある教会・大聖堂', categories: ['教会・大聖堂'] },
        { v: 'glass', text: 'ステンドグラスのある空間', categories: ['ステンドグラスがある'] },
        { v: 'athome', text: 'アットホームな雰囲気', categories: ['アットホーム'] },
        { v: 'none', text: '特にこだわらない', categories: [], exclusive: true }
      ]
    },
    {
      id: 'stay', section: 'STAY & PARTY', type: 'multi',
      title: '滞在やパーティについて、叶えたいことはありますか？',
      sub: 'あてはまるものをすべてお選びください（複数選択可）。',
      opts: [
        { v: 'hotel', text: '滞在するホテルの中で挙式したい', categories: ['ホテル内'] },
        { v: 'villa', text: 'ヴィラ・水上ヴィラに泊まりたい', categories: ['水上ヴィラ又はヴィラ'] },
        { v: 'party', text: '挙式の後、同じ場所でパーティをしたい', categories: ['パーティ会場併設'] },
        { v: 'food', text: '料理のおいしさを大切にしたい', categories: ['食事がおいしい'] },
        { v: 'none', text: '特にこだわらない', categories: [], exclusive: true }
      ]
    },
    {
      id: 'focus', section: 'YOUR STYLE', type: 'multi',
      title: '結婚式で、ほかにこだわりたいことはありますか？',
      sub: 'あてはまるものをすべてお選びください（複数選択可）。',
      opts: [
        { v: 'photo', text: '写真にこだわりたい', categories: ['写真にこだわる'] },
        { v: 'dress', text: 'ドレス・衣裳にこだわりたい', categories: ['衣裳重視'] },
        { v: 'cost', text: '費用を抑えたい（コスパ重視）', categories: ['コスパ重視'] },
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
