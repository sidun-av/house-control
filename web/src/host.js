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

// A proxy that compresses the answer may turn a strong ETag into a weak one (`W/"…"`):
// the version is the same, so the two are compared without it.
export const sameVersion = (a, b) => String(a).replace(/^W\//, '') === String(b).replace(/^W\//, '');

const RELOADED = 'house-control:reloaded-for';

/**
 * Reloads the page for a new plan version, once per version in this tab: if the page comes
 * back still out of step (a version that never matches), it stays as it is rather than
 * reloading again and again. Without session storage it does not reload at all.
 */
export function reloadOnce(version, { storage, reload }) {
  try {
    if (storage.getItem(RELOADED) === version) return false;
    storage.setItem(RELOADED, version);
  } catch {
    return false;
  }
  reload();
  return true;
}

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
  let floor = 0; // the last poll asked before the latest command: its answer may predate it

  const host = {
    // Assignable after creation: the panel that shows what they report is built later.
    onState, onOffline, onPlanChanged,

    get offline() { return offline; },

    async loadPlan() {
      const res = await fetch(`${base}/plan`, { cache: 'no-store' });
      if (res.status === 404) throw fail(t('host.noPlan.title'), 'no_plan');
      if (!res.ok) throw fail(`HTTP ${res.status}`, 'unavailable');
      let raw;
      try {
        raw = await res.json();
      } catch (error) {
        throw fail(`The plan is not valid JSON: ${error.message}`, 'bad_plan');
      }
      version = res.headers.get('ETag');
      return { raw, version };
    },

    async command({ kind, id, patch, state }) {
      let res = null;
      let body = null;
      // A state answer asked for before this command may still show the device as it was.
      floor = asked;
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
      // A host applies nothing of a command it refuses, so the whole change goes back
      // (`failed` = null); the keys it named are kept in `refused`.
      const refused = Array.isArray(body?.failed) ? body.failed : null;
      throw Object.assign(new Error(t('host.commandFailed')), {
        detail: { failed: null, refused, code: body?.error || null },
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
        if (mine < used || mine <= floor) return;
        used = mine;
        setOffline(true);
        return;
      }
      if (mine < used || mine <= floor) return;
      used = mine;
      setOffline(false);
      if (json?.planVersion && version && !sameVersion(json.planVersion, version) && !planChanged) {
        planChanged = true;
        host.onPlanChanged?.(String(json.planVersion).replace(/^W\//, ''));
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
