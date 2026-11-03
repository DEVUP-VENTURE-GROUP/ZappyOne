import { jhalarCss } from '../../../customer/season';
import FestiveReveal from './FestiveReveal';

/**
 * A festive moment between home sections. As it scrolls into view the lines
 * draw out from the centre, the marigold drops in and swings, and a jhalar
 * slides across beneath.
 */
export default function FestiveDivider({ theme }) {
  return (
    <FestiveReveal on className="fz-divider">
      <div aria-hidden="true" className="flex flex-col items-center gap-1 py-2">
        <div className="flex items-center justify-center gap-3">
          <span className="fz-line-l h-px w-16 origin-right sm:w-28" style={{ background: theme.accent }} />
          <svg viewBox="0 0 36 30" width="36" height="30" className="fz-bell overflow-visible">
            <g className="fz-sway" style={{ transformOrigin: '18px 0px' }}>
              <path d="M18,0 L18,13" stroke={theme.accent} strokeWidth="1" />
              <circle cx="18" cy="17" r="5" fill="#F59E0B" />
              <circle cx="18" cy="17" r="2.2" fill="#EA580C" />
              <path d="M14,23 Q18,27 22,23" stroke="#2F7D4A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </g>
          </svg>
          <span className="fz-line-r h-px w-16 origin-left sm:w-28" style={{ background: theme.accent }} />
        </div>
        <span className="fz-strip block h-3 w-full max-w-md"
          style={{ backgroundImage: jhalarCss(theme.dark ? theme.accent : theme.paint[4] || theme.accent), backgroundRepeat: 'repeat-x' }} />
      </div>
    </FestiveReveal>
  );
}
