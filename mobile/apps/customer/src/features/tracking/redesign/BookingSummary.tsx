import { Pressable, StyleSheet, View } from 'react-native';
import { Clock, FileText, Hash, MapPin, ReceiptText, UserRound, Wallet, Wrench } from 'lucide-react-native';
import { rupeesOf, shortId } from '@zappy/core/shared/trackingSteps';
import { Text } from '@zappy/ui/components';
import { ink, success } from '@zappy/ui/theme/colors';
import type { TrackedJob } from '../types';
import { Row, Section } from './Section';

// Booking details as UC lists them (the website's BookingSummary): when, where, what and the money; only lines the server recorded.
export function BookingSummary({ job, onReceipt, onEditPlace, contact, onEditContact }: {
  job: TrackedJob; onReceipt?: () => void; onEditPlace?: () => void; contact?: { onSite?: { name: string; phone: string } | null }; onEditContact?: () => void;
}) {
  const price = job.price;
  const when = job.scheduledAt || job.createdAt;
  const lines = (price.lines || []).filter(([, paise]) => paise && paise !== 0);
  const totalLabel = price.isEstimate ? 'estimated total' : price.paid ? 'paid' : 'total amount';
  return (
    <Section title="Booking details">
      {when ? <Row first Icon={Clock} title={new Date(when).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} sub={job.scheduledAt ? 'Booked for' : 'Booked at'} /> : null}
      {job.place?.address ? <Row first={!when} Icon={MapPin} title={job.place.address} right={onEditPlace ? <Pressable onPress={onEditPlace} accessibilityRole="button" hitSlop={8}><Text variant="bodySmall" weight="bold" style={styles.edit}>Edit</Text></Pressable> : undefined} /> : null}
      {contact?.onSite || onEditContact ? (
        <Row Icon={UserRound} title={contact?.onSite ? `${contact.onSite.name}, ${contact.onSite.phone}` : 'You'} sub="Who the pro meets"
          right={onEditContact ? <Pressable onPress={onEditContact} accessibilityRole="button" hitSlop={8}><Text variant="bodySmall" weight="bold" style={styles.edit}>{contact?.onSite ? 'Edit' : 'Change'}</Text></Pressable> : undefined} />
      ) : null}
      <Row Icon={Wrench} title={<Text variant="body" style={styles.cap}>{job.service}</Text>} sub={job.subtitle ? `${job.subtitleLabel || 'For'}: ${job.subtitle}` : undefined} />
      {price.method ? <Row Icon={Wallet} title={price.method} sub="Payment" /> : null}
      {price.totalPaise != null ? (
        <Row Icon={ReceiptText}
          title={<Text variant="body"><Text variant="body" weight="bold">{rupeesOf(price.totalPaise)}</Text> {totalLabel}</Text>}
          sub={lines.length || price.note ? (
            <View style={styles.lines}>
              {lines.map(([label, paise]) => (
                <View key={label} style={styles.line}>
                  <Text variant="bodySmall" color={ink[500]} style={styles.flex}>{label}</Text>
                  <Text variant="bodySmall" color={paise < 0 ? success[700] : ink[700]}>{paise < 0 ? `− ${rupeesOf(-paise)}` : rupeesOf(paise)}</Text>
                </View>
              ))}
              {price.note ? <Text variant="caption" color={ink[500]}>{price.note}</Text> : null}
            </View>
          ) : undefined} />
      ) : null}
      {onReceipt ? <Row Icon={FileText} title="Download receipt" onPress={onReceipt} /> : null}
      <Row Icon={Hash} title={job.reference || `#${shortId(job.id)}`} sub="Booking ID" />
    </Section>
  );
}

const styles = StyleSheet.create({
  cap: { textTransform: 'capitalize' },
  edit: { textDecorationLine: 'underline' },
  lines: { gap: 4, marginTop: 6 },
  line: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
});
