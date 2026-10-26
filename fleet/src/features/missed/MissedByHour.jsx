import { Card } from '@admin/ui/kit';

const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);

// Orders made per hour of day (IST), with the missed share in red, so the hours that need more staff online stand out.
export default function MissedByHour({ hours }) {
  const top = Math.max(1, ...hours.map((h) => h.made));
  const worst = [...hours].filter((h) => h.missed).sort((a, b) => b.missed - a.missed).slice(0, 3);
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Orders by hour of day</h3>
        <p className="text-[12px] text-slate-500">
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-300" />made <span className="ml-2 mr-1 inline-block h-2 w-2 rounded-sm bg-red-500" />missed
          {worst.length > 0 && <> · most missed: {worst.map((h) => `${hourLabel(h.hour)} (${h.missed})`).join(', ')}</>}
        </p>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] items-end gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {hours.map((h) => (
            <div key={h.hour} className="flex flex-col items-center gap-1" title={`${hourLabel(h.hour)}: ${h.made} made, ${h.missed} missed`}>
              <div className="flex h-24 w-full flex-col justify-end overflow-hidden rounded-sm bg-slate-50">
                <div className="w-full bg-slate-300" style={{ height: `${((h.made - Math.min(h.missed, h.made)) / top) * 100}%` }} />
                <div className="w-full bg-red-500" style={{ height: `${(Math.min(h.missed, h.made) / top) * 100}%` }} />
              </div>
              <span className="text-[10px] tabular-nums text-slate-400">{h.hour % 3 === 0 ? hourLabel(h.hour) : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
