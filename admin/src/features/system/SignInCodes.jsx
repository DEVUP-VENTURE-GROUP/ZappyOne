import { useState } from 'react';
import { RefreshCw, MessageSquare } from 'lucide-react';
import { useAdminOtpAnalyticsQuery } from '@shared/services/api';
import { SectionHeader, Card } from '../../ui/kit';

/**
 * Sign-in codes: how the SMS codes customers and providers sign in with are
 * doing: sent, verified, failed, resent and blocked, per day. Each code costs
 * money, so a rising resend or failure rate is worth a look at the SMS provider.
 */
const OTP_DAY_OPTIONS = [7, 14, 30];

function OtpAnalyticsCard() {
  const [otpDays, setOtpDays] = useState(7);
  const { data: otp, isFetching: otpFetching } = useAdminOtpAnalyticsQuery(otpDays);
  const t = otp?.totals || {};
  const r = otp?.rates  || {};
  const byDay = otp?.byDay || [];

  const rows = [
    { label: 'Sent',      value: t.sent    || 0, color: 'text-blue-600',    bg: 'bg-blue-50' },
    { label: 'Verified',  value: t.verified || 0, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Failed',    value: t.failed   || 0, color: 'text-red-500',     bg: 'bg-red-50' },
    { label: 'Resent',    value: t.resent   || 0, color: 'text-amber-600',   bg: 'bg-amber-50' },
    { label: 'Blocked',   value: t.blocked  || 0, color: 'text-slate-500',   bg: 'bg-slate-100' },
  ];

  const maxBar = Math.max(...byDay.map(d => d.sent || 0), 1);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-zappy-500" />
          <p className="text-sm font-bold text-slate-800">Codes sent and verified</p>
        </div>
        <div className="flex items-center gap-1.5">
          {OTP_DAY_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setOtpDays(opt)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${otpDays === opt ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {opt}d
            </button>
          ))}
          {otpFetching && <RefreshCw size={12} className="animate-spin text-slate-400" />}
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">SMS delivery health - sent / verified / failed per day</p>

      <div className="grid grid-cols-5 gap-2 mb-4">
        {rows.map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-xl p-3 text-center ${bg}`}>
            <p className={`text-lg font-extrabold tabular-nums ${color}`}>{value.toLocaleString('en-IN')}</p>
            <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4 text-xs font-semibold mb-4">
        <span className="text-emerald-600">Success {r.successRate ?? 0}%</span>
        <span className="text-red-500">Failure {r.failureRate ?? 0}%</span>
        <span className="text-amber-600">Resend {r.resendRate ?? 0}%</span>
      </div>

      {byDay.length > 0 && (
        <div className="space-y-1">
          {byDay.map(row => (
            <div key={row.date} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-20 shrink-0">{row.date?.slice(5)}</span>
              <div className="flex-1 flex gap-0.5 h-4">
                <div className="bg-blue-400 rounded-sm" style={{ width: `${((row.sent || 0) / maxBar) * 100}%` }} title={`Sent: ${row.sent}`} />
                <div className="bg-emerald-400 rounded-sm" style={{ width: `${((row.verified || 0) / maxBar) * 100}%` }} title={`Verified: ${row.verified}`} />
                <div className="bg-red-400 rounded-sm" style={{ width: `${((row.failed || 0) / maxBar) * 100}%` }} title={`Failed: ${row.failed}`} />
              </div>
              <span className="text-[10px] text-slate-400 w-6 text-right">{row.sent || 0}</span>
            </div>
          ))}
          <div className="flex gap-3 mt-2 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400 inline-block" />Sent</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />Verified</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" />Failed</span>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function SignInCodes() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Sign-in codes" subtitle="SMS codes sent for sign-in, and how many worked" />
      <OtpAnalyticsCard />
    </div>
  );
}
