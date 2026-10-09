import { OtpScreen } from '@zappy/ui/auth/OtpScreen';
import { useLoginWorkerMutation } from '@zappy/core/api/authApi';

export default function RakshakOtpScreen() {
  const [loginWorker] = useLoginWorkerMutation();
  return (
    <OtpScreen
      title="ZappyOne Rakshak"
      subtitle="Earn with jobs and errands near you"
      namePlaceholder="Your full name, as on your ID"
      verify={async ({ phone, otp, name }) => {
        const r = await loginWorker({ phone, otp, ...(name ? { name } : {}) }).unwrap();
        return { accessToken: r.accessToken, refreshToken: r.refreshToken, role: 'worker' };
      }}
    />
  );
}
