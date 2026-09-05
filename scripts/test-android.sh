#!/usr/bin/env bash
# Run the Android unit tests in one command, the way `npm test` runs the web ones.
#
# WHY THIS EXISTS: these tests cannot run in WSL. There is no Android SDK on this
# side and AGP needs JDK 17+, both of which live on Windows. So this syncs the
# repo to C: first (WSL stays the source of truth) and then drives the WINDOWS
# gradle through cmd.exe — the fast native build, not the 9p share.
#
# Usage:
#   scripts/test-android.sh                        every JVM unit test
#   scripts/test-android.sh --tests '*LangTest'    one class
#   scripts/test-android.sh --tests '*HttpTest'    the network layer
#   Anything you pass is handed straight to gradle.
#
# NOT included: the Compose UI tests in app/src/androidTest. Those are
# instrumented — they need a running emulator or a plugged-in phone, via
# `gradlew.bat :app:connectedAndroidTest`.
set -euo pipefail

DEST="/mnt/c/Users/HP/GoGrameen/android"

# The app has two product flavours (prod / staging), so there is no plain
# `testDebugUnitTest` any more — the task is per variant. We run the PROD one:
# the flavours differ only in generated BuildConfig fields, and prodDebug is the
# variant Studio selects by default, so this is the build people actually have.
# To check the other: scripts/test-android.sh works on it via
#   cmd.exe /c "gradlew.bat :app:testStagingDebugUnitTest"
VARIANT="ProdDebug"
RESULTS="$DEST/app/build/test-results/test${VARIANT}UnitTest"

"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/sync-android-to-windows.sh"

# --rerun-tasks so the tests actually execute; without it gradle reports
# UP-TO-DATE and silently reuses the previous run's result.
cd "$DEST"
set +e
cmd.exe /c "gradlew.bat :app:test${VARIANT}UnitTest --rerun-tasks --console=plain $*" \
  | grep -vE '^WARNING: |^$'
status=${PIPESTATUS[0]}
set -e

# Gradle prints nothing per-test on success, so summarise the XML ourselves.
awk -F'"' '/<testsuite /{for(i=1;i<=NF;i++){
    if($(i)~/ tests=$/)t+=$(i+1); if($(i)~/ failures=$/)f+=$(i+1);
    if($(i)~/ errors=$/)e+=$(i+1);  if($(i)~/ skipped=$/)s+=$(i+1)}}
  END{printf "\n  Tests  %d passed", t-f-e-s;
      if(f+e)printf ", %d failed", f+e; if(s)printf ", %d skipped", s;
      printf " (%d)\n", t}' "$RESULTS"/*.xml

# Exit with gradle's status, so a failing test fails the command.
exit "$status"
