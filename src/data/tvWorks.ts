// テレビ番組への参画実績。リンクカード（src/components/LinkPreviewCard.astro）とサービスの実績カードが参照する。
// 番組の画像はこちらで保存・使用せず、番組公式サイトのリンクプレビュー画像（og:image）を相手のサイトから表示する（src/lib/linkPreview.ts）。
export interface TvWork {
  url: string;
  title: string;
  broadcaster: string;
  /** 放送枠など（公開情報） */
  slot: string;
  /** 当社の関わり方（ご本人確認済みの表現だけ） */
  role: string;
}

export const FRIDAY_MYSTERY: TvWork = {
  url: 'https://www.ntv.co.jp/friday-mystery/',
  title: '金曜ミステリークラブ!!!',
  broadcaster: '日本テレビ',
  slot: '毎週金曜19時',
  role: 'ミステリー企画で参画',
};
