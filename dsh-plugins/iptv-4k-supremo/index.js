/**
 * Mitad Host del bundle `@local/iptv-4k-supremo`.
 *
 * El plugin no necesita Host: el catálogo es dato estático ya medido, y lo
 * pinta entero la mitad Client en el panel de la barra lateral izquierda.
 *
 * No registra Services, ni Tools, ni listeners de Session. Dejar `apply` vacío
 * es la declaración honesta: no hay ninguna capacidad del Host que este plugin
 * use, y registrar una Tool que solo devuelve una constante sería superficie
 * sin función. Lo que el agente necesita saber vive en las skills
 * `iptv-supreme-repos-4k`, `iptv-4k-source-truth-audit` e
 * `iptv-4k-pipeline-automation`, no en una Tool.
 */
export function apply() {}
