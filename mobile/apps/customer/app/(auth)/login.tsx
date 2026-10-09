import { PhoneLoginScreen } from '@zappy/ui/auth/PhoneLoginScreen';

export default function LoginScreen() {
  return <PhoneLoginScreen title="Welcome to ZappyOne" subtitle="Log in to book trusted help near you" role="user" otpPath="/(auth)/otp" />;
}
