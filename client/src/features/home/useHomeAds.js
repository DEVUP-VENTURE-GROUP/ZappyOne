import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  useGetAdsByPlacementQuery, useTrackAdImpressionMutation, useTrackAdClickMutation,
} from '@shared/services/api';
import { selectIsAuthed } from '@shared/modules/auth/authSlice';
import { HOME_PLACEMENT, PLACEMENT_LIMIT, splitHomeAds } from '@shared/config/homepageContent';

/**
 * Admin-managed homepage banners, from the existing public placement endpoint
 * (works signed out). One request feeds the hero, campaign and offer sections;
 * see shared/config/homepageContent.js for how they are told apart.
 *
 * Impressions and clicks are recorded only when signed in — those endpoints
 * require auth, and a guest's view is still served the banner.
 */
const seen = new Set(); // once per session per banner

export function useHomeAds() {
  const nav = useNavigate();
  const isAuthed = useSelector(selectIsAuthed);
  const { data, isLoading, refetch } = useGetAdsByPlacementQuery({ placement: HOME_PLACEMENT, limit: PLACEMENT_LIMIT });
  const [impression] = useTrackAdImpressionMutation();
  const [click] = useTrackAdClickMutation();

  const sections = useMemo(() => splitHomeAds(data?.ads || []), [data]);

  useEffect(() => {
    if (!isAuthed) return;
    for (const ad of data?.ads || []) {
      const id = String(ad._id);
      if (seen.has(id)) continue;
      seen.add(id);
      impression({ id, placement: HOME_PLACEMENT }).catch(() => {});
    }
  }, [data, isAuthed, impression]);

  const open = useCallback((ad) => {
    const link = ad?.content?.ctaLink;
    if (!link) return;
    if (isAuthed) click({ id: String(ad._id), placement: HOME_PLACEMENT }).catch(() => {});
    if (link.startsWith('/')) nav(link);
    else if (/^https:\/\//i.test(link)) window.open(link, '_blank', 'noopener,noreferrer');
  }, [isAuthed, click, nav]);

  // Uploaded images are served as signed links that last 6 hours. If one fails
  // to load (a long-open tab), fetch fresh links — at most once a minute.
  const lastRefresh = useRef(0);
  const onImageError = useCallback(() => {
    if (Date.now() - lastRefresh.current < 60000) return;
    lastRefresh.current = Date.now();
    refetch();
  }, [refetch]);

  return { ...sections, isLoading, open, onImageError };
}
