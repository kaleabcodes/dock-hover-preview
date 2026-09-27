# Contributing

Thanks for helping improve Dock Hover Preview! Bug reports, feature ideas and
pull requests are all welcome.

## Reporting bugs

[Open an issue](https://github.com/kaleabcodes/dock-hover-preview/issues)
with:

- Your GNOME Shell version (`gnome-shell --version`) and dock extension
- Steps to reproduce
- Relevant log output:
  `journalctl -b -o cat _COMM=gnome-shell | grep -i dock-hover`

## Development setup

```bash
git clone https://github.com/kaleabcodes/dock-hover-preview.git
cd dock-hover-preview
./install.sh
```

`install.sh` compiles the settings schema and links the folder into
`~/.local/share/gnome-shell/extensions`, so your edits apply at your next
login.

To test without logging out, run a nested GNOME Shell in a window:

```bash
dbus-run-session gnome-shell --devkit
```

Set `DHP_DEBUG=1` to log hover detection and popup placement:

```bash
DHP_DEBUG=1 dbus-run-session gnome-shell --devkit
```

## Project layout

| File | Purpose |
| --- | --- |
| `extension.js` | When to open/close the preview and peek; which windows to show |
| `iconTracker.js` | Detects which dock icon the pointer is over |
| `previewPopup.js` | The popup: layout, placement next to the icon, animations |
| `windowCard.js` | One window card: header, live thumbnail, click handling |
| `windowPeek.js` | Fades other windows out and back in for peek |
| `util.js` | Debug logging and a timer helper |
| `prefs.js` | Settings window |
| `schemas/` | Settings definitions |
| `stylesheet.css` | Popup styling |

The extension uses only GNOME Shell's own APIs — please keep it independent
of any specific dock extension.

## Pull requests

- Keep changes focused, and match the existing code style
- Release every signal, timer and actor in `disable()` — this is required by
  the [extensions.gnome.org review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
- Test in a nested shell before opening the PR

## Releasing

Pushing a version tag publishes a release:

```bash
git tag v1.1
git push origin v1.1
```

The [Release workflow](.github/workflows/release.yml) checks the sources,
builds the zip, uploads it to extensions.gnome.org and creates a GitHub
release. It can also be run manually from the **Actions** tab.

It requires the repository secrets `EGO_USERNAME` and `EGO_PASSWORD`
(extensions.gnome.org login). Each upload is reviewed on extensions.gnome.org
before users receive it.

To build the zip locally (written to `dist/`):

```bash
./pack.sh          # or ./pack.sh 1.1 to set the version name
```
