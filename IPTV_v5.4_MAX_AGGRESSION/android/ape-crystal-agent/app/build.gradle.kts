import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ── Secreto de enrolamiento ARA (build-time, NUNCA en el repo). ───────────────
// Orden: local.properties (ape.enroll.secret) → env APE_ENROLL_SECRET → placeholder inerte.
// DEBE coincidir con env[APE_ENROLL_SECRET] del pool php-fpm del VPS; si no → /ara/enroll 401 BAD_SECRET.
val apeEnrollSecret: String = run {
    val props = Properties()
    val lp = rootProject.file("local.properties")
    if (lp.exists()) FileInputStream(lp).use { props.load(it) }
    props.getProperty("ape.enroll.secret")
        ?: System.getenv("APE_ENROLL_SECRET")
        ?: "CHANGE_ME_ENROLL_SECRET_AT_LEAST_32_CHARS"
}

android {
    namespace = "com.ape.crystalagent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.ape.crystalagent"
        minSdk = 22            // Fire OS 5 (Android 5.1) en adelante
        targetSdk = 28         // <29: conserva libertad de servicio en background en Fire OS
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "ENROLL_SECRET", "\"$apeEnrollSecret\"")
    }

    buildFeatures {
        buildConfig = true   // expone BuildConfig.ENROLL_SECRET (secreto inyectado en build-time)
    }

    buildTypes {
        release {
            isMinifyEnabled = false   // app pequeña; sin ofuscación para depurar en device
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
        isCoreLibraryDesugaringEnabled = true   // records desugaring (WireGuard tunnel lib)
    }
    kotlinOptions { jvmTarget = "11" }

    // dadb (F2) arrastra bouncycastle/okio con META-INF duplicados → mergeJavaResource FALLA sin esto.
    packaging {
        resources {
            excludes += setOf(
                "META-INF/DEPENDENCIES", "META-INF/INDEX.LIST",
                "META-INF/*.kotlin_module", "META-INF/versions/**",
                "META-INF/LICENSE*", "META-INF/NOTICE*",
                "META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA",
                "META-INF/BC*.SF", "META-INF/BC*.DSA", "META-INF/BC*.RSA"
            )
            pickFirsts += setOf("META-INF/AL2.0", "META-INF/LGPL2.1")
        }
    }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.core:core-ktx:1.12.0")              // FileProvider (SelfUpdateManager)
    implementation("com.wireguard.android:tunnel:1.0.20211029")  // WireGuard embebido (GoBackend/VpnService) — pre-records (compat D8/minSdk22)
    implementation("androidx.security:security-crypto:1.1.0-alpha06") // EncryptedSharedPreferences (clave WG)
    // F3 — player propio (ExoPlayer media3) con track-selection HEVC-first + ListLoader streaming
    implementation("androidx.media3:media3-exoplayer:1.3.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.3.1")
    implementation("androidx.media3:media3-ui:1.3.1")
    // F3+F6 — frame-feed real: media3-effect (GlShaderProgram GPU-directo) = UltraEnhance sobre cada frame
    implementation("androidx.media3:media3-effect:1.3.1")
    implementation("androidx.media3:media3-common:1.3.1")
    // F2 — ADB self-grant (Shizuku-style): cliente ADB pure-Kotlin para pair/connect/grant en localhost
    implementation("dev.mobile:dadb:1.2.7")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.4")  // records desugaring (WireGuard tunnel lib)
    // F6 UltraEnhance — inferencia on-device (CAR-CNN/ESRGAN/RIFE). minSdk 21 ≤ 22; core+gpu misma versión.
    // En 2.14 el GPU delegate se partió: -gpu (impl/.so) + -gpu-api (GpuDelegateFactory.Options, supertype de GpuDelegate.Options).
    implementation("org.tensorflow:tensorflow-lite:2.14.0")
    implementation("org.tensorflow:tensorflow-lite-gpu:2.14.0")
    implementation("org.tensorflow:tensorflow-lite-gpu-api:2.14.0")
}
