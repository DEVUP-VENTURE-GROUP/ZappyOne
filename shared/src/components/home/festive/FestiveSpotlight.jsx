import { useEffect, useMemo, useRef, useState } from 'react';
import { SCENE_MS, spotlightScenes } from '../../../customer/season';
import SpotlightFireworks from './SpotlightFireworks';
import SpotlightGreeting from './SpotlightGreeting';
import SpotlightOffer from './SpotlightOffer';
import SpotlightPetals from './SpotlightPetals';
import SpotlightPhoto from './SpotlightPhoto';

const still = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The festive spotlight, as Zepto's: a stage at the top of the festive band
 * that changes scene every few seconds, each scene its own festive animation
 * (curtains opening on the greeting, real photographs of Bathukamma, dandiya
 * and garba under twinkling lights and falling petals, the offer). Hovering or holding pauses it; a
 * swipe changes scene. With reduced motion it stays on the first.
 */
export default function FestiveSpotlight({ season, theme }) {
  const scenes = useMemo(() => spotlightScenes(season), [season]);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef(null);
  const auto = !still() && scenes.length > 1;

  useEffect(() => {
    if (!auto || paused) return undefined;
    const t = setTimeout(() => setAt((i) => (i + 1) % scenes.length), SCENE_MS);
    return () => clearTimeout(t);
  }, [at, paused, auto, scenes.length]);

  if (!scenes.length) return null;
  const scene = scenes[at % scenes.length];
  const go = (d) => setAt((i) => (i + d + scenes.length) % scenes.length);

  return (
    <div className="relative -mx-4 h-[200px] select-none sm:mx-0 sm:h-[236px]" aria-label={`${season.name}`}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onPointerDown={(e) => { startX.current = e.clientX; setPaused(true); }}
      onPointerUp={(e) => { const dx = e.clientX - (startX.current ?? e.clientX); startX.current = null; setPaused(false); if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); }}
      onPointerCancel={() => { startX.current = null; setPaused(false); }}>
      {/* key: a new scene mounts afresh, so its animation starts from the beginning. */}
      <div key={`${scene.key}-${at}`} className="fz-scene absolute inset-0">
        {scene.kind === 'curtains' && <SpotlightGreeting season={season} theme={theme} />}
        {scene.kind === 'photo' && <SpotlightPhoto scene={scene} theme={theme} />}
        {scene.kind === 'fireworks' && <SpotlightFireworks season={season} theme={theme} />}
        {scene.kind === 'petals' && <SpotlightPetals season={season} theme={theme} />}
        {scene.kind === 'offer' && <SpotlightOffer offer={scene.offer} theme={theme} />}
      </div>
    </div>
  );
}
