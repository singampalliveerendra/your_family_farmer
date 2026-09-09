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

/* KILL SWITCH — false while the file in public/ is the WRONG BUILD.
 *
 * 2026-09-09: public/downloads/gogrameen.apk is the STAGING flavour. Unpacked,
 * it reports package `in.gogrameen.app.staging`, label "Go Grameen (Test)", and
 * a base URL hardcoded to the staging Vercel deployment. It is byte-identical
 * on prod (same sha256), because APK_URL is one static file in public/ and
 * nothing here is environment-aware — so gogrameen.in was handing every farmer
 * a test app wired to the test server. Orders placed in it land in the staging
 * database and no farmer or moderator ever sees them.
 *
 * While this is false the Android section offers the PWA install instead, which
 * always points at the origin it is served from — the real site.
 *
 * To turn it back on: build the `prod` flavour (android/app/build.gradle.kts
 * pins API_BASE_URL to https://www.gogrameen.in/), sign it with the release
 * keystore, drop it in public/downloads/, update the three lines below AND
 * public/.well-known/assetlinks.json — which still names the .staging package
 * and so currently verifies the test app against the real domain. Then flip
 * this to true.
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
