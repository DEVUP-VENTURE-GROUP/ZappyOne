/** The one shape every kind of job takes on the tracking page (core/shared/jobKinds KINDS[kind].toJob). */
export interface TrackedJob {
  kind: 'repair' | 'pet' | 'helping' | 'order'; id: string; reference?: string; noun: string;
  service: string; subtitle?: string; subtitleLabel?: string;
  status: string; statusLabel?: string; rawStatus?: string; terminal: boolean;
  provider: { name?: string; phone?: string; rating?: number | null; jobs?: number; from?: string | null } | null;
  place: { lat?: number; lng?: number; address: string };
  scheduledAt?: string; createdAt?: string;
  history: { stage: string; at: string }[];
  price: { lines: [string, number][]; totalPaise: number | null; method: string | null; paid: boolean; isEstimate?: boolean; note?: string };
  proofs: string[];
  trip: { to?: { lat: number; lng: number }; toCustomer?: boolean } | null;
}
