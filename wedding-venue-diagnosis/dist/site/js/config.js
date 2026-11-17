/* 表示・動作の設定。診断の根拠データ（式場・カテゴリ）は js/data/venues.js、質問は js/data/questions.js にあります。 */
(function (root) {
  root.VENUE_DIAG = root.VENUE_DIAG || {};
  root.VENUE_DIAG.CONFIG = {
    // 「その他のおすすめ式場」に表示する最大件数
    maxAlternatives: 4,

    // 国・地域。areaPrefixes は式場追加情報.xlsx の「エリア」の先頭文字。minDays はおすすめに入れる最低日数。
    // 並び順は「国・地域を選ぶ」質問の表示順です。
    regions: [
      { id: 'hawaii', label: 'ハワイ（オアフ島）', areaPrefixes: ['ハワイ'], minDays: 6 },
      { id: 'okinawa', label: '沖縄', areaPrefixes: ['沖縄'], minDays: 3 },
      { id: 'guam', label: 'グアム', areaPrefixes: ['グアム'], minDays: 3 },
      { id: 'bali', label: 'バリ島', areaPrefixes: ['バリ島'], minDays: 6 },
      { id: 'cairns', label: 'オーストラリア（ケアンズ）', areaPrefixes: ['オーストラリア'], minDays: 6 },
      { id: 'europe', label: 'ヨーロッパ（パリ・フィレンツェ・ローマ）', areaPrefixes: ['フランス', 'イタリア'], minDays: 8 },
      { id: 'maldives', label: 'モルディブ', areaPrefixes: ['モルディブ'], minDays: 8 },
      { id: 'nz', label: 'ニュージーランド', areaPrefixes: ['ニュージーランド'], minDays: 8 },
      { id: 'hokkaido', label: '北海道', areaPrefixes: ['北海道'], minDays: 3 }
    ],
    // お子さまが参列する場合のおすすめ順（ここに無い地域は、その後ろに上の並び順で続きます）
    kidsRegionOrder: ['guam', 'okinawa', 'bali', 'hawaii', 'cairns'],

    // 各画面の背景写真。通常は source/式場追加情報.xlsx の「背景写真」シートで設定します（そちらが優先）。
    // 空欄の場合は写真なしのグラデーション背景になります。
    sceneImages: {
      start: '',
      question: '',
      loading: '',
      result: ''
    },

    // 結果画面の相談ボタン。url が空欄のボタンは表示しません。
    consult: {
      title: '気になる式場が見つかったら、\n専任スタッフにご相談ください。',
      buttons: [
        { label: 'ご来店での無料相談はこちら', url: 'https://www.his-wedding.com/special/shop_visit/', primary: true },
        { label: 'オンラインでの無料相談はこちら', url: '' }
      ],
      note: '診断結果は、診断用データに登録された式場の特徴をもとに算出しています。'
    },

    // シェア文言（{name} は最もおすすめの式場名に置き換わります）
    shareText: '結婚式場診断で「{name}」をおすすめされました！',

    // ヘッダー右上のリンク（url が空欄なら非表示）
    headerLink: { label: 'About HIS WEDDING', url: 'https://www.his-wedding.com/' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
