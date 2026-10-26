import { useEffect, useRef } from 'react';

// While nobody can take the job the list is asked again every 20 s; the moment someone can, the customer is told once.
export const WAIT_POLL_MS = 20000;

export function useProsArrive(providers, loaded, setPollMs, onArrive) {
  const count = providers?.length || 0;
  const was = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    if (was.current === 0 && count > 0) onArrive(count);
    was.current = count;
    setPollMs(count === 0 ? WAIT_POLL_MS : 0);
  }, [count, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
}
