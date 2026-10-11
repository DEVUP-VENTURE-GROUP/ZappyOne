/**
 * Help & Support (the website's SupportPage): the support email, every ticket
 * the customer has opened (those waiting on them flagged first), and a new
 * ticket. FAQs and chat are one tap away.
 */
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, Clock, Headphones, HelpCircle, Mail, MessageCircle, Plus } from 'lucide-react-native';
import { useGetMyTicketsQuery } from '@zappy/core/api';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { openLink } from '@zappy/ui/lib/openLink';
import { accent, colors, ink, navy, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { NewTicketSheet } from './NewTicketSheet';
import { StatusBadge } from './StatusBadge';

const EMAIL = 'support@zappyone.com';
interface Ticket { _id: string; subject: string; category?: string; status: string; createdAt: string; messages?: unknown[] }

export function SupportPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading, isFetching, refetch } = useGetMyTicketsQuery(undefined);
  const [showNew, setShowNew] = useState(false);
  const tickets: Ticket[] = [...(data?.tickets || [])].sort((a: Ticket, b: Ticket) => Number(b.status === 'waiting_user') - Number(a.status === 'waiting_user'));
  const open = (id: string) => router.push(`/support/tickets/${id}` as never);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('support.title', 'Help & Support')} onBack={back}
        right={<Button label={t('support.newTicket', 'New Ticket')} size="small" icon={<Plus size={13} color="#fff" />} onPress={() => setShowNew(true)} />} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={zappy[500]} />}>
        <View style={styles.email}>
          <View style={styles.flex}>
            <Text variant="caption" weight="bold" color={zappy[200] ?? '#BFD0FF'}>{t('support.direct', 'DIRECT EMAIL SUPPORT')}</Text>
            <Text variant="bodySmall" weight="black" color="#fff">{EMAIL}</Text>
            <Text variant="caption" color={slate[400]}>{t('support.desk', '24/7 Dedicated Customer Resolution Desk')}</Text>
          </View>
          <Button label={t('support.emailUs', 'Email Us')} size="small" icon={<Mail size={13} color="#fff" />} onPress={() => openLink(`mailto:${EMAIL}`, `Write to ${EMAIL} from your email app.`)} />
        </View>
        <View style={styles.links}>
          <Pressable onPress={() => router.push('/faq' as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.link}><HelpCircle size={18} color={zappy[600]} /><Text variant="bodySmall" weight="semibold">{t('support.faqs', 'FAQs')}</Text></Pressable>
          <Pressable onPress={() => router.push('/disputes' as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.link}><AlertCircle size={18} color={zappy[600]} /><Text variant="bodySmall" weight="semibold">{t('profile.disputes', 'Disputes')}</Text></Pressable>
        </View>

        {isLoading ? <LoadingState /> : !tickets.length ? (
          <EmptyState icon={<Headphones size={24} color={slate[400]} />} title={t('support.noTickets', 'No support tickets yet')}
            message={t('support.noTicketsHint', 'Need help? Create a ticket and our team will get back to you.')} actionLabel={t('support.create', 'Create Support Ticket')} onAction={() => setShowNew(true)} />
        ) : tickets.map((tk) => {
          const awaiting = tk.status === 'waiting_user';
          return (
            <Pressable key={tk._id} onPress={() => open(tk._id)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.card, awaiting && styles.awaiting]}>
              {awaiting ? <View style={styles.flag}><AlertCircle size={10} color={accent[700]} /><Text variant="caption" weight="bold" color={accent[700]}>{t('support.actionRequired', 'Action required: reply to support')}</Text></View> : null}
              <View style={styles.top}>
                <View style={styles.flex}>
                  <Text variant="bodySmall" weight="bold" numberOfLines={1}>{tk.subject}</Text>
                  <Text variant="caption" color={ink[400]} style={styles.cap}>{tk.category?.replace(/_/g, ' ')}</Text>
                </View>
                <StatusBadge status={tk.status} />
              </View>
              <View style={styles.meta}>
                <View style={styles.inline}><Clock size={10} color={ink[400]} /><Text variant="caption" color={ink[400]}>{new Date(tk.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text></View>
                {tk.messages?.length ? <View style={styles.inline}><MessageCircle size={10} color={ink[400]} /><Text variant="caption" color={ink[400]}>{tk.messages.length} {t('support.messages', 'messages')}</Text></View> : null}
                <Text variant="caption" weight="bold" color={zappy[600]} style={styles.view}>{t('support.view', 'View')} →</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <NewTicketSheet visible={showNew} onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); refetch(); open(id); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  email: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, backgroundColor: navy[900] },
  flex: { flex: 1, minWidth: 0 },
  links: { flexDirection: 'row', gap: spacing.sm },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  awaiting: { borderColor: accent[100] },
  flag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.small, backgroundColor: accent[50] },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cap: { textTransform: 'capitalize' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  view: { marginLeft: 'auto' },
});
