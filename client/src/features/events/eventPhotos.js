import { eventPhoto, eventToneIndex } from '@shared/components/events/eventPhotos';

export { eventPhoto };

/** A colour per occasion for its tile and hero, so tiles without a photo still differ. */
const TONES = ['from-pink-500 to-rose-400', 'from-sky-500 to-indigo-400', 'from-violet-500 to-fuchsia-400', 'from-amber-500 to-orange-400',
  'from-emerald-500 to-teal-400', 'from-rose-500 to-red-400', 'from-cyan-500 to-blue-400', 'from-lime-500 to-green-400'];
export const eventTone = (occasion) => TONES[eventToneIndex(occasion)];
