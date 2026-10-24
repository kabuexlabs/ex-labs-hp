// 体質（気血水6証と寒・熱）のアイコン（自作の簡素な図形。viewBox 0 0 48 48、currentColor で描く）。
import type { AdviceKey } from './masters.ts';

export const TYPE_ICON: Record<AdviceKey, string> = {
  // 気虚：バッテリー残量が少ない
  qi_def: '<rect x="8" y="14" width="30" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><rect x="38" y="20" width="4" height="8" rx="1" fill="currentColor"/><rect x="12" y="18" width="7" height="12" rx="2" fill="currentColor"/>',
  // 血虚：中が空の雫
  blood_def: '<path d="M24 6c6 9 13 16 13 24a13 13 0 0 1-26 0c0-8 7-15 13-24z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M18 30a6 6 0 0 0 5 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  // 気滞：途切れた渦
  qi_stag: '<path d="M24 8a16 16 0 1 1-16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M24 16a8 8 0 1 1-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="24" r="2.5" fill="currentColor"/>',
  // 瘀血：濃い雫に点
  blood_stasis: '<path d="M24 6c6 9 13 16 13 24a13 13 0 0 1-26 0c0-8 7-15 13-24z" fill="currentColor"/><circle cx="20" cy="30" r="2.5" fill="#fff"/><circle cx="28" cy="26" r="2" fill="#fff"/>',
  // 水滞：波
  fluid: '<path d="M6 18c4-4 8-4 12 0s8 4 12 0 8-4 12 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M6 26c4-4 8-4 12 0s8 4 12 0 8-4 12 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M6 34c4-4 8-4 12 0s8 4 12 0 8-4 12 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  // 陰虚：月
  yin_def: '<path d="M30 6a18 18 0 1 0 12 30A15 15 0 0 1 30 6z" fill="currentColor"/>',
  // 冷え（寒）：雪の結晶
  cold: '<path d="M24 6v36M8.4 15l31.2 18M8.4 33l31.2-18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M20 10l4 4 4-4M20 38l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  // 熱：太陽
  heat: '<circle cx="24" cy="24" r="9" fill="currentColor"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
};

export const typeIconSvg = (t: AdviceKey, size = 28) =>
  `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${TYPE_ICON[t]}</svg>`;
