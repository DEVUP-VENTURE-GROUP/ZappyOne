/**
 * After the code (the website's ServiceProLogin): pick one of this number's
 * accounts, or, for a new number, say what you do and open your account.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, PartyPopper, Store, Wrench } from 'lucide-react-native';
import { saveSession } from '@zappy/core/api/tokenStorage';
import { useServiceproLoginMutation, useServiceproRegisterMutation } from '@zappy/core/api';
import { PARTNER_TYPES } from '@zappy/core/shared/partnerBoard';
import { socketClient } from '@zappy/core/socket/socketClient';
import { setSession } from '@zappy/core/store/authSlice';
import { useAppDispatch } from '@zappy/core/store/hooks';
import { AuthShell } from '@zappy/ui/auth/AuthShell';
import { Button, Chip, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Account { role: 'shop' | 'worker' | 'event_partner'; name: string; kind: string; shopName?: string | null }
const ICON = { shop: Store, worker: Wrench, event_partner: PartyPopper };
const SUB = (a: Account) => (a.role === 'worker' ? `Technician${a.shopName ? ` at ${a.shopName}` : ''}` : a.role === 'event_partner' ? 'Event partner' : PARTNER_TYPES.find((t) => t.key === a.kind)?.label || 'Your business');

export default function AccountScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const p = useLocalSearchParams<{ ticket: string; accounts?: string }>();
  const accounts: Account[] = useMemo(() => { try { return JSON.parse(String(p.accounts || '[]')); } catch { return []; } }, [p.accounts]);
  const [login, { isLoading: opening }] = useServiceproLoginMutation();
  const [register, { isLoading: creating }] = useServiceproRegisterMutation();
  const [kind, setKind] = useState<'services' | 'events'>('services');
  const [partnerType, setPartnerType] = useState('individual');
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [accepted, setAccepted] = useState(false);

  async function enter(r: { accessToken: string; refreshToken?: string; role: Account['role']; account?: unknown }) {
    await saveSession({ accessToken: r.accessToken, refreshToken: r.refreshToken ?? '', role: r.role });
    dispatch(setSession({ user: (r.account as never) ?? null, role: r.role }));
    socketClient.connect();
  }
  const restart = (err: unknown) => { toast.error(errText(err, 'Could not continue')); if ((err as { data?: { code?: string } })?.data?.code === 'TICKET_EXPIRED') router.replace('/(auth)/login' as never); };
  const pick = (role: Account['role']) => login({ ticket: p.ticket, role }).unwrap().then(enter).catch(restart);
  const create = () => register({ ticket: p.ticket, kind, businessName: businessName.trim(), ownerName: ownerName.trim(), acceptTerms: true, ...(kind === 'services' && { partnerType }) }).unwrap().then(enter).catch(restart);
  const ok = businessName.trim().length >= 2 && ownerName.trim().length >= 2 && accepted;

  if (accounts.length) {
    return (
      <AuthShell title="Which account?" subtitle="This number has more than one ZappyOne account.">
        <View style={styles.list}>
          {accounts.map((a) => { const I = ICON[a.role]; return (
            <Pressable key={a.role} onPress={() => pick(a.role)} disabled={opening} accessibilityRole="button" accessibilityLabel={a.name} style={styles.card}>
              <View style={styles.icon}><I size={18} color={zappy[700]} /></View>
              <View style={styles.flex}><Text variant="bodySmall" weight="bold" numberOfLines={1}>{a.name}</Text><Text variant="caption" color={ink[500]}>{SUB(a)}</Text></View>
              <ArrowRight size={16} color={ink[400]} />
            </Pressable>
          ); })}
        </View>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="What do you do?" subtitle="You choose your exact services and get verified for each right after this.">
      <View style={styles.list}>
        <View style={styles.row}>
          <Chip label="Doorstep services" selected={kind === 'services'} onPress={() => setKind('services')} />
          <Chip label="Events & decor" selected={kind === 'events'} onPress={() => setKind('events')} />
        </View>
        {kind === 'services' ? <View style={styles.row}>{PARTNER_TYPES.map((t: { key: string; label: string }) => <Chip key={t.key} label={t.label} selected={partnerType === t.key} onPress={() => setPartnerType(t.key)} />)}</View> : null}
        <TextInput value={businessName} onChangeText={setBusinessName} maxLength={120} placeholder={kind === 'services' && partnerType === 'individual' ? 'Your work name, e.g. Ramesh Electricals' : 'Business name'} placeholderTextColor={ink[400]} style={styles.input} />
        <TextInput value={ownerName} onChangeText={setOwnerName} maxLength={100} placeholder="Your name" placeholderTextColor={ink[400]} style={styles.input} />
        <Pressable onPress={() => setAccepted((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} style={styles.row}>
          <View style={[styles.box, accepted && styles.boxOn]} />
          <Text variant="caption" weight="semibold" color={ink[700]} style={styles.flex}>I accept the ZappyOne partner terms.</Text>
        </Pressable>
        <Text variant="caption" weight="semibold" color={zappy[600]} onPress={() => router.push('/policy/partner-terms' as never)}>Read the partner terms</Text>
        <Button label="Create my account" onPress={create} loading={creating} disabled={!ok} fullWidth size="large" />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: colors.border },
  boxOn: { backgroundColor: zappy[600], borderColor: zappy[600] },
});
