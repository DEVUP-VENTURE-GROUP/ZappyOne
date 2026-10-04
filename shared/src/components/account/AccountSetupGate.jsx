import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { selectAuth, logout } from '../../modules/auth/authSlice';
import { useAccountMeQuery, useLogoutMutation } from '../../services/api';
import AccountSetup from './AccountSetup';

/**
 * Until an account has what it needs (name, password, email where required),
 * the app shows setup instead of its pages. Applies to new sign-ups and to
 * older accounts that never set a password, once. Email and password-reset
 * links always open, so a link from an email is never blocked by setup.
 *
 *   roles    which signed-in roles this app gates (others pass through)
 */
const OPEN_PATHS = ['/verify-email', '/reset-password'];

export default function AccountSetupGate({ roles, appName, intro, children }) {
  const dispatch = useDispatch();
  const { accessToken, role } = useSelector(selectAuth);
  const { pathname } = useLocation();
  const [doLogout] = useLogoutMutation();
  const applies = !!accessToken && roles.includes(role) && !OPEN_PATHS.some((p) => pathname.startsWith(p));
  const { data } = useAccountMeQuery(undefined, { skip: !applies });

  async function signOut() {
    try { await doLogout().unwrap(); } catch { /* signed out locally either way */ }
    dispatch(logout());
  }

  if (applies && data?.needsSetup) {
    return <AccountSetup appName={appName} intro={intro} onSignOut={signOut} />;
  }
  return children;
}
