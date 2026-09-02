// 自社内で同じ検索意図を奪い合っていたページの統合先。
// microCMS のブログ記事 ID → 統合先パス。middleware が 301 を返し、
// sitemap・ブログ一覧・関連記事枠からも除外して評価を1ページに集約する。
// 例）「イマーシブの意味とは？」ブログ記事は /guide/immersive/ と
//     「イマーシブ 意味」で票を分け合っていた（GSC で両方が表示）。
export const BLOG_REDIRECTS: Record<string, string> = {
  'znpa6h6q_-gn': '/guide/immersive/',
};
