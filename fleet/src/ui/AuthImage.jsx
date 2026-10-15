import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Loader2 } from 'lucide-react';
import { API_BASE } from '@shared/services/apiBase';
import { adminApiPath } from '@shared/config/admin';

/**
 * A private image from the admin API (an image an <img> cannot fetch on its
 * own, because the call needs the admin's token): fetched with it, shown from
 * memory, released when gone. `path` is under the admin API, e.g.
 * '/workforce/shifts/<id>/selfie'.
 */
export default function AuthImage({ path, alt = '', className = '' }) {
  const token = useSelector((s) => s.auth.accessToken);
  const [url, setUrl] = useState(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let gone = false; let made = null;
    fetch(`${API_BASE}/api${adminApiPath(path)}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-client-type': import.meta.env.VITE_CLIENT_SURFACE || 'admin' },
    })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => { if (gone) return; made = URL.createObjectURL(b); setUrl(made); setState('ok'); })
      .catch(() => !gone && setState('error'));
    return () => { gone = true; if (made) URL.revokeObjectURL(made); };
  }, [path, token]);
  if (state === 'loading') return <div className={`flex items-center justify-center bg-slate-100 ${className}`}><Loader2 size={18} className="animate-spin text-slate-400" /></div>;
  if (state === 'error') return <div className={`flex items-center justify-center bg-slate-100 text-[12px] text-slate-400 ${className}`}>Could not load</div>;
  return <img src={url} alt={alt} className={`object-cover ${className}`} />;
}
