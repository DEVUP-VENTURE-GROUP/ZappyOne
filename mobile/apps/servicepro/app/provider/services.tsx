import { Redirect } from 'expo-router';
import { useAppSelector } from '@zappy/core/store/hooks';
import { ProviderRepairSetupPage } from '@zappy/ui/provider/pages/ProviderRepairSetupPage';

// An owner's Work & prices lives on their bottom bar (shop/work), so old links land there; a technician opens it here.
export default function Services() {
  const role = useAppSelector((s) => s.auth.role);
  return role === 'shop' ? <Redirect href="/shop/work" /> : <ProviderRepairSetupPage />;
}
