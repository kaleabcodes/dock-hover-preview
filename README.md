# Dock Hover Preview

GNOME Shell extension (GNOME 50, Wayland) that shows live window previews
when you hover a running app's icon in the dock — like Windows/macOS taskbar
previews.

Standalone: it uses only GNOME Shell's own APIs, so it works with the
built-in dash, Ubuntu Dock or Dash to Dock without depending on any of them.

## Features

- Live, scaled thumbnails of each window (they keep updating while shown)
- **Click** a thumbnail to focus that window; click the focused window's
  thumbnail to minimize it
- **Middle-click** or **×** closes a window
- **Peek**: rest on a thumbnail to fade out other windows and see it in place
- App icon, window title and focused-window highlight on each card
- Workspace badge when windows from all workspaces are shown
- Move the pointer from the icon into the preview without it disappearing
- Slides in from the dock's side; works with docks on any screen edge
- Many windows shrink to fit the screen; minimized windows are dimmed
- Closes when you click the icon, open its menu, switch workspace or open
  the overview
- Keeps an auto-hiding dock visible while you use the preview (if the dock
  supports it)

## Settings

`gnome-extensions prefs dock-hover-preview@kaleabcodes.dev`

| Page | Setting | Default |
| --- | --- | --- |
| Behavior | Hover delay | 300 ms |
| | Hide delay | 250 ms |
| | Current workspace only | on |
| | Click focused window to minimize | on |
| | Middle-click to close | on |
| | Peek at window / peek delay | on / 700 ms |
| Appearance | Preview width | 240 px |
| | Show window titles / app icon / close button | on |
| | Background opacity | 94 % |
| | Animation duration (0 = off) | 150 ms |

Appearance also has a **Reset All Settings** button.

## Files

| File | Purpose |
| --- | --- |
| `extension.js` | When to open/close the preview and peek; which windows to show |
| `iconTracker.js` | Detects which dock icon the pointer is over |
| `previewPopup.js` | The popup: layout, placement next to the icon, animations |
| `windowCard.js` | One window card: header, live thumbnail, click handling |
| `windowPeek.js` | Fades other windows out and back for peek |
| `util.js` | Debug logging and a small timer helper |
| `prefs.js` | Settings window |
| `schemas/` | Settings definitions |
| `stylesheet.css` | Popup styling |

## Develop

```bash
./install.sh     # compile settings schema, symlink into ~/.local/share/gnome-shell/extensions
# log out and back in (Wayland only loads code changes on login), then:
gnome-extensions enable dock-hover-preview@kaleabcodes.dev
journalctl -f -o cat _COMM=gnome-shell
```

To test without logging out, run a nested shell in a window:
`dbus-run-session gnome-shell --devkit`

Set `DHP_DEBUG=1` in gnome-shell's environment to log hover detection and
popup placement, e.g. `DHP_DEBUG=1 dbus-run-session gnome-shell --devkit`.

## Package

```bash
gnome-extensions pack --force \
  --extra-source=iconTracker.js --extra-source=previewPopup.js \
  --extra-source=windowCard.js --extra-source=windowPeek.js --extra-source=util.js
```

## Author

Kaleab Tesfaye — [kaleabcodes.dev](https://kaleabcodes.dev) —
[kaleabcodes@gmail.com](mailto:kaleabcodes@gmail.com)
