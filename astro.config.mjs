import { defineConfig, passthroughImageService } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // Update this when the site moves to a custom domain — canonical
  // URLs, OGP tags, and the sitemap all derive from it.
  site: 'https://kabuexlabs.com',
  // Pages are static by default; the blog routes opt out with
  // `export const prerender = false` so they render on request.
  output: 'static',
  adapter: vercel(),
  // 画像最適化（/_image）は使っていない（画像は public/ の完成品をそのまま配信）。
  // 画像変換処理の脆弱性（GHSA-26w7-cxv4-gfx2）の影響を受けないよう、変換しない設定にしておく。
  // ※ astro 7.3 系＋@astrojs/vercel 11.0.11 に上げた版では本番でページがダウンロード扱いになったため、版は 7.1.3 に固定。
  image: { service: passthroughImageService() },
});
