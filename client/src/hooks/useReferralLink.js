import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useApplyReferralMutation } from '@shared/services/api';

const KEY = 'zappy:ref';

// A friend's link (?ref=CODE) is kept until they sign in as a customer, then applied once (server referral rules decide).
export function useReferralLink({ token, role }) {
  const { search } = useLocation();
  const [apply] = useApplyReferralMutation();

  useEffect(() => {
    const ref = new URLSearchParams(search).get('ref');
    if (ref && /^[A-Za-z0-9_-]{4,20}$/.test(ref)) {
      try { localStorage.setItem(KEY, ref.toUpperCase()); } catch { /* storage blocked: the link still opened */ }
    }
  }, [search]);

  useEffect(() => {
    if (!token || role !== 'user') return;
    let code = null;
    try { code = localStorage.getItem(KEY); } catch { return; }
    if (!code) return;
    apply(code).unwrap()
      .then(() => toast.success('Your friend\'s referral is applied'))
      .catch(() => { /* not new, own code or used up: nothing to retry */ })
      .finally(() => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } });
  }, [token, role, apply]);
}
