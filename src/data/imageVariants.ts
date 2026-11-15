// 縮小版（横600px、ファイル名に -600 を付けたもの）を用意してある画像と、元画像の横幅。
// スマホでは表示幅が小さいため、srcset でブラウザに小さい方を選ばせて読み込み量を減らす（見た目は同じ）。
// 画像を差し替えたら、縮小版も作り直すこと（public/ の同じ場所に <名前>-600.webp）。2026-11-15 作成。
const FULL_WIDTH = new Map<string, number>([
  ['/assets/events/uwasabanashi-kv.webp', 880], ['/assets/events/7th-composition-kv.webp', 880], ['/assets/events/gensou-kv.webp', 880],
  ['/assets/events/lost-frame.webp', 800], ['/assets/events/kaitou-kv.webp', 880], ['/assets/events/uwasabanashi-case2-kv.webp', 880],
  ['/assets/events/atelier-copel.webp', 880], ['/assets/work-1.webp', 849], ['/assets/work-2.webp', 880], ['/assets/work-3.webp', 880],
  ['/assets/work-5.webp', 880], ['/assets/work-8.webp', 880], ['/assets/zunousen/present-poker.webp', 900],
  ['/assets/zunousen/zunouou-tunnel-tokyo.webp', 1600], ['/assets/zunousen/werewolf-theorem.webp', 900],
  ['/assets/mm/frankenstein.webp', 900], ['/assets/mm/blue-diamond.webp', 900],
]);

export const small600 = (src: string | undefined): string | undefined =>
  src && FULL_WIDTH.has(src) ? src.replace(/\.webp$/, '-600.webp') : undefined;

/** <img> に渡す srcset（縮小版がない画像は undefined＝従来どおり） */
export function srcsetOf(src: string | undefined): string | undefined {
  const s = small600(src);
  return s ? `${s} 600w, ${src} ${FULL_WIDTH.get(src!)}w` : undefined;
}
