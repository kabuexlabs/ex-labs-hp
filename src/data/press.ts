// プレスリリース一覧。新しい配信が出たら先頭に1件追加するだけでOK。
// date は YYYY-MM-DD、url は PR TIMES などの配信先リンク。
export interface PressItem {
  date: string;
  title: string;
  url: string;
  source?: string;
}

export const pressItems: PressItem[] = [
  {
    date: '2026-07-07',
    title: 'プレスリリース第1弾を配信しました',
    url: 'https://prtimes.jp/main/html/rd/p/000000001.000185770.html',
    source: 'PR TIMES',
  },
];
