import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteHost, hostBase } from '../src/host.js';

// A fetch that records each call and answers from a script: { status, body, etag } or an Error.
function fakeFetch(script) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const next = typeof script === 'function' ? script(url, init) : script.shift();
    if (next instanceof Error) throw next;
    const { status = 200, body = {}, etag = null } = next;
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (k) => (k.toLowerCase() === 'etag' ? etag : null) },
      json: async () => body,
    };
  };
  return { fetch, calls };
}

function fakeTimers() {
  const live = new Map();
  let next = 1;
  return {
    live,
    setTimeout: (fn, ms) => { const id = next++; live.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { live.delete(id); },
    delays: () => [...live.values()].map((t) => t.ms).sort((a, b) => a - b),
  };
}

const make = (script, extra = {}) => {
  const f = fakeFetch(script);
  const timers = fakeTimers();
  const host = createRemoteHost({ base: '/h', fetch: f.fetch, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, ...extra });
  return { host, calls: f.calls, timers };
};

test('loadPlan returns raw and ETag version', async () => {
  const { host, calls } = make([{ body: { rooms: [1] }, etag: '"v1"' }]);
  const { raw, version } = await host.loadPlan();
  assert.deepEqual(raw, { rooms: [1] });
  assert.equal(version, '"v1"');
  assert.equal(calls[0].url, '/h/plan');
  assert.equal(calls[0].init.cache, 'no-store');
});

test('loadPlan 404 throws code no_plan', async () => {
  const { host } = make([{ status: 404, body: { error: 'no_plan' } }]);
  await assert.rejects(host.loadPlan(), (e) => e.code === 'no_plan');
});

test('loadPlan other failure throws code unavailable', async () => {
  const { host } = make([{ status: 503, body: { error: 'unavailable' } }]);
  await assert.rejects(host.loadPlan(), (e) => e.code === 'unavailable');
});

test('command posts JSON with Content-Type application/json to base/command', async () => {
  const { host, calls } = make([{ body: { ok: true } }]);
  const payload = { kind: 'light', id: 'a.lamp', patch: { on: true }, state: { on: true } };
  assert.deepEqual(await host.command(payload), { ok: true });
  assert.equal(calls[0].url, '/h/command');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), payload);
});

test('command non-2xx rejects with detail.failed', async () => {
  const { host } = make([{ status: 400, body: { error: 'bad_patch', failed: ['target'] } }]);
  await assert.rejects(host.command({ kind: 'ac', id: 'k', patch: { target: 40 }, state: {} }), (e) => {
    assert.deepEqual(e.detail.failed, ['target']);
    assert.equal(e.detail.code, 'bad_patch');
    assert.ok(e.message);
    return true;
  });
});

test('command network error rejects with failed null', async () => {
  const { host } = make([new TypeError('Failed to fetch')]);
  await assert.rejects(host.command({ kind: 'light', id: 'a', patch: { on: true }, state: {} }), (e) => e.detail.failed === null);
});

test('refreshSoon schedules 1500 and 5000, plus 12000 for vacuum', () => {
  const a = make([]);
  a.host.refreshSoon('light');
  assert.deepEqual(a.timers.delays(), [1500, 5000]);
  const b = make([]);
  b.host.refreshSoon('vacuum');
  assert.deepEqual(b.timers.delays(), [1500, 5000, 12000]);
});

test('a command refreshes soon, whether or not it worked', async () => {
  const { host, timers } = make([{ status: 502, body: { error: 'unavailable' } }]);
  await host.command({ kind: 'light', id: 'a', patch: { on: true }, state: {} }).catch(() => {});
  assert.deepEqual(timers.delays(), [1500, 5000]);
});

test('offline transitions', async () => {
  const seen = [];
  const states = [];
  const { host } = make([{ status: 503, body: { error: 'unavailable' } }, new TypeError('down'), { body: { lights: {} } }, { body: { lights: {} } }],
    { onOffline: (off) => seen.push(off), onState: (s) => states.push(s) });
  for (let i = 0; i < 4; i++) await host.pollNow();
  assert.deepEqual(seen, [true, false]);
  assert.equal(states.length, 2);
  assert.equal(host.offline, false);
});

test('planVersion change calls onPlanChanged once', async () => {
  let changed = 0;
  const { host } = make([{ body: { rooms: [1] }, etag: '"v1"' }, { body: { planVersion: '"v1"' } }, { body: { planVersion: '"v2"' } }, { body: { planVersion: '"v2"' } }],
    { onPlanChanged: () => changed++ });
  await host.loadPlan();
  for (let i = 0; i < 3; i++) await host.pollNow();
  assert.equal(changed, 1);
});

test('an older answer does not overwrite a newer one', async () => {
  const order = [];
  let release;
  const slow = new Promise((r) => { release = r; });
  let n = 0;
  const host = createRemoteHost({
    base: '', setTimeout: () => 0, clearTimeout: () => {},
    fetch: async () => {
      const mine = n++;
      if (mine === 0) await slow;
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ n: mine }) };
    },
    onState: (s) => order.push(s.n),
  });
  const first = host.pollNow();
  await host.pollNow();
  release();
  await first;
  assert.deepEqual(order, [1]);
});

test('start polls on the interval; stop clears every timer', async () => {
  const { host, timers } = make(() => ({ body: {} }), { interval: 10000 });
  host.start();
  assert.deepEqual(timers.delays(), [10000]);
  host.start(); // already running: no second loop
  assert.deepEqual(timers.delays(), [10000]);
  host.refreshSoon('vacuum');
  assert.equal(timers.live.size, 4);
  host.stop();
  assert.equal(timers.live.size, 0);
});

test('the loop schedules the next poll after each one', async () => {
  const { host, timers, calls } = make(() => ({ body: {} }), { interval: 10000 });
  host.start();
  const [[id, t]] = timers.live;
  timers.live.delete(id);
  await t.fn();
  assert.equal(calls.length, 1);
  assert.deepEqual(timers.delays(), [10000]);
});

test('hostBase', () => {
  const s = (q) => new URLSearchParams(q);
  assert.equal(hostBase({ boot: { host: '/ha-widget/house' }, search: s('?host=http://x') }), '/ha-widget/house');
  assert.equal(hostBase({ boot: null, search: s('?host=http://localhost:5198/') }), 'http://localhost:5198');
  assert.equal(hostBase({ boot: { host: '/a/b//' }, search: s('') }), '/a/b');
  assert.equal(hostBase({ boot: null, search: s('') }), null);
  assert.equal(hostBase({ boot: {}, search: s('') }), null);
});
