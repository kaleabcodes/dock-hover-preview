#!/usr/bin/env bash
# Symlinks this folder into GNOME's extensions directory so edits apply
# after reloading the shell (log out/in on Wayland, or use a devkit session).
set -euo pipefail

SRC=$(cd "$(dirname "$0")" && pwd)
UUID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$SRC/metadata.json")
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

glib-compile-schemas "$SRC/schemas"
ln -sfn "$SRC" "$DEST"
echo "Linked $DEST -> $SRC"
echo "Log out and back in, then run: gnome-extensions enable $UUID"
