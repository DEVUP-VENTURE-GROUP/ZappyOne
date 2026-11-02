import { OtpScreen } from '@zappy/ui/auth/OtpScreen';
import { useServiceproLoginMutation } from '@zappy/core/api';
import { useRouter } from 'expo-router';

/** The code, checked once by ServicePro's sign-in; several accounts or none continue on the account screen. */
export default function ServiceProOtpScreen() {
  const router = useRouter();
  const [login] = useServiceproLoginMutation();
  return (
    <OtpScreen
      title="ZappyOne ServicePro"
      subtitle="Enter the code we sent you"
      collectNewDetails={false}
      verify={async ({ phone, otp }) => {
        const r = await login({ phone, otp }).unwrap();
        if (r.accessToken) return { accessToken: r.accessToken, refreshToken: r.refreshToken, role: r.role, user: r.account };
        router.replace({ pathname: '/(auth)/account', params: { ticket: r.ticket, accounts: JSON.stringify(r.accounts || []) } } as never);
        return null;
      }}
    />
  );
}
