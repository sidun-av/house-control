// A remote host: a server that owns the real devices and drives this page over plain HTTP,
// the way the native shell does over its message channel. It serves the plan, answers the
// devices' state when asked and runs commands; the page polls it while it is visible.
// The protocol is in docs/remote-host.md.
import { t } from './i18n/index.js';

const SOON = [1500, 5000];
const SOON_VACUUM = 12000; // a robot reports a new status late (its cloud, then the host)

/** Where the host lives: the boot config's `host`, then `?host=`; null when there is none. */
export function hostBase({ boot, search }) {
  const base = boot?.host || search?.get('host') || null;
  return base == null ? null : base.replace(/\/+$/, '');
}

const fail = (message, code) => Object.assign(new Error(message), { code });

export function createRemoteHost({
  base, fetch, setTimeout, clearTimeout, interval = 10000, onState = null, onOffline = null, onPlanChanged = null,
}) {
  let version = null; // the plan this page was built from (its ETag)
  let offline = false;
  let planChanged = false;
  let running = false;
  let loop = null;
  const soon = new Set();
  let asked = 0; // polls started, so an answer older than one already used is dropped
  let used = 0;

  const host = {
    // Assignable after creation: the panel that shows what they report is built later.
    onState, onOffline, onPlanChanged,

    get offline() { return offline; },

    async loadPlan() {
      const res = await fetch(`${base}/plan`, { cache: 'no-store' });
      if (res.status === 404) throw fail(t('host.noPlan.title'), 'no_plan');
      if (!res.ok) throw fail(`HTTP ${res.status}`, 'unavailable');
      const raw = await res.json();
      version = res.headers.get('ETag');
      return { raw, version };
    },

    async command({ kind, id, patch, state }) {
      let res = null;
      let body = null;
      try {
        res = await fetch(`${base}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, id, patch, state }),
        });
        body = await res.json().catch(() => null);
      } catch { /* no answer: rolled back like a refusal */ }
      // Whatever happened, the device's own report settles it shortly.
      host.refreshSoon(kind);
      if (res?.ok) return { ok: true };
      throw Object.assign(new Error(t('host.commandFailed')), {
        detail: { failed: Array.isArray(body?.failed) ? body.failed : null, code: body?.error || null },
      });
    },

    async pollNow() {
      const mine = ++asked;
      let json;
      try {
        const res = await fetch(`${base}/state`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        json = await res.json();
      } catch {
        if (mine < used) return;
        used = mine;
        setOffline(true);
        return;
      }
      if (mine < used) return;
      used = mine;
      setOffline(false);
      if (json?.planVersion && version && json.planVersion !== version && !planChanged) {
        planChanged = true;
        host.onPlanChanged?.();
      }
      host.onState?.(json);
    },

    start() {
      if (running) return;
      running = true;
      schedule();
    },

    stop() {
      running = false;
      clearTimeout(loop);
      loop = null;
      for (const id of soon) clearTimeout(id);
      soon.clear();
    },

    refreshSoon(kind) {
      for (const ms of kind === 'vacuum' ? [...SOON, SOON_VACUUM] : SOON) {
        const id = setTimeout(() => { soon.delete(id); host.pollNow(); }, ms);
        soon.add(id);
      }
    },
  };

  function setOffline(off) {
    if (off === offline) return;
    offline = off;
    host.onOffline?.(off);
  }

  function schedule() {
    loop = setTimeout(async () => {
      loop = null;
      await host.pollNow();
      if (running && loop === null) schedule();
    }, interval);
  }

  return host;
}
