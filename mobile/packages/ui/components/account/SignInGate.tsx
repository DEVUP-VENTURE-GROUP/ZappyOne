// A screen that needs an account, opened by a guest: says why and offers sign-in in place, so Back never leaves the app.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { LogIn } from 'lucide-react-native';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Button, EmptyState } from '..';
import { rememberReturn } from '../../app/AppRoot';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

export function SignInGate({ title, message, icon, login = '/(auth)/login', children }: { title: string; message: string; icon?: ReactNode; login?: string; children: ReactNode }) {
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated);
  const router = useRouter();
  const pathname = usePathname();
  if (signedIn) return <>{children}</>;
  return (
    <View style={styles.page}>
      <EmptyState title={title} message={message} icon={icon} />
      <View style={styles.cta}>
        <Button label="Sign in" icon={<LogIn size={16} color="#fff" />} onPress={() => { rememberReturn(pathname); router.push(login as never); }} fullWidth size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', backgroundColor: colors.background, padding: spacing.lg },
  cta: { marginTop: spacing.base },
});
