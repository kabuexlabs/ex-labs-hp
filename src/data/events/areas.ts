// 地域・エリア・ジャンルの登録簿。掲載データがある地域だけをページに出す（空の地域ページは作らない）。
import type { Genre } from './types';

export interface Region { id: string; name: string }
export interface Area { id: string; regionId: string; name: string }

export const REGIONS: Region[] = [
  { id: 'tokyo', name: '東京' },
];

export const AREAS: Area[] = [
  { id: 'shibuya', regionId: 'tokyo', name: '渋谷' },
  { id: 'roppongi', regionId: 'tokyo', name: '六本木' },
  { id: 'shimokitazawa', regionId: 'tokyo', name: '下北沢' },
  { id: 'kanda', regionId: 'tokyo', name: '神田' },
];

export const GENRES: { id: Genre; name: string; short: string; desc: string }[] = [
  { id: 'immersive-theater', name: 'イマーシブシアター', short: 'シアター', desc: '客席のない空間で物語の中を歩き回る演劇型の体験' },
  { id: 'story-experience', name: '俳優と交流する物語体験', short: '物語体験', desc: 'キャストとの会話や選択で物語が進む少人数の体験' },
  { id: 'walk-story', name: '物語性のある周遊型イベント', short: '周遊型', desc: '街や施設を歩いて巡りながら物語を追う体験' },
  { id: 'murder-mystery', name: 'マーダーミステリー', short: 'マダミス', desc: '登場人物になりきって推理と議論で真相を探る体験' },
];

export const genreName = (id: Genre): string => GENRES.find((g) => g.id === id)?.name ?? id;
export const areaName = (id: string): string => AREAS.find((a) => a.id === id)?.name ?? id;
export const regionName = (id: string): string => REGIONS.find((r) => r.id === id)?.name ?? id;
