/**
 * The sound a provider hears when work arrives.
 *
 * Browsers create an AudioContext in the `suspended` state unless a user
 * gesture starts it. An offer arrives over a socket — no gesture — so building
 * a fresh context per alert produced a SILENT beep every time. One context is
 * kept and unlocked on the provider's first tap, then resumed before each play.
 *
 * Shared by order offers and repair offers so both actually make the same
 * noise; a second copy of this drifts into a different sound, or into silence.
 */

let audioCtx = null;

function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/**
 * Three rising tones — audible across a workshop, short enough not to be
 * infuriating when several land in a row.
 */
export function playOfferAlert() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    [[0, 880], [0.2, 1100], [0.4, 880]].forEach(([delay, freq]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.18);
    });
  } catch {
    // A missing or blocked audio device must never break the screen that was
    // trying to make a noise.
  }
}

/**
 * Ring repeatedly until the provider deals with it.
 *
 * A single beep is missed by someone with a soldering iron in their hand, so a
 * repair offer keeps ringing for as long as it is on screen. Returns a stop
 * function; callers MUST call it when the alert closes.
 */
export function startRinging({ intervalMs = 2500, vibratePattern = [300, 120, 300] } = {}) {
  const ring = () => {
    playOfferAlert();
    try { navigator.vibrate?.(vibratePattern); } catch { /* not supported */ }
  };

  ring();
  const timer = setInterval(ring, intervalMs);
  return () => clearInterval(timer);
}
