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
    title: '下北沢の街を実際に歩き、手描きの絵画の謎を見抜き、登場人物との対話で物語を紡ぐ「あなた自身が体験する美術館」『ロスト・フレーム』をリリース。',
    url: 'https://prtimes.jp/main/html/rd/p/000000001.000185770.html',
    source: 'PR TIMES',
  },
];
