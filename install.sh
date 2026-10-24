#!/usr/bin/env bash
# Install Lectio for the current user.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
data=${XDG_DATA_HOME:-$HOME/.local/share}

mkdir -p "$HOME/.local/bin" "$data/applications" "$data/icons/hicolor/scalable/apps"
ln -sf "$here/lectio" "$HOME/.local/bin/lectio"
cp "$here/io.github.jamers99.lectio.desktop" "$data/applications/"
cp "$here/io.github.jamers99.lectio.svg" "$data/icons/hicolor/scalable/apps/"
