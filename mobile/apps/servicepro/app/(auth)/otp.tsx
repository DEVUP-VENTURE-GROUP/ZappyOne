import { OtpScreen } from '@zappy/ui/auth/OtpScreen';
import { useLoginEventPartnerMutation, useLoginShopMutation, useLoginWorkerMutation } from '@zappy/core/api';
import { useLocalSearchParams } from 'expo-router';

/** Who is signing in, with what a new account of that kind is asked for. */
const COPY = {
  shop: { subtitle: 'Sign in to run your shop', name: 'Your shop name', namePlaceholder: 'As customers will see it' },
  worker: { subtitle: 'Sign in as a technician of your shop', name: 'Your name', namePlaceholder: 'Your full name, as on your ID' },
  event_partner: { subtitle: 'Sign in to run your decor and events business', name: 'Your business name', namePlaceholder: 'e.g. Dream Decors Hyderabad' },
} as const;

export default function ServiceProOtpScreen() {
  const { as } = useLocalSearchParams<{ as?: string }>();
  const role: keyof typeof COPY = as === 'worker' || as === 'event_partner' ? as : 'shop';
  const copy = COPY[role];
  const [loginShop] = useLoginShopMutation();
  const [loginWorker] = useLoginWorkerMutation();
  const [loginPartner] = useLoginEventPartnerMutation();
  return (
    <OtpScreen
      title="ZappyOne ServicePro"
      subtitle={copy.subtitle}
      nameLabel={copy.name}
      namePlaceholder={copy.namePlaceholder}
      // A new shop or event business gives its owner's name too; the server needs both to open it.
      secondField={role === 'worker' ? null : { label: 'Owner name', placeholder: 'Your full name' }}
      verify={async ({ phone, otp, name, second }) => {
        const opening = { ...(name ? { businessName: name } : {}), ...(second ? { ownerName: second } : {}) };
        if (role === 'shop') {
          const r = await loginShop({ phone, otp, ...opening }).unwrap();
          return { accessToken: r.accessToken, refreshToken: r.refreshToken, role: 'shop' };
        }
        if (role === 'event_partner') {
          const r = await loginPartner({ phone, otp, ...opening }).unwrap();
          return { accessToken: r.accessToken, refreshToken: r.refreshToken, role: 'event_partner' };
        }
        const r = await loginWorker({ phone, otp, ...(name ? { name } : {}) }).unwrap();
        return { accessToken: r.accessToken, refreshToken: r.refreshToken, role: 'worker' };
      }}
    />
  );
}
