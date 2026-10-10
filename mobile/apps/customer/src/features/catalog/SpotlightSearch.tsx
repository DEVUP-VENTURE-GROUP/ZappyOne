/**
 * Full-screen search over the live catalog (the website's SpotlightSearch):
 * services, the problem headings inside them, and specific problems, each
 * opening the real booking flow. Only what is live at the customer's location
 * appears; where we don't serve, it says so. Searches are recorded once typing
 * stops, so admin sees what people look for and what we could not serve.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Clock, Search, Wrench, X } from 'lucide-react-native';
import { useLazySmartSearchQuery, useSearchTrendingQuery } from '@zappy/core/api';
import { addRecent, clearRecent, getRecent } from '@zappy/core/lib/recentSearches';
import { trackSearch } from '@zappy/core/lib/telemetry';
import { categoryPhoto, problemPhoto, servicePhoto } from '@zappy/core/shared/problemArt';
import { Button, Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Item { type?: string; code?: string; title?: string; subtitle?: string; path: string; vertical?: string; problemCode?: string; categoryCode?: string; lineCode?: string }
interface Results { query?: string; corrected?: string; notHere?: boolean; empty?: boolean; services?: Item[]; problems?: Item[]; categories?: Item[]; suggestions?: Item[] }

const topResult = (d?: Results | null) => d?.problems?.[0] || d?.services?.[0] || d?.categories?.[0] || null;

/** The result's own photo: the problem's, its heading's, else the service's. */
const photoOf = (it: Item) => webAsset(
  (it.problemCode && problemPhoto(it.vertical, { code: it.problemCode }))
  || (it.categoryCode && categoryPhoto(it.vertical, { code: it.categoryCode }))
  || servicePhoto(it.lineCode) || servicePhoto(it.vertical) || null,
);

/** The typed words in bold, so the customer sees why it matched. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return <>{String(text).split(re).map((part, i) => (i % 2 ? <Text key={i} variant="body" weight="semibold">{part}</Text> : part))}</>;
}

function Row({ item, onOpen, words = [], subtitle = true }: { item: Item; onOpen: (i: Item) => void; words?: string[]; subtitle?: boolean }) {
  const photo = photoOf(item);
  return (
    <Pressable onPress={() => onOpen(item)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.row}>
      <View style={styles.thumb}>{photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} /> : <Wrench size={18} color={slate[400]} />}</View>
      <View style={styles.flex}>
        <Text variant="body" color={ink[700]} numberOfLines={1}><Highlight text={item.title || ''} words={words} /></Text>
        {subtitle && item.subtitle ? <Text variant="caption" color={ink[500]} numberOfLines={1}>{item.subtitle}</Text> : null}
      </View>
      <ChevronRight size={16} color={slate[300]} />
    </Pressable>
  );
}

function Group({ title, items, onOpen, words }: { title: string; items?: Item[]; onOpen: (i: Item) => void; words?: string[] }) {
  if (!items?.length) return null;
  return (
    <View style={styles.group}>
      <Text variant="caption" weight="semibold" color={ink[500]} style={styles.groupTitle}>{title.toUpperCase()}</Text>
      {items.map((it) => <Row key={`${it.type}:${it.code}`} item={it} onOpen={onOpen} words={words} />)}
    </View>
  );
}

/** Problems under the service they belong to, each group ending with the whole service. */
function ProblemGroups({ problems, onOpen, words }: { problems?: Item[]; onOpen: (i: Item) => void; words: string[] }) {
  if (!problems?.length) return null;
  const groups: { lineCode?: string; name?: string; path: string; items: Item[] }[] = [];
  for (const p of problems) {
    let g = groups.find((x) => x.lineCode === p.lineCode);
    if (!g) groups.push((g = { lineCode: p.lineCode, name: p.subtitle, path: p.path.split('?')[0], items: [] }));
    g.items.push(p);
  }
  return (
    <>
      {groups.map((g) => (
        <View key={g.lineCode} style={styles.group}>
          <Text variant="caption" weight="semibold" color={ink[500]} style={styles.groupTitle}>{(g.name || '').toUpperCase()}</Text>
          {g.items.map((it) => <Row key={it.code} item={it} onOpen={onOpen} words={words} subtitle={false} />)}
          <Pressable onPress={() => onOpen({ path: g.path })} style={styles.allRow}>
            <Text variant="bodySmall" weight="semibold" color={zappy[600]}>All {g.name} repairs</Text><ChevronRight size={15} color={zappy[600]} />
          </Pressable>
        </View>
      ))}
    </>
  );
}

export function SpotlightSearch({ open, onClose, lat, lng }: { open: boolean; onClose: () => void; lat?: number; lng?: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [runSearch, state] = useLazySmartSearchQuery();
  const { data: trendData } = useSearchTrendingQuery({ lat, lng }, { skip: !open });

  useEffect(() => { if (open) getRecent().then(setRecent); else setQ(''); }, [open]);

  // Search as they type, after a short pause; repeat queries come from the cache.
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) return undefined;
    const id = setTimeout(() => runSearch({ q: term, lat, lng }, true), 220);
    return () => clearTimeout(id);
  }, [q, open, lat, lng, runSearch]);

  // Record what was searched once typing stops, not every keystroke.
  const logged = useRef('');
  useEffect(() => {
    const d = state.data as Results | undefined;
    const term = q.trim().toLowerCase();
    if (!open || !d || term.length < 3 || logged.current === term || d.query?.toLowerCase() !== term) return undefined;
    const t = setTimeout(() => {
      logged.current = term;
      const top = topResult(d);
      trackSearch({ category: top?.lineCode || 'unmatched', query: term, lat, lng, result: d.empty || d.notHere ? 'no_service' : 'served', userType: 'user' });
    }, 1500);
    return () => clearTimeout(t);
  }, [state.data, q, open, lat, lng]);

  const openResult = useCallback((item: Item) => {
    if (q.trim()) addRecent(q.trim()).then(setRecent);
    onClose();
    router.push(item.path as never);
  }, [q, onClose, router]);

  const term = q.trim();
  const data = term ? (state.data as Results | undefined) : undefined;
  const loading = !!term && (state.isFetching || state.isUninitialized);
  const trending: Item[] = trendData?.trending || [];
  const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 1);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} accessibilityLabel="Close search" hitSlop={8} style={styles.back}><ArrowLeft size={20} color={ink[700]} /></Pressable>
          <View style={styles.input}>
            <Search size={18} color={ink[400]} />
            <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search a service or what’s wrong" placeholderTextColor={ink[400]} returnKeyType="search"
              onSubmitEditing={() => { const top = topResult(data); if (top) openResult(top); }} style={styles.textInput} accessibilityLabel="Search a service or what’s wrong" />
            {q ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear" hitSlop={8}><X size={16} color={ink[500]} /></Pressable> : null}
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }} keyboardShouldPersistTaps="handled">
          {!term ? (
            <>
              {recent.length ? (
                <View style={styles.recentWrap}>
                  <View style={styles.between}>
                    <Text variant="caption" weight="semibold" color={ink[500]}>RECENT</Text>
                    <Pressable onPress={() => clearRecent().then(setRecent)} hitSlop={8}><Text variant="caption" weight="medium" color={ink[500]}>Clear</Text></Pressable>
                  </View>
                  <View style={styles.chips}>
                    {recent.map((r) => (
                      <Pressable key={r} onPress={() => setQ(r)} style={styles.chip}><Clock size={13} color={ink[400]} /><Text variant="bodySmall" color={ink[700]}>{r}</Text></Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              <Group title="Popular near you" items={trending} onOpen={openResult} />
            </>
          ) : null}
          {loading && !data ? <View style={styles.skeletons}>{[0, 1, 2, 3, 4].map((i) => <View key={i} style={styles.skeleton} />)}</View> : null}
          {term && state.isError && !state.isFetching ? (
            <View style={styles.center}>
              <Text variant="body" color={ink[700]}>Search did not load.</Text>
              <Button label="Try again" variant="outline" size="small" onPress={() => runSearch({ q: term, lat, lng })} />
            </View>
          ) : null}
          {data?.notHere ? <Text variant="body" color={ink[700]} style={styles.note}>We don’t serve this location yet, so there’s nothing to book here. Change your address on the home screen.</Text> : null}
          {data && !data.notHere ? (
            <>
              {data.corrected ? <Text variant="caption" color={ink[500]} style={styles.note}>Showing results for “{data.corrected}”</Text> : null}
              <Group title="Services" items={data.services} onOpen={openResult} words={words} />
              <ProblemGroups problems={data.problems} onOpen={openResult} words={words} />
              <Group title="Browse by type of problem" items={data.categories} onOpen={openResult} words={words} />
              {data.empty ? (
                <>
                  <Text variant="body" color={ink[700]} style={styles.note}>No match for “{term}”.</Text>
                  <Group title="You can book these here" items={data.suggestions} onOpen={openResult} />
                </>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: slate[100] },
  back: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.medium, backgroundColor: slate[100] },
  textInput: { flex: 1, fontSize: 16, fontFamily: 'Figtree-Regular', color: ink[900] },
  recentWrap: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingTop: spacing.base },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.medium, backgroundColor: slate[100] },
  group: { paddingTop: spacing.md },
  groupTitle: { paddingHorizontal: spacing.base, paddingBottom: 4, letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  thumb: { width: 48, height: 48, borderRadius: radius.medium, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  allRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  skeletons: { gap: spacing.md, padding: spacing.base },
  skeleton: { height: 40, borderRadius: radius.medium, backgroundColor: slate[100] },
  center: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl },
  note: { paddingHorizontal: spacing.base, paddingTop: spacing.base },
});

