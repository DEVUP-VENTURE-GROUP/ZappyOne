import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Radio } from 'lucide-react';
import { useSendShopLocationMutation, useSetShopLiveMutation, useShopMeQuery } from '@shared/services/api';

const EVERY_MS = 60 * 1000;

// While live and this tab is open, where the owner is each minute, as the app does; never asks for permission again.
function useOwnerHeartbeat(on) {
  const [send] = useSendShopLocationMutation();
  useEffect(() => {
    if (!on || !navigator.geolocation) return undefined;
    let stopped = false;
    const beat = async () => {
      if (stopped || document.hidden) return;
      try {
        const perm = await navigator.permissions?.query({ name: 'geolocation' });
        if (perm && perm.state !== 'granted') return;
      } catch { /* no permissions API: the browser decides */ }
      navigator.geolocation.getCurrentPosition((pos) => {
        if (stopped || pos.coords.accuracy > 200) return;
        send({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, () => {}, { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 });
    };
    const t = setInterval(beat, EVERY_MS);
    const back = () => { if (!document.hidden) beat(); };
    document.addEventListener('visibilitychange', back);
    return () => { stopped = true; clearInterval(t); document.removeEventListener('visibilitychange', back); };
  }, [on, send]);
}

// The shop's Live switch, like a driver's: ON goes live from where the owner is now (their location is asked for), OFF takes no new orders.
export default function LiveSwitch() {
  const { data } = useShopMeQuery();
  const [setLive, { isLoading }] = useSetShopLiveMutation();
  const [locating, setLocating] = useState(false);
  const on = data?.shop ? data.shop.takingOrders !== false : null;
  useOwnerHeartbeat(on === true);
  if (on == null) return null;

  async function toggle() {
    if (on) {
      try { toast.success((await setLive({ on: false }).unwrap()).message); } catch (e) { toast.error(e?.data?.error || 'Could not switch off. Try again.'); }
      return;
    }
    if (!navigator.geolocation) { toast.error('This browser cannot share your location. Use the ServicePro app to go live.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try { toast.success((await setLive({ on: true, lat: pos.coords.latitude, lng: pos.coords.longitude }).unwrap()).message); } catch (e) { toast.error(e?.data?.error || 'Could not go live. Try again.'); } finally { setLocating(false); }
    }, () => { setLocating(false); toast.error('Allow your location to go live: orders come from where you are.'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  const busy = isLoading || locating;
  return (
    <section className={`flex items-center gap-3 rounded-card border p-4 ${on ? 'border-emerald-200 bg-emerald-50' : 'border-line bg-sunken'}`}>
      <Radio size={22} className={on ? 'text-emerald-700' : 'text-ink-400'} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-extrabold text-ink-900">{on ? 'You are live' : 'You are off'}</p>
        <p className="text-[13px] text-ink-600">{on ? 'New orders near you come to you, from where you are.' : 'Go live to get new orders.'}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={on ? 'Go off' : 'Go live'} onClick={toggle} disabled={busy}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? 'bg-emerald-600' : 'bg-ink-300'} disabled:opacity-60`}>
        <span className={`absolute top-1 grid h-6 w-6 place-items-center rounded-full bg-white shadow transition-all ${on ? 'left-7' : 'left-1'}`}>
          {busy && <Loader2 size={13} className="animate-spin text-ink-500" />}
        </span>
      </button>
    </section>
  );
}
