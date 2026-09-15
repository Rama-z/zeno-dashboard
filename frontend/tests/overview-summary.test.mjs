import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOverviewSummary, overviewDateRange } from '../src/overview-summary.ts';

const now = new Date('2026-09-15T12:00:00+07:00');

test('overviewDateRange uses local Monday-Sunday week and calendar month', () => {
  assert.deepEqual(overviewDateRange(now), {
    today: '2026-09-15',
    weekStart: '2026-09-14',
    weekEnd: '2026-09-20',
    monthStart: '2026-09-01',
    monthEnd: '2026-09-30',
  });
});

test('calculateOverviewSummary keeps module definitions explicit', () => {
  const summary = calculateOverviewSummary({
    now,
    doing: [
      { id: 'd1', date: '2026-09-15', title: 'Priority', status: 'doing', priority: 'high', completed: false },
      { id: 'd2', date: '2026-09-14', title: 'Blocked', status: 'blocked', priority: 'medium', completed: false },
      { id: 'd3', date: '2026-09-15', title: 'Done', status: 'done', priority: 'high', completed: true, completedAt: '2026-09-15T09:00:00+07:00' },
    ],
    learning: [
      { id: 'l1', date: '2026-09-15', title: 'Today', completed: false },
      { id: 'l2', date: '2026-09-20', title: 'Week', completed: true },
    ],
    workouts: [
      { id: 'w1', name: 'Today plan', date: '2026-09-15', status: 'planned', movements: [] },
      { id: 'w2', name: 'Partial counts', date: '2026-09-14', status: 'partial', movements: [] },
      { id: 'w3', name: 'Skipped does not count', date: '2026-09-16', status: 'skipped', movements: [] },
    ],
    journals: [
      { id: 'j1', date: '2026-09-01', title: 'Older', updatedAt: '2026-09-01T08:00:00+07:00' },
      { id: 'j2', date: '2026-09-15', title: 'Latest', updatedAt: '2026-09-15T08:00:00+07:00' },
    ],
    spending: [
      { id: 's1', date: '2026-09-01', amount: 12500 },
      { id: 's2', date: '2026-08-31', amount: 50000 },
    ],
  });

  assert.equal(summary.doing.active, 2);
  assert.equal(summary.doing.blocked, 1);
  assert.equal(summary.doing.completedToday, 1);
  assert.equal(summary.learning.thisWeek, 2);
  assert.equal(summary.workout.completedThisWeek, 1);
  assert.equal(summary.workout.plannedThisWeek, 1);
  assert.equal(summary.journaling.thisMonth, 2);
  assert.equal(summary.journaling.latest?.id, 'j2');
  assert.equal(summary.spending.thisMonth, 12500);
  assert.equal(summary.spending.transactions, 1);
  assert.deepEqual(summary.today.priorityDoing.map((entry) => entry.id), ['d1']);
  assert.deepEqual(summary.today.learning.map((entry) => entry.id), ['l1']);
  assert.equal(summary.today.workout?.id, 'w1');
});

test('overview source includes real navigation, motion controls, and preserved session log', async () => {
  const [{ readFile }, { default: path }] = await Promise.all([import('node:fs/promises'), import('node:path')]);
  const root = path.resolve(import.meta.dirname, '..');
  const [main, styles, overviewStyles] = await Promise.all([readFile(path.join(root, 'src/main.ts'), 'utf8'), readFile(path.join(root, 'src/styles.css'), 'utf8'), readFile(path.join(root, 'src/overview.css'), 'utf8')]);
  const source = main + styles + overviewStyles;
  for (const marker of ['overview-home', 'overview-module-grid', 'overview-focus', 'overview-activity', 'overview-quick-actions', 'overview-changes', 'overview-session-log', 'data-overview-motion']) {
    assert.match(source, new RegExp(marker), `missing ${marker}`);
  }
  assert.match(main, /renderSessionEntriesContent/);
  assert.match(main, /zeno-overview-motion-v1/);
  assert.match(main, /prefers-reduced-motion/);
  assert.match(main, /requestAnimationFrame/);
  assert.match(main, /listen\(window, 'scroll'/, 'overview must provide disposable scroll parallax');
  assert.match(main, /Promise\.allSettled/, 'overview synchronization must preserve successful modules during partial failure');
  assert.match(main, /overviewFailedSources/, 'overview must track source-specific failure states');
  assert.match(main, /data-overview-route=/);
  assert.match(overviewStyles, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
  assert.match(overviewStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
