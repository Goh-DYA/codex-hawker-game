import type { RuntimeEvent } from "./types";

export interface ActivityEntry extends RuntimeEvent {
  readonly id: number;
  readonly count: number;
}

export function shouldShowPopup(event: RuntimeEvent): boolean {
  if (event.importance) return event.importance === "important";
  return event.kind === "warning" || event.kind === "error";
}

export function appendActivityEvent(
  current: readonly ActivityEntry[],
  event: RuntimeEvent,
  id: number,
  limit = 60,
): readonly ActivityEntry[] {
  const latest = current[0];
  if (event.groupKey && latest?.groupKey === event.groupKey) {
    return [
      {
        ...latest,
        ...event,
        id: latest.id,
        count: latest.count + 1,
        amount: (latest.amount ?? 0) + (event.amount ?? 0),
      },
      ...current.slice(1),
    ];
  }

  return [{ ...event, id, count: 1 }, ...current].slice(0, Math.max(1, limit));
}

export function activityEntryMessage(entry: ActivityEntry): string {
  if (entry.groupKey === "sales" && entry.count > 1) {
    return `${entry.count} neighbours enjoyed their meals · +$${Math.round(entry.amount ?? 0)}`;
  }
  return entry.message;
}
