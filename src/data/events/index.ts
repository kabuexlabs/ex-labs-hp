// 公開用データセット。ページはここから読む。読み込み時に検証し、不正ならビルドを止める。
// 動作確認用のダミーデータは fixtures.ts にあり、ここには含めない（公開ページ・サイトマップに混入させない）。
import type { EventsDataset } from './types.ts';
import { sources } from './sources.ts';
import { organizers } from './organizers.ts';
import { venues } from './venues.ts';
import { channels } from './channels.ts';
import { works } from './works.ts';
import { occurrences } from './occurrences.ts';
import { validateDataset } from '../../lib/events.ts';

export const eventsData: EventsDataset = { sources, organizers, venues, channels, works, occurrences };

const errors = validateDataset(eventsData);
if (errors.length) throw new Error(`公演データの検証に失敗:\n- ${errors.join('\n- ')}`);

/** 修正・掲載停止の連絡先（ページに表示） */
export const EVENTS_CONTACT = 'info@kabuexlabs.com';
/** 一覧に出す期間（今日から何日先まで） */
export const LIST_DAYS = 90;
