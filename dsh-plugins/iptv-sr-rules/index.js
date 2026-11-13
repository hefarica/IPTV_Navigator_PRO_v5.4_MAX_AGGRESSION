/**
 * Mitad Host del bundle `@local/iptv-sr-rules`.
 *
 * Este plugin no necesita Host: las reglas de superresolucion son contenido
 * estatico que renderiza la mitad Client. No registra Tools, ni Services, ni
 * listeners de Session. Por eso `apply` esta vacio: no hay nada que el Host
 * tenga que hacer, y fingir lo contrario seria declarar una capacidad que no
 * existe.
 */
export function apply() {}
