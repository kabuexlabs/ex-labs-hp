import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // Update this when the site moves to a custom domain — canonical
  // URLs, OGP tags, and the sitemap all derive from it.
  site: 'https://ex-labs-hp.vercel.app',
  // Pages are static by default; the blog routes opt out with
  // `export const prerender = false` so they render on request.
  output: 'static',
  adapter: vercel(),
});
