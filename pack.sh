#!/usr/bin/env bash
# Builds the zip uploaded to extensions.gnome.org. Used locally and by CI,
# so it only needs zip and python3 (no GNOME Shell).
#
#   ./pack.sh            -> dist/<uuid>.shell-extension.zip
#   ./pack.sh 1.2        -> same, with version-name set to 1.2
set -euo pipefail

SRC=$(cd "$(dirname "$0")" && pwd)
cd "$SRC"

UUID=$(python3 -c 'import json; print(json.load(open("metadata.json"))["uuid"])')
OUT="$SRC/dist/$UUID.shell-extension.zip"
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT

cp extension.js prefs.js iconTracker.js previewPopup.js previewGeometry.js windowCard.js contentCards.js contentSources.js mediaMatch.js \
   windowPeek.js util.js stylesheet.css LICENSE metadata.json "$BUILD/"
mkdir "$BUILD/schemas"
cp schemas/*.gschema.xml "$BUILD/schemas/"

if [[ $# -ge 1 ]]; then
    python3 - "$BUILD/metadata.json" "$1" <<'PY'
import json, sys
path, version = sys.argv[1], sys.argv[2]
meta = json.load(open(path))
meta["version-name"] = version
open(path, "w").write(json.dumps(meta, indent=2) + "\n")
PY
fi

mkdir -p "$SRC/dist"
rm -f "$OUT"
(cd "$BUILD" && zip -qr "$OUT" .)
echo "$OUT"
