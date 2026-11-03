import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// A link with ?focus=<key> lands on the field marked data-field="<key>": scrolled into view, focused and briefly highlighted.
export function useFocusField(ready = true) {
  const [params] = useSearchParams();
  const key = params.get('focus');
  useEffect(() => {
    if (!ready || !key) return undefined;
    let timer;
    const frame = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-field="${CSS.escape(key)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.querySelector('input:not([type=hidden]),textarea,select')?.focus({ preventScroll: true });
      el.classList.add('field-flash');
      timer = setTimeout(() => el.classList.remove('field-flash'), 1800);
    });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [ready, key]);
}
