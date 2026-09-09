# Digital Asset Links

`assetlinks.json` is what lets the Go Grameen Android app (a Trusted Web
Activity — Chrome rendering this site full-screen) prove it is allowed to
open this domain WITHOUT showing a URL bar. Android fetches it over HTTPS on
first launch. If it is missing, unreachable, or the fingerprint does not
match the APK's signing certificate, the app silently degrades to a Chrome
Custom Tab with the address bar visible — which is the single most common
way a TWA "looks like a browser" instead of an app.

One entry per app that may claim this domain. Today: **EMPTY, on purpose.**

Until 2026-09-09 this listed the STAGING build (`in.gogrameen.app.staging`),
which meant the REAL domain formally vouched for a test app — one wired to the
staging server, whose orders land in a database no farmer ever reads. That build
was also the file being served from `/downloads`, so gogrameen.in was handing it
out and then verifying it. Both are now gone; an empty array claims nothing,
which is the honest answer while no Android app ships.

Do not re-add an entry to make an existing install behave better. An entry here
is a statement that the app IS this site, and the only app that has ever asked
for one was the test build.

Two things to remember when production ships:
1. Production gets its own package id and its own keystore, so it needs its
   OWN object added to this array — it does not inherit the staging one.
2. If Play App Signing is enabled, Google RE-SIGNS the upload with a
   different key. The fingerprint that then matters is the one Play shows
   under "App signing key certificate", NOT the upload key's. Add both.

Verify a deploy with:
  curl https://<host>/.well-known/assetlinks.json
