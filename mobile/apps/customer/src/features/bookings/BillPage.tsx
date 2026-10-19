// A finished booking's bill on its own screen, drawn from the same figures as the PDF; the PDF stays one tap away.
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileDown } from 'lucide-react-native';
import { useJobBillQuery, useOrderBillQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Button, ErrorState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { useOpenDocument } from '@zappy/ui/lib/openDocument';
import { colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Bill {
  title: string; number: string; issuedOn: string | null;
  business: { name: string; legalName: string; address: string; gstin: string; email: string };
  customer: { name: string; phone: string; address: string };
  service: string; provider: string | null; reference: string;
  lines: { label: string; paise: number }[]; totalPaise: number; paidBy: string | null; paid: boolean;
}

const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
const money = (p: number) => (p < 0 ? `− ${formatPaise(-p)}` : formatPaise(p));

export function BillPage() {
  const router = useRouter();
  const { source, id } = useLocalSearchParams<{ source?: string; id?: string }>();
  const isOrder = source === 'order';
  const job = useJobBillQuery(id as string, { skip: !id || isOrder });
  const order = useOrderBillQuery(id as string, { skip: !id || !isOrder });
  const q = isOrder ? order : job;
  const bill = (q.data as { bill?: Bill } | undefined)?.bill;
  const { open, opening } = useOpenDocument();
  const pdf = isOrder ? `/api/orders/${id}/invoice` : `/api/jobs/${id}/receipt`;

  return (
    <View style={styles.page}>
      <ScreenHeader title={bill?.title || 'Bill'} safeArea onBack={() => router.back()} />
      {q.isLoading ? <LoadingState rows={4} /> : q.isError || !bill ? (
        <ErrorState message="Could not load this bill." onRetry={() => q.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.card}>
            <View style={styles.head}>
              <View style={styles.flex}>
                <Text variant="heading3" weight="black" color={zappy[700]}>{bill.business.name}</Text>
                {bill.business.legalName ? <Text variant="caption" color={ink[500]}>A venture of {bill.business.legalName}</Text> : null}
                {bill.business.gstin ? <Text variant="caption" color={ink[500]}>GSTIN {bill.business.gstin}</Text> : null}
              </View>
              <View style={styles.right}>
                <Text variant="caption" weight="bold" color={ink[500]}>No. {bill.number}</Text>
                <Text variant="caption" color={ink[500]}>{day(bill.issuedOn)}</Text>
                <View style={[styles.badge, { backgroundColor: bill.paid ? success[50] : slate[100] }]}>
                  <Text variant="caption" weight="bold" color={bill.paid ? success[700] : ink[500]}>{bill.paid ? 'PAID' : 'DUE'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text variant="caption" weight="bold" color={ink[400]}>SERVICE</Text>
              <Text variant="bodySmall" weight="semibold" style={styles.cap}>{bill.service}</Text>
              {bill.provider ? <Text variant="caption" color={ink[500]}>By {bill.provider}</Text> : null}
              <Text variant="caption" color={ink[500]}>Booking {bill.reference}</Text>
            </View>

            <View style={styles.section}>
              <Text variant="caption" weight="bold" color={ink[400]}>BILLED TO</Text>
              <Text variant="bodySmall" weight="semibold">{bill.customer.name || 'Customer'}</Text>
              {bill.customer.address ? <Text variant="caption" color={ink[500]}>{bill.customer.address}</Text> : null}
            </View>

            <View style={styles.lines}>
              {bill.lines.map((l, i) => (
                <View key={`${l.label}${i}`} style={styles.line}>
                  <Text variant="bodySmall" color={ink[700]} style={styles.flex}>{l.label}</Text>
                  <Text variant="bodySmall" color={l.paise < 0 ? success[700] : ink[900]}>{money(l.paise)}</Text>
                </View>
              ))}
              <View style={[styles.line, styles.total]}>
                <Text variant="body" weight="black" style={styles.flex}>Total</Text>
                <Text variant="body" weight="black" color={zappy[700]}>{money(bill.totalPaise)}</Text>
              </View>
              {bill.paidBy ? <Text variant="caption" color={ink[500]}>Paid by {bill.paidBy}{bill.paid ? '' : ' (due)'}</Text> : null}
            </View>
          </View>

          <Button label="Download PDF" variant="outline" icon={<FileDown size={15} color={ink[700]} />} loading={opening === pdf} onPress={() => open(pdf)} fullWidth />
          {bill.business.email ? <Text variant="caption" color={ink[400]} align="center">Questions about this bill? {bill.business.email}</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.base, paddingBottom: 80, gap: spacing.md },
  card: { padding: spacing.base, gap: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 2, borderBottomColor: zappy[500] },
  flex: { flex: 1, minWidth: 0 },
  right: { alignItems: 'flex-end', gap: 2 },
  badge: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  section: { gap: 2 },
  cap: { textTransform: 'capitalize' },
  lines: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  total: { paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
});
