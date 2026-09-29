import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCircle2 } from 'lucide-react';
import { useGetNotificationPrefsQuery, useUpdateNotificationPrefsMutation } from '@shared/services/api';

const PREF_ITEMS = [
  { key: 'orderUpdates',  label: 'Order Updates',      desc: 'Status changes, worker assignment, arrival' },
  { key: 'workerArrival', label: 'Worker Arrival',      desc: 'Alert when your worker is nearby' },
  { key: 'payments',      label: 'Payments',            desc: 'Refunds, wallet credit, invoices' },
  { key: 'disputes',      label: 'Disputes & Support',  desc: 'Replies to your tickets and disputes' },
  { key: 'promotions',    label: 'Promotions',          desc: 'New promo codes and seasonal offers' },
  { key: 'marketing',     label: 'Marketing',           desc: 'Tips, new services, feature updates' },
];

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${checked ? 'bg-zappy-600' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function NotificationPrefsPage() {
  const nav = useNavigate();
  const { data, isLoading } = useGetNotificationPrefsQuery();
  const [updatePrefs, { isLoading: isSaving }] = useUpdateNotificationPrefsMutation();
  const [prefs, setPrefs] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.prefs) setPrefs(data.prefs);
  }, [data]);

  async function toggle(key) {
    const newVal = !prefs[key];
    const newPrefs = { ...prefs, [key]: newVal };
    setPrefs(newPrefs);
    try {
      await updatePrefs({ [key]: newVal }).unwrap();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setPrefs(prefs);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => nav(-1)} className="p-1.5 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-semibold text-slate-800">Notification Preferences</h1>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </header>

      {isLoading || !prefs ? (
        <div className="flex items-center justify-center h-60">
          <div className="w-7 h-7 rounded-full border-2 border-zappy-200 border-t-zappy-600 animate-spin" />
        </div>
      ) : (
        <div className="p-4">
          <div className="bg-white rounded-xl shadow-sm divide-y divide-slate-100">
            {PREF_ITEMS.map(item => (
              <div key={item.key} className="flex items-center gap-4 px-4 py-3.5">
                <Bell className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                </div>
                <Toggle checked={!!prefs[item.key]} onChange={() => toggle(item.key)} />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 text-center mt-4">
            Changes are saved instantly
          </p>
        </div>
      )}
    </div>
  );
}
