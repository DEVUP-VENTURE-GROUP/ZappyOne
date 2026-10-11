/** One booking of any kind, as useMyJobs (core/shared) gives it to every screen. */
export interface MyJob {
  kind: string; id: string; title: string; titleKey: string; stage: string; statusKey: string;
  active: boolean; needsYou: boolean; outcome: 'completed' | 'cancelled' | 'failed' | null;
  totalPaise: number | null; rating: number | null; address: string; iconCode: string;
  rebookHref: string | null; createdAt: string; href: string; canInvoice?: boolean;
}
