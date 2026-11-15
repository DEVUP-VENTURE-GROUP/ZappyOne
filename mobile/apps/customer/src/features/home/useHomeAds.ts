// Admin homepage banners from the public home_banner placement (the website's useHomeAds): one request feeds hero, campaign and offer.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useGetAdsByPlacementQuery, useTrackAdClickMutation, useTrackAdImpressionMutation } from '@zappy/core/api';
import { HOME_PLACEMENT, PLACEMENT_LIMIT, splitHomeAds } from '@zappy/core/shared/homepageContent';
import { useAppSelector } from '@zappy/core/store/hooks';
import { openLink } from '@zappy/ui/lib/openLink';
import type { HomeAd } from './PromoBanner';

// A view is counted once per banner per app session; impressions and clicks need a signed-in customer.
const seen = new Set<string>();

export function useHomeAds() {
  const router = useRouter();
  const isAuthed = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const { data, isLoading, refetch } = useGetAdsByPlacementQuery({ placement: HOME_PLACEMENT, limit: PLACEMENT_LIMIT });
  const [impression] = useTrackAdImpressionMutation();
  const [click] = useTrackAdClickMutation();
  const ads: HomeAd[] = useMemo(() => data?.ads || [], [data]);
  const sections = useMemo(() => splitHomeAds(ads) as { hero: HomeAd[]; campaign: HomeAd[]; offer: HomeAd[] }, [ads]);

  useEffect(() => {
    if (!isAuthed) return;
    for (const ad of ads) {
      const id = String(ad._id);
      if (seen.has(id)) continue;
      seen.add(id);
      impression({ id, placement: HOME_PLACEMENT }).unwrap().catch(() => {});
    }
  }, [ads, isAuthed, impression]);

  const open = useCallback((ad: HomeAd) => {
    const link = ad.content?.ctaLink;
    if (!link) return;
    if (isAuthed) click({ id: String(ad._id), placement: HOME_PLACEMENT }).unwrap().catch(() => {});
    if (link.startsWith('/')) router.push(link as never);
    else if (/^https:\/\//i.test(link)) openLink(link);
  }, [isAuthed, click, router]);

  // Signed image links last 6 hours; one that fails to load fetches fresh links, at most once a minute.
  const lastRefresh = useRef(0);
  const onImageError = useCallback(() => {
    if (Date.now() - lastRefresh.current < 60000) return;
    lastRefresh.current = Date.now();
    refetch();
  }, [refetch]);

  return { ...sections, isLoading, open, onImageError };
}
