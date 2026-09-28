import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';

/**
 * `role` accepts a string or an array. Some screens legitimately serve more
 * than one actor — provider onboarding is walked by a shop owner and an
 * independent technician alike — and duplicating the page per role is how the
 * two copies drift apart.
 */
export function RequireAuth({ role, children }) {
  const { accessToken, role: currentRole } = useSelector(selectAuth);
  const loc = useLocation();

  const allowed = role == null ? null : (Array.isArray(role) ? role : [role]);
  // Where to send someone who is not signed in at all: the first role listed.
  const primary = allowed?.[0];

  if (!accessToken) {
    const loginPath = primary === 'worker' ? '/worker/login'
      : primary === 'event_partner' ? '/partner/login'
      : primary === 'shop' ? '/shop/login'
      : '/login';
    return <Navigate to={loginPath} state={{ from: loc.pathname }} replace />;
  }
  if (allowed && !allowed.includes(currentRole)) {
    const home = currentRole === 'worker' ? '/worker'
      : currentRole === 'event_partner' ? '/partner'
      : currentRole === 'shop' ? '/shop'
      : '/';
    return <Navigate to={home} replace />;
  }
  return children;
}
