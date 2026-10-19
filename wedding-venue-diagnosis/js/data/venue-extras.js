/* 式場の追加情報（Excel に無い情報）を後から設定するためのファイル。
   ・キーは Excel（シート1 A列）の式場名と完全に同じ文字列にしてください。
   ・空欄・未設定の項目は画面に表示されません。存在しない画像やURLは設定しないでください。
   ・この情報は診断の順位計算には一切使いません（順位の根拠は Excel のカテゴリのみ）。

   設定例:
   'プルメリアガーデン': {
     area: '',          // 地域名（例: エリア名）
     image: '',         // 画像ファイルのパスまたはURL（例: 'images/plumeria.jpg'）
     imageAlt: '',      // 画像の説明文
     url: '',           // 詳細ページ・公式サイトのURL
     address: '',       // 住所
     price: '',         // 料金の目安（表示用の文字列）
     description: ''    // 紹介文
   },
*/
(function (root) {
  root.VENUE_DIAG = root.VENUE_DIAG || {};
  root.VENUE_DIAG.EXTRAS = {
  };
})(typeof window !== 'undefined' ? window : globalThis);
