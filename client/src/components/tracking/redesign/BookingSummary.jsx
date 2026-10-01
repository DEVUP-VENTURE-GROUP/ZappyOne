import { motion } from 'framer-motion';
import { Zap, MapPin, Clock, Wallet, FileText } from 'lucide-react';
import { fadeInUp } from '../../../lib/animations';
import { rupeesOf } from './_shared';

/**
 * Booking summary — service, address, when, payment, itemised lines, total,
 * and the receipt. Reads only `job.price` from the kind's adapter: only lines
 * the server recorded, never a computed guess.
 */
export default function BookingSummary({ job, onReceipt }) {
  const price = job.price || {};
  const when = job.scheduledAt || job.createdAt;
  const whenLabel = when
    ? new Date(when).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '—';
  const lines = (price.lines || []).filter(([, paise]) => paise > 0);

  return (
    <motion.div
      variants={fadeInUp}
      className="rounded-[24px] bg-white p-[18px]"
      style={{ boxShadow: '0 12px 34px -12px rgba(15,23,42,.18)', border: '1px solid rgba(255,255,255,.9)' }}
    >
      <h3 className="text-[16px] font-extrabold tracking-[-.02em] text-[#0B1220] mb-2">Booking summary</h3>

      <SummaryRow
        icon={<Zap size={17} fill="currentColor" strokeWidth={0} />}
        k="Service"
        v={<span className="capitalize">{job.service}</span>}
        right={job.subtitle ? { k: job.subtitleLabel || 'For', v: job.subtitle } : null}
      />
      <SummaryRow icon={<MapPin size={17} strokeWidth={2} />} k="Address" v={job.place?.address || '—'} />
      <SummaryRow
        icon={<Clock size={17} strokeWidth={2} />}
        k={job.scheduledAt ? 'Scheduled' : 'Booked'}
        v={whenLabel}
        right={price.method ? {
          node: (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0B1220] px-2.5 py-1.5 rounded-[10px]" style={{ background: '#F1F5FB' }}>
              <Wallet size={14} className="text-[#2563FF]" /> {price.method}
            </span>
          ),
        } : null}
      />

      {(lines.length > 0 || price.totalPaise != null) && (
        <div className="mt-1.5 pt-3.5" style={{ borderTop: '1.5px dashed #EAEEF6' }}>
          {lines.map(([label, paise]) => (
            <div key={label} className="flex justify-between items-baseline text-[12.5px] text-[#647084] py-[3px]">
              <span>{label}</span>
              <span className="font-bold text-[#334155] tabular-nums">{rupeesOf(paise)}</span>
            </div>
          ))}
          {price.totalPaise != null && (
            <div className="flex justify-between items-center mt-2 pt-3" style={{ borderTop: '1px solid #EAEEF6' }}>
              <span className="text-[13px] font-bold text-[#0B1220]">
                {price.isEstimate ? 'Estimated total' : `Total ${price.paid ? 'paid' : 'payable'}`}
              </span>
              <span className="text-[22px] font-extrabold tracking-[-.03em] text-[#0B1220] tabular-nums">{rupeesOf(price.totalPaise)}</span>
            </div>
          )}
          {price.note && <p className="mt-2 text-[11.5px] leading-relaxed text-[#647084]">{price.note}</p>}
        </div>
      )}

      {onReceipt && (
        <button
          onClick={onReceipt}
          className="mt-3.5 w-full h-[46px] rounded-[15px] flex items-center justify-center gap-2 text-[13.5px] font-bold text-[#334155] transition active:scale-[.98]"
          style={{ border: '1.5px solid #EAEEF6', background: '#fff' }}
        >
          <FileText size={16} className="text-[#2563FF]" /> Download receipt
        </button>
      )}
    </motion.div>
  );
}

function SummaryRow({ icon, k, v, right }) {
  return (
    <div className="flex items-center gap-3.5 py-3" style={{ borderBottom: '1px solid #EAEEF6' }}>
      <span className="w-[38px] h-[38px] rounded-xl flex items-center justify-center shrink-0 text-[#647084]" style={{ background: '#F1F5FB' }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-[#647084] tracking-[.02em]">{k}</div>
        <div className="text-[14px] font-bold text-[#0B1220] mt-0.5 tracking-[-.01em] truncate">{v}</div>
      </div>
      {right && (
        <div className="ml-auto text-right shrink-0 max-w-[45%]">
          {right.node ? right.node : (
            <>
              <div className="text-[11px] font-semibold text-[#647084]">{right.k}</div>
              <div className="text-[14px] font-bold text-[#0B1220] mt-0.5 truncate capitalize">{right.v}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
