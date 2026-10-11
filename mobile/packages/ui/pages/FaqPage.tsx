/**
 * Help & FAQs (the website's FaqPage), for any audience the server keeps
 * answers for: grouped, searchable, one answer open at a time, and support
 * one tap away when the answer is not there.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, HelpCircle, MessageCircle, Search } from 'lucide-react-native';
import { useGetFaqsQuery } from '@zappy/core/api';
import { Button, Input, LoadingState, ScreenHeader, Text } from '../components';
import { useT } from '../lib/i18n';
import { colors, ink, slate, zappy } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

interface Group { category: string; items: { id: string; question: string; answer: string }[] }

export function FaqPage({ audience = 'user', supportPath = '/support' }: { audience?: string; supportPath?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useGetFaqsQuery(audience);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const groups: Group[] = data?.faqs || [];
  const shown = term ? groups.map((g) => ({ ...g, items: g.items.filter((i) => `${i.question} ${i.answer}`.toLowerCase().includes(term)) })).filter((g) => g.items.length) : groups;
  const back = () => (router.canGoBack() ? router.back() : router.replace(supportPath as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('faq.title', 'Help & FAQs')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <Input value={q} onChangeText={setQ} placeholder={t('faq.search', 'Search help topics…')} leadingIcon={<Search size={16} color={slate[400]} />} />
        {isLoading ? <LoadingState /> : !shown.length ? (
          <View style={styles.empty}><HelpCircle size={40} color={slate[300]} /><Text variant="bodySmall" weight="medium" color={ink[400]}>{t('faq.none', 'No help topics found')}{term ? ` for "${q}"` : ''}.</Text></View>
        ) : shown.map((g) => (
          <View key={g.category} style={styles.card}>
            <Text variant="caption" weight="black" color={zappy[500]} style={styles.cat}>{g.category.toUpperCase()}</Text>
            {g.items.map((it, i) => {
              const open = openId === it.id;
              return (
                <View key={it.id} style={i > 0 && styles.rule}>
                  <Pressable onPress={() => setOpenId(open ? null : it.id)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.q}>
                    <Text variant="bodySmall" weight="semibold" style={styles.flex}>{it.question}</Text>
                    <ChevronDown size={18} color={slate[400]} style={open ? styles.flip : undefined} />
                  </Pressable>
                  {open ? <Text variant="bodySmall" color={ink[700]} style={styles.a}>{it.answer}</Text> : null}
                </View>
              );
            })}
          </View>
        ))}
        <Button label={t('faq.contact', 'Still need help? Contact support')} icon={<MessageCircle size={17} color="#fff" />} onPress={() => router.push(supportPath as never)} fullWidth />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.base, padding: spacing.base },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  card: { paddingHorizontal: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cat: { paddingTop: spacing.base, letterSpacing: 1.2 },
  rule: { borderTopWidth: 1, borderTopColor: colors.border },
  q: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.base },
  flex: { flex: 1 },
  flip: { transform: [{ rotate: '180deg' }] },
  a: { paddingBottom: spacing.base },
});
