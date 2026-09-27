import { Zap, Clock, Briefcase } from 'lucide-react';
import { Card } from '../../_shared';

export function computeHealth(d, ops) {
  if (!d.totalOrders) return null;
  const completion = (d.completionRate || 0) * 0.35;
  const cancel     = Math.max(0, 100 - (d.cancelRate || 0) * 3) * 0.25;
  const growth     = d.changes?.revenue > 0 ? Math.min(d.changes.revenue, 50) * 0.2 : (d.changes?.revenue == null ? 10 : 0);
  const dispatch   = ops?.avgDispatchMin != null ? Math.max(0, 100 - ops.avgDispatchMin * 4) * 0.2 : 8;
  return Math.min(100, Math.round(completion + cancel + growth + dispatch));
}

export function gradeOf(score) {
  if (score == null) return { grade: '—', label: 'No data', ring: 'text-slate-300', bg: 'bg-slate-50', border: 'border-slate-200' };
  if (score >= 80) return { grade: 'A', label: 'Excellent', ring: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' };
  if (score >= 65) return { grade: 'B', label: 'Good',      ring: 'text-blue-500',    bg: 'bg-blue-50',    border: 'border-blue-200'    };
  if (score >= 50) return { grade: 'C', label: 'Average',   ring: 'text-amber-500',   bg: 'bg-amber-50',   border: 'border-amber-200'   };
  if (score >= 35) return { grade: 'D', label: 'Needs work',ring: 'text-orange-500',  bg: 'bg-orange-50',  border: 'border-orange-200'  };
  return                  { grade: 'F', label: 'Critical',  ring: 'text-red-500',     bg: 'bg-red-50',     border: 'border-red-200'     };
}

export default function HealthCard({ score, d, ops }) {
  const g = gradeOf(score);
  const factors = [
    { label: 'Completion',  val: d.completionRate || 0, unit: '%',  good: v => v >= 75 },
    { label: 'Cancel Rate', val: d.cancelRate || 0,     unit: '%',  good: v => v <= 15, invert: true },
    { label: 'Dispatch',    val: ops?.avgDispatchMin,   unit: 'min',good: v => v < 10  },
    { label: 'Rev Growth',  val: d.changes?.revenue,    unit: '%',  good: v => v > 0   },
  ];
  return (
    <Card className={`p-5 border-2 ${g.border} ${g.bg}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Platform Health</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Composite score this period</p>
        </div>
        <div className="text-right">
          <p className={`text-4xl font-black tabular-nums ${g.ring}`}>{g.grade}</p>
          <p className={`text-[11px] font-bold ${g.ring}`}>{g.label}</p>
        </div>
      </div>
      {score != null && (
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>Score</span><span className="font-bold text-slate-600">{score}/100</span>
          </div>
          <div className="bg-white/60 rounded-full h-2 overflow-hidden">
            <div className={`h-2 rounded-full transition-all ${score >= 65 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${score}%` }} />
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        {factors.map(({ label, val, unit, good }) => {
          const isNull = val == null;
          const isGood = isNull ? null : good(val);
          return (
            <div key={label} className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-medium">{label}</span>
              <span className={`font-bold tabular-nums ${isNull ? 'text-slate-400' : isGood ? 'text-emerald-600' : 'text-red-500'}`}>
                {isNull ? '—' : `${val}${unit}`}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
