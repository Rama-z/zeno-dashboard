export const activitySessionGapMs = 60 * 60 * 1000;

export type ActivityGroupingEvent = {
  id: string;
  actorName: string;
  actorEmail: string;
  createdAt: string;
};

export type ActivityActorGroup<T extends ActivityGroupingEvent> = {
  key: string;
  date: string;
  actorName: string;
  actorEmail: string;
  events: T[];
};

const localDateKey = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function splitActivityActorGroups<T extends ActivityGroupingEvent>(
  events: T[],
  maxGapMs = activitySessionGapMs,
): ActivityActorGroup<T>[] {
  const groups: ActivityActorGroup<T>[] = [];
  const latestGroupByActorAndDate = new Map<string, ActivityActorGroup<T>>();
  const newestFirst = [...events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  for (const event of newestFirst) {
    const date = localDateKey(event.createdAt);
    const actorDateKey = `${date}:${event.actorEmail}`;
    const currentGroup = latestGroupByActorAndDate.get(actorDateKey);
    const previousEvent = currentGroup?.events[currentGroup.events.length - 1];
    const gapMs = previousEvent
      ? new Date(previousEvent.createdAt).getTime() - new Date(event.createdAt).getTime()
      : Number.POSITIVE_INFINITY;

    if (currentGroup && gapMs >= 0 && gapMs <= maxGapMs) {
      currentGroup.events.push(event);
      continue;
    }

    const nextGroup: ActivityActorGroup<T> = {
      key: `${actorDateKey}:${event.id}`,
      date,
      actorName: event.actorName,
      actorEmail: event.actorEmail,
      events: [event],
    };
    groups.push(nextGroup);
    latestGroupByActorAndDate.set(actorDateKey, nextGroup);
  }

  return groups;
}
