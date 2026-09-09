// Lighthouse JSON の要約（perf/a11y/bp/seo と FCP/LCP/TBT/CLS/SI）。 node scripts/lighthouse-summarize.mjs <dir>
import fs from 'node:fs'; import path from 'node:path';
const dir = process.argv[2]; const out = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); const c = r.categories, a = r.audits; const g = (k) => a[k]?.displayValue ?? '-';
  out.push({ page: f.replace('.json', ''), perf: Math.round(c.performance.score * 100), a11y: Math.round(c.accessibility.score * 100), bp: Math.round(c['best-practices'].score * 100), seo: Math.round(c.seo.score * 100), FCP: g('first-contentful-paint'), LCP: g('largest-contentful-paint'), TBT: g('total-blocking-time'), CLS: g('cumulative-layout-shift'), SI: g('speed-index') });
}
fs.writeFileSync(path.join(dir, '_summary.json'), JSON.stringify(out, null, 1)); console.table(out);
