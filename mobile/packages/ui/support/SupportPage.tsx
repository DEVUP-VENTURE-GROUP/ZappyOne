/**
 * Talk to ZappyOne (the website's SupportPage): every conversation this account
 * has with the team (those waiting on them first) and a new one. `base` is the
 * route it lives at; a notification's ?ticket= opens that conversation.
 */
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, Clock, Headphones, HelpCircle, Mail, MessageCircle, Plus } from 'lucide-react-native';
import { useGetMyTicketsQuery } from '@zappy/core/api';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '../components';
import { RIPPLE } from '../lib/feedback';
import { useT } from '../lib/i18n';
import { openLink } from '../lib/openLink';
import { accent, colors, ink, navy, slate, zappy } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { NewTicketSheet } from './NewTicketSheet';
import { StatusBadge } from './StatusBadge';
import { TOPIC, type Audience } from './ticketMeta';
import { useLivePoll } from '@zappy/core/hooks/useLivePoll';

const EMAIL = 'support@zappyone.com';
interface Ticket { _id: string; subject: string; category?: string; status: string; createdAt: string; messages?: unknown[] }

export function SupportPage({ audience = 'customer', base = '/support', home = '/profile' }: { audience?: Audience; base?: string; home?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { ticket } = useLocalSearchParams<{ ticket?: string }>();
  const { data, isLoading, isFetching, refetch } = useGetMyTicketsQuery(undefined, { pollingInterval: useLivePoll(30000) });
  const [showNew, setShowNew] = useState(false);
  const tickets: Ticket[] = [...(data?.tickets || [])].sort((a: Ticket, b: Ticket) => Number(b.status === 'waiting_user') - Number(a.status === 'waiting_user'));
  const open = (id: string) => router.push(`${base}/tickets/${id}` as never);
  const back = () => (router.canGoBack() ? router.back() : router.replace(home as never));
  useEffect(() => { if (ticket) open(ticket); }, [ticket]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('support.title', 'Talk to ZappyOne')} onBack={back}
        right={<Button label={t('support.newTicket', 'New message')} size="small" icon={<Plus size={13} color="#fff" />} onPress={() => setShowNew(true)} />} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={zappy[500]} />}>
        <View style={styles.email}>
          <View style={styles.flex}>
            <Text variant="caption" weight="bold" color={zappy[200]}>{t('support.direct', 'OR WRITE TO US')}</Text>
            <Text variant="bodySmall" weight="black" color="#fff">{EMAIL}</Text>
            <Text variant="caption" color={slate[400]}>{audience === 'partner' ? t('support.partnerDesk', 'Problems, complaints and ideas for the app') : t('support.desk', 'Help with bookings, payments and your account')}</Text>
          </View>
          <Button label={t('support.emailUs', 'Email Us')} size="small" icon={<Mail size={13} color="#fff" />} onPress={() => openLink(`mailto:${EMAIL}`, `Write to ${EMAIL} from your email app.`)} />
        </View>
        {audience === 'customer' ? (
          <View style={styles.links}>
            <Pressable onPress={() => router.push('/faq' as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.link}><HelpCircle size={18} color={zappy[600]} /><Text variant="bodySmall" weight="semibold">{t('support.faqs', 'FAQs')}</Text></Pressable>
            <Pressable onPress={() => router.push('/disputes' as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.link}><AlertCircle size={18} color={zappy[600]} /><Text variant="bodySmall" weight="semibold">{t('profile.disputes', 'Disputes')}</Text></Pressable>
          </View>
        ) : null}

        {isLoading ? <LoadingState /> : !tickets.length ? (
          <EmptyState icon={<Headphones size={24} color={slate[400]} />} title={t('support.noTickets', 'Nothing here yet')}
            message={t('support.noTicketsHint', 'Ask for help, raise a complaint or suggest a feature. The ZappyOne team replies right here.')} actionLabel={t('support.create', 'Message ZappyOne')} onAction={() => setShowNew(true)} />
        ) : tickets.map((tk) => {
          const awaiting = tk.status === 'waiting_user';
          return (
            <Pressable key={tk._id} onPress={() => open(tk._id)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.card, awaiting && styles.awaiting]}>
              {awaiting ? <View style={styles.flag}><AlertCircle size={10} color={accent[700]} /><Text variant="caption" weight="bold" color={accent[700]}>{t('support.actionRequired', 'ZappyOne is waiting for your reply')}</Text></View> : null}
              <View style={styles.top}>
                <View style={styles.flex}>
                  <Text variant="bodySmall" weight="bold" numberOfLines={1}>{tk.subject}</Text>
                  <Text variant="caption" color={ink[400]}>{TOPIC[tk.category || ''] || tk.category}</Text>
                </View>
                <StatusBadge status={tk.status} />
              </View>
              <View style={styles.meta}>
                <View style={styles.inline}><Clock size={10} color={ink[400]} /><Text variant="caption" color={ink[400]}>{new Date(tk.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text></View>
                {tk.messages?.length ? <View style={styles.inline}><MessageCircle size={10} color={ink[400]} /><Text variant="caption" color={ink[400]}>{tk.messages.length} {t('support.messages', 'messages')}</Text></View> : null}
                <Text variant="caption" weight="bold" color={zappy[600]} style={styles.view}>{t('support.view', 'Open')} →</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <NewTicketSheet visible={showNew} audience={audience} onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); refetch(); open(id); }} />
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
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  view: { marginLeft: 'auto' },
});
