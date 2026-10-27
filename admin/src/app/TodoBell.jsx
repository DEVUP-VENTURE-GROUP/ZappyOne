import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, ChevronRight } from 'lucide-react';
import { useAdminTodoQuery } from '@shared/services/api';

// What is waiting on someone (server admin/todo.service), checked every 30 seconds; new work pops a toast and, when allowed, a browser notification.
export default function TodoBell({ onOpen }) {
  const { data } = useAdminTodoQuery(undefined, { pollingInterval: 30000 });
  const [open, setOpen] = useState(false);
  const last = useRef(null);
  const items = data?.items || [];
  const total = data?.total || 0;

  useEffect(() => {
    if (data == null) return;
    if (last.current != null && total > last.current) {
      const msg = `${total - last.current} new item${total - last.current === 1 ? '' : 's'} waiting for you`;
      toast(msg);
      try { if (window.Notification?.permission === 'granted') new window.Notification('ZappyOne admin', { body: msg }); } catch { /* notifications are a bonus */ }
    }
    last.current = total;
  }, [data, total]);

  function toggle() {
    setOpen((v) => !v);
    try { if (window.Notification?.permission === 'default') window.Notification.requestPermission(); } catch { /* not supported */ }
  }

  return (
    <div className="px-4 pt-2.5">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left"
        style={{ background: total ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.04)', border: `1px solid ${total ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.06)'}` }}>
        <Bell size={13} className={total ? 'text-indigo-300' : 'text-slate-500'} />
        <span className={`flex-1 text-[11.5px] font-semibold ${total ? 'text-indigo-100' : 'text-slate-500'}`}>{total ? 'To do' : 'Nothing waiting'}</span>
        {total > 0 && <span className="rounded-full bg-indigo-500 px-1.5 text-[10.5px] font-black text-white">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && items.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 rounded-lg p-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {items.map((it) => (
            <li key={it.key}>
              <button type="button" onClick={() => { setOpen(false); onOpen(it.tab); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] text-slate-300 hover:bg-white/5">
                <span className="min-w-[22px] rounded bg-white/10 px-1 text-center text-[10.5px] font-bold text-white">{it.count}</span>
                <span className="flex-1">{it.label}</span>
                <ChevronRight size={12} className="text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
