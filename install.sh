#!/usr/bin/env bash
# Installs Dock Hover Preview for the current user.
#
# From GitHub (downloads the latest version and installs a copy):
#   curl -fsSL https://raw.githubusercontent.com/kaleabcodes/dock-hover-preview/main/install.sh | bash
#
# From a clone (links the folder, so edits apply at your next login):
#   ./install.sh
#
# Uninstall (either way):
#   ./install.sh --uninstall
#   curl -fsSL https://raw.githubusercontent.com/kaleabcodes/dock-hover-preview/main/install.sh | bash -s -- --uninstall
set -euo pipefail

REPO=kaleabcodes/dock-hover-preview
BRANCH=main
UUID=dock-hover-preview@kaleabcodes.dev
EXT_DIR="$HOME/.local/share/gnome-shell/extensions"
DEST="$EXT_DIR/$UUID"
FILES=(extension.js prefs.js iconTracker.js previewPopup.js windowCard.js contentCards.js contentSources.js mediaMatch.js
       windowPeek.js util.js stylesheet.css metadata.json LICENSE)

# Adds or removes the extension in GNOME's list of enabled extensions, so
# it's on (or off) from the next login without needing the shell running.
set_enabled() {
    local current
    current=$(gsettings get org.gnome.shell enabled-extensions)
    gsettings set org.gnome.shell enabled-extensions "$(python3 - "$current" "$UUID" "$1" <<'PY'
import ast, sys
raw, uuid, enable = sys.argv[1], sys.argv[2], sys.argv[3] == "on"
raw = raw.removeprefix("@as ")
items = [i for i in ast.literal_eval(raw) if i != uuid]
if enable:
    items.append(uuid)
print(repr(items))
PY
)"
}

if [[ "${1:-}" == "--uninstall" ]]; then
    gnome-extensions disable "$UUID" 2>/dev/null || true
    set_enabled off
    rm -rf "$DEST"
    echo "Removed $UUID. Log out and back in to finish."
    exit 0
fi

mkdir -p "$EXT_DIR"
rm -rf "$DEST"

# Running from a clone: link it for development.
SRC=$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd || true)
if [[ -n "$SRC" && -f "$SRC/metadata.json" && -f "$SRC/extension.js" ]]; then
    glib-compile-schemas "$SRC/schemas"
    ln -s "$SRC" "$DEST"
    echo "Linked $DEST -> $SRC"
else
    # Piped from curl: download the latest code and install a copy.
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT
    echo "Downloading $REPO ($BRANCH)..."
    curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" |
        tar -xz -C "$TMP" --strip-components=1

    mkdir -p "$DEST/schemas"
    for f in "${FILES[@]}"; do
        cp "$TMP/$f" "$DEST/"
    done
    cp "$TMP"/schemas/*.gschema.xml "$DEST/schemas/"
    glib-compile-schemas "$DEST/schemas"
    echo "Installed to $DEST"
fi

set_enabled on
# Takes effect now if GNOME already knows the extension (e.g. an update).
gnome-extensions enable "$UUID" 2>/dev/null || true

echo "Done. Log out and back in to start Dock Hover Preview."
echo "Settings: gnome-extensions prefs $UUID"
