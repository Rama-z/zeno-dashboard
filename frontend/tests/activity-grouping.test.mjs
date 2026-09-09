import assert from 'node:assert/strict';
import test from 'node:test';
import { splitActivityActorGroups } from '../src/activity-grouping.ts';

const event = (id, actorEmail, createdAt) => ({
  id,
  actorName: actorEmail.split('@')[0],
  actorEmail,
  createdAt,
});

test('same actor remains in one activity group at an exact 60 minute gap', () => {
  const groups = splitActivityActorGroups([
    event('newer', 'rama@example.test', '2026-09-09T12:00:00+07:00'),
    event('older', 'rama@example.test', '2026-09-09T11:00:00+07:00'),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].events.map(({ id }) => id), ['newer', 'older']);
});

test('same actor starts a new activity group when the gap exceeds 60 minutes', () => {
  const groups = splitActivityActorGroups([
    event('newer', 'rama@example.test', '2026-09-09T12:01:00+07:00'),
    event('older', 'rama@example.test', '2026-09-09T11:00:00+07:00'),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.events.map(({ id }) => id)), [['newer'], ['older']]);
});

test('actor sessions stay independent while preserving newest-first group order', () => {
  const groups = splitActivityActorGroups([
    event('rama-new', 'rama@example.test', '2026-09-09T12:10:00+07:00'),
    event('maya', 'maya@example.test', '2026-09-09T12:05:00+07:00'),
    event('rama-near', 'rama@example.test', '2026-09-09T11:20:00+07:00'),
    event('rama-old', 'rama@example.test', '2026-09-09T09:00:00+07:00'),
  ]);

  assert.deepEqual(groups.map((group) => group.events.map(({ id }) => id)), [
    ['rama-new', 'rama-near'],
    ['maya'],
    ['rama-old'],
  ]);
});
