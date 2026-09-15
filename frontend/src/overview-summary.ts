export type OverviewDoing = {
  id: string;
  date: string;
  title: string;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
  completedAt?: string;
  timeBlockStart?: string;
  estimatedMinutes?: number;
  energyFocus?: 'deep' | 'medium' | 'light';
};

export type OverviewLearning = { id: string; date: string; title: string; completed: boolean };
export type OverviewWorkout = { id: string; name: string; date: string; status: 'planned' | 'in_progress' | 'completed' | 'partial' | 'skipped'; localTime?: string; estimatedMinutes?: number; movements: unknown[] };
export type OverviewJournal = { id: string; date: string; title: string; updatedAt: string };
export type OverviewSpending = { id: string; date: string; amount: number };

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function overviewDateRange(now = new Date()) {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const day = local.getDay() || 7;
  const monday = new Date(local);
  monday.setDate(local.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const monthStart = new Date(local.getFullYear(), local.getMonth(), 1, 12);
  const monthEnd = new Date(local.getFullYear(), local.getMonth() + 1, 0, 12);
  return {
    today: localDateKey(local),
    weekStart: localDateKey(monday),
    weekEnd: localDateKey(sunday),
    monthStart: localDateKey(monthStart),
    monthEnd: localDateKey(monthEnd),
  };
}

function inRange(value: string, start: string, end: string) {
  return value >= start && value <= end;
}

export function calculateOverviewSummary(input: {
  now?: Date;
  doing: OverviewDoing[];
  learning: OverviewLearning[];
  workouts: OverviewWorkout[];
  journals: OverviewJournal[];
  spending: OverviewSpending[];
}) {
  const range = overviewDateRange(input.now);
  const weekLearning = input.learning.filter((entry) => inRange(entry.date, range.weekStart, range.weekEnd));
  const weekWorkouts = input.workouts.filter((entry) => inRange(entry.date, range.weekStart, range.weekEnd));
  const monthJournals = input.journals.filter((entry) => inRange(entry.date, range.monthStart, range.monthEnd));
  const monthSpending = input.spending.filter((entry) => inRange(entry.date, range.monthStart, range.monthEnd));
  const activeDoing = input.doing.filter((entry) => entry.status !== 'done' && !entry.completed);
  const priorityRank = { high: 0, medium: 1, low: 2 } as const;
  const todayPriorityDoing = activeDoing
    .filter((entry) => entry.date === range.today)
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || (a.timeBlockStart ?? '').localeCompare(b.timeBlockStart ?? ''))
    .slice(0, 3);
  const todayWorkout = input.workouts
    .filter((entry) => entry.date === range.today && (entry.status === 'planned' || entry.status === 'in_progress'))
    .sort((a, b) => (a.localTime ?? '').localeCompare(b.localTime ?? ''))[0];
  const latestJournal = [...input.journals].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];

  return {
    range,
    doing: {
      active: activeDoing.length,
      blocked: activeDoing.filter((entry) => entry.status === 'blocked').length,
      completedToday: input.doing.filter((entry) => entry.completedAt && localDateKey(new Date(entry.completedAt)) === range.today).length,
    },
    learning: { thisWeek: weekLearning.length, completedThisWeek: weekLearning.filter((entry) => entry.completed).length },
    workout: {
      completedThisWeek: weekWorkouts.filter((entry) => entry.status === 'completed' || entry.status === 'partial').length,
      plannedThisWeek: weekWorkouts.filter((entry) => entry.status === 'planned' || entry.status === 'in_progress').length,
    },
    journaling: { thisMonth: monthJournals.length, latest: latestJournal },
    spending: { thisMonth: monthSpending.reduce((total, entry) => total + entry.amount, 0), transactions: monthSpending.length },
    today: {
      priorityDoing: todayPriorityDoing,
      learning: input.learning.filter((entry) => entry.date === range.today).slice(0, 3),
      workout: todayWorkout,
    },
  };
}
