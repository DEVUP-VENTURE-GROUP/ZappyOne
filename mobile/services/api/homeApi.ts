/**
 * Home-screen content, from endpoints the website already uses.
 * ----------------------------------------------------------------------------
 *   GET /ads/placement/home_banner   PUBLIC — admin-managed homepage banners
 *                                    (Homepage → Banners in the admin console).
 *                                    One response feeds three sections, told
 *                                    apart by `type` — the same mapping as
 *                                    `shared/src/config/homepageContent.js`.
 *   GET /promos/available            AUTH — promo codes this customer can use.
 *
 * Nothing new is asked of the server; these are read-only definitions of
 * existing contracts.
 * ----------------------------------------------------------------------------
 */

import { apiSlice } from './apiSlice';

export interface HomeBanner {
  _id: string;
  type: 'banner' | 'home_card' | 'offer_card' | string;
  title?: string;
  createdAt?: string;
  billing?: { rate?: number };
  content: {
    headline: string;
    body?: string;
    imageUrl?: string;
    ctaText?: string;
    ctaLink?: string;
    badgeText?: string;
    backgroundColor?: string;
    textColor?: string;
  };
}

export interface HomeBannerSections {
  hero: HomeBanner[];
  campaign: HomeBanner[];
  offer: HomeBanner[];
}

export interface AvailablePromo {
  code: string;
  name: string;
  type: 'percent' | 'flat' | string;
  discountValue: number;
  maxDiscountPaise?: number;
  minOrderPaise?: number;
  alreadyUsed?: boolean;
  validity?: { endAt?: string };
}

const KIND_BY_TYPE: Record<string, keyof HomeBannerSections> = {
  banner: 'hero',
  home_card: 'campaign',
  offer_card: 'offer',
};

/** Higher priority (`billing.rate`) first; ties newest first. */
const byPriority = (a: HomeBanner, b: HomeBanner) =>
  (b.billing?.rate ?? 0) - (a.billing?.rate ?? 0)
  || new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();

export function splitHomeBanners(ads: HomeBanner[]): HomeBannerSections {
  const out: HomeBannerSections = { hero: [], campaign: [], offer: [] };
  for (const ad of ads) {
    const kind = KIND_BY_TYPE[ad.type];
    if (kind && ad.content?.headline) out[kind].push(ad);
  }
  out.hero.sort(byPriority);
  out.campaign.sort(byPriority);
  out.offer.sort(byPriority);
  return out;
}

export const homeApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getHomeBanners: builder.query<HomeBannerSections, void>({
      // The endpoint caps `limit` at 10.
      query: () => ({ url: '/ads/placement/home_banner', params: { limit: 10 } }),
      transformResponse: (r: { ads?: HomeBanner[] }) => splitHomeBanners(r?.ads ?? []),
    }),
    getAvailablePromos: builder.query<AvailablePromo[], void>({
      query: () => ({ url: '/promos/available' }),
      transformResponse: (r: { promos?: AvailablePromo[] }) =>
        (r?.promos ?? []).filter((p) => !p.alreadyUsed),
    }),
    trackBannerImpression: builder.mutation<unknown, string>({
      query: (id) => ({ url: `/ads/${id}/impression`, method: 'POST', data: { placement: 'home_banner' } }),
    }),
    trackBannerClick: builder.mutation<unknown, string>({
      query: (id) => ({ url: `/ads/${id}/click`, method: 'POST', data: { placement: 'home_banner' } }),
    }),
  }),
});

export const {
  useGetHomeBannersQuery,
  useGetAvailablePromosQuery,
  useTrackBannerImpressionMutation,
  useTrackBannerClickMutation,
} = homeApi;
