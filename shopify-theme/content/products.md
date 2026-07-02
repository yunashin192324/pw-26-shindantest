# 商品（プラン）投入用コンテンツ

各商品について、以下をShopify管理画面にそのままコピーしてください。
`custom.faqs` は metaobject の一覧参照です（型の作り方は `shopify-theme/README.md` を参照）。
Description は「HTMLで表示」モードでそのまま貼り付けてください。写真はプレースホルダーのため、
実写真を商品画像としてアップロードしてください（1枚目が商品ヒーロー画像、2枚目以降が撮影イメージギャラリーになります）。


---

## ハワイ ベーシックプラン（Product handle: `hawaii-basic`, Collection: `hawaii`）

**価格（バリアント価格）**: ¥298,000

**custom.availability**
```
instant
```

**custom.availability_label**
```
即予約できます
```

**custom.region**
```
Hawaii — Basic
```

**custom.short_description**
```
ワイキキビーチと市街地で撮る、ハワイフォトウェディングの定番ベーシックプラン。
```

**custom.diagnosis_reason**
```
王道のビーチ×市街地ロケーションを、無理のない予算で。
```

**custom.faqs（faq_item ×3）**
1. Q: `雨天時はどうなりますか？`
   A: `短時間のスコールであれば時間をずらして撮影を続行します。長時間の悪天候の場合は、屋内ロケーションへの振替または日程変更でご案内します。`
2. Q: `両親や友人も同行して撮影できますか？`
   A: `本プランはお二人での撮影が基本ですが、ご家族・ご友人の同行撮影を含むオプションもご用意できます。お問い合わせください。`
3. Q: `データはどのように届きますか？`
   A: `オンラインギャラリー形式で納品し、ダウンロードしてお使いいただけます。撮影から約4〜6週間が目安です。`

**Description（商品説明、HTMLで貼り付け）**
```html
<section>
  <div class="container">
    <div>
      <div class="reveal">
        <p class="eyebrow">Plan Overview</p>
        <h2>ワイキキビーチ×市街地、王道の一枚</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>透明度の高いワイキキビーチと、レトロな趣のカラカウア通り。ハワイを象徴する2つのロケーションで、プロカメラマンが自然な表情を引き出します。初めての海外フォトウェディングにも選ばれている、当店で最も人気のプランです。</p>
        <div class="tag-row mt-40">
          <span class="tag">撮影時間 約4時間</span>
          <span class="tag">カット数目安 80カット</span>
          <span class="tag">カメラマン1名</span>
          <span class="tag">ロケーション2箇所</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="grid grid-2">
      <div class="reveal">
        <h3>含まれるもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="check-list mt-40">
          <li>撮影料・カメラマン1名（約4時間）</li>
          <li>衣裳一式（フォーシスアンドカンパニー製 / ドレス・タキシード各1着）</li>
          <li>簡易ヘアメイク（1回）</li>
          <li>撮影データ一式のオンライン納品（厳選50カット＋全カット）</li>
          <li>日本語対応スタッフによる事前サポート</li>
        </ul>
      </div>
      <div class="reveal reveal-1">
        <h3>含まれないもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="cross-list mt-40">
          <li>航空券・宿泊費</li>
          <li>空港・撮影地までの送迎</li>
          <li>追加衣裳・アルバム制作</li>
          <li>ESTA申請費用・海外旅行保険</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">Options</p><h2>オプション</h2><div class="divider-gold"></div></div>
    <div class="grid grid-4">
      <div class="trust-item reveal"><h3 style="font-size:1rem;">送迎付きプラン</h3><p class="mt-40" style="margin-top:10px;">+¥15,000</p></div>
      <div class="trust-item reveal reveal-1"><h3 style="font-size:1rem;">衣裳追加（1着）</h3><p style="margin-top:10px;">+¥30,000</p></div>
      <div class="trust-item reveal reveal-2"><h3 style="font-size:1rem;">アルバム制作</h3><p style="margin-top:10px;">+¥45,000</p></div>
      <div class="trust-item reveal reveal-3"><h3 style="font-size:1rem;">ヘアメイクグレードアップ</h3><p style="margin-top:10px;">+¥20,000</p></div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="split reverse">
      <div class="split-media reveal"><img src="../assets/images/dress-1.svg" alt="フォーシスアンドカンパニーの衣裳"></div>
      <div class="reveal reveal-1">
        <p class="eyebrow">Dress</p>
        <h2>フォーシスアンドカンパニーの衣裳から1着</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>全国の提携サロンで試着し、選んだドレス・タキシードをそのまま現地へ。現地レンタルにありがちなサイズの不安がなく、着心地も確認済みのまま撮影に臨めます。</p>
        <div class="cta-row mt-40"><a href="../dress.html" class="btn btn-outline-dark">ドレスを詳しく見る</a></div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container" style="max-width:820px;">
    <div class="section-head reveal"><p class="eyebrow">Schedule</p><h2>撮影当日のスケジュール例</h2><div class="divider-gold"></div></div>
    <table class="info-table reveal">
      <tr><th>9:00</th><td>現地集合・お着替え</td></tr>
      <tr><th>9:30</th><td>簡易ヘアメイク</td></tr>
      <tr><th>10:30</th><td>ワイキキビーチにて撮影</td></tr>
      <tr><th>12:30</th><td>カラカウア通り周辺にて撮影</td></tr>
      <tr><th>13:30</th><td>撮影終了・解散</td></tr>
    </table>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">More Information</p><h2>ベーシックプランについて、もっと詳しく</h2><div class="divider-gold"></div></div>
    <div class="geo-block reveal">
      <dl class="geo-grid">
        <div class="geo-item"><dt>特徴</dt><dd>ワイキキビーチとカラカウア通りという、ハワイを象徴する2ロケーションを1日で撮影できる王道プラン。</dd></div>
        <div class="geo-item"><dt>向いている人</dt><dd>海外挙式は行わないが記念写真を残したい方、ハネムーンと合わせて撮影したい方、費用を抑えつつ定番のロケーションを希望する方。</dd></div>
        <div class="geo-item"><dt>料金相場</dt><dd>海外フォトウェディング全体の相場は25万〜60万円程度。本プランは相場内でも標準的な価格帯です。</dd></div>
        <div class="geo-item"><dt>撮影時期</dt><dd>通年撮影可能。特に4〜9月は晴天率が高くおすすめです。</dd></div>
        <div class="geo-item"><dt>気候</dt><dd>年間を通じて温暖な亜熱帯気候。短時間のスコールが発生することがあります。</dd></div>
        <div class="geo-item"><dt>準備するもの</dt><dd>パスポート、ESTA（電子渡航認証）の事前申請、日焼け対策。</dd></div>
        <div class="geo-item"><dt>持ち物</dt><dd>サングラス、小物アクセサリー、履き慣れたサンダルまたは靴。</dd></div>
        <div class="geo-item"><dt>撮影データ納品目安</dt><dd>撮影から約4〜6週間でオンライン納品。</dd></div>
      </dl>
    </div>

    <div class="mt-40" style="margin-top:56px;overflow-x:auto;">
      <h3 class="text-center mb-40">プレミアムプランとの比較</h3>
      <table class="compare-table">
        <tr><th></th><th class="center">ベーシックプラン</th><th class="center">プレミアムプラン</th></tr>
        <tr><td>価格（税込・2名）</td><td class="center">¥298,000</td><td class="center">¥458,000</td></tr>
        <tr><td>撮影時間</td><td class="center">約4時間</td><td class="center">約7時間</td></tr>
        <tr><td>カット数目安</td><td class="center">80カット</td><td class="center">150カット</td></tr>
        <tr><td>ロケーション</td><td class="center">ビーチ＋市街地</td><td class="center">ビーチ＋教会＋ヨット</td></tr>
        <tr><td>予約形式</td><td class="center">即予約できます</td><td class="center">現地確認後ご回答</td></tr>
      </table>
    </div>
  </div>
</section>
```


---

## ハワイ プレミアムプラン（Product handle: `hawaii-premium`, Collection: `hawaii`）

**価格（バリアント価格）**: ¥458,000

**custom.availability**
```
confirm
```

**custom.availability_label**
```
現地確認後ご回答
```

**custom.region**
```
Hawaii — Premium
```

**custom.short_description**
```
ビーチ・教会・ヨットの3ロケーションで撮る、ハワイフォトウェディングのプレミアムプラン。
```

**custom.diagnosis_reason**
```
ビーチ・教会・ヨットの3ロケーションで、特別な一日を。
```

**custom.faqs（faq_item ×3）**
1. Q: `「現地確認後ご回答」とはどういう意味ですか？`
   A: `チャペル・ヨットは現地の空き枠が限られているため、お問い合わせ後に現地手配先へ空き状況を確認し、2営業日以内にご回答するプランです。`
2. Q: `ヨットが天候不良で出港できない場合は？`
   A: `海況が悪い場合は、代替ロケーションでの撮影に振り替えます。事前に代替案もご提案いたします。`
3. Q: `チャペルでの誓いの儀式は含まれますか？`
   A: `本プランは撮影のみのご案内です。誓いの儀式や挙式を含めたい場合は、ご相談時にお申し付けください。`

**Description（商品説明、HTMLで貼り付け）**
```html
<section>
  <div class="container">
    <div>
      <div class="reveal">
        <p class="eyebrow">Plan Overview</p>
        <h2>ビーチ・教会・ヨット、3つの舞台で紡ぐ物語</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>ワイキキビーチでの撮影に加え、歴史あるチャペルでの厳かなシーン、そして海上のヨットでの開放的なひとときを1日に凝縮。ハワイの魅力を余すことなく写真に残す、当店最上位のプランです。</p>
        <div class="tag-row mt-40">
          <span class="tag">撮影時間 約7時間</span>
          <span class="tag">カット数目安 150カット</span>
          <span class="tag">カメラマン2名体制</span>
          <span class="tag">ロケーション3箇所</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="grid grid-2">
      <div class="reveal">
        <h3>含まれるもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="check-list mt-40">
          <li>撮影料・カメラマン2名体制（約7時間）</li>
          <li>衣裳一式（フォーシスアンドカンパニー製 / ドレス・タキシード各2着まで）</li>
          <li>本格ヘアメイク（1回・チェンジ込み）</li>
          <li>チャペル利用料</li>
          <li>ヨットチャーター料（約1時間）</li>
          <li>撮影データ一式のオンライン納品（厳選100カット＋全カット）</li>
          <li>現地送迎（ホテル〜各ロケーション間）</li>
          <li>日本語対応スタッフ同行</li>
        </ul>
      </div>
      <div class="reveal reveal-1">
        <h3>含まれないもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="cross-list mt-40">
          <li>航空券・宿泊費</li>
          <li>アルバム制作（オプション）</li>
          <li>ドローン空撮（オプション・要許可）</li>
          <li>ESTA申請費用・海外旅行保険</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">Options</p><h2>オプション</h2><div class="divider-gold"></div></div>
    <div class="grid grid-4">
      <div class="trust-item reveal"><h3 style="font-size:1rem;">アルバム制作</h3><p style="margin-top:10px;">+¥55,000</p></div>
      <div class="trust-item reveal reveal-1"><h3 style="font-size:1rem;">ドローン空撮</h3><p style="margin-top:10px;">+¥25,000</p></div>
      <div class="trust-item reveal reveal-2"><h3 style="font-size:1rem;">衣裳追加（1着）</h3><p style="margin-top:10px;">+¥30,000</p></div>
      <div class="trust-item reveal reveal-3"><h3 style="font-size:1rem;">ご家族の同行撮影</h3><p style="margin-top:10px;">+¥20,000</p></div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="split reverse">
      <div class="split-media reveal"><img src="../assets/images/dress-2.svg" alt="フォーシスアンドカンパニーの衣裳"></div>
      <div class="reveal reveal-1">
        <p class="eyebrow">Dress</p>
        <h2>2着までの衣裳チェンジに対応</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>ビーチ用のカジュアルなドレスと、チャペル用のクラシックなドレス。シーンに合わせて2着までお選びいただけます。全国の提携サロンで事前に試着可能です。</p>
        <div class="cta-row mt-40"><a href="../dress.html" class="btn btn-outline-dark">ドレスを詳しく見る</a></div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container" style="max-width:820px;">
    <div class="section-head reveal"><p class="eyebrow">Schedule</p><h2>撮影当日のスケジュール例</h2><div class="divider-gold"></div></div>
    <table class="info-table reveal">
      <tr><th>7:30</th><td>ホテルにて本格ヘアメイク</td></tr>
      <tr><th>9:00</th><td>ワイキキビーチにて撮影</td></tr>
      <tr><th>11:00</th><td>衣裳チェンジ・チャペルへ移動</td></tr>
      <tr><th>11:30</th><td>チャペルにて撮影</td></tr>
      <tr><th>13:30</th><td>ヨットへ乗船・洋上撮影</td></tr>
      <tr><th>14:30</th><td>撮影終了・ホテルへ送迎</td></tr>
    </table>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">More Information</p><h2>プレミアムプランについて、もっと詳しく</h2><div class="divider-gold"></div></div>
    <div class="geo-block reveal">
      <dl class="geo-grid">
        <div class="geo-item"><dt>特徴</dt><dd>ビーチ・チャペル・ヨットの3ロケーションを1日で撮影する、当店最上位のプレミアムプラン。</dd></div>
        <div class="geo-item"><dt>向いている人</dt><dd>衣裳チェンジをして複数シーンを残したい方、チャペルでの厳かな雰囲気も撮影したい方、記念日として特別な体験にしたい方。</dd></div>
        <div class="geo-item"><dt>料金相場</dt><dd>複数ロケーション・チャペル・ヨットを含むプランの相場は40万〜70万円程度。本プランはその中でも標準的です。</dd></div>
        <div class="geo-item"><dt>撮影時期</dt><dd>通年可能。ヨット撮影は海況の影響を受けるため、4〜9月が特におすすめです。</dd></div>
        <div class="geo-item"><dt>気候</dt><dd>年間を通じて温暖。洋上は風が強まることがあるため、羽織りものがあると安心です。</dd></div>
        <div class="geo-item"><dt>準備するもの</dt><dd>パスポート、ESTA申請、酔い止め（ヨット撮影に備えて）。</dd></div>
        <div class="geo-item"><dt>持ち物</dt><dd>サングラス、羽織りもの、替えのヘアアクセサリー。</dd></div>
        <div class="geo-item"><dt>撮影データ納品目安</dt><dd>撮影から約6〜8週間でオンライン納品。</dd></div>
      </dl>
    </div>

    <div class="mt-40" style="margin-top:56px;overflow-x:auto;">
      <h3 class="text-center mb-40">ベーシックプランとの比較</h3>
      <table class="compare-table">
        <tr><th></th><th class="center">ベーシックプラン</th><th class="center">プレミアムプラン</th></tr>
        <tr><td>価格（税込・2名）</td><td class="center">¥298,000</td><td class="center">¥458,000</td></tr>
        <tr><td>撮影時間</td><td class="center">約4時間</td><td class="center">約7時間</td></tr>
        <tr><td>カット数目安</td><td class="center">80カット</td><td class="center">150カット</td></tr>
        <tr><td>ロケーション</td><td class="center">ビーチ＋市街地</td><td class="center">ビーチ＋教会＋ヨット</td></tr>
        <tr><td>予約形式</td><td class="center">即予約できます</td><td class="center">現地確認後ご回答</td></tr>
      </table>
    </div>
  </div>
</section>
```


---

## ダナン ビーチプラン（Product handle: `danang-basic`, Collection: `danang`）

**価格（バリアント価格）**: ¥248,000

**custom.availability**
```
instant
```

**custom.availability_label**
```
即予約できます
```

**custom.region**
```
Da Nang — Beach
```

**custom.short_description**
```
ミーケービーチとリゾートで撮る、ダナンフォトウェディングのビーチプラン。
```

**custom.diagnosis_reason**
```
世界的評価のビーチとリゾートで、コスパよく非日常を。
```

**custom.faqs（faq_item ×3）**
1. Q: `湿度が高いと聞きますが、メイクは崩れませんか？`
   A: `現地の気候に対応したウォータープルーフメイクをご用意しています。撮影中のお直しにも対応いたします。`
2. Q: `ビザは必要ですか？`
   A: `日本国籍の方は15日以内の滞在であればビザ免除で渡航可能です。滞在日数によっては事前申請が必要な場合がありますので、詳細はお問い合わせください。`
3. Q: `バナヒルズにも行きたい場合はどうすればいいですか？`
   A: `オプションの「バナヒルズ半日観光付き」をお選びいただくか、バナヒルズでの撮影を含むラグジュアリープランをご検討ください。`

**Description（商品説明、HTMLで貼り付け）**
```html
<section>
  <div class="container">
    <div>
      <div class="reveal">
        <p class="eyebrow">Plan Overview</p>
        <h2>世界的に評価されるビーチで撮る一枚</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>米国の旅行誌でも「世界の美しいビーチ」に選ばれたミーケービーチと、五つ星リゾートの庭園やプールサイドを舞台に撮影。コストパフォーマンスに優れながらも、非日常感のある一枚が残せます。</p>
        <div class="tag-row mt-40">
          <span class="tag">撮影時間 約3時間</span>
          <span class="tag">カット数目安 70カット</span>
          <span class="tag">カメラマン1名</span>
          <span class="tag">ロケーション2箇所</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="grid grid-2">
      <div class="reveal">
        <h3>含まれるもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="check-list mt-40">
          <li>撮影料・カメラマン1名（約3時間）</li>
          <li>衣裳一式（フォーシスアンドカンパニー製 / ドレス・タキシード各1着）</li>
          <li>簡易ヘアメイク（1回）</li>
          <li>撮影データ一式のオンライン納品（厳選50カット＋全カット）</li>
          <li>日本語対応スタッフによる事前サポート</li>
        </ul>
      </div>
      <div class="reveal reveal-1">
        <h3>含まれないもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="cross-list mt-40">
          <li>航空券・宿泊費</li>
          <li>空港・撮影地までの送迎</li>
          <li>バナヒルズ入場料</li>
          <li>アルバム制作（オプション）</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">Options</p><h2>オプション</h2><div class="divider-gold"></div></div>
    <div class="grid grid-4">
      <div class="trust-item reveal"><h3 style="font-size:1rem;">送迎付きプラン</h3><p style="margin-top:10px;">+¥12,000</p></div>
      <div class="trust-item reveal reveal-1"><h3 style="font-size:1rem;">バナヒルズ半日観光付き</h3><p style="margin-top:10px;">+¥18,000</p></div>
      <div class="trust-item reveal reveal-2"><h3 style="font-size:1rem;">アルバム制作</h3><p style="margin-top:10px;">+¥40,000</p></div>
      <div class="trust-item reveal reveal-3"><h3 style="font-size:1rem;">衣裳追加（1着）</h3><p style="margin-top:10px;">+¥28,000</p></div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="split reverse">
      <div class="split-media reveal"><img src="../assets/images/dress-1.svg" alt="フォーシスアンドカンパニーの衣裳"></div>
      <div class="reveal reveal-1">
        <p class="eyebrow">Dress</p>
        <h2>ビーチに映える、軽やかな一着</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>潮風の中でも美しいシルエットを保つ、動きやすいドレスをご提案。全国の提携サロンで事前に試着いただけます。</p>
        <div class="cta-row mt-40"><a href="../dress.html" class="btn btn-outline-dark">ドレスを詳しく見る</a></div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container" style="max-width:820px;">
    <div class="section-head reveal"><p class="eyebrow">Schedule</p><h2>撮影当日のスケジュール例</h2><div class="divider-gold"></div></div>
    <table class="info-table reveal">
      <tr><th>8:00</th><td>リゾート内にて集合・お着替え</td></tr>
      <tr><th>8:30</th><td>簡易ヘアメイク</td></tr>
      <tr><th>9:30</th><td>ミーケービーチにて撮影</td></tr>
      <tr><th>11:00</th><td>リゾート庭園・プールサイドにて撮影</td></tr>
      <tr><th>11:30</th><td>撮影終了・解散</td></tr>
    </table>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">More Information</p><h2>ビーチプランについて、もっと詳しく</h2><div class="divider-gold"></div></div>
    <div class="geo-block reveal">
      <dl class="geo-grid">
        <div class="geo-item"><dt>特徴</dt><dd>世界的評価の高いミーケービーチと五つ星リゾート内で撮影する、コストパフォーマンスに優れたプラン。</dd></div>
        <div class="geo-item"><dt>向いている人</dt><dd>費用を抑えつつ非日常感のある写真を残したい方、週末を利用した短期渡航を希望する方。</dd></div>
        <div class="geo-item"><dt>料金相場</dt><dd>東南アジア方面のフォトウェディング相場は20万〜40万円程度。本プランは相場のなかでも手が届きやすい価格帯です。</dd></div>
        <div class="geo-item"><dt>撮影時期</dt><dd>2〜8月の乾季がおすすめ。9〜1月は雨季のため天候リスクが高まります。</dd></div>
        <div class="geo-item"><dt>気候</dt><dd>熱帯モンスーン気候。乾季は高温多湿、雨季はスコールが多くなります。</dd></div>
        <div class="geo-item"><dt>準備するもの</dt><dd>パスポート（ビザ免除対象、滞在日数にご注意ください）、日焼け対策、虫よけ。</dd></div>
        <div class="geo-item"><dt>持ち物</dt><dd>サングラス、日傘、履き慣れたサンダル。</dd></div>
        <div class="geo-item"><dt>撮影データ納品目安</dt><dd>撮影から約4〜6週間でオンライン納品。</dd></div>
      </dl>
    </div>

    <div class="mt-40" style="margin-top:56px;overflow-x:auto;">
      <h3 class="text-center mb-40">ラグジュアリープランとの比較</h3>
      <table class="compare-table">
        <tr><th></th><th class="center">ビーチプラン</th><th class="center">ラグジュアリープラン</th></tr>
        <tr><td>価格（税込・2名）</td><td class="center">¥248,000</td><td class="center">¥348,000</td></tr>
        <tr><td>撮影時間</td><td class="center">約3時間</td><td class="center">約6時間</td></tr>
        <tr><td>カット数目安</td><td class="center">70カット</td><td class="center">130カット</td></tr>
        <tr><td>ロケーション</td><td class="center">ビーチ＋リゾート</td><td class="center">ビーチ＋バナヒルズ＋リゾート貸切</td></tr>
        <tr><td>予約形式</td><td class="center">即予約できます</td><td class="center">現地確認後ご回答</td></tr>
      </table>
    </div>
  </div>
</section>
```


---

## ダナン ラグジュアリープラン（Product handle: `danang-premium`, Collection: `danang`）

**価格（バリアント価格）**: ¥348,000

**custom.availability**
```
confirm
```

**custom.availability_label**
```
現地確認後ご回答
```

**custom.region**
```
Da Nang — Luxury
```

**custom.short_description**
```
バナヒルズ「黄金の橋」と五つ星リゾート貸切で撮る、ダナンフォトウェディングのラグジュアリープラン。
```

**custom.diagnosis_reason**
```
「黄金の橋」とリゾート貸切で、非日常感を最大限に。
```

**custom.faqs（faq_item ×3）**
1. Q: `バナヒルズは混雑しますか？`
   A: `週末や祝日は観光客で混雑します。平日の朝一番での撮影を優先的にご案内し、混雑を避けやすいスケジュールを組んでいます。`
2. Q: `山頂は寒いと聞きましたが大丈夫ですか？`
   A: `標高約1,400mのため市街地より気温が5〜10度ほど低くなります。羽織りものをご用意いただくか、当日スタッフがブランケットをご用意します。`
3. Q: `リゾートの貸切とはどの範囲ですか？`
   A: `提携リゾート内の庭園・プールサイドなど指定エリアを一定時間貸切利用いたします。詳細エリアは予約確定後にご案内します。`

**Description（商品説明、HTMLで貼り付け）**
```html
<section>
  <div class="container">
    <div>
      <div class="reveal">
        <p class="eyebrow">Plan Overview</p>
        <h2>世界的絶景スポットと、リゾートの贅沢を1日で</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>SNSでも話題の「黄金の橋」があるバナヒルズと、五つ星リゾートの貸切エリアでの撮影を組み合わせた特別プラン。標高1,400mの高原リゾートから海辺のラグジュアリーホテルまで、ダナンの魅力を凝縮した1日です。</p>
        <div class="tag-row mt-40">
          <span class="tag">撮影時間 約6時間</span>
          <span class="tag">カット数目安 130カット</span>
          <span class="tag">カメラマン2名体制</span>
          <span class="tag">ロケーション3箇所</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="grid grid-2">
      <div class="reveal">
        <h3>含まれるもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="check-list mt-40">
          <li>撮影料・カメラマン2名体制（約6時間）</li>
          <li>衣裳一式（フォーシスアンドカンパニー製 / ドレス・タキシード各2着まで）</li>
          <li>本格ヘアメイク（1回・チェンジ込み）</li>
          <li>バナヒルズ入場料・ケーブルカー代</li>
          <li>五つ星リゾート貸切利用料</li>
          <li>撮影データ一式のオンライン納品（厳選100カット＋全カット）</li>
          <li>現地送迎（ホテル〜各ロケーション間）</li>
          <li>日本語対応スタッフ同行</li>
        </ul>
      </div>
      <div class="reveal reveal-1">
        <h3>含まれないもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="cross-list mt-40">
          <li>航空券・宿泊費</li>
          <li>アルバム制作（オプション）</li>
          <li>ドローン空撮（オプション・要許可）</li>
          <li>海外旅行保険</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">Options</p><h2>オプション</h2><div class="divider-gold"></div></div>
    <div class="grid grid-4">
      <div class="trust-item reveal"><h3 style="font-size:1rem;">アルバム制作</h3><p style="margin-top:10px;">+¥50,000</p></div>
      <div class="trust-item reveal reveal-1"><h3 style="font-size:1rem;">ドローン空撮</h3><p style="margin-top:10px;">+¥22,000</p></div>
      <div class="trust-item reveal reveal-2"><h3 style="font-size:1rem;">衣裳追加（1着）</h3><p style="margin-top:10px;">+¥28,000</p></div>
      <div class="trust-item reveal reveal-3"><h3 style="font-size:1rem;">サンセットディナー同時手配</h3><p style="margin-top:10px;">+¥35,000</p></div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="split reverse">
      <div class="split-media reveal"><img src="../assets/images/dress-2.svg" alt="フォーシスアンドカンパニーの衣裳"></div>
      <div class="reveal reveal-1">
        <p class="eyebrow">Dress</p>
        <h2>高原と海辺、2つの表情に合わせて</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>バナヒルズのヨーロピアンな街並みに映えるドレスと、リゾートに似合うリゾートウェアの2着チェンジに対応。全国の提携サロンで事前に試着可能です。</p>
        <div class="cta-row mt-40"><a href="../dress.html" class="btn btn-outline-dark">ドレスを詳しく見る</a></div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container" style="max-width:820px;">
    <div class="section-head reveal"><p class="eyebrow">Schedule</p><h2>撮影当日のスケジュール例</h2><div class="divider-gold"></div></div>
    <table class="info-table reveal">
      <tr><th>7:00</th><td>リゾートにて本格ヘアメイク</td></tr>
      <tr><th>8:30</th><td>バナヒルズへ移動・ケーブルカーで山頂へ</td></tr>
      <tr><th>9:30</th><td>「黄金の橋」周辺にて撮影</td></tr>
      <tr><th>12:00</th><td>リゾートへ戻り、衣裳チェンジ</td></tr>
      <tr><th>13:00</th><td>リゾート貸切エリアにて撮影</td></tr>
      <tr><th>14:00</th><td>撮影終了・解散</td></tr>
    </table>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">More Information</p><h2>ラグジュアリープランについて、もっと詳しく</h2><div class="divider-gold"></div></div>
    <div class="geo-block reveal">
      <dl class="geo-grid">
        <div class="geo-item"><dt>特徴</dt><dd>SNSで話題の「黄金の橋」があるバナヒルズと、五つ星リゾート貸切エリアを1日で撮影する上位プラン。</dd></div>
        <div class="geo-item"><dt>向いている人</dt><dd>非日常感のあるインパクトのある写真を残したい方、リゾートステイと組み合わせて贅沢な滞在を希望する方。</dd></div>
        <div class="geo-item"><dt>料金相場</dt><dd>バナヒルズを含む上位プランの相場は30万〜50万円程度。本プランはその中でも標準的な価格帯です。</dd></div>
        <div class="geo-item"><dt>撮影時期</dt><dd>2〜8月の乾季がおすすめ。バナヒルズは標高が高く、朝晩は霧が出ることがあります。</dd></div>
        <div class="geo-item"><dt>気候</dt><dd>市街地は熱帯性気候、バナヒルズ山頂は標高差により涼しく霧が発生しやすい環境です。</dd></div>
        <div class="geo-item"><dt>準備するもの</dt><dd>パスポート、羽織りもの（バナヒルズの気温差対策）、歩きやすい靴。</dd></div>
        <div class="geo-item"><dt>持ち物</dt><dd>サングラス、カーディガンなどの上着、酔い止め（ケーブルカー移動用）。</dd></div>
        <div class="geo-item"><dt>撮影データ納品目安</dt><dd>撮影から約6〜8週間でオンライン納品。</dd></div>
      </dl>
    </div>

    <div class="mt-40" style="margin-top:56px;overflow-x:auto;">
      <h3 class="text-center mb-40">ビーチプランとの比較</h3>
      <table class="compare-table">
        <tr><th></th><th class="center">ビーチプラン</th><th class="center">ラグジュアリープラン</th></tr>
        <tr><td>価格（税込・2名）</td><td class="center">¥248,000</td><td class="center">¥348,000</td></tr>
        <tr><td>撮影時間</td><td class="center">約3時間</td><td class="center">約6時間</td></tr>
        <tr><td>カット数目安</td><td class="center">70カット</td><td class="center">130カット</td></tr>
        <tr><td>ロケーション</td><td class="center">ビーチ＋リゾート</td><td class="center">ビーチ＋バナヒルズ＋リゾート貸切</td></tr>
        <tr><td>予約形式</td><td class="center">即予約できます</td><td class="center">現地確認後ご回答</td></tr>
      </table>
    </div>
  </div>
</section>
```


---

## ロンドン クラシックプラン（Product handle: `london-basic`, Collection: `london`）

**価格（バリアント価格）**: ¥398,000

**custom.availability**
```
instant
```

**custom.availability_label**
```
即予約できます
```

**custom.region**
```
London — Classic
```

**custom.short_description**
```
タワーブリッジと石畳の街並みで撮る、ロンドンフォトウェディングのクラシックプラン。
```

**custom.diagnosis_reason**
```
タワーブリッジと石畳の街並みで、気品ある一枚を。
```

**custom.faqs（faq_item ×3）**
1. Q: `雨が多いと聞きますが撮影は大丈夫ですか？`
   A: `小雨であれば傘を使った撮影も味のある一枚になります。本降りの場合は屋内ロケーションへ振替、または日程変更でご案内します。`
2. Q: `入国にビザは必要ですか？`
   A: `日本国籍の方は電子渡航認証（ETA）の事前申請で入国可能です。申請方法は予約確定後にご案内します。`
3. Q: `移動は徒歩ですか？`
   A: `ロケーション間は基本的に徒歩または公共交通機関での移動です。送迎付きオプションもご用意しています。`

**Description（商品説明、HTMLで貼り付け）**
```html
<section>
  <div class="container">
    <div>
      <div class="reveal">
        <p class="eyebrow">Plan Overview</p>
        <h2>タワーブリッジと歴史的街並みで撮る一枚</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>ロンドンを象徴するタワーブリッジ周辺と、石畳が美しいクラシックな街並みを舞台に撮影。歴史的建築が織りなす気品ある背景が、フォーシスアンドカンパニーの衣裳を一層引き立てます。</p>
        <div class="tag-row mt-40">
          <span class="tag">撮影時間 約4時間</span>
          <span class="tag">カット数目安 80カット</span>
          <span class="tag">カメラマン1名</span>
          <span class="tag">ロケーション2箇所</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="grid grid-2">
      <div class="reveal">
        <h3>含まれるもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="check-list mt-40">
          <li>撮影料・カメラマン1名（約4時間）</li>
          <li>衣裳一式（フォーシスアンドカンパニー製 / ドレス・タキシード各1着）</li>
          <li>簡易ヘアメイク（1回）</li>
          <li>撮影データ一式のオンライン納品（厳選50カット＋全カット）</li>
          <li>日本語対応スタッフによる事前サポート</li>
        </ul>
      </div>
      <div class="reveal reveal-1">
        <h3>含まれないもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="cross-list mt-40">
          <li>航空券・宿泊費</li>
          <li>空港・撮影地までの送迎</li>
          <li>アルバム制作（オプション）</li>
          <li>海外旅行保険</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">Options</p><h2>オプション</h2><div class="divider-gold"></div></div>
    <div class="grid grid-4">
      <div class="trust-item reveal"><h3 style="font-size:1rem;">送迎付きプラン</h3><p style="margin-top:10px;">+¥20,000</p></div>
      <div class="trust-item reveal reveal-1"><h3 style="font-size:1rem;">衣裳追加（1着）</h3><p style="margin-top:10px;">+¥32,000</p></div>
      <div class="trust-item reveal reveal-2"><h3 style="font-size:1rem;">アルバム制作</h3><p style="margin-top:10px;">+¥48,000</p></div>
      <div class="trust-item reveal reveal-3"><h3 style="font-size:1rem;">追加ロケーション（1箇所）</h3><p style="margin-top:10px;">+¥30,000</p></div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="split reverse">
      <div class="split-media reveal"><img src="../assets/images/dress-1.svg" alt="フォーシスアンドカンパニーの衣裳"></div>
      <div class="reveal reveal-1">
        <p class="eyebrow">Dress</p>
        <h2>クラシックな街並みに映える、上品な一着</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>歴史的建築と調和する、クラシックなシルエットのドレス・タキシードをご提案。全国の提携サロンで事前に試着可能です。</p>
        <div class="cta-row mt-40"><a href="../dress.html" class="btn btn-outline-dark">ドレスを詳しく見る</a></div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container" style="max-width:820px;">
    <div class="section-head reveal"><p class="eyebrow">Schedule</p><h2>撮影当日のスケジュール例</h2><div class="divider-gold"></div></div>
    <table class="info-table reveal">
      <tr><th>9:00</th><td>ホテルにて集合・お着替え</td></tr>
      <tr><th>9:30</th><td>簡易ヘアメイク</td></tr>
      <tr><th>10:30</th><td>タワーブリッジ周辺にて撮影</td></tr>
      <tr><th>12:30</th><td>石畳の街並みエリアにて撮影</td></tr>
      <tr><th>13:30</th><td>撮影終了・解散</td></tr>
    </table>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">More Information</p><h2>クラシックプランについて、もっと詳しく</h2><div class="divider-gold"></div></div>
    <div class="geo-block reveal">
      <dl class="geo-grid">
        <div class="geo-item"><dt>特徴</dt><dd>タワーブリッジと石畳の街並みという、ロンドンを象徴する2ロケーションを1日で撮影する定番プラン。</dd></div>
        <div class="geo-item"><dt>向いている人</dt><dd>クラシックで気品のある雰囲気を好む方、ヨーロッパ周遊と組み合わせたい方。</dd></div>
        <div class="geo-item"><dt>料金相場</dt><dd>ヨーロッパ方面のフォトウェディング相場は35万〜60万円程度。本プランは相場のなかでも標準的な価格帯です。</dd></div>
        <div class="geo-item"><dt>撮影時期</dt><dd>4〜9月は日照時間が長く撮影しやすい時期です。冬季は日没が早いため午前中の撮影が中心となります。</dd></div>
        <div class="geo-item"><dt>気候</dt><dd>西岸海洋性気候で、年間を通じて雨が降りやすく気温差も比較的穏やかです。</dd></div>
        <div class="geo-item"><dt>準備するもの</dt><dd>パスポート、ETA（電子渡航認証）の事前申請、折りたたみ傘。</dd></div>
        <div class="geo-item"><dt>持ち物</dt><dd>羽織りもの、歩きやすい靴（石畳が多いため）、替えのヘアアクセサリー。</dd></div>
        <div class="geo-item"><dt>撮影データ納品目安</dt><dd>撮影から約4〜6週間でオンライン納品。</dd></div>
      </dl>
    </div>

    <div class="mt-40" style="margin-top:56px;overflow-x:auto;">
      <h3 class="text-center mb-40">ロイヤルプランとの比較</h3>
      <table class="compare-table">
        <tr><th></th><th class="center">クラシックプラン</th><th class="center">ロイヤルプラン</th></tr>
        <tr><td>価格（税込・2名）</td><td class="center">¥398,000</td><td class="center">¥598,000</td></tr>
        <tr><td>撮影時間</td><td class="center">約4時間</td><td class="center">約7時間</td></tr>
        <tr><td>カット数目安</td><td class="center">80カット</td><td class="center">150カット</td></tr>
        <tr><td>ロケーション</td><td class="center">タワーブリッジ＋市街地</td><td class="center">古城＋庭園＋市街地</td></tr>
        <tr><td>予約形式</td><td class="center">即予約できます</td><td class="center">現地確認後ご回答</td></tr>
      </table>
    </div>
  </div>
</section>
```


---

## ロンドン ロイヤルプラン（Product handle: `london-premium`, Collection: `london`）

**価格（バリアント価格）**: ¥598,000

**custom.availability**
```
confirm
```

**custom.availability_label**
```
現地確認後ご回答
```

**custom.region**
```
London — Royal
```

**custom.short_description**
```
古城・庭園ロケーションを含む、ロンドンフォトウェディングの格式高いロイヤルプラン。
```

**custom.diagnosis_reason**
```
古城・庭園を含む、格式高い特別な物語を。
```

**custom.faqs（faq_item ×3）**
1. Q: `古城は毎回同じ場所ですか？`
   A: `提携する複数の古城・邸宅から、当日の空き状況に応じてご案内します。第一希望のヒアリングも可能です。`
2. Q: `移動距離が心配です。`
   A: `古城・庭園はロンドン市内から車で1〜2時間程度の郊外にあることが多く、専用車での送迎を含みます。移動時間も考慮したスケジュールをご提案します。`
3. Q: `「現地確認後ご回答」とはどういう意味ですか？`
   A: `古城・庭園は現地の利用枠が限られているため、お問い合わせ後に現地手配先へ空き状況を確認し、2営業日以内にご回答するプランです。`

**Description（商品説明、HTMLで貼り付け）**
```html
<section>
  <div class="container">
    <div>
      <div class="reveal">
        <p class="eyebrow">Plan Overview</p>
        <h2>古城・庭園・市街地、格式ある3つの舞台</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>英国貴族の邸宅を思わせる古城と、手入れの行き届いた庭園、そしてタワーブリッジをはじめとする市街地を1日で撮影する当店最上位のプラン。フォーシスアンドカンパニーのクラシックな衣裳が、格式高い背景と美しく調和します。</p>
        <div class="tag-row mt-40">
          <span class="tag">撮影時間 約7時間</span>
          <span class="tag">カット数目安 150カット</span>
          <span class="tag">カメラマン2名体制</span>
          <span class="tag">ロケーション3箇所</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="grid grid-2">
      <div class="reveal">
        <h3>含まれるもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="check-list mt-40">
          <li>撮影料・カメラマン2名体制（約7時間）</li>
          <li>衣裳一式（フォーシスアンドカンパニー製 / ドレス・タキシード各2着まで）</li>
          <li>本格ヘアメイク（1回・チェンジ込み）</li>
          <li>古城・庭園の利用料</li>
          <li>撮影データ一式のオンライン納品（厳選100カット＋全カット）</li>
          <li>現地送迎（ホテル〜各ロケーション間）</li>
          <li>日本語対応スタッフ同行</li>
        </ul>
      </div>
      <div class="reveal reveal-1">
        <h3>含まれないもの</h3>
        <div class="divider-gold" style="margin-left:0;"></div>
        <ul class="cross-list mt-40">
          <li>航空券・宿泊費</li>
          <li>アルバム制作（オプション）</li>
          <li>ドローン空撮（オプション・要許可）</li>
          <li>海外旅行保険</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">Options</p><h2>オプション</h2><div class="divider-gold"></div></div>
    <div class="grid grid-4">
      <div class="trust-item reveal"><h3 style="font-size:1rem;">アルバム制作</h3><p style="margin-top:10px;">+¥60,000</p></div>
      <div class="trust-item reveal reveal-1"><h3 style="font-size:1rem;">ドローン空撮</h3><p style="margin-top:10px;">+¥28,000</p></div>
      <div class="trust-item reveal reveal-2"><h3 style="font-size:1rem;">衣裳追加（1着）</h3><p style="margin-top:10px;">+¥32,000</p></div>
      <div class="trust-item reveal reveal-3"><h3 style="font-size:1rem;">クラシックカー送迎</h3><p style="margin-top:10px;">+¥45,000</p></div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container">
    <div class="split reverse">
      <div class="split-media reveal"><img src="../assets/images/dress-2.svg" alt="フォーシスアンドカンパニーの衣裳"></div>
      <div class="reveal reveal-1">
        <p class="eyebrow">Dress</p>
        <h2>格式ある空間に映える、2着チェンジ</h2>
        <div class="divider-gold" style="margin-left:0;"></div>
        <p>古城・庭園に映えるクラシカルなドレスと、市街地散策に映えるモダンな一着。全国の提携サロンで事前に試着可能です。</p>
        <div class="cta-row mt-40"><a href="../dress.html" class="btn btn-outline-dark">ドレスを詳しく見る</a></div>
      </div>
    </div>
  </div>
</section>

<section class="bg-ivory">
  <div class="container" style="max-width:820px;">
    <div class="section-head reveal"><p class="eyebrow">Schedule</p><h2>撮影当日のスケジュール例</h2><div class="divider-gold"></div></div>
    <table class="info-table reveal">
      <tr><th>7:00</th><td>ホテルにて本格ヘアメイク</td></tr>
      <tr><th>8:30</th><td>古城・庭園へ移動</td></tr>
      <tr><th>9:30</th><td>古城・庭園にて撮影</td></tr>
      <tr><th>12:30</th><td>市街地へ移動・衣裳チェンジ</td></tr>
      <tr><th>13:30</th><td>タワーブリッジ周辺にて撮影</td></tr>
      <tr><th>14:30</th><td>撮影終了・ホテルへ送迎</td></tr>
    </table>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head reveal"><p class="eyebrow">More Information</p><h2>ロイヤルプランについて、もっと詳しく</h2><div class="divider-gold"></div></div>
    <div class="geo-block reveal">
      <dl class="geo-grid">
        <div class="geo-item"><dt>特徴</dt><dd>古城・庭園・市街地の3ロケーションを1日で撮影する、格式高い当店最上位プラン。</dd></div>
        <div class="geo-item"><dt>向いている人</dt><dd>クラシックで格式高い雰囲気を求める方、衣裳チェンジで複数シーンを残したい方、特別な記念として撮影したい方。</dd></div>
        <div class="geo-item"><dt>料金相場</dt><dd>古城・庭園を含む上位プランの相場は50万〜80万円程度。本プランはその中でも標準的な価格帯です。</dd></div>
        <div class="geo-item"><dt>撮影時期</dt><dd>4〜9月は庭園の緑が美しく、日照時間も長くおすすめです。</dd></div>
        <div class="geo-item"><dt>気候</dt><dd>西岸海洋性気候。庭園エリアは緑豊かで季節による表情の変化が楽しめます。</dd></div>
        <div class="geo-item"><dt>準備するもの</dt><dd>パスポート、ETA申請、歩きやすい靴（庭園・古城内は砂利道が多いため）。</dd></div>
        <div class="geo-item"><dt>持ち物</dt><dd>羽織りもの、折りたたみ傘、替えのヘアアクセサリー。</dd></div>
        <div class="geo-item"><dt>撮影データ納品目安</dt><dd>撮影から約6〜8週間でオンライン納品。</dd></div>
      </dl>
    </div>

    <div class="mt-40" style="margin-top:56px;overflow-x:auto;">
      <h3 class="text-center mb-40">クラシックプランとの比較</h3>
      <table class="compare-table">
        <tr><th></th><th class="center">クラシックプラン</th><th class="center">ロイヤルプラン</th></tr>
        <tr><td>価格（税込・2名）</td><td class="center">¥398,000</td><td class="center">¥598,000</td></tr>
        <tr><td>撮影時間</td><td class="center">約4時間</td><td class="center">約7時間</td></tr>
        <tr><td>カット数目安</td><td class="center">80カット</td><td class="center">150カット</td></tr>
        <tr><td>ロケーション</td><td class="center">タワーブリッジ＋市街地</td><td class="center">古城＋庭園＋市街地</td></tr>
        <tr><td>予約形式</td><td class="center">即予約できます</td><td class="center">現地確認後ご回答</td></tr>
      </table>
    </div>
  </div>
</section>
```
