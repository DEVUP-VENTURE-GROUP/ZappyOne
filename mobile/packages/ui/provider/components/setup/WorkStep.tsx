/**
 * What the provider fixes: the headings a customer sees, with the work under
 * each. Ticking work above the stated level raises the level rather than
 * refusing the tick; the server still checks a level that needs verification
 * before that work reaches anyone.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useRepairWorkCatalogQuery, useSaveRepairCapabilitiesMutation } from '@zappy/core/api';
import { Button, LoadingState, Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { errText } from '../../../lib/feedback';
import { zappy } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { HeadingTile } from './HeadingTile';
import { MissingWorkSheet } from './MissingWorkSheet';
import { RepairTick } from './RepairTick';
import { SkillLevelCard } from './SkillLevelCard';
import { StepShell } from './StepShell';
import { workModesFor } from './setupFlow';
import {
  claimedCodes, codesUpTo, levelOf, requiredLevel, toggled, topLevel, uniqueRepairs, withGroup,
  type Repair, type RepairGroup, type SkillLevel,
} from './workSelection';

export function WorkStep({ vertical, cityCode, brandCodes, onBack, onNext }: { vertical: string; cityCode: string; brandCodes: string[]; onBack: () => void; onNext: () => void }) {
  const { data, isLoading, refetch } = useRepairWorkCatalogQuery({ vertical, cityCode });
  const [save, { isLoading: saving }] = useSaveRepairCapabilitiesMutation();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [skillLevel, setSkillLevel] = useState(2);
  const [missingOpen, setMissingOpen] = useState(false);

  const groups: RepairGroup[] = useMemo(() => data?.groups || [], [data]);
  const repairs = useMemo(() => uniqueRepairs(groups), [groups]);

  // Seed from what the server already knows, once.
  useEffect(() => {
    if (!data || selected) return;
    setSelected(claimedCodes(groups));
    setSkillLevel(data.skillLevel || 2);
  }, [data, groups, selected]);

  const raiseTo = useCallback((level: number) => setSkillLevel((l) => Math.max(l, level)), []);
  const onTick = useCallback((r: Repair) => { setSelected((s) => toggled(s || new Set(), r.code)); raiseTo(levelOf(r)); }, [raiseTo]);
  const setGroup = useCallback((g: RepairGroup, on: boolean) => { setSelected((s) => withGroup(s || new Set(), g, on)); if (on) raiseTo(topLevel(g)); }, [raiseTo]);

  if (isLoading || !selected) return <LoadingState />;

  const levels: SkillLevel[] = data.skillLevels || [];
  const upTo = codesUpTo(repairs, skillLevel);
  const allUpToTicked = upTo.length > 0 && upTo.every((c) => selected.has(c));

  async function persist(): Promise<boolean> {
    try {
      const res = await save({
        vertical, repairCodes: [...selected!], candidateCodes: repairs.map((r) => r.code), brandCodes, skillLevel, serviceModes: workModesFor(vertical),
      }).unwrap();
      await refetch();
      if (res.skipped?.length) { toast.error(`${res.skipped.length} need a higher skill level. Raise it or untick them.`); return false; }
      return true;
    } catch (err) { toast.error(errText(err, 'Could not save')); return false; }
  }

  // Inside one heading
  const group = openGroup ? groups.find((g) => g.code === openGroup) : null;
  if (group) {
    const all = group.repairs.every((r) => selected.has(r.code));
    return (
      <>
        {missingOpen ? <MissingWorkSheet vertical={vertical} group={group} cityCode={cityCode} onClose={() => setMissingOpen(false)} /> : null}
        <StepShell title={group.name} hint="Tick everything you can do. One job here answers several of the issues customers search for."
          onBack={() => setOpenGroup(null)} onNext={async () => { if (await persist()) setOpenGroup(null); }} busy={saving} nextLabel="Save">
          <Button label={all ? 'Untick all in this heading' : 'Tick all in this heading'} variant="outline" onPress={() => setGroup(group, !all)} fullWidth />
          {group.repairs.map((r) => <RepairTick key={r.code} repair={r} on={selected.has(r.code)} myLevel={skillLevel} onToggle={onTick} />)}
          <Pressable onPress={() => setMissingOpen(true)} accessibilityRole="button" style={styles.link}>
            <Plus size={15} color={zappy[600]} /><Text variant="bodySmall" weight="semibold" color={zappy[600]}>I do something not listed here</Text>
          </Pressable>
        </StepShell>
      </>
    );
  }

  // The headings
  return (
    <StepShell title="What do you fix?" hint="Pick your level and tick everything at once, or open a heading to choose job by job."
      onBack={onBack} onNext={async () => { if (await persist()) onNext(); }} busy={saving} canNext={selected.size > 0}
      nextLabel={selected.size ? `Continue with ${selected.size} jobs` : 'Pick at least one job'}>
      <SkillLevelCard levels={levels} level={skillLevel} required={requiredLevel(repairs, selected)} upToCount={upTo.length} allUpToTicked={allUpToTicked}
        selectedCount={selected.size} onLevel={setSkillLevel} onTickUpTo={() => setSelected((s) => new Set([...(s || []), ...upTo]))} onUntickAll={() => setSelected(new Set())} />
      <View style={styles.grid}>
        {groups.map((g) => (
          <HeadingTile key={g.code} group={g} count={g.repairs.reduce((n, r) => n + (selected.has(r.code) ? 1 : 0), 0)}
            onOpen={() => setOpenGroup(g.code)} onToggleAll={(on) => setGroup(g, on)} />
        ))}
      </View>
    </StepShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md },
});
