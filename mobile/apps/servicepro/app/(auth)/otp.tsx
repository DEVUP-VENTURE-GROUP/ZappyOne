import { OtpScreen } from '@zappy/ui/auth/OtpScreen';
import { useLoginShopMutation, useLoginWorkerMutation } from '@zappy/core/api/authApi';
import { useLocalSearchParams } from 'expo-router';

export default function ServiceProOtpScreen() {
  const { as } = useLocalSearchParams<{ as?: string }>();
  const owner = as !== 'worker';
  const [loginShop] = useLoginShopMutation();
  const [loginWorker] = useLoginWorkerMutation();
  return (
    <OtpScreen
      title="ZappyOne ServicePro"
      subtitle={owner ? 'Sign in to run your shop' : 'Sign in as a technician of your shop'}
      nameLabel={owner ? 'Your shop name' : 'Your name'}
      namePlaceholder={owner ? 'As customers will see it' : 'Your full name, as on your ID'}
      verify={async ({ phone, otp, name }) => {
        if (owner) {
          const r = await loginShop({ phone, otp, ...(name ? { businessName: name } : {}) }).unwrap();
          return { accessToken: r.accessToken, refreshToken: r.refreshToken, role: 'shop' };
        }
        const r = await loginWorker({ phone, otp, ...(name ? { name } : {}) }).unwrap();
        return { accessToken: r.accessToken, refreshToken: r.refreshToken, role: 'worker' };
      }}
    />
  );
}
