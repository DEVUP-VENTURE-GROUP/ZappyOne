import { useEffect } from 'react';
import { useCurrentSeasonQuery } from '@shared/services/api';

// The festival look, drawn at once from the last one this browser saw (until it ends), so a refresh never shows the plain home first and then switches.
const KEY = 'zo_season_v1';

function remembered() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && (!s.endAt || new Date(s.endAt) > new Date()) ? s : null;
  } catch { return null; }
}

/** { season, loading }: the server's answer once it is in; until then the remembered one, so nothing waits on it. */
export default function useSeason() {
  const { data, isLoading } = useCurrentSeasonQuery();
  const fresh = data ? data.season || null : undefined;
  useEffect(() => {
    if (fresh === undefined) return;
    try { if (fresh) localStorage.setItem(KEY, JSON.stringify(fresh)); else localStorage.removeItem(KEY); } catch { /* storage off: just no head start */ }
  }, [fresh]);
  const early = fresh === undefined ? remembered() : null;
  return { season: fresh !== undefined ? fresh : early, loading: isLoading && !early };
}
