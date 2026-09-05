import java.io.FileInputStream
import java.util.Properties

/* Release signing credentials, kept out of the repo (see .gitignore).
 *
 * Read defensively: a fresh clone has no keystore.properties, and the whole
 * project must still configure and build a debug APK for anyone who does not
 * hold the signing key. Only `assembleRelease` needs it. */
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) FileInputStream(keystorePropsFile).use { load(it) }
}

/* Which site the TEST build talks to. Set in gradle.properties (see the note
 * there); production is hardcoded below and never read from a property.
 *
 * Normalised to a trailing slash so Http.joinUrl has one shape to reason about,
 * and only accepted as https — a staging build is going to carry a real
 * password and a real session cookie.
 *
 * Empty is allowed: leaving it unset must not stop anyone building the PROD
 * app. The staging build then compiles and refuses at the first request, with a
 * message naming the line to fill in — which is far easier to act on than a
 * build failure in a file nobody has opened. */
val stagingBaseUrl: String = (project.findProperty("gg.stagingBaseUrl") as String?)
    ?.trim()
    ?.takeIf { it.startsWith("https://") }
    ?.let { if (it.endsWith("/")) it else "$it/" }
    .orEmpty()

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.gogrameen.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.gogrameen.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            if (keystorePropsFile.exists()) {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            /* R8 is off for now. It would cut the APK roughly in half, which
               matters on 4G, but a shrunk build has to be tested as carefully
               as a written feature and this one is going to a client as a
               preview. Turn it on — with isShrinkResources — once the app has
               screens worth measuring. */
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    /* Every test in the project lives under android/tests/, not in the two
     * places Gradle would look by default.
     *
     * One folder because that is where someone goes looking for "the tests",
     * and because the web half of this repo already keeps its vitest suites in
     * a top-level tests/ directory — one convention across both halves beats
     * each half following its own.
     *
     * The split inside it is the one that actually matters and is not a matter
     * of taste: `unit` runs on the JVM in seconds with no device, `device`
     * needs a phone or emulator. Gradle keeps them as separate source sets
     * because they compile against different things.
     *
     * srcDirs REPLACES the default rather than adding to it, on purpose: a
     * test file dropped into app/src/test/ must fail to run rather than
     * quietly become the one nobody can find. */
    sourceSets {
        getByName("test").java.srcDirs("../tests/unit")
        getByName("androidTest").java.srcDirs("../tests/device")
    }

    buildFeatures {
        compose = true
        /* Off by default since AGP 8. The two flavours below differ ONLY in
           generated BuildConfig fields, so without this there is no split. */
        buildConfig = true
    }

    /* Two apps out of one codebase: one that talks to www.gogrameen.in and one
     * that talks to staging.
     *
     * This exists because of what comes next. Reading the catalogue against
     * production is harmless; placing a test order against it is not — it would
     * decrement a real farmer's real stock and land on their real dashboard.
     * The split has to be here BEFORE checkout is written, not retrofitted
     * across a dozen screens afterwards.
     *
     * `prod` is declared first so prodDebug is the variant Studio selects by
     * default: the everyday build is the one aimed at the real site, and
     * reaching for the test build is a deliberate act. */
    flavorDimensions += "env"
    productFlavors {
        create("prod") {
            dimension = "env"
            buildConfigField("String", "API_BASE_URL", "\"https://www.gogrameen.in/\"")
            buildConfigField("boolean", "IS_STAGING", "false")
        }
        create("staging") {
            dimension = "env"
            /* A DIFFERENT application id, so both installs can sit on one phone.
               Sharing the id would make installing either one uninstall the
               other, which is exactly the phone you want during a demo. The
               name is overridden to "Go Grameen (Test)" in
               src/staging/res/values/strings.xml so the drawer says which is
               which. */
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField("String", "API_BASE_URL", "\"$stagingBaseUrl\"")
            buildConfigField("boolean", "IS_STAGING", "true")
            if (stagingBaseUrl.isEmpty()) {
                project.logger.warn(
                    "Go Grameen: gg.stagingBaseUrl is not set in android/gradle.properties, " +
                        "so the staging build has nowhere to talk to. Prod is unaffected.",
                )
            }
        }
    }
}

dependencies {

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)

    /* The catalogue's three additions.
     *
     * navigation-compose: MainActivity said routing waits for a second screen;
     * the catalogue and its detail page are that second and third screen.
     *
     * kotlinx-serialization: /api/produce returns ~45 fields per listing and
     * the app reads eight of them. A @Serializable data class with
     * ignoreUnknownKeys is the only shape where the API growing a column
     * cannot crash the app.
     *
     * coil: produce photos are remote URLs out of Supabase Storage. Nothing is
     * hand-rolled here — decoding, downsampling to the view, memory and disk
     * caching and cancel-on-scroll are exactly what goes wrong when it is.
     *
     * Deliberately NOT added: Retrofit/OkHttp. There is one GET, it takes no
     * auth and no headers, and HttpURLConnection makes it in ten lines. See
     * ProduceApi.kt. */
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.coil.compose)

    testImplementation(libs.junit)
    /* Lets the ViewModel's debounce and request-cancelling be tested on the JVM
       in milliseconds instead of by typing into a phone and watching. */
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}