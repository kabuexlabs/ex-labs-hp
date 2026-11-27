// 「午前零時の幻想集」の会期が終わったかどうか（2026-11-27 追加）。
// 案内枠（src/components/guide/GensouFeature.astro）は会期後に何も出さないため、
// 枠を置いている記事の側でも、この関数で外側の余白ごと出さないようにする（空の白い枠が残るのを防ぐ）。
import { eventsData } from './events/index';
import { jstDateString } from '../lib/thisWeek';

export function gensouEnded(now: Date = new Date()): boolean {
  const w = eventsData.works.find((x) => x.id === 'gensou');
  const dates = eventsData.occurrences.filter((o) => o.workId === 'gensou' && o.published && !o.test && o.eventStatus !== 'cancelled').map((o) => o.date).sort();
  const to = dates[dates.length - 1] ?? w?.period?.to ?? '2026-11-22';
  return jstDateString(now) > to;
}
