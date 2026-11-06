// ── :shim — ottshim como modulo de ARA (background, misma interfaz) ─────────────
// DECISION: el proxy loopback entra DENTRO del APK de ARA, no como APK aparte.
//   · "cuando se instale el ARA, esto ya esta"        -> un solo install
//   · "use la misma interfaz de ARA"                   -> mismo proceso, mismo UI
//   · "desde ahi despegar su actualizacion/instalacion" -> SelfUpdateManager de ARA
//     (consulta /ara/version, descarga /ara/agent.apk, verifica sha256 + PIN DE FIRMA,
//      fail-closed). Un segundo APK no tendria ruta de update verificada.
//
// Las FUENTES NO SE COPIAN: se reusa el mismo srcDir de ottshim/ para que no existan
// dos verdades del motor. El manifest del modulo declara solo los services (ver
// src/main/AndroidManifest.xml): el Activity y los attrs de <application> de ottshim
// NO se mergean, para no pisar el icono/tema de ARA.
//
// minSdk 22 (el de ARA, Fire OS 5). ottshim pedia 26: los usos API-26 van guardados
// dentro del propio codigo (NotificationChannel, startForegroundService).
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.venice.ottshim"
    compileSdk = 34

    defaultConfig {
        minSdk = 22
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions { jvmTarget = "11" }

    // Fuente unica: <repo>/ottshim/app/src/main/kotlin
    // (desde ape-crystal-agent/shim: ../../../../ = raiz del repo)
    sourceSets["main"].kotlin.srcDir("../../../../ottshim/app/src/main/kotlin")
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
