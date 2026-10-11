/** The signed-in event partner, and whether they are verified (packages, bookings and earnings open then). */
import { usePartnerMeQuery } from '@zappy/core/api';

export interface Partner {
  _id: string; businessName?: string; ownerName?: string; phone?: string; email?: string; bio?: string;
  yearsExperience?: number; cities?: string[]; serviceRadiusKm?: number; rating?: number; reviewCount?: number;
  completedEvents?: number; profilePhotoUrl?: string;
  kyc?: { status?: string; reviewNote?: string; panNumber?: string; gstNumber?: string; clarification?: { active?: boolean; message?: string; docCodes?: string[] } } & Record<string, unknown>;
}

export function usePartner() {
  const { data, isLoading, isError, refetch } = usePartnerMeQuery(undefined);
  const partner: Partner | undefined = data?.partner;
  return { partner, verified: partner?.kyc?.status === 'approved', isLoading, isError, refetch };
}
