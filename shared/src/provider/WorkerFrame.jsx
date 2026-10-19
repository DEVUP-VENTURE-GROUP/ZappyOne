import { Suspense, createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { WorkerSidebar, NAV_ITEMS } from '../components/worker/DashboardUI';
import { selectAuth, logout } from '../modules/auth/authSlice';
import { useGetWorkerMeQuery, useListNotificationsQuery, useLogoutMutation } from '../services/api';
import { prefetchWorkerPages } from './providerRoutes';

// Pages inside the frame skip drawing their own sidebar; home lends it the real go-online toggle.
const InFrame = createContext(null);
export const useInWorkerFrame = () => !!useContext(InFrame);
export function useFrameGoOnline(toggle) {
  const frame = useContext(InFrame);
  useEffect(() => {
    if (!frame) return undefined;
    frame.goOnline.current = toggle;
    return () => { frame.goOnline.current = null; };
  });
}

function activeKeyFor(pathname) {
  let best = null;
  for (const item of NAV_ITEMS) {
    const hit = pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (hit && (!best || item.to.length > best.to.length)) best = item;
  }
  return best?.key || null;
}

const ContentLoading = () => (
  <div className="flex justify-center py-24">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-zappy-100 border-t-zappy-600" />
  </div>
);

// The worker portal's frame: the sidebar stays put while only the page beside it changes.
export default function WorkerFrame() {
  const nav = useNavigate();
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const { accessToken, role } = useSelector(selectAuth);
  const signedIn = !!accessToken && role === 'worker';
  const { data: meData } = useGetWorkerMeQuery(undefined, { pollingInterval: 60000, skip: !signedIn });
  const isOnline = meData?.worker?.isOnline ?? false;
  const { data: notifData } = useListNotificationsQuery({ page: 1, unreadOnly: true }, { skip: !signedIn, pollingInterval: 60000 });
  const [callLogout] = useLogoutMutation();
  const goOnline = useRef(null);
  const frame = useMemo(() => ({ goOnline }), []);

  useEffect(() => { if (signedIn) prefetchWorkerPages(); }, [signedIn]);

  async function signOut() {
    try { await callLogout().unwrap(); } catch { /* signing out locally either way */ }
    dispatch(logout());
    nav('/worker/login');
  }

  if (!signedIn) return <Suspense fallback={<ContentLoading />}><Outlet /></Suspense>;
  return (
    <InFrame.Provider value={frame}>
      <div className="[--frame-left:0px] lg:[--frame-left:16rem]">
        <WorkerSidebar
          activeKey={activeKeyFor(pathname)}
          unread={notifData?.unread ?? 0}
          onNavigate={(item) => nav(item.to)}
          onGoOnline={() => (goOnline.current ? goOnline.current() : nav('/worker'))}
          isOnline={isOnline}
          onSignOut={signOut}
        />
        <div className="lg:pl-64">
          <Suspense fallback={<ContentLoading />}><Outlet /></Suspense>
        </div>
      </div>
    </InFrame.Provider>
  );
}
