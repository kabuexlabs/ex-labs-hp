import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // Pages are static by default; the blog routes opt out with
  // `export const prerender = false` so they render on request.
  output: 'static',
  adapter: vercel(),
});
