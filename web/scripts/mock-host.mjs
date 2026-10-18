#!/usr/bin/env node
// A remote host for working on the browser-hosted panel (docs/remote-host.md) without real
// devices: it serves the demo plan with every lamp, AC and robot vacuum linked to a made-up
// Home Assistant entity, keeps their state in memory, runs commands on it and answers /state.
//
//   node web/scripts/mock-host.mjs [port=5198] [--fail] [--no-plan]
//   then open http://localhost:5199/?host=http://localhost:5198&embed=1&lang=ru under `vite dev`
//
// --fail (or fail=1) answers every command with 502 {"error":"unavailable"}, to see a
// refused change roll back. --no-plan answers as a host that has no plan yet. Editing the
// demo plan changes its version: open pages reload.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a))) || 5198;
const failing = args.some((a) => a === '--fail' || a === 'fail=1' || a === '?fail=1');
const noPlan = args.includes('--no-plan');
const PLAN_FILE = new URL('../public/plans/home.json', import.meta.url);

const AC_MODES = ['cool', 'heat', 'dry', 'fan', 'auto'];
const AC_FANS = ['auto', 'low', 'medium', 'high', 'turbo'];
const AC_SWINGS = ['swing', 'l1', 'l2', 'l3', 'l4', 'l5', 'off'];
const VACUUM_FANS = ['Quiet', 'Standard', 'Strong', 'Turbo'];
const ALLOWED = {
  light: ['on', 'brightness', 'temp', 'color'],
  ac: ['on', 'mode', 'target', 'fan', 'swing', 'sleep', 'eco'],
  vacuum: ['status', 'fan'],
};

const entity = (domain, id) => ({ service: 'homeassistant', id: `${domain}.${id.replace(/\./g, '_')}` });

function loadPlan() {
  const text = readFileSync(PLAN_FILE, 'utf8');
  const plan = JSON.parse(text);
  for (const l of plan.lights || []) { delete l.tuya; l.link = entity('light', l.id); }
  for (const a of plan.acs || []) { delete a.tuya; a.link = entity('climate', a.id); }
  for (const v of plan.vacuums || []) { delete v.tuya; v.link = entity('vacuum', v.id); }
  const etag = `"${createHash('sha256').update(text).digest('hex').slice(0, 16)}"`;
  return { plan, etag };
}

let { plan } = loadPlan();
const kindOf = new Map();
const state = { lights: {}, acs: {}, vacuums: {}, features: {} };
for (const l of plan.lights || []) {
  kindOf.set(l.id, { kind: 'light', cfg: l });
  state.lights[l.id] = { on: false, brightness: 0.8, temp: 3000, color: null };
}
for (const a of plan.acs || []) {
  kindOf.set(a.id, { kind: 'ac', cfg: a });
  state.acs[a.id] = { on: false, mode: 'cool', target: 24, fan: 'auto', swing: 'swing', sleep: false, eco: false, roomTemp: 25.5 };
  state.features[a.id] = { modes: AC_MODES, fans: AC_FANS, sleep: true, eco: true, swing: true };
}
for (const v of plan.vacuums || []) {
  kindOf.set(v.id, { kind: 'vacuum', cfg: v });
  state.vacuums[v.id] = { status: 'docked', battery: 87, fan: 'Standard' };
  state.features[v.id] = { fans: VACUUM_FANS, canStart: true, canPause: true, canReturn: true };
}

// Which patch keys a device takes, and whether each value is one it can take.
function badKeys(kind, cfg, patch) {
  const bad = [];
  for (const [k, v] of Object.entries(patch)) {
    let ok = ALLOWED[kind].includes(k);
    if (ok && kind === 'light') {
      if (k === 'on') ok = typeof v === 'boolean';
      if (k === 'brightness') ok = typeof v === 'number' && v >= 0.05 && v <= 1;
      if (k === 'temp') ok = typeof v === 'number' && v >= 2200 && v <= 6500;
      if (k === 'color') ok = v === null || /^#[0-9a-f]{6}$/i.test(v);
    } else if (ok && kind === 'ac') {
      if (k === 'on' || k === 'sleep' || k === 'eco') ok = typeof v === 'boolean';
      if (k === 'mode') ok = AC_MODES.includes(v);
      if (k === 'fan') ok = AC_FANS.includes(v);
      if (k === 'swing') ok = AC_SWINGS.includes(v);
      if (k === 'target') ok = typeof v === 'number' && v >= (cfg.min ?? 16) && v <= (cfg.max ?? 30);
    } else if (ok && kind === 'vacuum') {
      if (k === 'status') ok = ['cleaning', 'paused', 'returning'].includes(v);
      if (k === 'fan') ok = VACUUM_FANS.includes(v);
    }
    if (!ok) bad.push(k);
  }
  return bad;
}

function run(kind, id, patch) {
  if (kind === 'light') Object.assign(state.lights[id], patch, 'temp' in patch ? { color: null } : {});
  if (kind === 'ac') Object.assign(state.acs[id], patch);
  if (kind === 'vacuum') {
    Object.assign(state.vacuums[id], patch);
    // A real robot reports its arrival a while later.
    if (patch.status === 'returning') setTimeout(() => { if (state.vacuums[id].status === 'returning') state.vacuums[id].status = 'docked'; }, 8000);
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJSON(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 8192) throw new Error('too large');
  }
  return JSON.parse(text);
}

createServer(async (req, res) => {
  // Any page may use it: it is a development tool, on this machine only.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const { pathname } = new URL(req.url, 'http://mock');
  if (noPlan && ['/plan', '/state', '/command'].includes(pathname)) { send(res, 404, { error: 'no_plan' }); return; }

  if (pathname === '/plan' && req.method === 'GET') {
    const current = loadPlan();
    plan = current.plan;
    if (req.headers['if-none-match'] === current.etag) { send(res, 304, undefined, { ETag: current.etag }); return; }
    send(res, 200, plan, { ETag: current.etag, 'Cache-Control': 'no-cache' });
    return;
  }
  if (pathname === '/state' && req.method === 'GET') {
    send(res, 200, { planVersion: loadPlan().etag, ...state });
    return;
  }
  if (pathname === '/command') {
    if (req.method !== 'POST') { send(res, 405, { error: 'method_not_allowed' }); return; }
    if (!String(req.headers['content-type']).startsWith('application/json')) { send(res, 415, { error: 'unsupported_media_type' }); return; }
    let body;
    try { body = await readJSON(req); } catch { send(res, 400, { error: 'bad_request' }); return; }
    const { kind, id, patch } = body || {};
    const device = kindOf.get(id);
    if (!device || device.kind !== kind) { send(res, 400, { error: 'unknown_device' }); return; }
    if (!patch || typeof patch !== 'object') { send(res, 400, { error: 'bad_patch', failed: [] }); return; }
    const failed = badKeys(kind, device.cfg, patch);
    if (failed.length) { send(res, 400, { error: 'bad_patch', failed }); return; }
    if (failing) { console.log(`${kind} ${id} ${Object.keys(patch).join(',')} → refused (--fail)`); send(res, 502, { error: 'unavailable' }); return; }
    run(kind, id, patch);
    console.log(`${kind} ${id} ${JSON.stringify(patch)} → ok`);
    send(res, 200, { ok: true });
    return;
  }
  send(res, 404, { error: 'not_found' });
}).listen(port, () => {
  console.log(`Mock host on http://localhost:${port}${failing ? ' (every command fails)' : ''}${noPlan ? ' (no plan)' : ''}`);
  console.log(`Open http://localhost:5199/?host=http://localhost:${port}&embed=1`);
});
