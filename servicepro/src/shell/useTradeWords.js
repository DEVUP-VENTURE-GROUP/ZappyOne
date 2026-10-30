import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useProviderWorkspaceQuery } from '@shared/services/api';

// What this partner's trade calls a page (Appointments, Jobs, Stylists…), from the same workspace the menu uses; the given word when the trade has none.
export function useTradeWords() {
  const { accessToken, role } = useSelector(selectAuth);
  const { data } = useProviderWorkspaceQuery(undefined, { skip: !accessToken || !['shop', 'worker'].includes(role) });
  return (key, fallback) => data?.labels?.[key] || fallback;
}
