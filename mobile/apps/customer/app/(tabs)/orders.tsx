import { ClipboardList } from 'lucide-react-native';
import { SignInGate } from '@zappy/ui/components/account/SignInGate';
import { colors } from '@zappy/ui/theme/colors';
import { OrdersListPage } from '../../src/features/bookings/OrdersListPage';

export default function Orders() {
  return (
    <SignInGate title="Your bookings live here" message="Sign in to see your bookings and book again in a tap." icon={<ClipboardList size={28} color={colors.textMuted} />}>
      <OrdersListPage />
    </SignInGate>
  );
}
