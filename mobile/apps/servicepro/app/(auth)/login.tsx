import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PhoneLoginScreen } from '@zappy/ui/auth/PhoneLoginScreen';
import { Chip } from '@zappy/ui/components';
import { spacing } from '@zappy/ui/theme/spacing';

/** Shop owners and their technicians both sign in here; the code is for whichever they are. */
export default function LoginScreen() {
  const [as, setAs] = useState<'shop' | 'worker'>('shop');
  return (
    <PhoneLoginScreen
      title="ZappyOne ServicePro"
      subtitle={as === 'shop' ? 'Sign in to run your shop' : 'Sign in as a technician of your shop'}
      role={as}
      otpPath="/(auth)/otp"
      params={{ as }}
      header={
        <View style={styles.switch}>
          <Chip label="I own the shop" selected={as === 'shop'} tone={as === 'shop' ? 'blue' : 'neutral'} onPress={() => setAs('shop')} />
          <Chip label="I work at a shop" selected={as === 'worker'} tone={as === 'worker' ? 'blue' : 'neutral'} onPress={() => setAs('worker')} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({ switch: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.base } });
