/**
 * One document the service asks for, with what to do about it: upload or
 * replace it, take it live when it must be taken now, or nothing when it is
 * already on file or accepted.
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Camera, Check, FileText, Upload } from 'lucide-react-native';
import { Text } from '../../../components';
import { RIPPLE } from '../../../lib/feedback';
import { danger, ink, slate, success, zappy } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { ob } from './onboardingStyles';

export interface RequiredDoc { code: string; label: string; required?: boolean; hint?: string; capture?: 'user' | 'environment' | null }

export function RequirementDocument({ doc, uploaded, missing, locked, again, redo, carried, busy, onPick }: {
  doc: RequiredDoc;
  uploaded: boolean;
  missing: boolean;
  /** Accepted by the reviewer, or the service is decided: nothing to change. */
  locked: boolean;
  /** The reviewer asked for this one again. */
  again: boolean;
  /** Some documents were asked for again (this one or others). */
  redo: boolean;
  /** Identity given once elsewhere, carried here. */
  carried: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const canChange = !locked && (again || !carried);
  const actionLabel = doc.capture ? (uploaded ? 'Retake' : 'Take photo') : (uploaded ? 'Replace' : 'Upload');
  const ActionIcon = doc.capture ? Camera : Upload;

  return (
    <View style={[ob.card, uploaded ? styles.done : missing ? styles.missing : null]}>
      <View style={[ob.row, styles.top]}>
        <View style={[styles.icon, { backgroundColor: uploaded ? success[100] : slate[100] }]}>
          {uploaded ? <Check size={17} color={success[600]} /> : <FileText size={17} color={ink[400]} />}
        </View>
        <View style={[ob.flex, styles.gapXs]}>
          <Text variant="bodySmall" weight="semibold">{doc.label}{!doc.required ? <Text variant="caption" color={ink[400]}> · optional</Text> : null}</Text>
          {again ? <Text variant="caption" weight="semibold" color={danger[600]}>{uploaded ? 'New copy added. Submit when ready.' : 'Asked for again: send a new, clear copy.'}</Text>
            : redo ? <Text variant="caption" color={success[700]}>Accepted</Text>
            : carried ? <Text variant="caption" color={success[700]}>Already on file from your verification. Nothing to do.</Text>
            : doc.hint ? <Text variant="caption" color={ink[400]}>{doc.hint}</Text> : null}
        </View>
        {canChange ? (
          <Pressable onPress={onPick} disabled={busy} android_ripple={RIPPLE} accessibilityRole="button" accessibilityLabel={`${actionLabel}: ${doc.label}`} style={[styles.action, busy && styles.busy]}>
            {busy ? <ActivityIndicator size="small" color={zappy[600]} /> : <><ActionIcon size={13} color={zappy[700]} /><Text variant="caption" weight="bold" color={zappy[700]}>{actionLabel}</Text></>}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  gapXs: { gap: 2 },
  done: { borderColor: success[100], backgroundColor: '#F6FEF9' },
  missing: { borderColor: danger[100] },
  icon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.button, borderWidth: 1, borderColor: zappy[100], backgroundColor: zappy[50] },
  busy: { opacity: 0.5 },
});
