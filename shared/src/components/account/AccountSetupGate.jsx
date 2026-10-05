import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { selectAuth, logout, updateProfile } from '../../modules/auth/authSlice';
import { useAccountMeQuery, useLogoutMutation } from '../../services/api';
import AccountSetup from './AccountSetup';
import WhatsNew, { RELEASE } from './WhatsNew';

/**
 * Until an account has what it needs (name, password, email where required),
 * the app shows setup instead of its pages. Applies to new sign-ups and to
 * older accounts that never set a password, once. Then, once each: a photo
 * prompt for accounts that never had one, and "What's new" after an update
 * for anyone who used the app before it. Email and password-reset links
 * always open, so a link from an email is never blocked by setup.
 *
 *   roles    which signed-in roles this app gates (others pass through)
 */
const OPEN_PATHS = ['/verify-email', '/reset-password'];

export default function AccountSetupGate({ roles, appName, intro, children }) {
  const dispatch = useDispatch();
  const { accessToken, role, profile } = useSelector(selectAuth);
  const { pathname } = useLocation();
  const [doLogout] = useLogoutMutation();
  const applies = !!accessToken && roles.includes(role) && !OPEN_PATHS.some((p) => pathname.startsWith(p));
  const { data } = useAccountMeQuery(undefined, { skip: !applies });

  // The photo shown in headers and menus follows the account, on every app.
  useEffect(() => {
    if (data && (data.photoUrl || null) !== (profile?.avatar || null)) dispatch(updateProfile({ avatar: data.photoUrl || null }));
  }, [data?.photoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    try { await doLogout().unwrap(); } catch { /* signed out locally either way */ }
    dispatch(logout());
  }

  if (applies && (data?.needsSetup || data?.askPhoto)) {
    return <AccountSetup appName={appName} intro={intro} onSignOut={signOut} />;
  }
  // Only for people who used the app before this update; new accounts start on it.
  const before = !data?.joinedAt || new Date(data.joinedAt) < new Date(RELEASE.since);
  const showNews = applies && data && before && data.lastSeenRelease !== RELEASE.id;
  return (
    <>
      {children}
      {showNews && <WhatsNew role={data.role} appName={appName} />}
    </>
  );
}
