/** One booking on the schedule, as core/shared/schedule builds it. */
export interface ScheduleItem {
  key: string; id: string; kind: string; title: string; stage?: string; reference?: string; iconCode?: string;
  href: string; address?: string; when: string; slot?: string; later: boolean;
}
