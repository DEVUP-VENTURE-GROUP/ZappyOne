/**
 * What customers said (the websites' ProviderReviewsPage): rating, breakdown,
 * each review, and reporting one that is not right.
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Flag, EyeOff, MessageSquare, Reply, Star } from 'lucide-react-native';
import { useMyReviewsQuery, useReportReviewMutation, useReplyToReviewMutation } from '@zappy/core/api';
import { Button, EmptyState, ErrorState, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { errText } from '../../lib/feedback';
import { useTl } from '../../lib/i18n';
import { colors, ink, slate, accent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={styles.row} accessibilityLabel={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} color={n <= value ? accent[500] : slate[300]} fill={n <= value ? accent[500] : 'none'} />)}
    </View>
  );
}

type Review = { id: string; rating: number; by: string; service?: string; at: string; text?: string; reported?: boolean; hidden?: boolean; excluded?: boolean; reply?: { text: string; at: string } | null };

function ReportBox({ review, onDone }: { review: Review; onDone: () => void }) {
  const tl = useTl();
  const [reason, setReason] = useState('');
  const [report, { isLoading }] = useReportReviewMutation();
  async function send() {
    try { await report({ id: review.id, reason: reason.trim() }).unwrap(); toast.success(tl('Sent for review. We will look at it and let you know.')); onDone(); }
    catch (err) { toast.error(errText(err, 'That did not go through. Please try again.')); }
  }
  return (
    <View style={styles.gap}>
      <TextInput value={reason} onChangeText={setReason} maxLength={300} multiline placeholder={tl('What is wrong with this review? For example: I did not do this job.')}
        placeholderTextColor={ink[400]} style={styles.area} accessibilityLabel="Why you are reporting this review" />
      <View style={styles.row}>
        <Button label={tl('Send')} size="small" onPress={send} loading={isLoading} disabled={reason.trim().length < 5} />
        <Button label={tl('Cancel')} size="small" variant="outline" onPress={onDone} />
      </View>
    </View>
  );
}

function ReplyBox({ review, onDone }: { review: Review; onDone: () => void }) {
  const tl = useTl();
  const [text, setText] = useState(review.reply?.text || '');
  const [save, { isLoading }] = useReplyToReviewMutation();
  async function send(words: string) {
    try { await save({ id: review.id, text: words }).unwrap(); toast.success(words ? tl('Reply posted. Customers see it under the review.') : tl('Reply removed')); onDone(); }
    catch (err) { toast.error(errText(err, 'That did not go through. Please try again.')); }
  }
  return (
    <View style={styles.gap}>
      <TextInput value={text} onChangeText={setText} maxLength={500} multiline placeholder={tl('Thank the customer, or explain politely. Everyone can read this.')}
        placeholderTextColor={ink[400]} style={styles.area} accessibilityLabel="Your reply" />
      <View style={styles.wrap}>
        <Button label={review.reply ? tl('Save reply') : tl('Post reply')} size="small" onPress={() => send(text.trim())} loading={isLoading} disabled={text.trim().length < 2} />
        {review.reply ? <Button label={tl('Remove')} size="small" variant="outline" disabled={isLoading} onPress={() => send('')} /> : null}
        <Button label={tl('Cancel')} size="small" variant="outline" onPress={onDone} />
      </View>
    </View>
  );
}

export function ProviderReviewsPage() {
  const [page, setPage] = useState(1);
  const [reporting, setReporting] = useState<string | null>(null);
  const [replying, setReplying] = useState<string | null>(null);
  const tl = useTl();
  const { data, isLoading, isError, refetch } = useMyReviewsQuery(page);
  const total: number = data?.reviewCount || 0;
  const reviews: Review[] = data?.reviews || [];

  return (
    <View style={styles.page}>
      <ScreenHeader title={tl('My reviews')} safeArea />
      {isLoading ? <LoadingState /> : isError ? <ErrorState message={tl('Your reviews did not load.')} onRetry={refetch} /> : (
        <FlatList
          data={reviews}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.body}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListHeaderComponent={
            <View style={[styles.card, styles.summary]}>
              <View style={styles.centerCol}>
                <Text variant="display" weight="extrabold">{total ? Number(data.rating).toFixed(1) : '-'}</Text>
                <Stars value={Math.round(data?.rating || 0)} />
                <Text variant="caption" color={ink[500]}>{total ? `${total} review${total === 1 ? '' : 's'}` : 'No reviews yet'}</Text>
              </View>
              <View style={styles.flex}>
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = data?.breakdown?.[n] || 0;
                  return (
                    <View key={n} style={styles.row}>
                      <Text variant="caption" color={ink[500]} style={{ width: 10 }}>{n}</Text>
                      <View style={styles.bar}><View style={[styles.barFill, { width: `${total ? (c / total) * 100 : 0}%` }]} /></View>
                      <Text variant="caption" color={ink[500]} style={{ width: 24, textAlign: 'right' }}>{c}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState title={tl('No reviews yet')} message={tl('Customers can rate you after each finished job. Their reviews show here.')} icon={<MessageSquare size={24} color={ink[400]} />} />}
          renderItem={({ item: r }) => (
            <View style={styles.card}>
              <View style={styles.between}>
                <View style={styles.flex}>
                  <Stars value={r.rating} />
                  <Text variant="caption" color={ink[500]}>{r.by}{r.service ? `, ${r.service}` : ''}, {new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                </View>
                {!r.reported && reporting !== r.id ? (
                  <Pressable onPress={() => setReporting(r.id)} hitSlop={8} style={styles.row}><Flag size={13} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[500]}>{tl('Report')}</Text></Pressable>
                ) : null}
              </View>
              {r.text ? <Text variant="bodySmall">{r.text}</Text> : null}
              <View style={styles.wrap}>
                {r.reported ? <View style={[styles.tag, { backgroundColor: accent[50] }]}><Text variant="caption" weight="semibold" color={accent[700]}>{tl('Reported, being looked at')}</Text></View> : null}
                {r.hidden ? <View style={styles.tag}><EyeOff size={11} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[500]}>{tl('Not shown to customers')}</Text></View> : null}
                {r.excluded ? <View style={styles.tag}><Text variant="caption" weight="semibold" color={ink[500]}>{tl('Not counted in your rating')}</Text></View> : null}
              </View>
              {r.reply && replying !== r.id ? (
                <View style={styles.replyBox}>
                  <Text variant="caption" weight="semibold" color={ink[700]}>{tl('Your reply')}</Text>
                  <Text variant="bodySmall">{r.reply.text}</Text>
                </View>
              ) : null}
              {replying !== r.id && reporting !== r.id && !r.hidden ? (
                <Pressable onPress={() => setReplying(r.id)} hitSlop={8} style={styles.row} accessibilityRole="button">
                  <Reply size={13} color={colors.primary} /><Text variant="caption" weight="semibold" color={colors.primary}>{r.reply ? tl('Edit reply') : tl('Reply')}</Text>
                </Pressable>
              ) : null}
              {replying === r.id ? <ReplyBox review={r} onDone={() => setReplying(null)} /> : null}
              {reporting === r.id ? <ReportBox review={r} onDone={() => setReporting(null)} /> : null}
            </View>
          )}
          ListFooterComponent={data?.pages > 1 ? (
            <View style={[styles.between, { marginTop: spacing.md }]}>
              <Button label={tl('Newer')} size="small" variant="outline" disabled={page <= 1} onPress={() => setPage((p) => p - 1)} />
              <Text variant="caption" color={ink[500]}>Page {page} of {data.pages}</Text>
              <Button label={tl('Older')} size="small" variant="outline" disabled={page >= data.pages} onPress={() => setPage((p) => p + 1)} />
            </View>
          ) : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gap: { gap: spacing.sm },
  centerCol: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  summary: { flexDirection: 'row', gap: spacing.lg },
  bar: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: slate[100], overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: accent[500] },
  replyBox: { backgroundColor: slate[100], borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: slate[100], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  area: { minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: spacing.md, fontSize: 14, fontFamily: 'Figtree-Regular', color: ink[900], textAlignVertical: 'top', backgroundColor: colors.surface },
});
