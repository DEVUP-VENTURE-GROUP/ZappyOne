import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { API_BASE } from '@shared/services/apiBase';

/**
 * Tell ZappyOne about an emergency on any job (server: POST /api/jobs/:id/sos).
 * JobTrackingPage dials 112 first; this is the second call, and it throws if
 * ZappyOne could not be reached so the page never claims it was told.
 */
export function useJobSOS(jobId) {
  const { accessToken: token } = useSelector(selectAuth);
  return async () => {
    let coords = {};
    try {
      coords = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve({});
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve({}),
          { timeout: 4000, maximumAge: 60000 },
        );
      });
    } catch { /* send without a position */ }
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}/sos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(coords),
    });
    if (!res.ok) throw new Error(String(res.status));
  };
}
