pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "ape-crystal-agent"
include(":app")
// ottshim (proxy loopback + pin de variante + QoE) empaquetado dentro de ARA.
// Fuente unica: <repo>/ottshim/app/src/main/kotlin (no se copia).
include(":shim")
