# Tumult Rich Presence

Discord-style activities ("Playing Chess", "Listening to Lo-fi") for
[Tumult](https://github.com/jackgraddon/tumult), shipped as a plugin. Vanilla
Tumult only does what the Matrix spec does, so this lives outside it.

## How it works

- **Storage:** your activity is a versioned JSON document in your
  [MSC4133](https://github.com/matrix-org/matrix-spec-proposals/pull/4133)
  extended profile, under the key `app.tumult.activity`:

  ```json
  { "v": 1, "type": "playing", "name": "Chess", "details": "Ranked", "state": "Move 12",
    "startedAt": 1761660000000, "emoji": "♟️" }
  ```

  `type` is `playing` | `listening` | `watching` | `custom`. `name` is required
  (1–128 chars), and the other fields are optional. Readers accept only versions
  they understand (`isActivity` in `src/activity.ts`). A document that fails
  validation is not rendered, and the normal status line shows instead.
- **Producing it:** the **Activity** settings tab, or the `/activity` command:

  ```
  /activity playing Chess
  /activity listening 🎧 Lo-fi | Some Artist      (| separates details)
  /activity custom Out to lunch
  /activity clear
  ```

- **Status mirror** (on by default): the plugin also writes the headline
  ("Playing Chess") to your Matrix `status_msg` and leaves your presence as it
  is, so people on other clients see it too. It only overwrites a status that is
  empty or that it wrote itself. If you typed your own status, the plugin
  leaves it in place. If your homeserver lacks extended profiles, the mirror is
  the only output, and the settings tab says so.
- **Rendering:** an activity renderer replaces the status line in member rows
  (always one line, truncated, with the elapsed time) and in your user bar.

Requires Tumult contract ≥ 1.4.0 and plugin API ≥ 1.2.0 (`minCore` / `minUI`).
Permissions: `activity-renderers`, `settings-tabs`, `commands`, `styles`. The
component permissions mean it runs in the trusted, in-page lane.

## Develop

```sh
pnpm install
pnpm test        # node --test "test/**/*.test.ts"
pnpm typecheck
pnpm build       # dist/plugin.js
```

`types/plugin.d.ts` is vendored from Tumult (`templates/plugin/types/`) and
must describe contract 1.4.0 / plugin API 1.2.0 or newer.

## Releasing

**Make this repository public before releasing.** Tumult's installer fetches
releases without authentication, so it cannot see a private repo. After that,
follow the template flow: bump `version` in `package.json`, `tumult.plugin.json`
and `src/index.ts`, then push a matching `vX.Y.Z` tag. Actions must be enabled
in the repo settings.
