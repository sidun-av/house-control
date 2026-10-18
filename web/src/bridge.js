// Thin bridge to the native shell (the macOS menu bar app or the iPhone app). In a plain
// browser every call is a no-op, so the same bundle runs under `vite dev` too, unless a
// remote host drives the page over HTTP (see host.js).
import { createRemoteHost, hostBase } from './host.js';

const handler = window.webkit?.messageHandlers?.house;

export const isNative = Boolean(handler);

// A remote host (boot config `host` or `?host=`) owns the devices of a page outside the
// apps: it serves the plan, reports state and runs commands. Never inside the native shell.
const base = handler ? null : hostBase({ boot: window.__HOUSE_BOOT__, search: new URLSearchParams(location.search) });
export const host = base == null ? null : createRemoteHost({
  base,
  fetch: (...args) => window.fetch(...args),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
});
export const isHosted = Boolean(host) && !isNative;

// 'ios' inside the iPhone app (or with ?platform=ios in a browser, to work on that layout).
export const platform = window.__HOUSE_BOOT__?.platform
  || new URLSearchParams(location.search).get('platform') || (handler ? 'macos' : 'web');
export const isPhone = platform === 'ios';

export function post(type, payload = {}) {
  handler?.postMessage({ type, ...payload });
}

// A tap you can feel, on the iPhone only: 'tick' for a step of a slider, 'light' /
// 'medium' for a switch or a scene, 'error' when a device refuses a change.
export function haptic(kind = 'light') {
  if (isPhone) post('haptic', { kind });
}

// Native -> JS entry points are attached here by main.js.
export const incoming = (window.house = window.house || {});

// Request/response on top of the one-way message channel.
let nextId = 1;
const pending = new Map();

export function call(type, payload = {}) {
  if (!handler) return Promise.reject(new Error('Only available inside the app'));
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    handler.postMessage({ type, callId: id, ...payload });
  });
}

incoming.reply = (id, result) => {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  if (result && result.error) p.reject(Object.assign(new Error(result.error), { detail: result }));
  else p.resolve(result);
};
