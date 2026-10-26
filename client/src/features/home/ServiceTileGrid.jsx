import { Wrench } from 'lucide-react';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';

// A section's services as a dense grid of square photo tiles with a short label under each, the way quick-commerce apps lay out categories.
export default function ServiceTileGrid({ tiles, onOpen }) {
  return (
    <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-5 lg:grid-cols-6">
      {tiles.map((t) => {
        const Icon = SERVICE_ICONS[t.icon] || Wrench;
        return (
          <button key={t.code} type="button" onClick={() => onOpen(t)} className="group flex min-w-0 flex-col items-center gap-1.5 text-center" aria-label={t.name}>
            <span className={`relative aspect-square w-full overflow-hidden rounded-2xl ${t.imageUrl ? 'bg-sunken' : t.tone ? `bg-gradient-to-br ${t.tone}` : 'bg-[#EEF3FD]'}`}>
              {t.imageUrl ? (
                <img src={t.imageUrl} alt="" loading="lazy" decoding="async" width="160" height="160"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 group-active:scale-95" />
              ) : t.emoji ? (
                <span className="flex h-full w-full items-center justify-center text-4xl" aria-hidden="true">{t.emoji}</span>
              ) : (
                <span className="flex h-full w-full items-center justify-center text-zappy-600"><Icon size={30} strokeWidth={1.8} /></span>
              )}
            </span>
            <span className="line-clamp-2 text-[12px] font-semibold leading-tight text-ink-900 sm:text-[13px]">{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}
