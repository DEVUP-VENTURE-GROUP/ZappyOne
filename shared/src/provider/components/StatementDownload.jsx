import { useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { FileDown, Loader2 } from 'lucide-react';
import { selectAuth } from '../../modules/auth/authSlice';
import { API_BASE } from '../../services/apiBase';
import { fetchOk } from '../../utils/fetchOk';

const lastMonths = (n) => {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i += 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, label: m.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) });
  }
  return out;
};

// A month's statement (earnings, commission, dues paid, payouts) as a CSV for the partner's accounts (server shop/shop-statement).
export default function StatementDownload() {
  const months = lastMonths(12);
  const [month, setMonth] = useState(months[0].key);
  const [busy, setBusy] = useState(false);
  const { accessToken } = useSelector(selectAuth);
  async function download() {
    setBusy(true);
    try {
      const res = await fetchOk(`${API_BASE}/api/shops/me/statement?month=${month}&format=csv`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `zappyone-statement-${month}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { toast.error('Could not download the statement. Try again.'); }
    setBusy(false);
  }
  return (
    <div className="card grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900">Monthly statement</p>
        <p className="text-[12px] text-slate-500">Earnings, fees, dues and payouts, for your accounts and GST.</p>
      </div>
      <div className="flex min-w-0 gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:flex-none" aria-label="Month">
          {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <button type="button" onClick={download} disabled={busy} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-zappy-600 px-3.5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} Download
        </button>
      </div>
    </div>
  );
}
