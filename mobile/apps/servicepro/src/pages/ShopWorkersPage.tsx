/**
 * The shop's technicians (the website's ShopWorkersPage): who they are, whether
 * their ID is checked, their rating, whether they are on duty; add one by phone
 * number, or remove one. No skills picker: a technician works on whatever the
 * shop is approved for, and still completes their own ID check.
 */
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Briefcase, Circle, Clock, Crown, Plus, ShieldCheck, Star, Trash2, Users, XCircle } from 'lucide-react-native';
import { useAddShopWorkerMutation, useRemoveShopWorkerMutation, useSetShopWorkerTeamMutation, useShopWorkersQuery } from '@zappy/core/api';
import { Button, Chip, EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { DispatchSettingsCard } from '../components/DispatchSettingsCard';
import { InviteTeamSheet } from '../components/InviteTeamSheet';
import { toast } from '@zappy/ui/components/Toast';
import { FullScreenSheet } from '@zappy/ui/components/common/FullScreenSheet';
import { errText } from '@zappy/ui/lib/feedback';
import { accent, colors, danger, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const KYC_PILL: Record<string, { label: string; bg: string; fg: string; Icon: typeof ShieldCheck }> = {
  approved: { label: 'Verified', bg: success[50], fg: success[700], Icon: ShieldCheck },
  pending_review: { label: 'Pending review', bg: accent[50], fg: accent[700], Icon: Clock },
  rejected: { label: 'Rejected', bg: danger[50], fg: danger[600], Icon: XCircle },
  not_submitted: { label: 'Not verified yet', bg: slate[100], fg: ink[500], Icon: Circle },
};

interface Worker { _id: string; name?: string; phone?: string; rating?: number; isOnline?: boolean; kyc?: { status?: string }; team?: { role?: string; leadId?: string | null } }

function AddWorkerSheet({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [addWorker, { isLoading }] = useAddShopWorkerMutation();
  async function add() {
    if (phone.length < 10) { toast.error('Enter a valid phone number'); return; }
    try {
      const res = await addWorker({ phone, name: name || undefined }).unwrap();
      toast.success(res.isNew ? 'Added. They sign in to ServicePro as a shop worker with this number and verify their ID to go on duty.' : 'Linked to your shop', { duration: 6000 });
      onClose();
    } catch (err) { toast.error(errText(err, 'Failed to add worker')); }
  }
  return (
    <FullScreenSheet title="Add worker" onClose={onClose}>
      <Text variant="caption" color={ink[500]}>If this phone number already belongs to a ZappyOne worker, we'll just link them to your shop.</Text>
      <Text variant="caption" weight="bold" color={ink[700]}>Phone number *</Text>
      <TextInput value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="phone-pad" placeholder="10-digit mobile number" placeholderTextColor={ink[400]} style={styles.input} />
      <Text variant="caption" weight="bold" color={ink[700]}>Name (required if new)</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Worker's name" placeholderTextColor={ink[400]} autoCapitalize="words" style={styles.input} />
      <View style={styles.note}><Text variant="caption" color={ink[500]}>They will be able to work on everything your shop is approved for. They still complete their own verification before taking jobs.</Text></View>
      <Button label="Add worker" onPress={add} loading={isLoading} disabled={phone.length < 10 || !name.trim()} fullWidth size="large" />
    </FullScreenSheet>
  );
}

export function ShopWorkersPage() {
  const { data, isLoading } = useShopWorkersQuery();
  const [removeWorker] = useRemoveShopWorkerMutation();
  const [showAdd, setShowAdd] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [setTeam] = useSetShopWorkerTeamMutation();
  const teamAct = (body: Record<string, unknown>, ok: string) => setTeam(body).unwrap().then(() => toast.success(ok)).catch((e: unknown) => toast.error(errText(e, 'Could not save')));
  const [removingId, setRemovingId] = useState<string | null>(null);
  const workers: Worker[] = data?.workers || [];
  const leads = workers.filter((w) => w.team?.role === 'lead');

  function remove(w: Worker) {
    Alert.alert(`Remove ${w.name || 'this worker'} from your shop?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setRemovingId(w._id);
        try { await removeWorker(w._id).unwrap(); toast.success('Worker removed from your shop'); }
        catch (err) { toast.error(errText(err, 'Failed to remove worker')); }
        finally { setRemovingId(null); }
      } },
    ]);
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="Team" safeArea right={<View style={styles.inline}><Button label="Many" size="small" variant="secondary" icon={<Users size={14} color={zappy[700]} />} onPress={() => setInviting(true)} /><Button label="Add" size="small" icon={<Plus size={14} color="#fff" />} onPress={() => setShowAdd(true)} /></View>} />
      {isLoading ? <LoadingState /> : (
        <FlatList
          data={workers}
          keyExtractor={(w) => w._id}
          contentContainerStyle={styles.body}
          ListHeaderComponent={<DispatchSettingsCard />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<EmptyState title="No workers yet" message="Add a worker by their phone number to get started." actionLabel="Add worker" onAction={() => setShowAdd(true)} icon={<Briefcase size={26} color={slate[300]} />} />}
          renderItem={({ item: w }) => {
            const kyc = KYC_PILL[w.kyc?.status || 'not_submitted'] || KYC_PILL.not_submitted;
            return (
              <View style={styles.card}>
                <View style={styles.avatar}><Text variant="bodySmall" weight="bold" color={zappy[600]}>{(w.name || w.phone || '?').charAt(0).toUpperCase()}</Text></View>
                <View style={styles.flex}>
                  <Text variant="bodySmall" weight="semibold" numberOfLines={1}>{w.name || 'Unnamed worker'}</Text>
                  {w.phone ? <Text variant="caption" color={ink[400]}>{w.phone}</Text> : null}
                  <View style={styles.meta}>
                    <View style={[styles.pill, { backgroundColor: kyc.bg }]}><kyc.Icon size={10} color={kyc.fg} /><Text variant="caption" weight="bold" color={kyc.fg}>{kyc.label}</Text></View>
                    {w.rating ? <View style={styles.inline}><Star size={10} color={accent[500]} fill={accent[500]} /><Text variant="caption" weight="bold" color={ink[500]}>{w.rating.toFixed(1)}</Text></View> : null}
                    <View style={styles.inline}><View style={[styles.dot, { backgroundColor: w.isOnline ? success[500] : slate[300] }]} /><Text variant="caption" weight="semibold" color={ink[400]}>{w.isOnline ? 'On duty' : 'Off duty'}</Text></View>
                    {w.team?.role === 'lead' ? <View style={[styles.pill, { backgroundColor: accent[50] }]}><Crown size={10} color={accent[700]} /><Text variant="caption" weight="bold" color={accent[700]}>Team lead</Text></View> : null}
                  </View>
                  {/* Leads see and give out their group's jobs (server shop/partner.service). */}
                  <View style={styles.meta}>
                    <Chip label={w.team?.role === 'lead' ? 'Remove lead' : 'Make lead'} onPress={() => teamAct({ workerId: w._id, role: w.team?.role === 'lead' ? 'member' : 'lead' }, w.team?.role === 'lead' ? 'No longer a lead' : 'Made a team lead')} />
                    {w.team?.role !== 'lead' ? leads.map((l) => {
                      const inGroup = String(w.team?.leadId) === String(l._id);
                      return <Chip key={l._id} label={`${l.name || l.phone}'s group`} selected={inGroup} onPress={() => teamAct({ workerId: w._id, leadId: inGroup ? null : l._id }, inGroup ? 'Taken out of the group' : 'Group saved')} />;
                    }) : null}
                  </View>
                </View>
                <Pressable onPress={() => remove(w)} disabled={removingId === w._id} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove ${w.name || 'worker'}`} style={styles.remove}>
                  {removingId === w._id ? <ActivityIndicator size="small" color={ink[400]} /> : <Trash2 size={15} color={ink[400]} />}
                </Pressable>
              </View>
            );
          }}
        />
      )}
      {showAdd ? <AddWorkerSheet onClose={() => setShowAdd(false)} /> : null}
      {inviting ? <InviteTeamSheet onClose={() => setInviting(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  body: { padding: spacing.base, paddingBottom: 120 },
  sep: { height: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  remove: { width: 36, height: 36, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  note: { padding: spacing.md, borderRadius: radius.medium, backgroundColor: slate[50] },
});
