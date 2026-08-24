/**
 * "Live status" — the lifecycle rail.
 * ----------------------------------------------------------------------------
 * Ported from `client/src/components/tracking/redesign/PremiumTimeline.jsx`.
 * Six nodes, a connector between them, and a real timestamp on every step the
 * order has actually passed through.
 *
 * ── THE TIMES ARE REAL ─────────────────────────────────────────────────────
 * `timesByStatus` is built from `GET /orders/:id/timeline`, which returns the
 * order's own `statusHistory` — `[{ status, at }]`. A step with no entry shows
 * nothing rather than a guess, and the current step shows "Now". The website
 * does exactly this, including folding `created` into the `searching` step
 * because the customer does not distinguish the two.
 *
 * `useGetOrderTimelineQuery` already existed and was never called by any
 * screen; this is its first consumer.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, Zap } from 'lucide-react-native';
import { Card, Text } from '../ui';
import { STEPS, fmtTime } from './trackingMeta';
import { colors, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { fontFamily } from '../../theme/typography';
import type { OrderStatusHistoryEntry } from '../../types/api';

export interface StatusTimelineProps {
  activeStepIdx: number;
  /** Straight from `GET /orders/:id/timeline`. */
  history?: OrderStatusHistoryEntry[];
}

function StatusTimelineBase({ activeStepIdx, history = [] }: StatusTimelineProps) {
  /** status → first time it was reached. */
  const timesByStatus = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of history) {
      const key = entry.status;
      if (key && entry.at && !map[key]) map[key] = entry.at;
    }
    return map;
  }, [history]);

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.heading}>Live status</Text>
        <View style={styles.realtime}>
          <Zap size={12} strokeWidth={2.5} color={zappy[700]} fill={zappy[700]} />
          <Text variant="caption" weight="bold" color={zappy[700]}>
            Real-time
          </Text>
        </View>
      </View>

      <View>
        {STEPS.map((step, i) => {
          const done = activeStepIdx > i;
          const current = activeStepIdx === i;
          const last = i === STEPS.length - 1;
          // `searching` inherits the `created` timestamp, as on the web.
          const at =
            timesByStatus[step.key] ??
            (step.key === 'searching' ? timesByStatus.created : undefined);

          return (
            <View key={step.key} style={styles.row}>
              {/* Rail — node + connector */}
              <View style={styles.rail}>
                <View
                  style={[
                    styles.node,
                    done ? styles.nodeDone : current ? styles.nodeCurrent : styles.nodeIdle,
                  ]}
                >
                  {done ? (
                    <Check size={16} strokeWidth={2.6} color={colors.textInverse} />
                  ) : (
                    <View
                      style={[styles.pip, current ? styles.pipCurrent : styles.pipIdle]}
                    />
                  )}
                </View>
                {!last ? (
                  <View style={[styles.connector, done ? styles.connectorDone : null]} />
                ) : null}
              </View>

              <View style={[styles.body, last ? null : styles.bodySpaced]}>
                <View style={styles.labelRow}>
                  <Text
                    variant="bodySmall"
                    weight={current ? 'bold' : 'semibold'}
                    color={done || current ? colors.textHeading : colors.textMuted}
                    style={styles.flex}
                  >
                    {step.label}
                  </Text>
                  {current ? (
                    <Text variant="caption" weight="bold" color={colors.primary}>
                      Now
                    </Text>
                  ) : at ? (
                    <Text variant="caption" color={colors.textMuted}>
                      {fmtTime(at)}
                    </Text>
                  ) : null}
                </View>
                <Text
                  variant="caption"
                  color={done || current ? colors.textSecondary : colors.textMuted}
                >
                  {step.desc}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export const StatusTimeline = memo(StatusTimelineBase);

const styles = StyleSheet.create({
  card: { padding: 18 },
  flex: { flex: 1 },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.base,
  },
  heading: {
    fontFamily: fontFamily.extrabold,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.32,
    color: colors.textHeading,
  },
  realtime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: zappy[50],
    borderRadius: radius.small,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },

  row: { flexDirection: 'row', gap: spacing.md + 2 },
  rail: { alignItems: 'center' },
  // `w-[34px] h-[34px] rounded-full`
  node: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDone: { backgroundColor: zappy[600] },
  nodeCurrent: { backgroundColor: zappy[600] },
  nodeIdle: { backgroundColor: slate[100], borderWidth: 1.5, borderColor: '#E3E9F3' },
  pip: { width: 10, height: 10, borderRadius: 5 },
  pipCurrent: { backgroundColor: colors.textInverse },
  pipIdle: { backgroundColor: '#B4C0D4' },
  connector: { flex: 1, width: 2, backgroundColor: '#E3E9F3', marginVertical: 2 },
  connectorDone: { backgroundColor: zappy[200] },

  body: { flex: 1, paddingTop: spacing.xs },
  bodySpaced: { paddingBottom: spacing.lg },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
