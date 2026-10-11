import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@zappy/ui/components';
import { WorkerLoginPage } from '@zappy/ui/provider/pages/WorkerLoginPage';
import { useT } from '@zappy/ui/lib/i18n';
import { zappy } from '@zappy/ui/theme/colors';

// A code to the phone, or the password set after the first sign-in (the website's login).
// Signing in is asked for when it is needed; until then the app can be browsed.
export default function LoginScreen() {
  const router = useRouter();
  const t = useT();
  return (
    <WorkerLoginPage title="Welcome to ZappyOne" subtitle="Log in to book trusted help near you" role="user" otpPath="/(auth)/otp"
      footer={(
        <Pressable onPress={() => router.replace('/' as never)} accessibilityRole="button" hitSlop={8}>
          <Text variant="bodySmall" weight="semibold" color={zappy[600]} align="center">{t('auth.browse', 'Continue browsing')}</Text>
        </Pressable>
      )} />
  );
}
