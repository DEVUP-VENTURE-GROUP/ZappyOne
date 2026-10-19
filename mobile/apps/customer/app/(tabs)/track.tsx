import { MapPin } from 'lucide-react-native';
import { SignInGate } from '@zappy/ui/components/account/SignInGate';
import { colors } from '@zappy/ui/theme/colors';
import { TrackPage } from '../../src/features/bookings/TrackPage';

export default function Track() {
  return (
    <SignInGate title="Track your booking live" message="Sign in to follow your pro on the map as they come to you." icon={<MapPin size={28} color={colors.textMuted} />}>
      <TrackPage />
    </SignInGate>
  );
}
