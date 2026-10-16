import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { attachRemote } = createRequire(import.meta.url)('../execution/remote-run.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function observer(overrides = {}) {
  const run = { status: 'running' }, events = [], terminals = [], journal = [];
  const host = {
    pushEvent: (_run, event) => events.push(event),
    flush: () => journal.push('flush'),
    recordCancel: () => journal.push('cancel-intent'),
    finish: (_run, terminal) => { terminals.push(terminal); run.status = terminal.status; },
    ...overrides,
  };
  return { run, events, terminals, journal, host };
}
const uncertain = view => view.events.some(event => event.subtype === 'remote_uncertain');

test('an unavailable or invalid remote handle cannot report failure or completion of the remote task', async () => {
  const incomplete = [null, {}, { done: true }, { done: {} }, { done: Promise.resolve({ status: 'done' }) }, { done: Promise.resolve({ status: 'done' }), cancel() {} }];
  for (const value of incomplete) {
    const v = observer();
    attachRemote(v.run, () => value, v.host);
    await tick();
    assert.equal(v.run.status, 'running');
    assert.deepEqual(v.terminals, []);
    assert.equal(uncertain(v), true);
  }
  for (const open of [() => { throw Error('private transport detail'); }, () => Promise.reject(Error('private transport detail'))]) {
    const v = observer();
    attachRemote(v.run, open, v.host);
    await tick();
    assert.equal(v.run.status, 'running');
    assert.deepEqual(v.terminals, []);
    assert.equal(uncertain(v), true);
    assert.equal(JSON.stringify(v.events).includes('private transport detail'), false);
  }
});

test('cancel before handle admission persists its intent and still waits for authoritative confirmation', async () => {
  const admission = deferred(), terminal = deferred(), v = observer();
  let cancels = 0;
  attachRemote(v.run, () => admission.promise, v.host);
  await tick();
  await v.run.cancelRemote();
  assert.equal(v.run.cancelRequested, true);
  assert.deepEqual(v.journal, ['cancel-intent', 'flush']);
  assert.equal(v.terminals.length, 0);
  admission.resolve({ done: terminal.promise, cancel: async () => { cancels++; throw Error('connection lost'); }, close() {} });
  await tick();
  assert.equal(cancels, 1);
  assert.equal(v.run.status, 'running');
  assert.equal(uncertain(v), true);
  terminal.resolve({ status: 'cancelled' });
  await tick();
  assert.deepEqual(v.terminals, [{ status: 'cancelled' }]);
  await v.run.cancelRemote();
  assert.equal(cancels, 1, 'terminal tasks do not receive another cancel request');
});

test('a cancellation write failure must prevent cancellation dispatch, and transport rejection remains uncertain', async () => {
  let persistFailure = true, cancels = 0;
  const terminal = deferred(), v = observer({ recordCancel() { if (persistFailure) throw Error('disk unavailable'); } });
  attachRemote(v.run, () => ({ done: terminal.promise, cancel: async () => { cancels++; throw Error('network unavailable'); }, close() {} }), v.host);
  await tick();
  await assert.rejects(v.run.cancelRemote(), /disk unavailable/);
  assert.equal(cancels, 0);
  assert.equal(v.run.cancelRequested, undefined);
  persistFailure = false;
  await v.run.cancelRemote();
  assert.equal(cancels, 1);
  assert.equal(v.run.status, 'running');
  assert.equal(v.terminals.length, 0);
  assert.equal(uncertain(v), true);
  terminal.reject(Error('connection ended without terminal observation'));
  await tick();
  assert.equal(v.run.status, 'running');
  assert.equal(v.terminals.length, 0);
});

test('immediate close prevents opening transport and creates neither a cancellation nor a terminal event', async () => {
  const v = observer(); let opened = 0;
  attachRemote(v.run, () => { opened++; throw Error('must not open'); }, v.host);
  v.run.closeRemote();
  await tick();
  assert.equal(opened, 0);
  assert.equal(v.run.status, 'running');
  assert.deepEqual(v.events, []);
  assert.deepEqual(v.terminals, []);
  assert.deepEqual(v.journal, []);
});

test('late handle admission and events after close never finish or cancel the remote task', async () => {
  const admission = deferred(), terminal = deferred(), v = observer();
  let emit, closes = 0, cancels = 0;
  attachRemote(v.run, callback => { emit = callback; return admission.promise; }, v.host);
  await tick();
  v.run.closeRemote();
  admission.resolve({ done: terminal.promise, cancel: async () => { cancels++; }, close() { closes++; } });
  await tick();
  emit({ type: 'remote_task', remote: { taskId: 'late' } });
  terminal.resolve({ status: 'done', result: 'late answer' });
  await tick();
  assert.equal(closes, 1);
  assert.equal(cancels, 0);
  assert.deepEqual(v.events, []);
  assert.deepEqual(v.terminals, []);
  assert.equal(v.run.status, 'running');
});

test('transport close errors and rejected completion never invent a terminal remote result', async () => {
  const terminal = deferred(), v = observer();
  attachRemote(v.run, () => ({ done: terminal.promise, cancel: async () => {}, close() { throw Error('private shutdown failure'); } }), v.host);
  await tick();
  assert.doesNotThrow(() => v.run.closeRemote());
  terminal.reject(Error('private completion failure'));
  await tick();
  assert.equal(v.run.status, 'running');
  assert.deepEqual(v.terminals, []);
  assert.equal(JSON.stringify(v.events).includes('private'), false);
});

test('nonterminal or malformed done values keep ownership pending rather than interpreting transport success as task completion', async () => {
  for (const value of [null, {}, { status: 'working' }, { status: 'timeout' }]) {
    const v = observer();
    attachRemote(v.run, () => ({ done: Promise.resolve(value), cancel: async () => {}, close() {} }), v.host);
    await tick();
    assert.equal(v.run.status, 'running');
    assert.equal(v.terminals.length, 0);
    assert.equal(uncertain(v), true);
  }
});

test('plugin event notifications cannot bypass terminal confirmation, exceed the limit, or mutate retained history', async () => {
  const terminal = deferred(), v = observer();let emit;
  attachRemote(v.run, callback => { emit = callback; return { done: terminal.promise, cancel: async () => {}, close() {} }; }, v.host);
  await tick();
  for (const value of [null, 1, [], {}, { type: 1 }, { type: 'exit', status: 'done' }, { type: 'result', result: 'unconfirmed' }, { type: 'system', text: 'x'.repeat(262145) }]) emit(value);
  assert.deepEqual(v.events, []);
  assert.equal(v.terminals.length, 0);
  const reference = { type: 'remote_task', remote: { taskId: 'fixed' } };
  emit(reference);reference.remote.taskId = 'changed';
  emit({ type: 'system', subtype: 'remote_status', state: 'working' });
  assert.equal(v.events[0].remote.taskId, 'fixed');
  assert.deepEqual(v.journal, ['flush'], 'accepted task identity is flushed promptly');
  assert.equal(v.events.length, 2);
  terminal.resolve({ status: 'done', result: 'confirmed' });
  await tick();
  emit({ type: 'system', state: 'late' });
  assert.equal(v.events.length, 2);
  assert.deepEqual(v.terminals, [{ status: 'done', result: 'confirmed' }]);
});

test('a rejected local finalization keeps the task pending for recovery rather than reporting success', async () => {
  const v = observer({ finish() { throw Error('history unavailable'); } });
  attachRemote(v.run, () => ({ done: Promise.resolve({ status: 'done' }), cancel: async () => {}, close() {} }), v.host);
  await tick();
  assert.equal(v.run.status, 'running');
  assert.equal(uncertain(v), true);
  assert.deepEqual(v.terminals, []);
});

test('an already finalized run ignores late completion and transport errors', async () => {
  for (const reject of [false, true]) {
    const v = observer(), terminal = deferred();
    attachRemote(v.run, () => ({ done: terminal.promise, cancel: async () => assert.fail('must not cancel terminal task'), close() {} }), v.host);
    await tick();
    v.run.status = 'cancelled';
    reject ? terminal.reject(Error('late error')) : terminal.resolve({ status: 'done' });
    await tick();
    await v.run.cancelRemote();
    assert.equal(v.run.status, 'cancelled');
    assert.deepEqual(v.events, []);
    assert.deepEqual(v.terminals, []);
  }
});
