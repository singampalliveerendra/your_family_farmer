/* The Android build offered for direct download on /home.
 *
 * Not on the Play Store yet — the client wants the app distributed from the
 * site first, so the APK is served as a plain static file out of public/ and
 * this module is the single place that describes it. The download button, the
 * headers in next.config.ts and anything added later all read from here, so
 * shipping a new build is: drop the file in, bump these three lines.
 *
 * WHY public/ AND NOT SUPABASE STORAGE: it has to work with no bucket, no
 * policy and no signed URL, and 2.5 MB is nothing next to a git repo. The
 * trade is that every future build adds another 2.5 MB blob to git history
 * permanently. Past a handful of releases, move this to a Storage bucket and
 * point APK_URL at the public object — nothing else here has to change.
 */

/* KILL SWITCH — false, and THE FILE BELOW NO LONGER EXISTS.
 *
 * 2026-09-09: public/downloads/gogrameen.apk was the STAGING flavour. Unpacked,
 * it reported package `in.gogrameen.app.staging`, label "Go Grameen (Test)",
 * and a base URL hardcoded to the staging Vercel deployment. Prod served a
 * byte-identical copy (same sha256), because APK_URL is one static file in
 * public/ and nothing here is environment-aware — so gogrameen.in was handing
 * every farmer a test app wired to the test server. Orders placed in it land in
 * the staging database and no farmer or moderator ever sees them.
 *
 * Hiding the button was not enough: the file stayed fetchable at its direct URL
 * for anyone who had saved or shared it. So the APK, its header block in
 * next.config.ts, and the assetlinks entry that verified it were all deleted.
 * The constants below are kept as the shape a real release must fill in.
 *
 * While this is false the Android section offers the PWA install instead, which
 * always points at the origin it is served from — the real site.
 *
 * To ship a real one: build the `prod` flavour (android/app/build.gradle.kts
 * pins API_BASE_URL to https://www.gogrameen.in/), sign it with the release
 * keystore, put it in public/downloads/, update the three lines below, restore
 * the header block in next.config.ts, add the prod package + its signing
 * fingerprint to public/.well-known/assetlinks.json, and flip this to true.
 * Do all five — flipping this alone serves a 404.
 *
 * NOTE: the prod build's applicationId differs from the test one, so Android
 * treats them as different apps. Anyone who installed "Go Grameen (Test)" must
 * uninstall it by hand; there is no update path.
 */
export const APK_AVAILABLE = false

/** Served straight from public/. Same-origin, so the <a download> works. */
export const APK_URL = '/downloads/gogrameen.apk'

/** The name the file lands under in the phone's Downloads folder. */
export const APK_FILENAME = 'GoGrameen.apk'

/** versionName out of the build. Shown so a tester can say which one they have. */
export const APK_VERSION = '1'

/** Rounded, for the button. Worth showing: people on 4G decide by this. */
export const APK_SIZE_LABEL = '2.5 MB'
