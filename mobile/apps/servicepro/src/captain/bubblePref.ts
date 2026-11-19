// The pro's own choice to keep the ZappyOne bubble off, saved on this phone; the bubble and its prompt follow it.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'zappy.bubbleOff';
let off = false;
const listeners = new Set<(v: boolean) => void>();
AsyncStorage.getItem(KEY).then((v) => { off = v === '1'; listeners.forEach((l) => l(off)); }).catch(() => {});

export const bubbleOff = () => off;
export function setBubbleOff(v: boolean) {
  off = v;
  AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => {});
  listeners.forEach((l) => l(v));
}
export function onBubbleOff(l: (v: boolean) => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
