// お客様の声（Xの投稿スクリーンショット）。
//
// 追加するときは、画像を public/assets/voices/<ページ名>/ に置いて、
// 対応する配列にエントリを1つ足すだけでOK。
export interface Voice {
  src: string;
  alt: string;
}

export const zunousenVoices: Voice[] = [
  { src: '/assets/voices/zunousen/voice-1.webp', alt: 'お客様の声1：東京都頭脳王決定戦 参加者の投稿' },
  { src: '/assets/voices/zunousen/voice-2.webp', alt: 'お客様の声2：東京都頭脳王決定戦 参加者の投稿' },
  { src: '/assets/voices/zunousen/voice-3.webp', alt: 'お客様の声3：東京都頭脳王決定戦 参加者の投稿' },
  { src: '/assets/voices/zunousen/voice-4.webp', alt: 'お客様の声4：東京都頭脳王決定戦 参加者の投稿' },
];
