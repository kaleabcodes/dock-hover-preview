# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A GNOME Shell extension (GJS, ES modules, **GNOME Shell 48–50**, developed and tested on 50 / Wayland) that shows live window previews when hovering a running app's dock icon. UUID: `dock-hover-preview@kaleabcodes.dev`. Settings schema: `org.gnome.shell.extensions.dock-hover-preview`.

It must stay **independent of any dock extension**. It works with Dash to Dock, Ubuntu Dock and the built-in dash only through GNOME Shell's own classes. Don't import from or name-match Dash to Dock internals.

## Commands

There is no test suite or linter. The checks (the same ones CI runs in `.github/workflows/release.yml`):

```bash
glib-compile-schemas --strict --dry-run schemas/
for f in *.js; do cp "$f" "/tmp/$f.mjs" && node --check "/tmp/$f.mjs"; done   # ESM syntax check
```

- `./install.sh`: compiles the schema and symlinks this folder into `~/.local/share/gnome-shell/extensions/` (development mode). Piped from curl, it instead downloads `main` and installs a copy. `--uninstall` removes it.
- `./pack.sh [version-name]`: builds `dist/<uuid>.shell-extension.zip` for extensions.gnome.org, using only zip and python3. **New source files must be added to the file lists in both `pack.sh` and `install.sh`.**
- Release: `git tag vX.Y && git push origin vX.Y`. The workflow packs, uploads to the extensions.gnome.org API (`/api/v1/accounts/login/`, then `/api/v1/extensions` with `Authorization: Token …`) using the `EGO_USERNAME` and `EGO_PASSWORD` secrets, and creates a GitHub release.

### Running changed code

On Wayland the running shell **never reloads extension JS**. Disabling and re-enabling does not re-import modules; changes only take effect after logging out and back in. To test without logging out:

```bash
dbus-run-session gnome-shell --devkit                     # nested shell in a window
DHP_DEBUG=1 dbus-run-session gnome-shell --headless --virtual-monitor 1920x1080 --no-x11 > /tmp/log 2>&1 &
```

`DHP_DEBUG=1` enables `debug()` logging from `util.js`. Headless sessions can be driven with Mutter's `org.gnome.Mutter.RemoteDesktop` D-Bus API: pointer motion and clicks, plus a linked `org.gnome.Mutter.ScreenCast` stream captured with a GStreamer `pipewiresrc` pipeline for screenshots. The session must be held open by a single long-lived D-Bus connection (e.g. a Python `Gio` script), not separate `gdbus` calls. Nested and headless shells share the user's real dconf and load all of the user's extensions, and `gnome-extensions enable/disable` talks to the real session bus even when HOME is overridden.

Logs: `journalctl -b -o cat _COMM=gnome-shell | grep -i dock-hover`. Many `Can't update stage views…` warnings come from other extensions and are noise.

## Architecture

The code is split so that each file owns one concern. `extension.js` is the only place that decides *when* things happen.

- **`iconTracker.js`**: hover detection. It connects to `captured-event` on `global.stage` and resolves the actor under the pointer with `global.stage.get_event_actor(event)`. It walks up to an actor whose `_delegate.app` is set **and whose parent is an instance of `Dash.DashItemContainer`**; that parent check is what separates dock icons from app-grid icons. Leaving an icon is detected through the icon's own `notify::hover`, because the stage doesn't see motion over client windows. It also follows the stage's `notify::key-focus`: a focused dock icon (Ctrl+Alt+Tab → Dock) counts as hovered, and key presses on it are offered to the extension first (the arrow pointing away from the dock moves into the popup). It also exports duck-typed dock helpers: `hideIconLabel` (the dash item's `hideLabel()`) and `pinDock`. `pinDock` sets `requiresVisibility` on the first ancestor that has it, so auto-hiding docks stay visible, and it returns a release function that is safe to call after the dock is destroyed.
- **`extension.js`**: the state machine. Timers: show (`hover-delay`), hide (`hide-delay`), peek (`peek-delay`), plus a short peek-end grace period. While the popup is open it watches the app's `windows-changed` to rebuild the cards. It closes immediately on icon click, the icon menu opening, overview showing, or a workspace switch. `_getWindows()` filters `skip_taskbar` and optionally other workspaces.
- **`previewPopup.js`**: an `St.BoxLayout` added with `Main.layoutManager.addTopChrome`, created once in `enable()` and shown or hidden per use. It emits `card-hover-changed` (a window or null) and `window-activated`. It works out the dock's screen edge from the icon's nearest monitor edge rather than from dock settings. Cards sit in an `St.ScrollView`; the scrollbar policy is set from the cards' natural length (`_syncScrollbar`), because St's `AUTOMATIC` showed a scrollbar even when everything fit. Keyboard navigation lives here too (`_onKeyPress`, `focusCard`). Rebuilding the cards keeps key focus on the card in the same position, and after Delete closes a window, `reclaimKeyFocus()` takes focus back from the window Mutter focused. The extension keeps the popup open while `_keyboard` is set, meaning key focus is on the icon or in the popup.
- **`windowCard.js`**: one card. The thumbnail is a `Clutter.Clone` of `win.get_compositor_private()`, offset by the buffer rect minus the frame rect and clipped, so shadows and invisible borders are hidden. Left click activates the window, or minimizes it if it's focused; middle click closes it (`button_mask` includes TWO).
- **`previewGeometry.js`**: pure geometry (unit-tested). `inTravelCorridor` is the trapezoid from the icon to the popup; `_scheduleHide` keeps the popup open for up to a second while the pointer is inside it, so diagonal moves from icon to popup don't close it.
- Full-title tooltips: `WindowCard.syncTitleTooltip()` shows an `St.Label` in top chrome after 500 ms of hover or key focus, only when the title is ellipsized. Scrolling and `close()` hide it (`_clearCardHover`).
- **`windowPeek.js`**: eases other windows' actors on the active workspace (NORMAL/DIALOG/UTILITY types) to opacity 0 and restores them. Clones ignore the source actor's opacity, so thumbnails stay visible while peeking.
- **`prefs.js`**: libadwaita window with Behavior, Appearance and About pages. It reads `metadata['version-name']`; there is no `version` key, because extensions.gnome.org assigns versions.

### Version support

`metadata.json` declares 48, 49 and 50; the APIs used were checked against the 48.0 and 49.0 sources. The floor is 48 because `St.BoxLayout`'s `orientation` property (used by `PreviewPopup` and `WindowCard`) doesn't exist in 47. Supporting 47 would need a fallback to the old `vertical` property. Only GNOME 50 is available locally for runtime testing.

### Media card

The popup can show a media card as well as windows. `contentSources.js` `MediaSource` wraps GNOME Shell's own `Mpris.MprisSource`/`MprisPlayer` (the same API in 48–50) and matches a player to the hovered app with `mediaMatch.js` (by `DesktopEntry`, the D-Bus owner's PID, or the bus name vs the app id; unit-tested). `contentCards.js` `MediaControls` shows art via `Gio.FileIcon`, falling back to a music icon if a local file is missing; its buttons call the player, and it re-syncs on `changed`. **Never show the same track twice.** If the app has windows, a compact `MediaControls` row goes **inside the playing window's card** (`mediaMatch.playingWindowIndex`: the window whose title contains the track title, else the focused one, else the first; unit-tested). Only an app with no windows gets the standalone `MediaCard`. `extension._open` shows the popup when there are windows **or** a player, so a background player (Spotify with no window) gets a popup too. Setting: `show-media-controls`. A recent-files card was tried and removed at the owner's request; don't add it back.

Tests: `npm test` (Node; the pure modules). For media in a headless shell there's no real player on the private bus, so a fake MPRIS player script works well (one that claims `DesktopEntry` `com.spotify.Client` and logs method calls). The dock layout in a headless session differs from the real desktop, so find icon positions from a screenshot first.

### Theming (light and dark)

A single `stylesheet.css` holds dark colors plus a `.dhp-light` override section. On every `open()`, `PreviewPopup._syncBackground()` checks `Main.getStyleVariant()` and toggles the `dhp-light` class together with the inline background (inline so `background-opacity` applies). **Don't rely on `stylesheet-light.css`**: GNOME didn't always reload extension stylesheets after a theme change (seen on Ubuntu with GNOME 50), which left dark text on the light background. To test light, use `--mode=ubuntu` with Ubuntu's Light appearance (`gtk-theme 'Yaru-purple'` and `color-scheme 'default'`), and save and restore both keys. The plain `user` mode never goes light, and Ubuntu mode rewrites `color-scheme` to match a `*-dark` gtk theme. Also check that the installed extension is a symlink to the repo (`./install.sh`): the curl installer leaves a copy, which silently runs old code.

### GNOME 50 pitfalls already hit (don't regress)

- **Popup placement**: `get_preferred_size()` is wrong (about 18×18) before the first layout. `PreviewPopup` re-runs `_reposition()` on `notify::size`, and raises itself with `set_child_above_sibling` on open, because the dock may be re-added to chrome after it. Removing either puts the popup off-screen or behind the dock.
- **Shutdown order**: on shell shutdown, actors are destroyed *before* `disable()` runs. Anything that can fire late (app `windows-changed`, dock pinning) must tolerate destroyed actors. That's why the popup's `destroy` handler unwatches the app and `pinDock` tracks the dock's `destroy`.
- **`disable()` must release everything**: signals (prefer `connectObject`/`disconnectObject`), `Timer`s, chrome, and faded window opacity (`peek.end(false)`). extensions.gnome.org review rejects leaks.

### Adding a setting

Add the key to `schemas/*.gschema.xml`, read it where it's used (read on use, not cached, unless a live update is needed; see `background-opacity` in `PreviewPopup`), add a row in `prefs.js` with the `spinRow`/`switchRow` helpers, and update the settings table in `README.md`.
