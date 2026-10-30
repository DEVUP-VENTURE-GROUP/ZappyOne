import { Pressable, StyleSheet } from 'react-native';
import { UserX } from 'lucide-react-native';
import { useReportProviderAbsentMutation } from '@zappy/core/api';
import { Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { ink, slate } from '@zappy/ui/theme/colors';
import { Row, Section } from '../redesign/Section';

export interface JobOptions {
  arrival?: { arrivedAt?: string; late?: boolean; dueBy?: string; scheduled?: boolean };
  providerChangedAt?: string; providerAbsent?: { open?: boolean };
}

// "Is your pro not coming?" once the server opens it (the website's inline note); the arrival promise is in the headline.
export function ProviderStatusNotes({ jobId, noun, options, hasProvider, onChanged }: { jobId: string; noun: string; options?: JobOptions; hasProvider: boolean; onChanged: () => void }) {
  const [reportAbsent, { isLoading }] = useReportProviderAbsentMutation();
  if (!options?.providerAbsent?.open || !hasProvider) return null;

  async function absent() {
    try { const r = await reportAbsent(jobId).unwrap(); toast.success(r.message); onChanged(); }
    catch (err) { toast.error(errText(err, 'Could not report that. Try again.')); }
  }

  return (
    <Section>
      <Row first Icon={UserX} title={`Is your ${noun} not coming?`} sub="Call them first. If they still are not on their way, we will find someone else."
        right={(
          <Pressable onPress={absent} disabled={isLoading} accessibilityRole="button" style={[styles.btn, isLoading && styles.busy]}>
            <Text variant="bodySmall" weight="semibold" color={ink[900]}>Find another</Text>
          </Pressable>
        )} />
    </Section>
  );
}

const styles = StyleSheet.create({
  btn: { height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: slate[200], alignItems: 'center', justifyContent: 'center' },
  busy: { opacity: 0.5 },
});
