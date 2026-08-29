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

/** Served straight from public/. Same-origin, so the <a download> works. */
export const APK_URL = '/downloads/gogrameen.apk'

/** The name the file lands under in the phone's Downloads folder. */
export const APK_FILENAME = 'GoGrameen.apk'

/** versionName out of the build. Shown so a tester can say which one they have. */
export const APK_VERSION = '1'

/** Rounded, for the button. Worth showing: people on 4G decide by this. */
export const APK_SIZE_LABEL = '2.5 MB'
