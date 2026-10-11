import { WorkerLoginPage } from '@zappy/ui/provider/pages/WorkerLoginPage';

// A code to the phone, or the password set after the first sign-in (the website's login).
export default function LoginScreen() {
  return <WorkerLoginPage title="Welcome to ZappyOne" subtitle="Log in to book trusted help near you" role="user" otpPath="/(auth)/otp" />;
}
