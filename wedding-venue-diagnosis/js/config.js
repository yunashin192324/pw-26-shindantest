/* 表示・動作の設定。診断の根拠データ（式場・カテゴリ）は js/data/venues.js、質問は js/data/questions.js にあります。 */
(function (root) {
  root.VENUE_DIAG = root.VENUE_DIAG || {};
  root.VENUE_DIAG.CONFIG = {
    // 「その他のおすすめ式場」に表示する最大件数
    maxAlternatives: 4,

    // 各画面の背景写真。空欄の場合は写真なしのグラデーション背景になります。
    // 例: start: 'images/bg-start.jpg'（このフォルダからの相対パス、またはURL）
    sceneImages: {
      start: '',
      question: ['', '', '', '', '', '', ''],
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
