// メディア掲載実績の一覧。新しい掲載が決まったらこの配列の先頭に
// 追加するだけで、トップページの「メディア掲載実績」セクションと
// /media/ の一覧ページの両方に反映される。
//
// date は「2026.07」のように年月まで（正確な掲載日が分かる場合は
// 「2026.07.22」のように日まで）を記載する。

export interface MediaItem {
  /** 媒体名（例：日本経済新聞） */
  outlet: string;
  /** 掲載時期（表示用） */
  date: string;
  /** 見出し（サイト内での表示タイトル） */
  title: string;
  /** 掲載内容の紹介文 */
  desc: string;
  /** 記事URL（有料会員限定記事などでもリンクは載せてよい） */
  url?: string;
}

export const mediaItems: MediaItem[] = [
  {
    outlet: '日本経済新聞',
    date: '2026.07',
    title: '「ウワサバナシ調査委員会」が紹介されました',
    desc: '渋谷サクラステージ全体を周遊する都市伝説×イマーシブ×謎解きの体験型イベント「ウワサバナシ調査委員会」（東急不動産株式会社・404 Not Found・TSUTAYA協力）の取り組みが、日本経済新聞に掲載されました。',
    url: 'https://www.nikkei.com/article/DGXZQOUC222NG0S6A720C2000000/',
  },
];
