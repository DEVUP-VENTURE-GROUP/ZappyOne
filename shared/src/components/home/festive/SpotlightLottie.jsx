import { useEffect, useRef } from 'react';

const still = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Spotlight scene: an animated festival scene (Lottie: a garba dancer, Durga
 * Maa, a Diwali diya) in its own card, the line beside it. The player loads
 * only when a scene needs it; with reduced motion it rests on one frame.
 */
export default function SpotlightLottie({ scene, theme }) {
  const box = useRef(null);
  useEffect(() => {
    let anim = null;
    let gone = false;
    import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (gone || !box.current) return;
      anim = lottie.loadAnimation({ container: box.current, renderer: 'svg', loop: true, autoplay: !still(), path: scene.src, rendererSettings: { preserveAspectRatio: 'xMidYMid slice' } });
      if (still()) anim.addEventListener('DOMLoaded', () => anim.goToAndStop(anim.totalFrames * 0.6, true));
    }).catch(() => {});
    return () => { gone = true; anim?.destroy(); };
  }, [scene.src]);

  return (
    <div className="absolute inset-x-3 inset-y-1.5 flex items-stretch gap-3 overflow-hidden rounded-[24px] p-2 sm:inset-x-4 sm:gap-5 sm:p-2.5"
      style={{ background: theme.tile, boxShadow: `inset 0 0 0 1px ${theme.line}, 0 14px 30px -20px ${theme.dark ? '#000' : '#7a4a00'}` }}>
      <div className="fz-pop relative aspect-square h-full max-w-[44%] shrink-0 overflow-hidden rounded-[18px] min-[380px]:max-w-none" style={{ background: scene.card }}>
        <div ref={box} className="absolute inset-0" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center pr-1 sm:pr-4">
        <p className="fz-rise text-[10.5px] font-extrabold uppercase tracking-[0.2em] sm:text-[12px]" style={{ color: theme.accent, animationDelay: '.2s' }}>{scene.kicker}</p>
        <p className="fz-rise mt-1 text-[16px] font-extrabold leading-[1.15] tracking-[-0.02em] [text-wrap:balance] [hyphens:none] min-[380px]:text-[19px] sm:text-[26px]"
          style={{ color: theme.tileInk, animationDelay: '.35s' }}>
          {scene.title}
        </p>
        <span className="fz-rise mt-2.5 block h-[3px] w-10 rounded-full" style={{ background: theme.accent, animationDelay: '.5s' }} />
      </div>
    </div>
  );
}
