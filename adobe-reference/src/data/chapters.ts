import { features } from './features';
import type { Chapter, ProvenanceKind, Section, SectionBlock, SectionItem } from './types';

/**
 * 章・節データ。
 *
 * 項目（items）の文言は、開発指示書の第5章「元資料を忠実に収録する」に列挙された項目名を
 * そのまま転記したもの（provenance: 'instruction'）。元資料の本文ではない。
 * 元資料の本文は sourceText.ts に登録する（現状は未提供）。
 */

function items(sectionId: string, texts: string[], provenance: ProvenanceKind = 'instruction'): SectionItem[] {
  return texts.map((text, i) => ({ id: `item-${sectionId}-${i + 1}`, text, provenance }));
}

function section(chapterId: string, id: string, title: string, rest: Partial<Section> = {}): Section {
  return {
    id,
    chapterId,
    title,
    items: [],
    featureIds: features.filter((f) => f.section === id).map((f) => f.id),
    sourceTextKey: `section:${id}`,
    ...rest,
  };
}

const flow = (id: string, title: string, steps: string[], caption?: string): SectionBlock => ({
  kind: 'flow',
  id,
  title,
  steps,
  provenance: 'instruction',
  caption,
});

export const chapters: Chapter[] = [
  {
    id: 'ch1',
    number: 1,
    title: '最新版の全体像',
    sourceTextKey: 'chapter:1',
    items: [
      ...items('1-products', ['Photoshop', 'Lightroom', 'Adobe Firefly', 'Adobe Camera Raw']),
    ],
    sections: [
      section('ch1', '1', '最新版の全体像：収録内容', {
        items: items('1', [
          '各製品の概要',
          '主な用途',
          '主要機能',
          '製品間の役割の違い',
          '2026年10月20日時点という元資料の基準日',
          '公式更新情報に関する記述',
        ]),
        notes: [
          {
            id: 'note-1-basedate',
            text: '元資料の基準日：2026年10月20日（開発指示書の記載による。元資料本文で日付を確認したものではありません）',
            provenance: 'instruction',
          },
        ],
        blocks: [
          {
            kind: 'table',
            id: 'table-1-products',
            title: '対象製品と収録予定の項目',
            columns: ['製品', '概要', '主な用途', '主要機能', '他製品との役割の違い'],
            rows: [
              { key: 'Photoshop', cells: [null, null, null, null], link: '/product/photoshop' },
              { key: 'Lightroom', cells: [null, null, null, null], link: '/product/lightroom' },
              { key: 'Adobe Firefly', cells: [null, null, null, null], link: '/product/firefly' },
              { key: 'Adobe Camera Raw', cells: [null, null, null, null], link: '/product/camera-raw' },
            ],
            provenance: 'source-missing',
            caption: '行と列は開発指示書の項目に基づきます。各セルの内容は元資料本文が未提供のため未記載です。',
          },
        ],
      }),
    ],
  },
  {
    id: 'ch2',
    number: 2,
    title: 'Photoshopの機能仕様',
    sourceTextKey: 'chapter:2',
    items: [],
    sections: [
      section('ch2', '2-1', '生成AIによる画像編集', {
        notes: items('2-1-fields', [
          '各機能で保持する項目：目的／入力／処理／出力／用途／制約／関連する公式資料／実装状況に関する元資料の記述',
        ]),
      }),
      section('ch2', '2-2', '生成AI以外の主要な編集機能', {
        blocks: [
          {
            kind: 'table',
            id: 'table-2-2',
            title: '生成AI以外の主要な編集機能',
            columns: ['機能', '入力・操作', '主な出力', '実務上の用途'],
            rows: features
              .filter((f) => f.section === '2-2')
              .map((f) => ({ key: f.title, cells: [null, null, null], link: `/feature/${f.id}` })),
            provenance: 'source-missing',
            caption: '列名と行（機能名）は開発指示書の記載です。セルの内容は元資料本文が未提供のため未記載です。',
          },
        ],
      }),
      section('ch2', '2-3', '画像の品質改善'),
      section('ch2', '2-4', 'レイヤーと編集データの仕様', {
        blocks: [
          flow(
            'flow-2-4',
            '編集データの処理工程',
            ['元画像', '選択範囲・マスク', '編集レイヤー・生成結果', '補正・合成・確認', '最終書き出し'],
            '工程の順序と名称は開発指示書の記載に従っています。',
          ),
        ],
      }),
    ],
  },
  {
    id: 'ch3',
    number: 3,
    title: 'Lightroomの機能仕様',
    sourceTextKey: 'chapter:3',
    items: [],
    sections: [
      section('ch3', '3-1', 'AIによる写真選別', {
        items: items('3-1', [
          '大量の写真から候補を絞る仕組み',
          '顔や目の検出',
          '目の開閉や鮮明さの確認',
          '露出などの問題の検出',
          '人間による最終確認の必要性',
        ]),
      }),
      section('ch3', '3-2', '文章による写真編集', {
        items: items('3-2', ['Prompt to Edit', '入力例', '出力', '制約', '元資料に記載されたモデル名']),
        notes: [
          {
            id: 'note-3-2-model',
            text: '元資料に記載されたモデル名は、元資料本文が未提供のため収録していません。現在も利用できるかどうかは未確認です。',
            provenance: 'source-missing',
          },
        ],
      }),
      section('ch3', '3-3', '部分補正・マスク', {
        blocks: [
          {
            kind: 'table',
            id: 'table-3-3',
            title: '部分補正・マスクの種類',
            columns: ['対象', '主な処理', '具体例'],
            rows: features
              .filter((f) => f.section === '3-3')
              .map((f) => ({ key: f.title.replace('部分補正・マスク：', ''), cells: [null, null], link: `/feature/${f.id}` })),
            provenance: 'source-missing',
            caption: '対象（行）と列名は開発指示書の記載です。セルの内容は元資料本文が未提供のため未記載です。',
          },
        ],
      }),
      section('ch3', '3-4', '反射除去・ノイズ除去・鮮明化', {
        blocks: [
          {
            kind: 'table',
            id: 'table-3-4',
            title: '反射除去・ノイズ除去・鮮明化',
            columns: ['機能', '入力', '出力', '制約'],
            rows: features
              .filter((f) => f.section === '3-4')
              .map((f) => ({ key: f.title, cells: [null, null, null], link: `/feature/${f.id}` })),
            provenance: 'source-missing',
          },
          {
            kind: 'image-missing',
            id: 'image-3-4',
            title: '元資料の画像とキャプション',
            caption:
              '開発指示書には「元資料に画像とキャプションが含まれている場合」の扱いが記載されていますが、元資料と画像データは提供されていません。無関係な画像で代替していません。',
          },
        ],
      }),
      section('ch3', '3-5', 'Lightroomでの一括処理', {
        blocks: [
          flow('flow-3-5', 'Lightroomでの一括処理の工程', [
            '撮影写真を読み込む',
            '問題のある写真を確認して候補を絞る',
            '基準写真を補正する',
            '設定を複数の写真に適用する',
            '写真ごとに微調整する',
            '指定条件で書き出す',
          ]),
        ],
      }),
    ],
  },
  {
    id: 'ch4',
    number: 4,
    title: '技術仕様',
    sourceTextKey: 'chapter:4',
    items: [],
    sections: [
      section('ch4', '4-1', '画像データの扱い', {
        items: items('4-1', ['画像寸法', '解像度', '色深度', '色空間', 'レイヤー', 'マスク', '透明度', 'メタデータ', 'ICCプロファイル']),
        notes: [
          {
            id: 'note-4-1-formats',
            text: 'ファイル形式（RAW、PSD、PSB、TIFF、JPEG、PNG、DNG）の主な用途と特徴は「ファイル形式一覧」に収録しています。',
            provenance: 'app-original',
            link: '/formats',
          },
        ],
      }),
      section('ch4', '4-2', '生成AIの入力・処理・出力', {
        items: [
          ...items('4-2', ['入力', '処理', '出力', '品質検査']),
          ...items('4-2-qa', ['顔の同一性', '指や手などの形状', '衣装の装飾', '背景の構造', '光源・影・輪郭', '意図しない変化']).map(
            (it) => ({ ...it, text: `品質検査項目：${it.text}`, link: '/quality' }),
          ),
        ],
      }),
      section('ch4', '4-3', 'AIモデルの選択', {
        items: items('4-3', [
          '対応機能',
          '入力条件',
          '出力品質',
          '編集の一貫性',
          '処理時間',
          '利用費用',
          '商用利用条件',
          'データの取り扱い',
        ]),
        notes: [
          {
            id: 'note-4-3-model',
            text: '元資料に記載されたモデル名は、元資料本文が未提供のため収録していません。現在の公式対応状況も確認していないため、現在利用できるとは表示しません。',
            provenance: 'source-missing',
          },
        ],
      }),
    ],
  },
  {
    id: 'ch5',
    number: 5,
    title: '自動化・大量処理',
    sourceTextKey: 'chapter:5',
    items: [],
    sections: [
      section('ch5', '5-1', '自動化できる範囲', {
        notes: [
          {
            id: 'note-5-1',
            text: '作業ごとの自動化方法と注意点は「自動化一覧」の表に収録しています。',
            provenance: 'app-original',
            link: '/automation',
          },
        ],
      }),
      section('ch5', '5-2', '大量の写真を処理するシステムの設計例', {
        items: items('5-2', ['定型化しやすい工程と、人間による確認が必要な工程の違い']),
        blocks: [
          flow('flow-5-2', '大量の写真を処理するシステムの6工程', [
            '写真の取り込み',
            '自動選別',
            '一括補正',
            '個別修正',
            '品質検査',
            '納品データの作成',
          ]),
        ],
      }),
    ],
  },
  {
    id: 'ch6',
    number: 6,
    title: 'Fireflyとその他のAdobe製品',
    sourceTextKey: 'chapter:6',
    items: [],
    sections: [
      section('ch6', '6-1', 'Firefly', {
        notes: [
          {
            id: 'note-6-1',
            text: '個人向け機能と組織向け機能を区別して収録します。区別の内容は元資料本文が未提供のため未記載です。',
            provenance: 'instruction',
          },
        ],
      }),
      section('ch6', '6-2', 'Illustratorなど', {
        blocks: [
          {
            kind: 'table',
            id: 'table-6-2',
            title: '各製品の役割',
            columns: ['製品', '役割'],
            rows: [
              { key: 'Illustrator', cells: [null], link: '/product/illustrator' },
              { key: 'Adobe Express', cells: [null], link: '/product/express' },
              { key: 'Adobe Camera Raw', cells: [null], link: '/product/camera-raw' },
              { key: 'Photoshop', cells: [null], link: '/product/photoshop' },
              { key: 'Adobe Firefly', cells: [null], link: '/product/firefly' },
            ],
            provenance: 'source-missing',
            caption: '各製品の役割は元資料に沿って記載する項目ですが、元資料本文が未提供のため未記載です。',
          },
        ],
      }),
    ],
  },
];

export const allSections: Section[] = chapters.flatMap((c) => c.sections);
export const sectionById: Record<string, Section> = Object.fromEntries(allSections.map((s) => [s.id, s]));
export const chapterById: Record<string, Chapter> = Object.fromEntries(chapters.map((c) => [c.id, c]));

export function sectionLabel(id: string): string {
  const s = sectionById[id];
  if (!s) return id;
  return id === '1' ? `第1章 ${s.title}` : `${id} ${s.title}`;
}
