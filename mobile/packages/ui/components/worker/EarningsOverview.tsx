/**
 * This week's earnings, the change from last week and the seven-day chart (the
 * websites' DashboardUI EarningsOverview), shared by the technician's and the
 * shop owner's home.
 */
import { StyleSheet, View } from 'react-native';
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { Text } from '..';
import { colors, danger, success } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { LinkButton, Panel, inr } from './DashboardUI';
import { WeekChart } from './WeekChart';

export function EarningsOverview({ weekRupees, deltaPct, points, onViewDetails }: {
  weekRupees: number; deltaPct: number; points: { label: string; value: number }[]; onViewDetails: () => void;
}) {
  const up = deltaPct >= 0;
  return (
    <Panel title="Earnings overview" action={<LinkButton label="View details" onPress={onViewDetails} />}>
      <Text variant="caption" color={colors.textSecondary}>This week</Text>
      <Text variant="heading1" weight="black">{inr(weekRupees)}</Text>
      <View style={styles.inline}>
        {up ? <TrendingUp size={13} color={success[600]} /> : <TrendingDown size={13} color={danger[600]} />}
        <Text variant="caption" weight="bold" color={up ? success[600] : danger[600]}>{up ? '+' : ''}{deltaPct}% from last week</Text>
      </View>
      <View style={styles.chart}><WeekChart points={points} /></View>
    </Panel>
  );
}

/** The seven days from the shared week helpers, as chart points in rupees. */
export const weekPoints = (week: { date: string; earningsPaise: number }[]) =>
  week.map((d) => ({ label: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' }), value: Math.round(d.earningsPaise / 100) }));

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chart: { marginTop: spacing.md },
});
