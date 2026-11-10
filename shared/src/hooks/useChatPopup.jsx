import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSocketEvent } from './useSocket';

// A new chat message pops up wherever the person is on the website (the apps' useChatPopup), unless they wrote it or already have that job open.
export default function useChatPopup({ linkFor }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  useSocketEvent('chat.message', (p) => {
    if (!p || p.mine) return;
    const link = linkFor(p.kind, p.jobId);
    if (link && pathname === link) return;
    try { navigator.vibrate?.([0, 120, 80, 120]); } catch { /* not on this device */ }
    toast((t) => (
      <span className="flex items-center gap-3">
        <span className="min-w-0"><b className="block text-[13px]">New message</b><span className="line-clamp-2 text-[13px] text-slate-600">{String(p.text || '').slice(0, 90)}</span></span>
        {link && <button type="button" onClick={() => { toast.dismiss(t.id); nav(link); }} className="shrink-0 rounded-lg bg-zappy-600 px-3 py-1.5 text-[12.5px] font-bold text-white">Open</button>}
      </span>
    ), { id: `chat-${p.jobId}`, duration: 7000 });
  });
}
