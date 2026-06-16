plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
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
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions { jvmTarget = "1.8" }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
