import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  api, useAdminCreateAdMutation, useAdminUpdateAdMutation, useAdminDeleteAdMutation,
} from '@shared/services/api';
import { HOME_PLACEMENT, KIND_BY_TYPE, byPriority } from '@shared/config/homepageContent';

/**
 * Homepage banners = ads in the `home_banner` placement whose type is one of
 * the three homepage kinds. Everything goes through the existing admin ads
 * API; nothing new is asked of the server.
 *
 * Three behaviours of that API this hook works around, without changing it:
 *   • GET /ads pages at 20 and cannot filter by placement → read every page.
 *   • The placement response is cached for 5 minutes and only a PATCH that
 *     carries `status` clears it (create and delete do not) → publishing is
 *     create-as-draft then PATCH status, and delete pauses first.
 *   • PATCH is a raw $set and dotted keys are stripped by the API's sanitizer
 *     → a house banner's priority is changed by sending its own billing object
 *     back with only `rate` changed. Paid campaigns are never re-billed here.
 */

export const isHouseBanner = (ad) => (ad.billing?.model || 'fixed') === 'fixed'
  && (!ad.advertiser?.kind || ad.advertiser.kind === 'admin');

export const isHomepageBanner = (ad) => (ad.placements || []).includes(HOME_PLACEMENT) && Boolean(KIND_BY_TYPE[ad.type]);

/** Is it on the homepage right now (as far as the record says)? */
export function liveState(ad, now = new Date()) {
  if (ad.status !== 'active') return ad.status;
  const start = ad.schedule?.startAt ? new Date(ad.schedule.startAt) : null;
  const end = ad.schedule?.endAt ? new Date(ad.schedule.endAt) : null;
  if (start && start > now) return 'scheduled';
  if (end && end < now) return 'ended';
  return 'live';
}

const MAX_PAGES = 25;

export function useHomepageBanners() {
  const dispatch = useDispatch();
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createAd] = useAdminCreateAdMutation();
  const [updateAd] = useAdminUpdateAdMutation();
  const [deleteAd] = useAdminDeleteAdMutation();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const req = dispatch(api.endpoints.adminListAds.initiate({ page }, { forceRefetch: true }));
        try {
          const res = await req.unwrap();
          all.push(...(res.ads || []));
          if (page >= (res.totalPages || 1)) break;
        } finally {
          req.unsubscribe();
        }
      }
      setBanners(all.filter(isHomepageBanner).sort(byPriority));
    } catch (e) {
      setError(e?.data?.error || 'Could not load banners');
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => { reload(); }, [reload]);

  /** Create (as draft) or update; `publish` decides the final status. */
  const save = useCallback(async ({ id, body, status }) => {
    let saved;
    if (id) {
      saved = (await updateAd({ id, ...body, status }).unwrap()).ad;
    } else {
      // Created as a draft first: create does not clear the homepage cache,
      // the status PATCH below does — so a published banner appears at once.
      const created = (await createAd({ ...body, status: 'draft' }).unwrap()).ad;
      saved = (await updateAd({ id: created._id, status }).unwrap()).ad;
    }
    await reload();
    return saved;
  }, [createAd, updateAd, reload]);

  const setStatus = useCallback(async (id, status) => {
    await updateAd({ id, status }).unwrap();
    await reload();
  }, [updateAd, reload]);

  const setPriority = useCallback(async (id, rate) => {
    const ad = banners.find((b) => b._id === id);
    // House banners only (the UI never offers this on a paid campaign). The
    // whole billing object goes back with just `rate` changed — the API strips
    // dotted keys such as 'billing.rate'. Status rides along so the homepage
    // cache is cleared with the change.
    if (!ad || !isHouseBanner(ad)) return;
    await updateAd({ id, billing: { ...(ad.billing || {}), model: 'fixed', rate }, status: ad.status || 'draft' }).unwrap();
    await reload();
  }, [banners, updateAd, reload]);

  const remove = useCallback(async (id) => {
    // Pausing clears the homepage cache; delete alone would leave it showing for up to 5 minutes.
    await updateAd({ id, status: 'paused' }).unwrap().catch(() => {});
    await deleteAd(id).unwrap();
    await reload();
  }, [updateAd, deleteAd, reload]);

  return { banners, loading, error, reload, save, setStatus, setPriority, remove };
}
