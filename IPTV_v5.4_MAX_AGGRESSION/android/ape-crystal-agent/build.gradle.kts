// Root build — APE Crystal Agent
plugins {
    id("com.android.application") version "8.3.2" apply false
    // :shim es un modulo de libreria; AGP exige declarar el plugin en el root.
    id("com.android.library") version "8.3.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
}
