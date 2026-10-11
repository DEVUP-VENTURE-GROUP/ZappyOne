/**
 * The legal pages, as admin publishes them (Admin → Content → Legal pages):
 * privacy, terms, refunds, warranty, account deletion, grievances. The list
 * comes from the server, so a page added or hidden there shows here. Nothing
 * shows when the list cannot load.
 */
import { FileText } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useGetPoliciesQuery } from '@zappy/core/api';
import { MenuItem, MenuSection } from './MenuSection';

/** Pages meant for one side only. */
const PROVIDER_ONLY = ['partner-terms'];
const CUSTOMER_ONLY = ['terms', 'warranty-guidelines', 'refund-policy'];

export function LegalLinks({ audience = 'customer', title = 'Legal' }: { audience?: 'customer' | 'provider'; title?: string }) {
  const router = useRouter();
  const { data } = useGetPoliciesQuery(undefined);
  const skip = audience === 'customer' ? PROVIDER_ONLY : CUSTOMER_ONLY;
  const pages: { slug: string; title: string }[] = (data?.policies || []).filter((p: { slug: string }) => !skip.includes(p.slug));
  if (!pages.length) return null;
  return (
    <MenuSection title={title}>
      {pages.map((p) => <MenuItem key={p.slug} Icon={FileText} label={p.title} onPress={() => router.push(`/policy/${p.slug}` as never)} />)}
    </MenuSection>
  );
}
