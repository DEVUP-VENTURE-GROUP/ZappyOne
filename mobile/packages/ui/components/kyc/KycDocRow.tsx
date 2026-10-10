/**
 * One document on an ID-check form (shop or technician): what it is, whether it
 * is in, and the one action for it. A live document opens the camera; any
 * other takes a photo or picks one. Accepted documents have no action.
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Camera, CheckCircle2, Upload, type LucideIcon } from 'lucide-react-native';
import { Text } from '..';
import { RIPPLE } from '../../lib/feedback';
import { colors, danger, ink, slate, success, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function KycDocRow({ Icon, label, sublabel, required, live, uploaded, busy, locked, onPick }: {
  Icon: LucideIcon; label: string; sublabel: string; required?: boolean; live?: boolean; uploaded: boolean; busy: boolean;
  /** Accepted by the reviewer: shown, not changeable. */
  locked?: boolean; onPick: () => void;
}) {
  const action = live ? (uploaded ? 'Retake' : 'Take selfie') : (uploaded ? 'Replace' : 'Upload');
  const ActionIcon = live ? Camera : Upload;
  return (
    <View style={[styles.card, uploaded && styles.done]}>
      <View style={[styles.icon, { backgroundColor: uploaded ? success[100] : slate[100] }]}><Icon size={18} color={uploaded ? success[600] : ink[400]} /></View>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="semibold">{label}{required ? <Text variant="bodySmall" weight="bold" color={danger[500]}> *</Text> : null}</Text>
        <Text variant="caption" color={ink[400]}>{locked ? 'Accepted, nothing to change' : sublabel}</Text>
        {uploaded ? <View style={styles.ok}><CheckCircle2 size={12} color={success[600]} /><Text variant="caption" weight="semibold" color={success[700]}>{live ? 'Taken live' : 'Uploaded'}</Text></View> : null}
      </View>
      {locked ? null : (
        <Pressable onPress={onPick} disabled={busy} android_ripple={RIPPLE} accessibilityRole="button" accessibilityLabel={`${action}: ${label}`} style={[styles.action, busy && styles.busy]}>
          {busy ? <ActivityIndicator size="small" color={zappy[600]} /> : <><ActionIcon size={12} color={zappy[700]} /><Text variant="caption" weight="bold" color={zappy[700]}>{action}</Text></>}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  done: { borderColor: success[100], backgroundColor: '#F6FEF9' },
  icon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  ok: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.button, borderWidth: 1, borderColor: zappy[100], backgroundColor: zappy[50] },
  busy: { opacity: 0.5 },
});
