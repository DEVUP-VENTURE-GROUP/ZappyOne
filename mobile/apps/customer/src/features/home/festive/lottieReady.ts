/**
 * Whether this installed build has the Lottie player (added for app build 3).
 * Over-the-air updates also reach older builds without it, so festive scenes
 * check here and fall back rather than crash.
 */
import { UIManager } from 'react-native';

let ready: boolean | null = null;

export function lottieReady(): boolean {
  if (ready === null) {
    try { ready = !!UIManager.hasViewManagerConfig?.('LottieAnimationView'); } catch { ready = false; }
  }
  return ready;
}
