// 実績マーケー（ヒーロー下の自動スクロール画像）に使う実績一覧。
// トップページと全サービスLPが共通でこの配列を参照するので、
// ここを編集するだけで全ページに反映される。
export interface HeroWork {
  src: string;
  w: number;
  h: number;
}

export const heroWorks: HeroWork[] = [
  { src: '/assets/work-2.webp', w: 880, h: 1238 },
  { src: '/assets/work-1.webp', w: 849, h: 1200 },
  { src: '/assets/work-8.webp', w: 880, h: 1248 },
  { src: '/assets/work-7.webp', w: 880, h: 974 },
  { src: '/assets/work-3.webp', w: 880, h: 1252 },
  { src: '/assets/events/atelier-copel.webp', w: 880, h: 1244 },
  { src: '/assets/events/uwasabanashi-kv.webp', w: 880, h: 1244 },
  { src: '/assets/events/kaitou-kv.webp', w: 880, h: 1248 },
];
