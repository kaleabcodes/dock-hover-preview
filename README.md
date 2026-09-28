<div align="center">

<img src="assets/icon.svg" alt="" width="128" height="128">

# Dock Hover Preview

**Live window previews for the GNOME dock.**

Hover a running app in the dock to see its open windows — then switch, peek
or close them without leaving the dock.

[![License: GPL-2.0-or-later](https://img.shields.io/badge/license-GPL--2.0--or--later-blue.svg)](LICENSE)
[![GNOME Shell 48–50](https://img.shields.io/badge/GNOME%20Shell-48%20%7C%2049%20%7C%2050-4a86cf.svg?logo=gnome&logoColor=white)](https://www.gnome.org)
[![Release](https://github.com/kaleabcodes/dock-hover-preview/actions/workflows/release.yml/badge.svg)](https://github.com/kaleabcodes/dock-hover-preview/actions/workflows/release.yml)

![Window previews above the dock](screenshots/preview.png)

</div>

## Features

- **Live thumbnails** of every window, updating in real time
- **Peek** — rest on a thumbnail to fade out other windows and see it in place
- **Quick actions** — click to switch, click again to minimize, middle-click
  or × to close
- **Works with any dock** — Dash to Dock, Ubuntu Dock or the built-in dash,
  on any screen edge
- **Media controls** — album art, title and ⏮ ⏯ ⏭ for apps playing music
  or video (Spotify, browsers, VLC…), even with no window open
- **Configurable** — delays, sizes, visible elements, opacity and animations

![Peeking at a window](screenshots/peek.png)

## Installation

Requires **GNOME Shell 48, 49 or 50** (e.g. Ubuntu 25.04 or newer, Fedora 42 or newer).

```bash
curl -fsSL https://raw.githubusercontent.com/kaleabcodes/dock-hover-preview/main/install.sh | bash
```

Then **log out and back in** — on Wayland, GNOME loads new extensions at
login. Run the same command again to update.

<details>
<summary>Install from source</summary>

```bash
git clone https://github.com/kaleabcodes/dock-hover-preview.git
cd dock-hover-preview
./install.sh
```

</details>

<details>
<summary>Uninstall</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/kaleabcodes/dock-hover-preview/main/install.sh | bash -s -- --uninstall
```

</details>

> [!NOTE]
> Coming soon to [extensions.gnome.org](https://extensions.gnome.org).

## Usage

| Action | Result |
| --- | --- |
| Hover a running app's dock icon | Show its window previews |
| Click a preview | Switch to that window |
| Click the focused window's preview | Minimize it |
| Rest on a preview | Peek at the window in place |
| Middle-click a preview, or click × | Close the window |

## Configuration

Open **Extensions → Dock Hover Preview → Settings**, or run:

```bash
gnome-extensions prefs dock-hover-preview@kaleabcodes.dev
```

<details>
<summary>All settings</summary>

| Setting | Default | Description |
| --- | --- | --- |
| Hover delay | 300 ms | Time on an icon before the preview opens |
| Hide delay | 250 ms | Time the preview stays open after the pointer leaves |
| Current workspace only | On | Hide windows on other workspaces |
| Click focused window to minimize | On | Clicking the active window's preview minimizes it |
| Middle-click to close | On | Middle-clicking a preview closes the window |
| Peek at window | On | Fade out other windows while resting on a preview |
| Peek delay | 700 ms | Time on a preview before peeking |
| Preview width | 240 px | Maximum thumbnail width |
| Show titles / app icon / close button | On | Elements shown on each preview |
| Background opacity | 94 % | Popup background opacity |
| Animation duration | 150 ms | `0` turns animations off |

![Settings window](screenshots/settings.png)

</details>

## Troubleshooting

- **Nothing happens on hover** — log out and back in after installing, then
  check that the extension is enabled:
  `gnome-extensions info dock-hover-preview@kaleabcodes.dev`
- **Errors** — check the shell log:
  `journalctl -b -o cat _COMM=gnome-shell | grep -i dock-hover`

Still stuck? [Open an issue](https://github.com/kaleabcodes/dock-hover-preview/issues).

## Contributing

Bug reports, ideas and pull requests are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for development setup and the release
process.

## License

Released under the [GNU General Public License v2.0 or later](LICENSE).

Made by [Kaleab Tesfaye](https://github.com/kaleabcodes).
