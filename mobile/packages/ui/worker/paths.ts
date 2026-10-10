/**
 * Old provider paths the websites still redirect (shared/src/provider/
 * providerRoutes.jsx), mapped the same way here, so a link from a
 * notification or the server always lands on a real screen.
 */
export function providerPath(path: string): string {
  const p = path.split('?')[0];
  if (p === '/worker/kyc' || p === '/worker/skills') return '/provider/onboarding';
  if (p === '/worker/repair/setup') return '/provider/services';
  if (p === '/worker/pet' || p === '/worker/helping' || /^\/worker\/jobs\/[^/]+$/.test(p)) return '/worker/work';
  return path;
}
