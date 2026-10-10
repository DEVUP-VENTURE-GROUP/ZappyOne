/**
 * The rules of "What you fix", kept apart from the screens so each is one
 * pass over the catalog.
 */

export interface Repair {
  code: string; name: string; minSkillLevel?: number; estimatedDurationMin?: number; warrantyDays?: number;
  isLocal?: boolean; answers?: string[]; selected?: boolean; usesPart?: boolean;
}
export interface RepairGroup { code: string; name: string; imageUrl?: string; problemCount?: number; repairs: Repair[] }
export interface SkillLevel { level: number; description?: string; requiresVerification?: boolean }

export const levelOf = (r: Repair) => r.minSkillLevel || 1;

/** A repair can sit under two headings; count and tick it once. */
export function uniqueRepairs(groups: RepairGroup[]): Repair[] {
  const byCode = new Map<string, Repair>();
  for (const g of groups) for (const r of g.repairs) if (!byCode.has(r.code)) byCode.set(r.code, r);
  return [...byCode.values()];
}

/** What the provider already claims, as the server sent it. */
export const claimedCodes = (groups: RepairGroup[]) => new Set(uniqueRepairs(groups).filter((r) => r.selected).map((r) => r.code));

/**
 * The lowest level that carries everything ticked. The level cannot go below
 * it: dropping it would silently discard claimed work on save.
 */
export function requiredLevel(repairs: Repair[], selected: Set<string>): number {
  let max = 1;
  for (const r of repairs) if (selected.has(r.code)) max = Math.max(max, levelOf(r));
  return max;
}

/** Every job at or below a level: what "tick all up to my level" adds. */
export const codesUpTo = (repairs: Repair[], level: number) => repairs.filter((r) => levelOf(r) <= level).map((r) => r.code);

/** The highest level in a heading, which ticking all of it raises the provider to. */
export const topLevel = (group: RepairGroup) => group.repairs.reduce((m, r) => Math.max(m, levelOf(r)), 1);

/** Toggle one code, returning a new set. */
export function toggled(selected: Set<string>, code: string): Set<string> {
  const next = new Set(selected);
  if (next.has(code)) next.delete(code); else next.add(code);
  return next;
}

/** Tick or untick every job in a heading, returning a new set. */
export function withGroup(selected: Set<string>, group: RepairGroup, on: boolean): Set<string> {
  const next = new Set(selected);
  for (const r of group.repairs) { if (on) next.add(r.code); else next.delete(r.code); }
  return next;
}
