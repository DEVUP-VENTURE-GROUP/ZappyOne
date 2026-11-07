import { useEffect, useState } from 'react';

// The value once typing pauses, so a search box sends one request, not one per key. Websites and apps alike.
export function useDebounced(value, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

export default useDebounced;
