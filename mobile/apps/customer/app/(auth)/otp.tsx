import { OtpScreen } from '@zappy/ui/auth/OtpScreen';
import { useLoginUserMutation } from '@zappy/core/api';

export default function CustomerOtpScreen() {
  const [loginUser] = useLoginUserMutation();
  return (
    <OtpScreen
      title="Welcome to ZappyOne"
      subtitle="Log in to book trusted help near you"
      verify={async ({ phone, otp, name }) => {
        const r = await loginUser({ phone, otp, ...(name ? { name } : {}) }).unwrap();
        return { accessToken: r.accessToken, refreshToken: r.refreshToken, role: 'user', user: r.user };
      }}
    />
  );
}
