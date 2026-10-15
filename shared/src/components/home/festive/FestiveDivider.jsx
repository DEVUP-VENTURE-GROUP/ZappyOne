/**
 * A small festive ornament between home sections: two fine lines meeting at
 * a marigold (or the festival's accent), a little bell swaying beneath.
 */
export default function FestiveDivider({ theme }) {
  return (
    <div aria-hidden="true" className="flex items-center justify-center gap-3 py-1">
      <span className="h-px w-16 sm:w-28" style={{ background: `linear-gradient(90deg, transparent, ${theme.accent})` }} />
      <svg viewBox="0 0 36 30" width="36" height="30" className="overflow-visible">
        <g className="fz-sway" style={{ transformOrigin: '18px 0px' }}>
          <path d="M18,0 L18,13" stroke={theme.accent} strokeWidth="1" />
          <circle cx="18" cy="17" r="5" fill="#F59E0B" />
          <circle cx="18" cy="17" r="2.2" fill="#EA580C" />
          <path d="M14,23 Q18,27 22,23" stroke="#2F7D4A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
        <circle cx="4" cy="6" r="1.6" fill={theme.accent} opacity=".6" />
        <circle cx="32" cy="6" r="1.6" fill={theme.accent} opacity=".6" />
      </svg>
      <span className="h-px w-16 sm:w-28" style={{ background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
    </div>
  );
}
