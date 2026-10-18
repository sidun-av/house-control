# Remote host

The panel normally runs inside the Mac or iPhone app, which owns the devices, or in a plain browser, where every
device is simulated. A **remote host** is a third way: a server that owns the devices and drives the panel over
plain HTTP, so the same 3D panel can be shown on a web page — a dashboard, say — with real state and working
controls. The host serves the web build (`web/dist`) and three endpoints; the page does the rest.

Inside the apps a remote host is ignored: the native bridge always wins.

## Boot options

Set them in `window.__HOUSE_BOOT__` before the page's script runs (a host serving the page injects it into
`index.html`), or in the address for development:

| Boot key | Query | Meaning |
| --- | --- | --- |
| `host` | `?host=` | Base URL of the host's endpoints, absolute or a path on the same origin (`/dash/house`). A trailing `/` is dropped. |
| `lang` | `?lang=` | `en` or `ru`. Without it the page follows the browser's language (the apps stay English). |
| `embed` | `?embed=1` | The card fills its frame (an iframe): no margin, corners, notch or shadow; the 3D view stays on top, tiles and sheets scroll below it, the tile grid has as many columns as fit. |

For example, a host serving the page under `/dash/house/` would start `index.html` with

```html
<head><base href="/dash/house/"><script>window.__HOUSE_BOOT__={"host":"/dash/house","lang":"ru","embed":true}</script>
```

Hosted, the page has no plan menu and no AI Access badge, keeps no device state in the browser, and builds the 3D
view only after the first state answer (or 4 s), so lamps that are on do not open as off. Until a first answer
comes, the tiles say the state is not known and take no taps; nothing is made up.

When the page cannot open the home it says why, in the page's language: the host cannot be reached, it has no
plan yet, or its plan cannot be read. Each of these screens tries again by itself (after 5 s, then ever less often,
up to once a minute, and at once when the page is shown again), so a plan uploaded meanwhile simply appears.

## Endpoints

All bodies are JSON. Devices are named by their **plan ids** (`living.main`), never by the host's own entity ids.

### `GET <host>/plan`

The floor plan (the format of [floor-plan.md](floor-plan.md)), with an `ETag` header naming its version.
`404 {"error":"no_plan"}` when the host has none yet: the page shows a "plan not uploaded yet" screen.
A plan that is not JSON, or that the panel rejects (a duplicate id, an unknown room), gets its own screen.

The page treats every device in the plan as real. A host should leave out devices it cannot drive rather than
serve them unlinked, which would make them simulated.

### `GET <host>/state`

The devices' state, in the shape the native shell passes to `applyRemote`, plus the plan's version:

```json
{
  "planVersion": "\"3f1c0a9d2b7e4410\"",
  "lights":   { "living.main": { "on": true, "brightness": 0.8, "temp": 3000, "color": null } },
  "acs":      { "bedroom.ac": { "on": true, "mode": "heat", "target": 22, "fan": "auto", "swing": "off",
                                "sleep": false, "eco": false, "roomTemp": 21.5 } },
  "vacuums":  { "living.vacuum": { "status": "docked", "battery": 87, "fan": "Standard" } },
  "features": { "bedroom.ac": { "modes": ["heat", "fan"], "fans": ["auto", "low", "high"],
                                "sleep": false, "eco": false, "swing": true },
                "living.vacuum": { "fans": ["Quiet", "Standard", "Turbo"],
                                   "canStart": true, "canPause": true, "canReturn": true } }
}
```

Every key is optional and partial: a device or a field left out keeps what the page has. A vacuum's `status` is
one of `cleaning`, `docked`, `returning`, `paused`, `idle`, `error`, `unavailable`. When `planVersion` differs
from the `ETag` the page was built from, the page reloads itself to pick up the new plan. A leading `W/` is
ignored on both sides (a proxy that compresses the answer turns a strong ETag into a weak one), and a tab reloads
at most once for any one version, so a version that never matches cannot make it reload again and again.

Any answer that is not 2xx (a host answers `503 {"error":"unavailable"}` when it cannot reach the devices), or no
answer at all, puts the page offline: it keeps the last known state and shows one "no connection" message, until
an answer comes through again.

### `POST <host>/command`

Sent with `Content-Type: application/json` when the person changes something; `state` is the device's whole state
after the change, for hosts that need more than the patch:

```json
{ "kind": "light", "id": "living.main", "patch": { "on": true }, "state": { "on": true, "brightness": 0.8, "temp": 3000, "color": null } }
```

| `kind` | Patch keys |
| --- | --- |
| `light` | `on`, `brightness` (0.05–1), `temp` (2200–6500 K), `color` (`#rrggbb` or `null`) |
| `ac` | `on`, `mode`, `target`, `fan`, `swing`, `sleep`, `eco` |
| `vacuum` | `status` (`cleaning`, `paused`, `returning`), `fan` |

`200 {"ok":true}` when it was done. Anything else — `{"error":"<code>"}`, optionally with `"failed": ["target"]`
naming the patch keys that were the reason — means nothing of the command was applied: the page rolls the whole
change back and shows a localised "the device did not respond" message. A host that refuses a command applies
none of it. Error codes are for logs; the page does not show them. A host
should keep its own details (and any credentials) out of these bodies.

## Polling

The page asks for `/state` every 10 s while it is visible, and again 1.5 s and 5 s after each command (plus 12 s
for a robot vacuum, which reports late). It stops while hidden and asks at once when shown again; a page that
opens hidden (a background tab) asks once, to build the view, and then waits to be shown. An answer to a request
made before the latest command is dropped: it may still show the device as it was. One command per
device is in flight at a time; changes made meanwhile follow as one command, and a reply that never comes is given
up after 20 s.

## A mock host

`web/scripts/mock-host.mjs` is a host for working on all this without devices. It serves the demo plan with every
device linked, keeps their state in memory and runs commands on it:

```bash
cd web
npm run dev                          # the page, on :5199
node scripts/mock-host.mjs           # the host, on :5198
open 'http://localhost:5199/?host=http://localhost:5198&embed=1&lang=ru'
```

`--fail` makes every command answer `502 {"error":"unavailable"}`, to see a change roll back; `--no-plan` answers
as a host without a plan; stopping it shows the page going offline. It sends CORS headers so the dev server's page
can reach it; a real host serves the page itself and needs none.
