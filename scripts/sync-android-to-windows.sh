#!/usr/bin/env bash
# Push the Android project from WSL to the Windows filesystem for building.
#
# WHY THIS EXISTS: Android Studio runs on Windows (this PC has 8 GB of RAM and
# Studio through WSLg was unusable), but the repo — and all editing — stays in
# WSL. Building from \\wsl$\... is not an option: Gradle does tens of thousands
# of small file reads and the 9p share turns a 40-second build into minutes.
# So the WSL copy is the source of truth and this pushes it to C: before a build.
#
# One direction only, on purpose. Edit in WSL, sync, then use Studio purely as a
# build-and-install button. Anything typed into Studio is overwritten on the
# next sync.
#
# Not synced: build/ and .gradle/ (Windows makes its own) and local.properties,
# which holds an absolute SDK path that differs between the two systems.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../android" && pwd)/"
DEST="/mnt/c/Users/HP/GoGrameen/android/"

mkdir -p "$DEST"
rsync -a --delete \
  --exclude 'build/' \
  --exclude '.gradle/' \
  --exclude '.idea/' \
  --exclude 'local.properties' \
  "$SRC" "$DEST"

echo "Synced → C:\\Users\\HP\\GoGrameen\\android"
