/**
 * One festive tile, as Blinkit's: a cream card, the title in bold on top, a
 * real photo below it, and any badge as a ribbon on the photo. A feature tile
 * (two rows tall) gives the photo the extra height.
 */
export default function FestiveTile({ tile, theme, feature = false, wide = false, index = 0, onOpen }) {
  return (
    <button type="button" onClick={onOpen}
      className={`fz-rise fz-tile group relative flex flex-col overflow-hidden rounded-[18px] p-1.5 text-left active:scale-[0.97] ${feature ? 'row-span-2 lg:row-span-1' : ''}`}
      style={{
        background: theme.tile, animationDelay: `${0.12 + index * 0.07}s`,
        boxShadow: `inset 0 0 0 1px ${theme.line}, 0 8px 22px -16px ${theme.dark ? '#000' : '#8a5a00'}`,
      }}>
      <span className={`block px-1.5 pb-1.5 pt-1.5 text-center font-extrabold leading-[1.15] tracking-[-0.01em] [text-wrap:balance] ${feature ? 'text-[16px] lg:min-h-[2.3em] lg:text-[14px]' : 'min-h-[2.3em] text-[13px] lg:text-[14px]'}`}
        style={{ color: theme.tileInk }}>
        {tile.title}
      </span>
      <span className={`relative block w-full overflow-hidden rounded-[13px] ${feature ? 'min-h-[160px] flex-1 lg:aspect-[4/3] lg:min-h-0 lg:flex-none' : wide ? 'aspect-[4/3]' : 'aspect-[1/1] lg:aspect-[4/3]'}`}
        style={{ background: theme.line }}>
        {tile.image
          ? <img src={tile.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
          : <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] font-semibold" style={{ color: theme.sub }}>{tile.service.name}</span>}
        {tile.badge && (
          <span className="absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-[3px] text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm" style={{ background: theme.accent }}>
            {tile.badge}
          </span>
        )}
      </span>
    </button>
  );
}
