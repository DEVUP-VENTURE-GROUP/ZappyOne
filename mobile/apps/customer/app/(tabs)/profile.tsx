import { User } from 'lucide-react-native';
import { SignInGate } from '@zappy/ui/components/account/SignInGate';
import { colors } from '@zappy/ui/theme/colors';
import { ProfilePage } from '../../src/features/account/ProfilePage';

export default function Profile() {
  return (
    <SignInGate title="Your ZappyOne account" message="Sign in to see your profile, addresses, wallet and offers." icon={<User size={28} color={colors.textMuted} />}>
      <ProfilePage />
    </SignInGate>
  );
}
