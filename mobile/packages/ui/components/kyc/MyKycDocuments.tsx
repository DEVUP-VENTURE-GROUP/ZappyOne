/**
 * The technician's own submitted documents, read-only (the website's
 * MyDocuments): streamed from the server with their sign-in, so no link
 * expires and nobody else can open them. Tap one to see it large.
 */
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Camera, FileText, Lock, X } from 'lucide-react-native';
import { getAccessToken } from '@zappy/core/api/tokenStorage';
import { API_BASE_URL } from '@zappy/core/config/env';
import { Text } from '..';
import { colors, ink, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const DOCS = [
  { key: 'aadhaar', label: 'Aadhaar card', Icon: FileText },
  { key: 'license', label: 'Driving licence', Icon: FileText },
  { key: 'selfie', label: 'Live selfie', Icon: Camera },
];

export function MyKycDocuments({ kycStatus }: { kycStatus: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<{ uri: string; label: string } | null>(null);
  useEffect(() => { getAccessToken().then(setToken).catch(() => setToken(null)); }, []);

  if (kycStatus === 'not_submitted' || !token) return null;
  const source = (key: string) => ({ uri: `${API_BASE_URL}/kyc/stream/${key}`, headers: { Authorization: `Bearer ${token}` } });

  return (
    <View style={styles.card}>
      <View style={styles.row}><Lock size={13} color={ink[400]} /><Text variant="caption" weight="bold" color={ink[500]}>YOUR SUBMITTED DOCUMENTS</Text></View>
      <View style={styles.grid}>
        {DOCS.map(({ key, label, Icon }) => (
          <View key={key} style={styles.cell}>
            <Pressable onPress={() => !failed[key] && setOpen({ uri: source(key).uri, label })} disabled={!!failed[key]} accessibilityRole="imagebutton" accessibilityLabel={label} style={styles.thumb}>
              {failed[key] ? <Icon size={18} color={slate[300]} /> : (
                <Image source={source(key)} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed((f) => ({ ...f, [key]: true }))} />
              )}
            </Pressable>
            <Text variant="caption" weight="semibold" color={ink[500]} style={styles.center}>{label}</Text>
          </View>
        ))}
      </View>
      <Text variant="caption" color={ink[400]} style={styles.center}>Documents are securely stored and cannot be changed without admin approval</Text>
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.viewer} onPress={() => setOpen(null)} accessibilityLabel="Close">
          {open ? <Image source={{ uri: open.uri, headers: { Authorization: `Bearer ${token}` } }} style={styles.viewerImg} resizeMode="contain" /> : null}
          <View style={styles.close}><X size={18} color={ink[900]} /></View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grid: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1, gap: 4 },
  thumb: { aspectRatio: 3 / 4, borderRadius: radius.medium, overflow: 'hidden', borderWidth: 1, borderColor: slate[200], backgroundColor: slate[100], alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: spacing.base },
  viewerImg: { width: '100%', height: '85%' },
  close: { position: 'absolute', top: 56, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
