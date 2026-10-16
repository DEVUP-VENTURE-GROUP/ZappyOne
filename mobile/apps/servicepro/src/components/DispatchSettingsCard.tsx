// The website's DispatchSettingsCard.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { usePartnerSettingsQuery, useSavePartnerSettingsMutation } from '@zappy/core/api';
import { DISPATCH_MODES, PARTNER_TYPES } from '@zappy/core/shared/partnerBoard';
import { Chip, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function DispatchSettingsCard() {
  const { data } = usePartnerSettingsQuery(undefined);
  const [save, { isLoading }] = useSavePartnerSettingsMutation();
  const [cap, setCap] = useState('');
  useEffect(() => { if (data) setCap(data.dispatch.capacity ? String(data.dispatch.capacity) : ''); }, [data?.dispatch.capacity]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return null;
  const change = (body: Record<string, unknown>) => save(body).unwrap().then(() => toast.success('Saved')).catch((e: unknown) => toast.error(errText(e, 'Could not save')));

  return (
    <View style={styles.card}>
      <View>
        <Text variant="bodySmall" weight="black">How jobs reach your team</Text>
        <Text variant="caption" color={ink[500]}>{data.openJobs} job{data.openJobs === 1 ? '' : 's'} open right now{data.dispatch.capacity ? ` of your limit of ${data.dispatch.capacity}` : ''}.</Text>
        {data.commissionPct != null ? <Text variant="caption" color={ink[500]}>ZappyOne's commission: {data.commissionPct}% of the service money on each job.</Text> : null}
      </View>
      {DISPATCH_MODES.map((m) => {
        const on = data.dispatch.mode === m.key;
        return (
          <Pressable key={m.key} disabled={isLoading} onPress={() => !on && change({ mode: m.key })} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={[styles.option, on && styles.optionOn]}>
            <Text variant="bodySmall" weight="semibold">{m.label}</Text>
            <Text variant="caption" color={ink[500]}>{m.hint}</Text>
          </Pressable>
        );
      })}
      <Text variant="caption" weight="bold" color={ink[700]}>Most jobs at once</Text>
      <TextInput value={cap} onChangeText={(v) => setCap(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="No limit" placeholderTextColor={ink[400]}
        onEndEditing={() => { const v = Number(cap) || 0; if (v !== data.dispatch.capacity) change({ capacity: v }); }} style={styles.input} />
      <Text variant="caption" color={ink[400]}>When this many are open, we stop sending new ones until one finishes.</Text>
      <Text variant="caption" weight="bold" color={ink[700]}>You are a</Text>
      <View style={styles.chips}>
        {PARTNER_TYPES.map((t) => <Chip key={t.key} label={t.label} selected={data.partnerType === t.key} onPress={() => data.partnerType !== t.key && change({ partnerType: t.key })} />)}
      </View>
      <Text variant="caption" color={ink[400]}>{PARTNER_TYPES.find((t) => t.key === data.partnerType)?.hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: spacing.sm },
  option: { padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, gap: 2 },
  optionOn: { borderColor: zappy[500], backgroundColor: zappy[50] },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
