import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SerializedSessionSaveQueue } from '../src/session-save-queue.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('session saves serialize per session without dropping optimistic mutations', async () => {
  const writes = [];
  const pending = [];
  const local = new Map([
    ['session-a', { updatedAt: 'a-v1', timer: 0, completedSets: 0 }],
    ['session-b', { updatedAt: 'b-v1', timer: 0, completedSets: 0 }],
  ]);
  const queue = new SerializedSessionSaveQueue((id, snapshot) => {
    writes.push({ id, snapshot });
    const request = deferred();
    pending.push(request);
    return request.promise;
  });
  const callbacks = {
    optimistic: (id, snapshot) => local.set(id, snapshot),
    success: (id, saved, hasQueuedSuccessor) => {
      if (!hasQueuedSuccessor) local.set(id, saved);
    },
    failure: () => assert.fail('save unexpectedly failed'),
  };

  queue.enqueue('session-a', { ...local.get('session-a'), timer: 15 }, callbacks);
  queue.enqueue('session-a', { ...local.get('session-a'), completedSets: 1 }, callbacks);
  queue.enqueue('session-b', { ...local.get('session-b'), timer: 30 }, callbacks);

  assert.deepEqual(local.get('session-a'), { updatedAt: 'a-v1', timer: 15, completedSets: 1 });
  assert.equal(writes.length, 2, 'different sessions should save concurrently while one same-session mutation waits');
  assert.deepEqual(writes.map(({ id }) => id), ['session-a', 'session-b']);

  pending[0].resolve({ ...writes[0].snapshot, updatedAt: 'a-v2' });
  await tick();

  assert.equal(writes.length, 3, 'the queued same-session snapshot must be written exactly once');
  assert.deepEqual(writes[2], {
    id: 'session-a',
    snapshot: { updatedAt: 'a-v2', timer: 15, completedSets: 1 },
  });

  pending[1].resolve({ ...writes[1].snapshot, updatedAt: 'b-v2' });
  pending[2].resolve({ ...writes[2].snapshot, updatedAt: 'a-v3' });
  await tick();

  assert.equal(queue.hasPending(), false);
  assert.deepEqual(local.get('session-a'), { updatedAt: 'a-v3', timer: 15, completedSets: 1 });
  assert.deepEqual(local.get('session-b'), { updatedAt: 'b-v2', timer: 30, completedSets: 0 });
});

test('failed session save stays queued and retries its draft before later snapshots', async () => {
  const writes = [];
  const responses = [Promise.reject(new Error('offline')), Promise.resolve({ updatedAt: 'v2', note: 'first' }), Promise.resolve({ updatedAt: 'v3', note: 'second' })];
  const failures = [];
  const successes = [];
  const queue = new SerializedSessionSaveQueue((id, snapshot) => {
    writes.push({ id, snapshot });
    return responses.shift();
  });
  const callbacks = {
    optimistic: () => {},
    success: (_id, saved) => successes.push(saved.note),
    failure: (_id, error) => failures.push(error.message),
  };

  queue.enqueue('session-a', { updatedAt: 'v1', note: 'first' }, callbacks);
  queue.enqueue('session-a', { updatedAt: 'v1', note: 'second' }, callbacks);
  await tick();

  assert.deepEqual(failures, ['offline']);
  assert.equal(writes.length, 1);
  assert.equal(queue.retryFailed(), true);
  await tick();
  await tick();

  assert.deepEqual(successes, ['first', 'second']);
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[2].snapshot, { updatedAt: 'v2', note: 'second' });
  assert.equal(queue.hasPending(), false);
});
