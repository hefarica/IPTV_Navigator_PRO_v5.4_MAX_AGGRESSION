<?php
declare(strict_types=1);

// === APE MODULE LOADER — BULLETPROOF ===
// All external modules loaded with file_exists + function_exists guards
// This prevents Fatal Errors when a module is missing from the VPS
function ape_safe_call($func_name, ...$args) {
    if (function_exists($func_name)) {
        return call_user_func_array($func_name, $args);
    }
    // Log missing function for debugging
    @file_put_contents(__DIR__ . '/logs/missing_functions.log',
        date('Y-m-d H:i:s') . " MISSING: {$func_name}()\n", FILE_APPEND);
    return null;
}

require_once __DIR__ . "/rq_sniper_mode.php";
if (file_exists(__DIR__ . "/ape_stream_validator_proxy.php")) {
    require_once __DIR__ . "/ape_stream_validator_proxy.php";
}
if (file_exists(__DIR__ . "/rq_anti_cut_engine.php")) {
    require_once __DIR__ . "/rq_anti_cut_engine.php";
}
if (file_exists(__DIR__ . "/ape_anti_noise_engine.php")) {
    require_once __DIR__ . "/ape_anti_noise_engine.php";
}
if (file_exists(__DIR__ . "/ape_hdr_peak_nit_engine.php")) {
    require_once __DIR__ . "/ape_hdr_peak_nit_engine.php";
}



/**
 * RESOLVE QUALITY v3.0 — Autonomous Playback Intelligence System
 * ================================================================
 * Procesador de listas M3U/M3U8 con pipeline de 15 módulos.
 *
 * Pipeline: PARSE → NORMALIZE → CAPABILITIES → CONTENT → ESCALATE
 *           → RESILIENCE → INJECT → GUARDIAN → CACHE → OUTPUT
 *           → FEEDBACK → MUTATE → VARIANT → LATENCY → PRELOAD
 *
 * v3.0 Additions (backward compatible with v2.5):
 *   - RuntimeFeedbackCollector: telemetría en tiempo real desde el player
 *   - AdaptiveProfileMutator: mutación dinámica de perfil por sesión
 *   - MultiVariantSelector: evaluación de variantes de stream
 *   - LatencyAwareRouter: routing basado en latencia medida
 *   - PredictivePreloader: predicción de cambio de canal
 *
 * Política anti-509: nunca se origina tráfico paralelo.
 * Política idempotente: misma entrada = misma salida.
 * Política de seguridad: nunca se devuelven errores HTTP al reproductor.
 */

// ============================================================================
// CONSTANTES GLOBALES
// ============================================================================

/** Versión del resolver para cabeceras HTTP */
const RQ_VERSION = '3.0.0-AUTONOMOUS';

/** Directorio base para caché y logs */
const RQ_BASE_DIR = __DIR__;

/** TTL de caché en segundos para modo lista */
const RQ_CACHE_TTL_LIST = 300;

/** TTL de caché en segundos para modo canal */
const RQ_CACHE_TTL_CHANNEL = 30;

/** Tiempo máximo de fetch remoto en segundos */
const RQ_FETCH_TIMEOUT = 10;

/** Tiempo máximo permitido para el pipeline en milisegundos */
const RQ_PIPELINE_MAX_MS = 30;

/** Secreto HMAC para autenticación de endpoints de telemetría (v3.0) */
const RQ_SECRET_TOKEN = 'cambia_esto_por_un_secreto_aleatorio_64chars';

/** Rate limiting: máximas peticiones por endpoint por IP en ventana de 60s */
const RQ_RATE_LIMITS = [
    'feedback' => 10,
    'health'   => 30,
    'predict'  => 20,
    'latency'  => 20,
    'variant'  => 20,
    'resolve'  => 60,
    'raw'      => 30,
];

/** Ventana de rate limiting en segundos */
const RQ_RATE_WINDOW = 60;

// ============================================================================
// ENUM: Tipo de lista detectado
// ============================================================================

enum ListType: string
{
    case LIVE    = 'live';
    case VOD     = 'vod';
    case SERIES  = 'series';
    case MIXED   = 'mixed';
    case UNKNOWN = 'unknown';
}

// ============================================================================
// ENUM: Tipo de reproductor detectado
// ============================================================================

enum PlayerType: string
{
    case VLC      = 'vlc';
    case KODI     = 'kodi';
    case OTT      = 'ott';
    case EXO      = 'exo';
    case TIVIMATE = 'tivimate';
    case SMART_TV = 'smart_tv';
    case WEB      = 'web';
    case GENERIC  = 'generic';
}

// ============================================================================
// ENUM: Tipo de conexión de red
// ============================================================================

enum ConnectionType: string
{
    case ETHERNET = 'ethernet';
    case WIFI     = 'wifi';
    case MOBILE   = 'mobile';
    case UNKNOWN  = 'unknown';
}

// ============================================================================
// ENUM: Tipo de contenido clasificado
// ============================================================================

enum ContentType: string
{
    case SPORTS       = 'sports';
    case CINEMA       = 'cinema';
    case NEWS         = 'news';
    case MUSIC        = 'music';
    case DOCUMENTARY  = 'documentary';
    case KIDS         = 'kids';
    case GENERAL      = 'general';
}

// ============================================================================
// ENUM: Modo de failover
// ============================================================================

enum FailoverMode: string
{
    case SEAMLESS = 'seamless';
    case MANUAL   = 'manual';
    case DISABLED = 'disabled';
}

// ============================================================================
// ENUM: Tipo de retroceso de reintentos
// ============================================================================

enum RetryBackoff: string
{
    case LINEAR      = 'linear';
    case EXPONENTIAL = 'exponential';
}

// ============================================================================
// ENUM: Mutación de perfil adaptativa
// ============================================================================

enum MutationDirection: string
{
    case UPGRADE  = 'upgrade';
    case DOWNGRADE = 'downgrade';
    case HOLD     = 'hold';
}

// ============================================================================
// ENUM: Grado de calidad de red
// ============================================================================

enum NetworkGrade: string
{
    case EXCELLENT = 'excellent';
    case GOOD      = 'good';
    case FAIR      = 'fair';
    case POOR      = 'poor';
    case CRITICAL  = 'critical';
}

// ============================================================================
// PERFILES DE CONTENIDO — Modificadores por tipo de contenido
// ============================================================================

/**
 * Perfiles que modifican el comportamiento del pipeline según el tipo de contenido.
 * Cada perfil define modificadores de buffer, latencia, codec preferido, etc.
 */
const CONTENT_PROFILES = [
    ContentType::SPORTS->value => [
        'buffer_modifier'      => 1.4,
        'latency_sensitivity'  => 'low',
        'preferred_codec'      => 'hevc',
        'min_bitrate_kbps'     => 5000,
    ],
    ContentType::CINEMA->value => [
        'buffer_modifier'      => 1.2,
        'latency_sensitivity'  => 'normal',
        'preferred_codec'      => 'hevc',
        'min_bitrate_kbps'     => 8000,
    ],
    ContentType::NEWS->value => [
        'buffer_modifier'      => 1.0,
        'latency_sensitivity'  => 'high',
        'preferred_codec'      => null,
        'min_bitrate_kbps'     => 2000,
    ],
    ContentType::MUSIC->value => [
        'buffer_modifier'      => 1.1,
        'latency_sensitivity'  => 'normal',
        'preferred_codec'      => 'hevc',
        'min_bitrate_kbps'     => 1500,
    ],
    ContentType::DOCUMENTARY->value => [
        'buffer_modifier'      => 1.15,
        'latency_sensitivity'  => 'normal',
        'preferred_codec'      => 'hevc',
        'min_bitrate_kbps'     => 4000,
    ],
    ContentType::KIDS->value => [
        'buffer_modifier'      => 1.2,
        'latency_sensitivity'  => 'low',
        'preferred_codec'      => 'hevc',
        'min_bitrate_kbps'     => 3000,
    ],
    ContentType::GENERAL->value => [
        'buffer_modifier'      => 1.0,
        'latency_sensitivity'  => 'normal',
        'preferred_codec'      => null,
        'min_bitrate_kbps'     => 2000,
    ],
];

// ============================================================================
// NIVELES DE ESCALAMIENTO VISUAL (0-8)
// ============================================================================

/**
 * Tabla de niveles de escalamiento visual. Cada nivel define un multiplicador,
 * un porcentaje de mejora y la justificación correspondiente.
 */
const ESCALATION_LEVELS = [
    0 => ['name' => 'PRESERVE',  'multiplier' => 1.0,  'boost' => 0,   'reason' => 'Conservar origen intacto — capacidades desconocidas o insuficientes'],
    1 => ['name' => 'BASE_PLUS', 'multiplier' => 1.15, 'boost' => 15,  'reason' => 'Mejora base +15% — capacidades mínimas detectadas'],
    2 => ['name' => 'MODERATE',  'multiplier' => 1.20, 'boost' => 20,  'reason' => 'Mejora moderada +20% — capacidades estándar'],
    3 => ['name' => 'ENHANCED',  'multiplier' => 1.30, 'boost' => 30,  'reason' => 'Mejora avanzada +30% — buen hardware y red'],
    4 => ['name' => 'STRONG',    'multiplier' => 1.50, 'boost' => 50,  'reason' => 'Mejora fuerte +50% — hardware y red superiores'],
    5 => ['name' => 'ADVANCED',  'multiplier' => 1.60, 'boost' => 60,  'reason' => 'Mejora avanzada +60% — entorno premium'],
    6 => ['name' => 'HIGH',      'multiplier' => 1.70, 'boost' => 70,  'reason' => 'Mejora alta +70% — entorno de alto rendimiento'],
    7 => ['name' => 'EXTREME',   'multiplier' => 1.90, 'boost' => 90,  'reason' => 'Mejora extrema +90% — entorno de máxima capacidad'],
    8 => ['name' => 'MAXIMUM',   'multiplier' => 2.00, 'boost' => 100, 'reason' => 'Máximo posible real — exprimir hasta el límite seguro'],
];

// ============================================================================
// PATRONES DE CLASIFICACIÓN DE CONTENIDO
// ============================================================================

/**
 * Patrones regex (case-insensitive) para clasificar el tipo de contenido.
 * Soportan términos en español e inglés.
 */
const CONTENT_PATTERNS = [
    ContentType::SPORTS->value => '/deport|sport|futbol|soccer|football|nba|nfl|mlb|nhl|f1|formula|moto|gp|tenis|tennis|boxeo|boxing|ufc|mma|wrestling|lucha|baloncesto|basket|beisbol|baseball|golf|cricket|rugby|olympic|juegos/i',
    ContentType::CINEMA->value => '/pelicula|movie|film|cinema|cine|estreno|premier|premium|4k.*movie|uhd.*film/i',
    ContentType::NEWS->value => '/noticia|news|informe|24.*horas|24h|cnbc|cnn|bbc|aljazeera|teleSUR|en.*vivo.*noticia/i',
    ContentType::MUSIC->value => '/musica|music|mtv|vh1|radio.*vis|hit|concert|vivo.*music/i',
    ContentType::DOCUMENTARY->value => '/documental|documentary|natgeo|discovery|historia|history|nat.*geo|animal/i',
    ContentType::KIDS->value => '/infantil|kids|children|nick|cartoon|disney.*ch|anime|dragon|paw/i',
];

// ============================================================================
// FUNCIÓN AUXILIAR: Registro de errores en archivo
// ============================================================================

/**
 * Escribe un mensaje de error en el archivo de log.
 * Si el directorio no existe, intenta crearlo.
 */
function rq_log(string $message, string $level = 'ERROR'): void
{
    $logDir = RQ_BASE_DIR . '/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $timestamp = date('Y-m-d H:i:s');
    $line = "[{$timestamp}] [{$level}] {$message}" . PHP_EOL;
    @file_put_contents($logDir . '/resolver.log', $line, FILE_APPEND | LOCK_EX);
}

// ============================================================================
// FUNCIÓN AUXILIAR: Obtener cabecera HTTP del servidor
// ============================================================================

/**
 * Obtiene una cabecera HTTP del servidor de forma segura.
 * Busca en $_SERVER con y sin prefijo HTTP_, y en getallheaders().
 */
function rq_header(string $name, array $serverHeaders = []): ?string
{
    // Primero buscar en las cabeceras pasadas como parámetro
    if (isset($serverHeaders[$name])) {
        return $serverHeaders[$name];
    }

    // Buscar en $_SERVER con prefijo HTTP_
    $httpName = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$httpName])) {
        return $_SERVER[$httpName];
    }

    // Buscar en $_SERVER sin prefijo
    $upperName = strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$upperName])) {
        return $_SERVER[$upperName];
    }

    // Buscar en getallheaders() si está disponible (Apache/FastCGI)
    if (function_exists('getallheaders')) {
        $allHeaders = getallheaders();
        foreach ($allHeaders as $key => $value) {
            if (strtolower($key) === strtolower($name)) {
                return $value;
            }
        }
    }

    return null;
}

// ============================================================================
// FUNCIÓN AUXILIAR: Fetch HTTP seguro
// ============================================================================

/**
 * Realiza una petición HTTP GET segura con timeout.
 * Respeta la política anti-509: sin sondas, sin prefetch.
 * Devuelve null si falla.
 */
function rq_fetch(string $url, int $timeoutSec = RQ_FETCH_TIMEOUT): ?string
{
    $ctx = stream_context_create([
        'http' => [
            'method'          => 'GET',
            'timeout'         => $timeoutSec,
            'follow_location' => 0, // Sin redirecciones — política anti-509
            'ignore_errors'   => true,
            'header'          => implode("\r\n", [
                'User-Agent: ResolveQuality/' . RQ_VERSION,
                'Accept: application/vnd.apple.mpegurl, application/x-mpegurl, */*',
                'Cache-Control: no-cache',
            ]),
        ],
    ]);

    $result = @file_get_contents($url, false, $ctx);

    if ($result === false || $result === '') {
        return null;
    }

    // Verificar que el contenido parece una lista M3U válida
    $firstLine = trim(strtok($result, "\n"));
    if ($firstLine !== '#EXTM3U') {
        rq_log("Contenido descartado: primera línea no es #EXTM3U — URL: {$url}");
        return null;
    }

    return $result;
}

// ============================================================================
// FUNCIÓN AUXILIAR: M3U mínimo de error (fallback seguro)
// ============================================================================

/**
 * Genera un M3U mínimo con un canal de error.
 * Garantiza que el reproductor nunca reciba un error HTTP crudo.
 */
function rq_error_m3u(string $errorMessage): string
{
    return "#EXTM3U\n#EXTINF:-1 tvg-name=\"Error\" group-title=\"Sistema\",⚠ {$errorMessage}\n#EXTVLCOPT:network-caching=5000\nhttp://localhost/error\n";
}

// ============================================================================
// FUNCIÓN AUXILIAR: Obtener parámetro GET de forma segura (v3.0)
// ============================================================================

/**
 * Obtiene un parámetro GET de forma segura con valor por defecto.
 * Usado por los endpoints de telemetría v3.0.
 */
function q(string $key, mixed $default = ''): mixed
{
    return $_GET[$key] ?? $default;
}

/**
 * Valida que la salida M3U sea válida y no vacía.
 */
function isValidM3UOutput(string $output): bool
{
    $trimmed = trim($output);
    if ($trimmed === '' || $trimmed === '#EXTM3U') {
        return false;
    }
    if (strlen($trimmed) < 20) {
        return false;
    }
    if (!preg_match('#(https?|rtmp|udp|rtp)://#i', $trimmed)) {
        return false;
    }
    return true;
}

/**
 * Log de trazabilidad del pipeline (JSON append-only).
 */
function rq_pipeline_trace(array $data): void
{
    $logDir = RQ_BASE_DIR . '/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $data['ts'] = date('c');
    @file_put_contents($logDir . '/pipeline_trace.log', json_encode($data, JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX);
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASE 1: ManifestAnatomyParser
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analizador de anatomía del manifiesto M3U/M3U8.
 *
 * Extrae toda la información estructural de la lista: entradas EXTINF,
 * directivas de jugador, cabeceras HTTP, perfiles APE, y metadatos del stream.
 * No realiza ninguna petición de red ni modifica el contenido.
 */
class ManifestAnatomyParser
{
    /**
     * Analiza el contenido bruto de una lista M3U y devuelve su ADN completo.
     *
     * @param  string $raw Contenido bruto del archivo M3U
     * @return array  Estructura manifest_dna completa
     */
    public function parse(string $raw): array
    {
        // Dividir en líneas limpias
        $lines = array_values(array_filter(
            array_map('trim', explode("\n", str_replace("\r\n", "\n", $raw))),
            static fn(string $line): bool => $line !== ''
        ));

        // Clasificar líneas en tags y streams
        $classified = $this->classifyLines(lines: $lines);

        // Analizar cada entrada EXTINF
        $extinfEntries = [];
        foreach ($classified['tags'] as $idx => $tagLine) {
            if (str_starts_with($tagLine, '#EXTINF:')) {
                $parsed = $this->parseExtInf(line: $tagLine);
                $parsed['line_index'] = $idx;
                $extinfEntries[] = $parsed;
            }
        }

        // Construir el ADN del manifiesto
        $dna = [
            'raw_lines'        => $lines,
            'tags'             => $classified['tags'],
            'streams'          => $classified['streams'],
            'extinf_entries'   => $extinfEntries,
            'extvlcopt'        => $this->extractDirectivesByPrefix(tags: $classified['tags'], prefix: '#EXTVLCOPT:'),
            'kodiprop'         => $this->extractDirectivesByPrefix(tags: $classified['tags'], prefix: '#KODIPROP:'),
            'exthttp'          => $this->extractHttpHeaders(tags: $classified['tags']),
            'extx_tags'        => $this->extractDirectivesByPrefix(tags: $classified['tags'], prefix: '#EXT-X-'),
            'extattrfromurl'   => $this->extractDirectivesByPrefix(tags: $classified['tags'], prefix: '#EXTATTRFROMURL:'),
            'headers_injected' => $this->extractHttpHeaders(tags: $classified['tags']),
            'ape_profile'      => $this->detectApeProfile(tags: $classified['tags'], extinfEntries: $extinfEntries),
            'ape_attributes'   => $this->extractApeAttributes(extinfEntries: $extinfEntries),
            'list_type'        => $this->detectListType(dna: [
                'tags' => $classified['tags'],
                'streams' => $classified['streams'],
                'extinf_entries' => $extinfEntries,
            ]),
            'has_groups'       => $this->detectGroups(extinfEntries: $extinfEntries),
            'group_title_map'  => $this->buildGroupMap(extinfEntries: $extinfEntries),
            'codec_hints'      => $this->extractCodecHints(extinfEntries: $extinfEntries),
            'hdr_hints'        => $this->extractHdrHints(extinfEntries: $extinfEntries, tags: $classified['tags']),
            'transport_hints'  => $this->extractTransportHints(tags: $classified['tags'], extinfEntries: $extinfEntries),
            'fallback_chains'  => $this->extractFallbackChains(tags: $classified['tags']),
            'total_streams'    => count($classified['streams']),
            'has_hd'           => false,
            'has_4k'           => false,
            'has_hdr'          => false,
            'stream_signature' => '',
        ];

        // Detectar capacidades visuales del ADN
        $dna['has_hd'] = $this->detectCapabilityInDna(dna: $dna, pattern: '/hd|1080|1920x1080/i');
        $dna['has_4k'] = $this->detectCapabilityInDna(dna: $dna, pattern: '/4k|2160|3840x2160|uhd/i');
        $dna['has_hdr'] = !empty($dna['hdr_hints']);

        // Construir firma única de la lista
        $dna['stream_signature'] = $this->buildStreamSignature(dna: $dna);

        return $dna;
    }

    /**
     * Clasifica las líneas en tags (empiezan con #) y streams (URLs).
     *
     * @param  array $lines Líneas del archivo
     * @return array{tags: array<string>, streams: array<string>}
     */
    private function classifyLines(array $lines): array
    {
        $tags = [];
        $streams = [];

        foreach ($lines as $line) {
            if (str_starts_with($line, '#')) {
                $tags[] = $line;
            } else {
                $streams[] = $line;
            }
        }

        return ['tags' => $tags, 'streams' => $streams];
    }

    /**
     * Parsea una línea #EXTINF y extrae todos los atributos y el título.
     *
     * Formato: #EXTINF:duration key="value" ...,Title
     *
     * @param  string $line Línea EXTINF completa
     * @return array{duration: int|string, attributes: array<string, string>, title: string}
     */
    private function parseExtInf(string $line): array
    {
        // Eliminar el prefijo #EXTINF:
        $content = substr($line, 8);
        $content = ltrim($content);

        // Separar la parte de atributos/título de la duración
        $commaPos = strpos($content, ',');
        if ($commaPos === false) {
            return ['duration' => trim($content), 'attributes' => [], 'title' => trim($content)];
        }

        $duration = trim(substr($content, 0, $commaPos));
        $afterComma = substr($content, $commaPos + 1);
        $title = trim($afterComma);

        // La parte antes de la coma puede contener la duración y atributos
        $beforeComma = substr($content, 0, $commaPos);

        // Extraer atributos tipo key="value" y key=value
        $attributes = [];

        // Patrón para atributos con comillas: key="value" o key='value'
        if (preg_match_all('/([a-zA-Z0-9_\-]+)\s*=\s*"([^"]*)"/', $beforeComma, $matches, PREG_SET_ORDER
        )) {
            foreach ($matches as $match) {
                $attributes[$match[1]] = $match[2];
            }
        }

        // También buscar atributos sin comillas: key=value (solo si no fue capturado con comillas)
        if (preg_match_all('/([a-zA-Z0-9_\-]+)\s*=\s*([^\s"]+)/', $beforeComma, $matches, PREG_SET_ORDER
        )) {
            foreach ($matches as $match) {
                if (!isset($attributes[$match[1]])) {
                    $attributes[$match[1]] = $match[2];
                }
            }
        }

        // Intentar extraer atributos del título también (algunas listas los ponen ahí)
        if (preg_match_all('/([a-zA-Z0-9_\-]+)\s*=\s*"([^"]*)"/', $afterComma, $matches, PREG_SET_ORDER
        )) {
            foreach ($matches as $match) {
                $attributes[$match[1]] = $match[2];
                // Limpiar el atributo del título
                $title = str_replace($match[0], '', $title);
            }
        }

        $title = trim($title, " \t\n\r\0\x0B,");

        return [
            'duration'   => $duration,
            'attributes' => $attributes,
            'title'      => $title,
        ];
    }

    /**
     * Extrae directivas de un tipo específico por prefijo.
     *
     * @param  array  $tags   Lista de tags del manifiesto
     * @param  string $prefix Prefijo a buscar (ej: '#EXTVLCOPT:')
     * @return array<string>  Directivas encontradas, sin prefijo duplicado
     */
    private function extractDirectivesByPrefix(array $tags, string $prefix): array
    {
        $found = [];
        $seen = [];

        foreach ($tags as $tag) {
            if (str_starts_with($tag, $prefix)) {
                $value = substr($tag, strlen($prefix));
                // Deduplicar por clave (parte antes del primer '=')
                $key = strstr($value, '=', true) ?: $value;
                if (!isset($seen[$key])) {
                    $seen[$key] = true;
                    $found[] = $value;
                }
            }
        }

        return $found;
    }

    /**
     * Extrae cabeceras HTTP de las directivas #EXTHTTP.
     * Soporta formato JSON y formato simple key=value.
     *
     * @param  array $tags Lista de tags del manifiesto
     * @return array<string, string> Mapa de cabeceras HTTP
     */
    private function extractHttpHeaders(array $tags): array
    {
        $headers = [];

        foreach ($tags as $tag) {
            if (!str_starts_with($tag, '#EXTHTTP:')) {
                continue;
            }

            $value = trim(substr($tag, 9));

            // Intentar decodificar como JSON
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                foreach ($decoded as $k => $v) {
                    $headers[(string) $k] = (string) $v;
                }
                continue;
            }

            // Formato simple: key=value
            $eqPos = strpos($value, '=');
            if ($eqPos !== false) {
                $key = trim(substr($value, 0, $eqPos));
                $val = trim(substr($value, $eqPos + 1));
                if ($key !== '' && $val !== '') {
                    $headers[$key] = $val;
                }
            }
        }

        return $headers;
    }

    /**
     * Detecta el perfil APE de la lista.
     * Busca atributos ape-profile en EXTINF o tags #APE-*.
     *
     * @param  array          $tags          Tags del manifiesto
     * @param  array          $extinfEntries Entradas EXTINF parseadas
     * @return string|null    Perfil APE detectado o null
     */
    private function detectApeProfile(array $tags, array $extinfEntries): ?string
    {
        // Buscar en tags APE explícitos
        foreach ($tags as $tag) {
            if (str_starts_with($tag, '#APE-')) {
                $value = trim(substr($tag, 5));
                return $value;
            }
        }

        // Buscar en atributos EXTINF
        foreach ($extinfEntries as $entry) {
            if (isset($entry['attributes']['ape-profile']) && $entry['attributes']['ape-profile'] !== '') {
                return $entry['attributes']['ape-profile'];
            }
        }

        return null;
    }

    /**
     * Extrae todos los atributos APE de las entradas EXTINF.
     *
     * @param  array $extinfEntries Entradas EXTINF parseadas
     * @return array Atributos APE encontrados
     */
    private function extractApeAttributes(array $extinfEntries): array
    {
        $apeAttrs = [];

        foreach ($extinfEntries as $entry) {
            foreach ($entry['attributes'] as $key => $value) {
                if (str_starts_with(strtolower($key), 'ape-')) {
                    $apeAttrs[$key] = $value;
                }
            }
        }

        return $apeAttrs;
    }

    /**
     * Detecta el tipo de lista basándose en su estructura y contenido.
     *
     * @param  array    $dna Datos parciales del ADN
     * @return string   Tipo de lista detectado
     */
    private function detectListType(array $dna): string
    {
        $tags = $dna['tags'];
        $streams = $dna['streams'];
        $entries = $dna['extinf_entries'];

        if (empty($entries)) {
            return ListType::UNKNOWN->value;
        }

        // Buscar patrones de VOD en group-title
        $vodPatterns = '/pelicula|movie|film|vod|cine|estreno/i';
        $vodCount = 0;
        $liveCount = 0;

        foreach ($entries as $entry) {
            $group = $entry['attributes']['group-title'] ?? '';
            $title = $entry['title'] ?? '';

            if (preg_match($vodPatterns, $group . ' ' . $title)) {
                $vodCount++;
            }

            // Los streams con extensión .m3u8 y que no tienen patrón VOD se consideran live
            if (!preg_match($vodPatterns, $group . ' ' . $title)) {
                $liveCount++;
            }
        }

        $total = count($entries);

        // Clasificar según proporción
        if ($vodCount > 0 && $liveCount > 0) {
            return ListType::MIXED->value;
        }

        if ($vodCount > $total * 0.5) {
            return ListType::VOD->value;
        }

        // Si TODOS los streams tienen URL, probablemente es live
        if (count($streams) === count($entries)) {
            return ListType::LIVE->value;
        }

        return ListType::LIVE->value;
    }

    /**
     * Detecta si la lista tiene grupos definidos.
     */
    private function detectGroups(array $extinfEntries): bool
    {
        foreach ($extinfEntries as $entry) {
            if (!empty($entry['attributes']['group-title'])) {
                return true;
            }
        }
        return false;
    }

    /**
     * Construye un mapa de group-title → cantidad de canales.
     */
    private function buildGroupMap(array $extinfEntries): array
    {
        $map = [];
        foreach ($extinfEntries as $entry) {
            $group = $entry['attributes']['group-title'] ?? 'Sin grupo';
            $map[$group] = ($map[$group] ?? 0) + 1;
        }
        return $map;
    }

    /**
     * Extrae pistas de codec del ADN (atributos EXTINF y directivas).
     *
     * @param  array $extinfEntries Entradas EXTINF
     * @return array Hints de codec encontrados
     */
    private function extractCodecHints(array $extinfEntries): array
    {
        $hints = [];
        $codecKeywords = ['codec', 'video-codec', 'video-code'];

        foreach ($extinfEntries as $entry) {
            foreach ($entry['attributes'] as $key => $value) {
                if (in_array(strtolower($key), $codecKeywords, true)) {
                    $hints['codec'] = strtolower($value);
                }
                if (str_contains(strtolower($key), 'video-track') || str_contains(strtolower($key), 'bl-video-track')) {
                    $hints[$key] = $value;
                }
            }
        }

        return $hints;
    }

    /**
     * Extrae pistas de HDR del ADN.
     *
     * @param  array $extinfEntries Entradas EXTINF
     * @param  array $tags          Tags del manifiesto
     * @return array Hints de HDR encontrados
     */
    private function extractHdrHints(array $extinfEntries, array $tags): array
    {
        $hints = [];
        $hdrKeywords = ['hdr', 'dolby-vision', 'dv', 'hdr10', 'hlg', 'pq'];

        foreach ($extinfEntries as $entry) {
            foreach ($entry['attributes'] as $key => $value) {
                $lowKey = strtolower($key);
                $lowVal = strtolower($value);
                foreach ($hdrKeywords as $kw) {
                    if (str_contains($lowKey, $kw) || str_contains($lowVal, $kw)) {
                        $hints[$kw] = true;
                    }
                }
            }
        }

        return $hints;
    }

    /**
     * Extrae pistas de transporte del ADN (protocolo, segmentación, etc.).
     */
    private function extractTransportHints(array $tags, array $extinfEntries): array
    {
        $hints = [];

        // Nota: Las URLs de stream se asocian por posición (índice) en $dna['streams'].
        // El parser no asocia URLs individuales a EXTINF aquí — eso lo hace el OutputBuilder.
        // Solo detectamos protocolo desde atributos explícitos de EXTINF.

        // Detectar desde tags HLS
        foreach ($tags as $tag) {
            if (str_starts_with($tag, '#EXT-X-TARGETDURATION:')) {
                $hints['segment-duration'] = (int) substr($tag, 22);
            }
            if (str_starts_with($tag, '#EXT-X-VERSION:')) {
                $hints['hls-version'] = (int) substr($tag, 16);
            }
        }

        // Detectar desde atributos
        foreach ($extinfEntries as $entry) {
            if (isset($entry['attributes']['transport'])) {
                $hints['transport'] = strtolower($entry['attributes']['transport']);
            }
            if (isset($entry['attributes']['protocol'])) {
                $hints['transport'] = strtolower($entry['attributes']['protocol']);
            }
        }

        return $hints;
    }

    /**
     * Extrae cadenas de fallback (URLs de backup) del ADN.
     */
    private function extractFallbackChains(array $tags): array
    {
        $chains = [];

        foreach ($tags as $tag) {
            // Buscar directivas de backup/fallback
            if (str_starts_with($tag, '#EXTVLCOPT:program=')) {
                $chains[] = $tag;
            }
            if (str_contains(strtolower($tag), 'fallback')) {
                $chains[] = $tag;
            }
            if (str_contains(strtolower($tag), 'backup')) {
                $chains[] = $tag;
            }
        }

        return $chains;
    }

    /**
     * Construye una firma MD5 única de la lista basada en todas las URLs de stream.
     *
     * @param  array  $dna ADN del manifiesto
     * @return string Hash MD5 de la firma
     */
    private function buildStreamSignature(array $dna): string
    {
        $urls = $dna['streams'];
        sort(array: $urls);
        return md5(implode('|', $urls) . '|' . count($urls));
    }

    /**
     * Detecta si una capacidad específica está presente en el ADN.
     */
    private function detectCapabilityInDna(array $dna, string $pattern): bool
    {
        // Buscar en títulos de entradas
        foreach ($dna['extinf_entries'] as $entry) {
            $text = ($entry['title'] ?? '') . ' ' . implode(' ', $entry['attributes']);
            if (preg_match($pattern, $text)) {
                return true;
            }
        }

        // Buscar en group titles
        foreach ($dna['group_title_map'] as $group => $count) {
            if (preg_match($pattern, $group)) {
                return true;
            }
        }

        return false;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASE 2: IdempotentNormalizationEngine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Motor de normalización idempotente.
 *
 * Deduplica directivas, resuelve conflictos y hereda políticas del ADN.
 * Garantiza que la misma entrada produzca siempre la misma salida.
 */
class IdempotentNormalizationEngine
{
    /**
     * Normaliza todas las directivas y políticas heredadas del ADN.
     *
     * @param  array $dna ADN del manifiesto (salida de ManifestAnatomyParser)
     * @return array{inherited_policies: array, normalized_directives: array}
     */
    public function normalize(array $dna): array
    {
        $inheritedPolicies = $this->mergeInheritedPolicies(dna: $dna);
        $normalizedDirectives = $this->buildNormalizedDirectives(dna: $dna);

        return [
            'inherited_policies'     => $inheritedPolicies,
            'normalized_directives'  => $normalizedDirectives,
        ];
    }

    /**
     * Deduplica directivas por tipo, manteniendo el orden de inserción.
     *
     * @param  array  $directives Lista de directivas crudas
     * @param  string $type       Tipo: 'vlcopt', 'kodiprop', 'exthttp'
     * @return array  Directivas deduplicadas
     */
    private function deduplicateDirectives(array $directives, string $type): array
    {
        $seen = [];
        $result = [];

        foreach ($directives as $directive) {
            $key = match ($type) {
                'vlcopt', 'kodiprop' => strstr($directive, '=', true) ?: $directive,
                'exthttp' => is_array($directive) ? array_key_first($directive) : strstr((string) $directive, '=', true),
                default => $directive,
            };

            if ($key !== null && !isset($seen[$key])) {
                $seen[$key] = true;
                $result[] = $directive;
            }
        }

        return $result;
    }

    /**
     * Resuelve conflictos de buffer: el valor MÁXIMO gana.
     *
     * @param  array<int> $values Valores de buffer encontrados (ms)
     * @return int|null   Valor máximo o null si no hay valores
     */
    private function resolveBufferConflicts(array $values): ?int
    {
        $valid = array_filter($values, static fn($v): bool => is_numeric($v) && $v > 0
        );

        if (empty($valid)) {
            return null;
        }

        return (int) max($valid);
    }

    /**
     * Resuelve conflictos de codec: el más específico gana.
     * Orden de especificidad: av1 > hevc > h264 > vp9 > any
     *
     * @param  array<string> $values Codecs encontrados
     * @return string|null    Codec más específico
     */
    private function resolveCodecConflicts(array $values): ?string
    {
        if (empty($values)) {
            return null;
        }

        $specificity = ['av1' => 5, 'hevc' => 4, 'h265' => 4, 'vp9' => 3, 'h264' => 2, 'avc' => 2, 'any' => 0];

        $best = null;
        $bestScore = -1;

        foreach ($values as $codec) {
            $low = strtolower(trim($codec));
            $score = $specificity[$low] ?? 1;

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $low;
            }
        }

        return $best;
    }

    /**
     * Fusiona políticas heredadas del ADN del manifiesto.
     * Extrae valores de buffer, codec, HDR, resolución, etc.
     */
    private function mergeInheritedPolicies(array $dna): array
    {
        $policies = [
            'buffer'            => null,
            'codec'             => null,
            'hdr'               => [],
            'resolution'        => null,
            'bitrate'           => null,
            'fallback_chain'    => $dna['fallback_chains'],
            'network'           => [],
            'deinterlace'       => null,
            'audio_passthrough' => null,
            'color_depth'       => null,
        ];

        // --- Extraer valores de buffer de EXTVLCOPT ---
        $bufferValues = [];
        foreach ($dna['extvlcopt'] as $opt) {
            if (str_contains(strtolower($opt), 'caching=')) {
                $eqPos = strpos($opt, '=');
                if ($eqPos !== false) {
                    $val = (int) substr($opt, $eqPos + 1);
                    if ($val > 0) {
                        $bufferValues[] = $val;
                    }
                }
            }
        }
        $policies['buffer'] = $this->resolveBufferConflicts(values: $bufferValues);

        // --- Extraer codec de hints ---
        $codecs = [];
        if (!empty($dna['codec_hints']['codec'])) {
            $codecs[] = $dna['codec_hints']['codec'];
        }
        if (isset($dna['ape_attributes']['ape-codec'])) {
            $codecs[] = $dna['ape_attributes']['ape-codec'];
        }
        $policies['codec'] = $this->resolveCodecConflicts(values: $codecs);

        // --- Extraer HDR de hints ---
        $policies['hdr'] = array_keys($dna['hdr_hints']);

        // --- Extraer resolución de atributos ---
        foreach ($dna['extinf_entries'] as $entry) {
            $attrs = $entry['attributes'];
            if (isset($attrs['resolution'])) {
                $policies['resolution'] = $attrs['resolution'];
            }
            if (isset($attrs['preferred-resolution'])) {
                $policies['resolution'] = $attrs['preferred-resolution'];
            }
        }

        // --- Extraer bitrate ---
        foreach ($dna['extinf_entries'] as $entry) {
            if (isset($entry['attributes']['bitrate'])) {
                $policies['bitrate'] = (int) $entry['attributes']['bitrate'];
            }
        }

        // --- Detectar deinterlace ---
        foreach ($dna['extvlcopt'] as $opt) {
            if (str_contains(strtolower($opt), 'deinterlace')) {
                $policies['deinterlace'] = 'detected';
            }
        }

        // --- Detectar color depth ---
        foreach ($dna['extinf_entries'] as $entry) {
            if (isset($entry['attributes']['color-depth'])) {
                $policies['color_depth'] = (int) $entry['attributes']['color-depth'];
            }
        }

        return $policies;
    }

    /**
     * Construye el set de directivas normalizadas (deduplicadas y ordenadas).
     */
    private function buildNormalizedDirectives(array $dna): array
    {
        return [
            'extvlcopt'         => $this->deduplicateDirectives(directives: $dna['extvlcopt'], type: 'vlcopt'),
            'kodiprop'          => $this->deduplicateDirectives(directives: $dna['kodiprop'], type: 'kodiprop'),
            'exthttp'           => $dna['exthttp'],
            'extx'              => $dna['extx_tags'],
            'extinf_overrides'  => [], // Se llenarán durante la inyección si es necesario
        ];
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASE 3: CapabilityNegotiationLayer
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Capa de negociación de capacidades.
 *
 * Detecta el tipo de reproductor, la pantalla/TV y la calidad de red
 * a partir de cabeceras HTTP y parámetros de consulta.
 * Sin esta información, se usan valores seguros por defecto.
 */
class CapabilityNegotiationLayer
{
    /**
     * Negocia las capacidades completas del entorno del cliente.
     *
     * @param  array $serverHeaders Cabeceras HTTP del servidor ($_SERVER)
     * @param  array $getParams     Parámetros GET
     * @return array capability_matrix completo
     */
    public function negotiate(array $serverHeaders = [], array $getParams = []): array
    {
        $player = $this->detectPlayer(serverHeaders: $serverHeaders);
        $tv = $this->detectTv(serverHeaders: $serverHeaders, getParams: $getParams);
        $network = $this->detectNetwork(serverHeaders: $serverHeaders);

        return [
            'player'  => $player,
            'tv'      => $tv,
            'network' => $network,
        ];
    }

    /**
     * Detecta el tipo de reproductor desde User-Agent y cabeceras.
     *
     * @param  array $serverHeaders Cabeceras HTTP del servidor
     * @return array Perfil del reproductor detectado
     */
    private function detectPlayer(array $serverHeaders): array
    {
        $ua = $serverHeaders['HTTP_USER_AGENT']
            ?? $serverHeaders['USER_AGENT']
            ?? $_SERVER['HTTP_USER_AGENT']
            ?? 'Generic/1.0';

        $uaLower = strtolower($ua);

        // Detección por patrones en User-Agent
        $playerType = match (true) {
            str_contains($uaLower, 'vlc')          => PlayerType::VLC->value,
            str_contains($uaLower, 'kodi')         => PlayerType::KODI->value,
            str_contains($uaLower, 'ott') ||
            str_contains($uaLower, 'navigator')    => PlayerType::OTT->value,
            str_contains($uaLower, 'exoplayer') ||
            str_contains($uaLower, 'smarters')     => PlayerType::EXO->value,
            str_contains($uaLower, 'tivimate')     => PlayerType::TIVIMATE->value,
            str_contains($uaLower, 'tv') ||
            str_contains($uaLower, 'aftt') ||
            str_contains($uaLower, 'aftm') ||
            str_contains($uaLower, 'web0s') ||
            str_contains($uaLower, 'tizen') ||
            str_contains($uaLower, 'netcast')      => PlayerType::SMART_TV->value,
            default                                                  => PlayerType::GENERIC->value,
        };

        // Extraer versión si es posible
        $version = '';
        if (preg_match('/[\d]+(?:\.[\d]+){1,3}/', $ua, $matches)) {
            $version = $matches[0];
        }

        // Construir perfil según el tipo
        return match ($playerType) {
            PlayerType::VLC->value => [
                'type'              => PlayerType::VLC->value,
                'name'              => 'VLC Media Player',
                'version'           => $version,
                'supports_vlcopt'   => true,
                'supports_kodiprop' => false,
                'supports_exthttp'  => true,
                'supports_extx'     => true,
                'hw_decode'         => true,
                'max_resolution'    => [3840, 2160],
                'max_fps'           => 60,
                'hdr_support'       => ['hdr10', 'hlg'],
                'codec_support'     => ['h264', 'hevc', 'vp9', 'av1'],
                'audio_channels'    => 8,
                'buffer_max_ms'     => 120000,
            ],
            PlayerType::KODI->value => [
                'type'              => PlayerType::KODI->value,
                'name'              => 'Kodi',
                'version'           => $version,
                'supports_vlcopt'   => false,
                'supports_kodiprop' => true,
                'supports_exthttp'  => true,
                'supports_extx'     => true,
                'hw_decode'         => true,
                'max_resolution'    => [3840, 2160],
                'max_fps'           => 60,
                'hdr_support'       => ['hdr10', 'hlg'],
                'codec_support'     => ['h264', 'hevc', 'vp9', 'av1'],
                'audio_channels'    => 8,
                'buffer_max_ms'     => 120000,
            ],
            PlayerType::OTT->value => [
                'type'              => PlayerType::OTT->value,
                'name'              => 'OTT Navigator',
                'version'           => $version,
                'supports_vlcopt'   => false,
                'supports_kodiprop' => false,
                'supports_exthttp'  => true,
                'supports_extx'     => false,
                'hw_decode'         => true,
                'max_resolution'    => [3840, 2160],
                'max_fps'           => 60,
                'hdr_support'       => ['hdr10', 'hlg', 'dolby_vision'],
                'codec_support'     => ['h264', 'hevc'],
                'audio_channels'    => 6,
                'buffer_max_ms'     => 60000,
            ],
            PlayerType::EXO->value => [
                'type'              => PlayerType::EXO->value,
                'name'              => 'ExoPlayer / IPTV Smarters',
                'version'           => $version,
                'supports_vlcopt'   => false,
                'supports_kodiprop' => false,
                'supports_exthttp'  => true,
                'supports_extx'     => false,
                'hw_decode'         => true,
                'max_resolution'    => [3840, 2160],
                'max_fps'           => 60,
                'hdr_support'       => ['hdr10'],
                'codec_support'     => ['h264', 'hevc', 'vp9'],
                'audio_channels'    => 6,
                'buffer_max_ms'     => 60000,
            ],
            PlayerType::TIVIMATE->value => [
                'type'              => PlayerType::TIVIMATE->value,
                'name'              => 'TiviMate',
                'version'           => $version,
                'supports_vlcopt'   => true,
                'supports_kodiprop' => false,
                'supports_exthttp'  => true,
                'supports_extx'     => false,
                'hw_decode'         => true,
                'max_resolution'    => [3840, 2160],
                'max_fps'           => 60,
                'hdr_support'       => ['hdr10'],
                'codec_support'     => ['h264', 'hevc'],
                'audio_channels'    => 6,
                'buffer_max_ms'     => 60000,
            ],
            PlayerType::SMART_TV->value => [
                'type'              => PlayerType::SMART_TV->value,
                'name'              => 'Smart TV',
                'version'           => $version,
                'supports_vlcopt'   => false,
                'supports_kodiprop' => false,
                'supports_exthttp'  => false,
                'supports_extx'     => false,
                'hw_decode'         => true,
                'max_resolution'    => [1920, 1080],
                'max_fps'           => 60,
                'hdr_support'       => [],
                'codec_support'     => ['h264', 'hevc'],
                'audio_channels'    => 2,
                'buffer_max_ms'     => 30000,
            ],
            default => [
                'type'              => PlayerType::GENERIC->value,
                'name'              => 'Generic Player',
                'version'           => $version,
                'supports_vlcopt'   => false,
                'supports_kodiprop' => false,
                'supports_exthttp'  => false,
                'supports_extx'     => false,
                'hw_decode'         => false,
                'max_resolution'    => [1920, 1080],
                'max_fps'           => 30,
                'hdr_support'       => [],
                'codec_support'     => ['h264'],
                'audio_channels'    => 2,
                'buffer_max_ms'     => 30000,
            ],
        };
    }

    /**
     * Detecta las capacidades de la pantalla/TV desde cabeceras X-Display-*.
     *
     * @param  array $serverHeaders Cabeceras HTTP
     * @param  array $getParams     Parámetros GET
     * @return array Perfil de TV detectado
     */
    private function detectTv(array $serverHeaders, array $getParams): array
    {
        // Valores por defecto: TV SDR 1080p estándar
        $tv = [
            'type'           => 'sdr',
            'max_nits'       => 350,
            'max_resolution' => [1920, 1080],
            'color_depth'    => 8,
            'color_space'    => 'BT709',
            'hdr_support'    => [],
        ];

        // Leer cabeceras de display (sin prefijo HTTP_ ya que rq_header lo maneja)
        $hdr = rq_header(name: 'X-Display-HDR', serverHeaders: $serverHeaders);
        if ($hdr !== null) {
            $tv['hdr_support'] = array_map('trim', explode(',', strtolower($hdr))
            );
            // Determinar tipo de TV según HDR
            $tv['type'] = match (true) {
                in_array('dolby_vision', $tv['hdr_support'], true) ||
                in_array('dolby-vision', $tv['hdr_support'], true) => 'dolby_vision',
                in_array('hdr10_plus', $tv['hdr_support'], true) ||
                in_array('hdr10-plus', $tv['hdr_support'], true) => 'hdr10_plus',
                in_array('hdr10', $tv['hdr_support'], true) => 'hdr10',
                in_array('hlg', $tv['hdr_support'], true) => 'hlg',
                default => 'hdr',
            };
        }

        // Nits máximos
        $nits = rq_header(name: 'X-Display-Max-Nits', serverHeaders: $serverHeaders);
        if ($nits !== null && is_numeric($nits)) {
            $tv['max_nits'] = (int) $nits;
        }

        // Resolución máxima
        $res = rq_header(name: 'X-Display-Resolution', serverHeaders: $serverHeaders);
        if ($res !== null) {
            $parts = array_map('intval', explode('x', strtolower($res)));
            if (count($parts) === 2) {
                $tv['max_resolution'] = [$parts[0], $parts[1]];
            }
        }

        // Profundidad de color
        $depth = rq_header(name: 'X-Display-Color-Depth', serverHeaders: $serverHeaders);
        if ($depth !== null && is_numeric($depth)) {
            $tv['color_depth'] = (int) $depth;
        }

        // Espacio de color
        $space = rq_header(name: 'X-Display-Color-Space', serverHeaders: $serverHeaders);
        if ($space !== null) {
            $tv['color_space'] = strtoupper(trim($space));
        }

        // Permitir override por GET params
        if (isset($getParams['max_res']) && str_contains($getParams['max_res'], 'x')) {
            $parts = array_map('intval', explode('x', $getParams['max_res']));
            if (count($parts) === 2 && $parts[0] > 0 && $parts[1] > 0) {
                $tv['max_resolution'] = [$parts[0], $parts[1]];
            }
        }

        return $tv;
    }

    /**
     * Detecta la calidad de red desde cabeceras X-Throughput-* y X-Latency-*.
     */
    private function detectNetwork(array $serverHeaders): array
    {
        $network = [
            'throughput_kbps' => 5000,
            'latency_ms'      => 50,
            'jitter_ms'       => 10,
            'packet_loss'     => 0.0,
            'connection_type' => ConnectionType::UNKNOWN->value,
        ];

        // Throughput
        $throughput = rq_header(name: 'X-Throughput-Kbps', serverHeaders: $serverHeaders)
            ?? rq_header(name: 'HTTP_X_THROUGHPUT', serverHeaders: $serverHeaders);
        if ($throughput !== null && is_numeric($throughput)) {
            $network['throughput_kbps'] = max(100, (int) $throughput);
        }

        // Latencia
        $latency = rq_header(name: 'X-Latency-Ms', serverHeaders: $serverHeaders)
            ?? rq_header(name: 'HTTP_X_LATENCY', serverHeaders: $serverHeaders);
        if ($latency !== null && is_numeric($latency)) {
            $network['latency_ms'] = max(1, (int) $latency);
        }

        // Jitter
        $jitter = rq_header(name: 'X-Jitter-Ms', serverHeaders: $serverHeaders);
        if ($jitter !== null && is_numeric($jitter)) {
            $network['jitter_ms'] = max(0, (int) $jitter);
        }

        // Tipo de conexión
        $connType = rq_header(name: 'X-Connection-Type', serverHeaders: $serverHeaders);
        if ($connType !== null) {
            $normalized = strtolower(trim($connType));
            if (in_array($normalized, ['ethernet', 'wifi', 'mobile'], true)) {
                $network['connection_type'] = $normalized;
            }
        }

        // Estimar pérdida de paquetes basada en jitter
        if ($network['jitter_ms'] > 50) {
            $network['packet_loss'] = min(0.1, $network['jitter_ms'] / 1000.0);
        }

        return $network;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASE 4: ContentHeuristicEngine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Motor heurístico de clasificación de contenido.
 *
 * Analiza el nombre del canal y el grupo para determinar el tipo de contenido
 * (deportes, cine, noticias, música, etc.) y devuelve el perfil asociado.
 */
class ContentHeuristicEngine
{
    /**
     * Clasifica el contenido de un canal según su nombre y grupo.
     *
     * @param  string $channelName Nombre del canal
     * @param  string $groupTitle  Título del grupo
     * @param  array  $metadata    Metadatos adicionales (atributos EXTINF, etc.)
     * @return array  Perfil de contenido {type, confidence, buffer_modifier, latency_sensitivity, preferred_codec, min_bitrate_kbps}
     */
    public function classify(string $channelName, string $groupTitle, array $metadata = []): array
    {
        $text = strtolower($channelName . ' ' . $groupTitle);
        $matchedType = ContentType::GENERAL->value;
        $bestConfidence = 0.0;

        // Evaluar cada patrón de contenido
        foreach (CONTENT_PATTERNS as $type => $pattern) {
            if (preg_match($pattern, $text)) {
                // Calcular confianza basada en qué tan específico es el match
                $confidence = $this->calculateConfidence(text: $text, pattern: $pattern);
                if ($confidence > $bestConfidence) {
                    $bestConfidence = $confidence;
                    $matchedType = $type;
                }
            }
        }

        // Ajustar confianza si el grupo coincide mejor que el nombre
        $groupText = strtolower($groupTitle);
        foreach (CONTENT_PATTERNS as $type => $pattern) {
            if ($type === $matchedType) {
                continue;
            }
            if (preg_match($pattern, $groupText)) {
                $groupConfidence = $this->calculateConfidence(text: $groupText, pattern: $pattern) * 1.2;
                if ($groupConfidence > $bestConfidence) {
                    $bestConfidence = min(1.0, $groupConfidence);
                    $matchedType = $type;
                }
            }
        }

        $profile = $this->getContentTypeProfile(type: $matchedType);

        return [
            'type'                => $matchedType,
            'confidence'          => round($bestConfidence, decimals: 2),
            'buffer_modifier'     => $profile['buffer_modifier'],
            'latency_sensitivity' => $profile['latency_sensitivity'],
            'preferred_codec'     => $profile['preferred_codec'],
            'min_bitrate_kbps'    => $profile['min_bitrate_kbps'],
        ];
    }

    /**
     * Verifica si un texto coincide con los patrones dados.
     */
    private function matchPatterns(string $text, array $patterns): bool
    {
        $lower = strtolower($text);
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $lower)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Calcula la confianza de la clasificación (0.0 - 1.0).
     * Se basa en la cantidad de matches y la especificidad del patrón.
     */
    private function calculateConfidence(string $text, string $pattern): float
    {
        $base = 0.5;

        // Más matches = más confianza
        $count = preg_match_all($pattern, $text);
        $base += min(0.3, $count * 0.1);

        // Si el grupo tiene una categoría clara, más confianza
        if (preg_match('/group|categoria|category/i', $text)) {
            $base += 0.2;
        }

        return min(1.0, $base);
    }

    /**
     * Obtiene el perfil de configuración para un tipo de contenido.
     *
     * @param  string $type Tipo de contenido
     * @return array  Perfil con modificadores
     */
    private function getContentTypeProfile(string $type): array
    {
        return CONTENT_PROFILES[$type] ?? CONTENT_PROFILES[ContentType::GENERAL->value];
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASE 5: VisualPotentialEscalator
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Escalador de potencial visual.
 *
 * Calcula el nivel de escalamiento (0-8) basándose en las capacidades
 * del hardware, la red y el tipo de contenido. NUNCA excede lo que
 * el hardware puede manejar realmente.
 */
class VisualPotentialEscalator
{
    /**
     * Calcula el nivel de escalamiento visual y su configuración.
     *
     * @param  array $capabilities Matriz de capacidades (salida de CapabilityNegotiationLayer)
     * @param  array $dna          ADN del manifiesto
     * @param  array $content      Perfil de contenido (salida de ContentHeuristicEngine)
     * @return array Configuración de escalamiento visual
     */
    public function calculate(array $capabilities, array $dna, array $content): array
    {
        // Determinar nivel base desde capacidades
        $baseLevel = $this->determineBaseLevel(capabilities: $capabilities, dna: $dna);

        // Aplicar modificador de contenido
        $contentLevel = $this->applyContentModifier(level: $baseLevel, content: $content);

        // Aplicar modificador de red
        $networkLevel = $this->applyNetworkModifier(level: $contentLevel, network: $capabilities['network']);

        // Limitar al máximo permitido por el hardware
        $finalLevel = min($networkLevel, 8);
        $finalLevel = max($finalLevel, 0);

        // Construir configuración de escalamiento
        return $this->buildEscalationConfig(level: $finalLevel);
    }

    /**
     * Determina el nivel base (0-8) desde las capacidades del entorno.
     *
     * Puntuación por componente (max ~33 cada uno, total ~100):
     * - Player: 0-33 basado en codec support, HDR, max resolution
     * - TV: 0-33 basado en HDR, resolution, nits, color depth
     * - Network: 0-33 basado en throughput, latency
     *
     * @return int Nivel base (0-8)
     */
    private function determineBaseLevel(array $capabilities, array $dna): int
    {
        $player = $capabilities['player'];
        $tv = $capabilities['tv'];
        $network = $capabilities['network'];

        // === Puntuación del reproductor (0-33) ===
        $playerScore = 0;

        // Soporte de codecs (0-10)
        $codecCount = count($player['codec_support']);
        $playerScore += min(10, $codecCount * 3);

        // Soporte de HDR (0-8)
        $playerScore += min(8, count($player['hdr_support']) * 3);

        // Resolución máxima (0-8)
        $playerMaxPixels = $player['max_resolution'][0] * $player['max_resolution'][1];
        $playerScore += match (true) {
            $playerMaxPixels >= 8294400  => 8,  // 4K+
            $playerMaxPixels >= 2073600  => 6,  // 1080p+
            $playerMaxPixels >= 921600   => 4,  // 720p+
            default                      => 2,
        };

        // Decodificación por hardware (0-4)
        $playerScore += $player['hw_decode'] ? 4 : 0;

        // FPS máximo (0-3)
        $playerScore += min(3, (int) ($player['max_fps'] / 20));

        // === Puntuación de la TV (0-33) ===
        $tvScore = 0;

        // HDR support (0-12)
        $tvScore += min(12, count($tv['hdr_support']) * 4);

        // Resolución máxima (0-10)
        $tvMaxPixels = $tv['max_resolution'][0] * $tv['max_resolution'][1];
        $tvScore += match (true) {
            $tvMaxPixels >= 8294400  => 10,
            $tvMaxPixels >= 2073600  => 7,
            $tvMaxPixels >= 921600   => 4,
            default                  => 2,
        };

        // Nits máximos (0-6)
        $tvScore += match (true) {
            $tv['max_nits'] >= 1000 => 6,
            $tv['max_nits'] >= 600  => 4,
            $tv['max_nits'] >= 400  => 3,
            default                 => 1,
        };

        // Profundidad de color (0-5)
        $tvScore += match ($tv['color_depth']) {
            12 => 5,
            10 => 3,
            8  => 1,
            default => 0,
        };

        // === Puntuación de red (0-33) ===
        $networkScore = 0;

        // Throughput (0-15)
        $networkScore += match (true) {
            $network['throughput_kbps'] >= 50000 => 15,
            $network['throughput_kbps'] >= 25000 => 12,
            $network['throughput_kbps'] >= 10000 => 9,
            $network['throughput_kbps'] >= 5000  => 6,
            $network['throughput_kbps'] >= 2000  => 3,
            default                              => 1,
        };

        // Latencia (0-10)
        $networkScore += match (true) {
            $network['latency_ms'] <= 10 => 10,
            $network['latency_ms'] <= 30 => 7,
            $network['latency_ms'] <= 60 => 4,
            default                     => 1,
        };

        // Tipo de conexión (0-8)
        $networkScore += match ($network['connection_type']) {
            ConnectionType::ETHERNET->value => 8,
            ConnectionType::WIFI->value     => 5,
            ConnectionType::MOBILE->value   => 2,
            default                        => 1,
        };

        // === Puntuación total y mapeo a nivel ===
        $totalScore = $playerScore + $tvScore + $networkScore; // Max ~99

        // Mapear score 0-99 a nivel 0-8
        return match (true) {
            $totalScore >= 80 => 7,
            $totalScore >= 65 => 6,
            $totalScore >= 50 => 5,
            $totalScore >= 40 => 4,
            $totalScore >= 30 => 3,
            $totalScore >= 20 => 2,
            $totalScore >= 10 => 1,
            default           => 0,
        };
    }

    /**
     * Aplica modificador según el tipo de contenido.
     * Deportes y cine suben 1 nivel, noticias se mantienen.
     */
    private function applyContentModifier(int $level, array $content): int
    {
        return match ($content['type']) {
            ContentType::SPORTS->value,
            ContentType::CINEMA->value,
            ContentType::DOCUMENTARY->value => min(8, $level + 1),
            ContentType::NEWS->value        => max(0, $level - 1), // Noticias: preferir baja latencia
            default                         => $level,
        };
    }

    /**
     * Aplica modificador según la calidad de la red.
     * Red mala reduce niveles agresivos.
     */
    private function applyNetworkModifier(int $level, array $network): int
    {
        $modified = $level;

        // Throughput bajo: reducir agresividad
        if ($network['throughput_kbps'] < 2000) {
            $modified = max(0, $modified - 3);
        } elseif ($network['throughput_kbps'] < 3000) {
            $modified = max(0, $modified - 2);
        } elseif ($network['throughput_kbps'] < 5000) {
            $modified = max(0, $modified - 1);
        }

        // Latencia alta: reducir
        if ($network['latency_ms'] > 150) {
            $modified = max(0, $modified - 2);
        } elseif ($network['latency_ms'] > 80) {
            $modified = max(0, $modified - 1);
        }

        // Conexión móvil: reducir agresividad
        if ($network['connection_type'] === ConnectionType::MOBILE->value) {
            $modified = max(0, $modified - 2);
        }

        return $modified;
    }

    /**
     * Construye la configuración completa de escalamiento para un nivel dado.
     */
    private function buildEscalationConfig(int $level): array
    {
        $config = ESCALATION_LEVELS[$level] ?? ESCALATION_LEVELS[0];

        return [
            'level'                  => $level,
            'level_name'             => $config['name'],
            'multiplier'             => $config['multiplier'],
            'boost'                  => $config['boost'],
            'reason'                 => $config['reason'],
            'can_escalate_hdr'       => $level >= 4,
            'can_escalate_codec'     => $level >= 2,
            'can_escalate_buffer'    => $level >= 1,
            'can_escalate_resolution' => $level >= 3,
        ];
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASE 6: ResilienceBrain
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cerebro de resiliencia.
 *
 * Configura los parámetros de reintentos, buffers, timeouts y failover
 * basándose en el nivel de escalamiento y las capacidades del entorno.
 * Todos los valores son calculados dinámicamente, nunca hardcodeados.
 */
class ResilienceBrain
{
    /**
     * Configura todos los parámetros de resiliencia según el contexto.
     *
     * @param  int   $escalationLevel Nivel de escalamiento visual (0-8)
     * @param  array $capabilities    Matriz de capacidades
     * @param  array $content         Perfil de contenido
     * @param  array $inherited       Políticas heredadas de la lista
     * @return array Configuración de resiliencia completa
     */
    public function configure(
        int $escalationLevel,
        array $capabilities,
        array $content,
        array $inherited
    ): array {
        $retry = $this->calculateRetryStrategy(level: $escalationLevel);
        $buffer = $this->calculateBufferTargets(
            level: $escalationLevel,
            content: $content,
            inherited: $inherited['buffer']
        );
        $timeout = $this->calculateTimeoutPolicy(level: $escalationLevel);
        $jitter = $this->buildJitterControl(level: $escalationLevel);
        $failover = $this->buildFailoverPolicy(level: $escalationLevel);

        // Aplicar límites de red en buffers
        $buffer = $this->applyNetworkBufferLimits(
            buffers: $buffer,
            network: $capabilities['network'],
            player: $capabilities['player']
        );

        // Si hay buffer heredado más alto, usarlo (MAX gana)
        if ($inherited['buffer'] !== null) {
            $buffer['buffer_network_ms'] = max($buffer['buffer_network_ms'], $inherited['buffer']);
            $buffer['buffer_live_ms']    = max($buffer['buffer_live_ms'], $inherited['buffer']);
        }

        return [
            'retry_base'         => $retry['base'],
            'retry_max'          => $retry['max'],
            'retry_backoff'      => $retry['backoff'],
            'timeout_connect_ms' => $timeout['connect'],
            'timeout_read_ms'    => $timeout['read'],
            'timeout_total_ms'   => $timeout['total'],
            'buffer_network_ms'  => $buffer['buffer_network_ms'],
            'buffer_live_ms'     => $buffer['buffer_live_ms'],
            'buffer_file_ms'     => $buffer['buffer_file_ms'],
            'buffer_min_ms'      => $buffer['buffer_min_ms'],
            'buffer_max_ms'      => $buffer['buffer_max_ms'],
            'jitter_tolerance'   => $jitter['tolerance'],
            'jump_on_underrun'   => $jitter['jump'],
            'failover_enabled'   => $failover['enabled'],
            'failover_mode'      => $failover['mode'],
            'reconnect_max'      => $failover['reconnect_max'],
            'reconnect_delay_ms' => $failover['reconnect_delay_ms'],
            'clock_recovery'     => $escalationLevel >= 2,
            'stall_protection'   => $escalationLevel >= 1,
        ];
    }

    /**
     * Calcula la estrategia de reintentos según el nivel de escalamiento.
     *
     * @param  int   $level Nivel de escalamiento (0-8)
     * @return array{base: int, max: int, backoff: string}
     */
    private function calculateRetryStrategy(int $level): array
    {
        $retryTable = [
            0 => ['base' => 2, 'backoff' => RetryBackoff::LINEAR->value],
            1 => ['base' => 3, 'backoff' => RetryBackoff::LINEAR->value],
            2 => ['base' => 4, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            3 => ['base' => 5, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            4 => ['base' => 6, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            5 => ['base' => 7, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            6 => ['base' => 8, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            7 => ['base' => 8, 'backoff' => RetryBackoff::EXPONENTIAL->value],
            8 => ['base' => 8, 'backoff' => RetryBackoff::EXPONENTIAL->value],
        ];

        $config = $retryTable[min($level, 8)] ?? $retryTable[0];

        return [
            'base'    => $config['base'],
            'max'     => $config['base'] * 2,
            'backoff' => $config['backoff'],
        ];
    }

    /**
     * Calcula los targets de buffer según el nivel y modificadores.
     *
     * @param  int      $level     Nivel de escalamiento
     * @param  array    $content   Perfil de contenido
     * @param  int|null $inherited Buffer heredado de la lista (ms)
     * @return array Valores de buffer calculados
     */
    private function calculateBufferTargets(int $level, array $content, ?int $inherited): array
    {
        // Tabla base de buffers por nivel (sin modificadores)
        $bufferTable = [
            0 => ['network' => 15000, 'live' => 12000, 'file' => 5000],
            1 => ['network' => 18000, 'live' => 15000, 'file' => 6000],
            2 => ['network' => 22000, 'live' => 18000, 'file' => 7000],
            3 => ['network' => 28000, 'live' => 22000, 'file' => 8000],
            4 => ['network' => 35000, 'live' => 28000, 'file' => 10000],
            5 => ['network' => 45000, 'live' => 35000, 'file' => 12000],
            6 => ['network' => 60000, 'live' => 45000, 'file' => 15000],
            7 => ['network' => 90000, 'live' => 60000, 'file' => 20000],
            8 => ['network' => 120000, 'live' => 90000, 'file' => 25000],
        ];

        $base = $bufferTable[min($level, 8)] ?? $bufferTable[0];

        // Aplicar modificador de contenido
        $modifier = $content['buffer_modifier'] ?? 1.0;

        return [
            'buffer_network_ms' => (int) min(120000, $base['network'] * $modifier),
            'buffer_live_ms'    => (int) min(90000, $base['live'] * $modifier),
            'buffer_file_ms'    => (int) min(25000, $base['file'] * $modifier),
            'buffer_min_ms'     => 5000,
            'buffer_max_ms'     => 120000,
        ];
    }

    /**
     * Calcula la política de timeouts según el nivel.
     */
    private function calculateTimeoutPolicy(int $level): array
    {
        $timeoutTable = [
            0 => ['connect' => 8000, 'read' => 15000, 'total' => 30000],
            1 => ['connect' => 7000, 'read' => 12000, 'total' => 25000],
            2 => ['connect' => 6000, 'read' => 10000, 'total' => 20000],
            3 => ['connect' => 5000, 'read' => 8000,  'total' => 18000],
            4 => ['connect' => 5000, 'read' => 7000,  'total' => 15000],
            5 => ['connect' => 4000, 'read' => 6000,  'total' => 12000],
            6 => ['connect' => 4000, 'read' => 5000,  'total' => 10000],
            7 => ['connect' => 3000, 'read' => 4000,  'total' => 8000],
            8 => ['connect' => 3000, 'read' => 3000,  'total' => 6000],
        ];

        return $timeoutTable[min($level, 8)] ?? $timeoutTable[0];
    }

    /**
     * Construye el control de jitter según el nivel.
     */
    private function buildJitterControl(int $level): array
    {
        // Nivel más alto = más tolerancia al jitter
        $tolerance = match (true) {
            $level >= 6 => 0.25,
            $level >= 4 => 0.20,
            $level >= 2 => 0.15,
            $level >= 1 => 0.10,
            default     => 0.05,
        };

        return [
            'tolerance' => $tolerance,
            'jump'      => $level >= 2,
        ];
    }

    /**
     * Construye la política de failover según el nivel.
     */
    private function buildFailoverPolicy(int $level): array
    {
        return [
            'enabled'           => $level >= 1,
            'mode'              => $level >= 3 ? FailoverMode::SEAMLESS->value : FailoverMode::MANUAL->value,
            'reconnect_max'     => match (true) {
                $level >= 6 => 500,
                $level >= 3 => 200,
                default     => 50,
            },
            'reconnect_delay_ms' => match (true) {
                $level >= 5 => 0,      // Reconexión inmediata
                $level >= 3 => 500,    // Medio segundo
                default     => 1000,   // Un segundo
            },
        ];
    }

    /**
     * Aplica límites de red a los valores de buffer.
     * El buffer no debe exceder lo que la red puede mantener.
     */
    private function applyNetworkBufferLimits(array $buffers, array $network, array $player): array
    {
        $throughputBytesPerSec = (int) ($network['throughput_kbps'] / 8);
        $maxSustainableMs = $throughputBytesPerSec > 0
            ? (int) ($throughputBytesPerSec * 2)
            : 5000;

        // Conexión móvil: cap en 15s
        if ($network['connection_type'] === ConnectionType::MOBILE->value) {
            $maxSustainableMs = min($maxSustainableMs, 15000);
        }

        // No exceder el máximo del reproductor
        $playerMax = $player['buffer_max_ms'] ?? 60000;
        $maxSustainableMs = min($maxSustainableMs, $playerMax);

        $buffers['buffer_network_ms'] = min($buffers['buffer_network_ms'], $maxSustainableMs);
        $buffers['buffer_live_ms']    = min($buffers['buffer_live_ms'], $maxSustainableMs);
        $buffers['buffer_file_ms']    = min($buffers['buffer_file_ms'], $maxSustainableMs);
        $buffers['buffer_max_ms']     = min($buffers['buffer_max_ms'], $maxSustainableMs);

        // Nunca bajar del mínimo
        $buffers['buffer_network_ms'] = max($buffers['buffer_network_ms'], $buffers['buffer_min_ms']);
        $buffers['buffer_live_ms']    = max($buffers['buffer_live_ms'], $buffers['buffer_min_ms']);
        $buffers['buffer_file_ms']    = max($buffers['buffer_file_ms'], $buffers['buffer_min_ms']);

        return $buffers;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASE 7: PremiumDirectiveInjector
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Inyector de directivas premium.
 *
 * Genera directivas específicas para cada tipo de reproductor,
 * fusionándolas con las existentes sin duplicar.
 * Todos los valores provienen del estado, nunca son hardcodeados.
 */
class PremiumDirectiveInjector
{
    /** User-Agent detectado para las directivas */
    private string $userAgent;

    /** Referer detectado (si existe) */
    private string $referer;

    /**
     * Constructor — extrae User-Agent y Referer del entorno.
     */
    public function __construct(string $userAgent = '', string $referer = '')
    {
        $this->userAgent = $userAgent ?: ($_SERVER['HTTP_USER_AGENT'] ?? 'Unknown');
        $this->referer = $referer ?: ($_SERVER['HTTP_REFERER'] ?? '');
    }

    /**
     * Inyecta directivas en el estado del pipeline.
     *
     * @param  array $state Estado completo del pipeline
     * @return array Directivas inyectadas {before_stream, global_headers}
     */
    public function inject(array $state): array
    {
        $playerType = $state['capability_matrix']['player']['type'] ?? 'generic';
        $resilience = $state['resilience_config'];
        $existing = $state['normalized_directives'];
        $capabilities = $state['capability_matrix'];
        $escalation = $state['visual_escalation'];

        // Construir directivas según el tipo de reproductor
        $directives = match ($playerType) {
            PlayerType::VLC->value      => $this->buildVlcDirectives(config: $resilience, capabilities: $capabilities, escalation: $escalation),
            PlayerType::KODI->value     => $this->buildKodiDirectives(config: $resilience, capabilities: $capabilities),
            PlayerType::OTT->value      => $this->buildOttDirectives(config: $resilience, capabilities: $capabilities),
            PlayerType::EXO->value      => $this->buildExoDirectives(config: $resilience, capabilities: $capabilities),
            PlayerType::TIVIMATE->value => $this->buildTivimateDirectives(config: $resilience, capabilities: $capabilities),
            PlayerType::SMART_TV->value => $this->buildSmartTvDirectives(config: $resilience),
            default                     => $this->buildGenericDirectives(config: $resilience),
        };

        // Fusionar con directivas existentes (sin duplicar)
        $merged = $this->mergeWithExisting(
            newDirectives: $directives,
            existing: $existing,
            playerType: $playerType
        );

        return [
            'before_stream'  => $merged['before_stream'],
            'global_headers' => $merged['global_headers'],
        ];
    }

    /**
     * Construye directivas EXTVLCOPT para VLC.
     */
    private function buildVlcDirectives(array $config, array $capabilities, array $escalation): array
    {
        $directives = [];
        $headers = [];

        $networkMs = $config['buffer_network_ms'];
        $liveMs = $config['buffer_live_ms'];
        $fileMs = $config['buffer_file_ms'];

        // Directivas de cache de red (VLC soporta estas)
        $directives[] = "#EXTVLCOPT:network-caching={$networkMs}";
        $directives[] = "#EXTVLCOPT:live-caching={$liveMs}";
        $directives[] = "#EXTVLCOPT:file-caching={$fileMs}";

        // Reconexión HTTP
        $directives[] = '#EXTVLCOPT:http-reconnect=true';
        $directives[] = '#EXTVLCOPT:http-continuous=true';

        // Control de reloj (solo si jitter tolerance lo indica)
        if ($config['clock_recovery']) {
            $directives[] = '#EXTVLCOPT:clock-jitter=0';
            $directives[] = '#EXTVLCOPT:clock-synchro=0';
        }

        // Mantener salida (anti-stall)
        if ($config['stall_protection']) {
            $directives[] = '#EXTVLCOPT:sout-keep=1';
        }

        // Decodificación por hardware (si el reproductor la soporta)
        if ($capabilities['player']['hw_decode']) {
            $directives[] = '#EXTVLCOPT:avcodec-hw=any';
            $directives[] = '#EXTVLCOPT:avcodec-threads=0';
            $directives[] = '#EXTVLCOPT:avcodec-fast=1';
        }

        // Deinterlazado (si el nivel de escalamiento lo permite)
        if ($escalation['can_escalate_buffer']) {
            $directives[] = '#EXTVLCOPT:deinterlace-mode=bwdif';
        }

        // User-Agent y Referer personalizados
        $directives[] = "#EXTVLCOPT:http-user-agent={$this->userAgent}";
        if ($this->referer !== '') {
            $directives[] = "#EXTVLCOPT:http-referrer={$this->referer}";
        }

        return ['before_stream' => $directives, 'global_headers' => $headers];
    }

    /**
     * Construye directivas KODIPROP para Kodi.
     */
    private function buildKodiDirectives(array $config, array $capabilities): array
    {
        $directives = [];
        $headers = [];

        $networkMs = $config['buffer_network_ms'];
        $liveMs = $config['buffer_live_ms'];

        // Directivas de buffer para InputStream Adaptive
        $directives[] = "#KODIPROP:inputstream.adaptive.buffer_for_playback={$networkMs}";
        $directives[] = '#KODIPROP:inputstream.adaptive.buffer_limit_mult=10';
        $directives[] = "#KODIPROP:inputstream.adaptive.live_buffer={$liveMs}";

        // Configuración de ancho de banda máximo
        if (!empty($capabilities['network']['throughput_kbps'])) {
            $directives[] = "#KODIPROP:inputstream.adaptive.max_bandwidth=0";
        }

        return ['before_stream' => $directives, 'global_headers' => $headers];
    }

    /**
     * Construye directivas EXTHTTP para OTT Navigator.
     */
    private function buildOttDirectives(array $config, array $capabilities): array
    {
        $directives = [];
        $headers = [
            'User-Agent' => $this->userAgent,
            'X-Buffer-Target' => (string) $config['buffer_network_ms'],
            'X-Reconnect' => 'true',
        ];

        if ($config['failover_enabled']) {
            $headers['X-Failover'] = $config['failover_mode'];
        }

        return ['before_stream' => $directives, 'global_headers' => $headers];
    }

    /**
     * Construye directivas para ExoPlayer / IPTV Smarters.
     */
    private function buildExoDirectives(array $config, array $capabilities): array
    {
        $directives = [];
        $headers = [
            'User-Agent' => $this->userAgent,
        ];

        if ($this->referer !== '') {
            $headers['Referer'] = $this->referer;
        }

        return ['before_stream' => $directives, 'global_headers' => $headers];
    }

    /**
     * Construye directivas para TiviMate.
     */
    private function buildTivimateDirectives(array $config, array $capabilities): array
    {
        $directives = [];
        $headers = [];

        // TiviMate soporta EXTVLCOPT limitado
        $directives[] = "#EXTVLCOPT:network-caching={$config['buffer_network_ms']}";

        // Y soporta EXTHTTP
        $headers['User-Agent'] = $this->userAgent;

        return ['before_stream' => $directives, 'global_headers' => $headers];
    }

    /**
     * Construye directivas mínimas para Smart TV.
     */
    private function buildSmartTvDirectives(array $config): array
    {
        // Smart TVs generalmente no soportan directivas avanzadas
        return ['before_stream' => [], 'global_headers' => []];
    }

    /**
     * Construye directivas genéricas (jugador desconocido).
     */
    private function buildGenericDirectives(array $config): array
    {
        // Jugador genérico: no asumir soporte de directivas
        return ['before_stream' => [], 'global_headers' => []];
    }

    /**
     * Fusiona directivas nuevas con las existentes, sin duplicar.
     * Respeta el orden: primero las existentes, luego las nuevas.
     *
     * @param  array  $newDirectives Directivas nuevas a insertar
     * @param  array  $existing      Directivas existentes de la lista
     * @param  string $playerType    Tipo de reproductor
     * @return array  Directivas fusionadas
     */
    private function mergeWithExisting(array $newDirectives, array $existing, string $playerType): array
    {
        $mergedStream = [];
        $seenKeys = [];
        $mergedHeaders = $newDirectives['global_headers'] ?? [];

        // Primero: directivas existentes (mantener orden original)
        $existingStream = match ($playerType) {
            PlayerType::VLC->value      => $existing['extvlcopt'] ?? [],
            PlayerType::TIVIMATE->value => array_merge(
                $existing['extvlcopt'] ?? [],
                []
            ),
            PlayerType::KODI->value     => $existing['kodiprop'] ?? [],
            default                     => [],
        };

        foreach ($existingStream as $directive) {
            $key = strstr($directive, '=', true) ?: $directive;
            $seenKeys[$key] = true;
            $mergedStream[] = $directive;
        }

        // Segundo: directivas nuevas (solo las que no existen ya)
        foreach (($newDirectives['before_stream'] ?? []) as $directive) {
            // Extraer clave para detectar duplicados
            if (str_contains($directive, '=')) {
                $key = strstr($directive, '=', true);
            } else {
                $key = $directive;
            }

            if ($key !== false && !isset($seenKeys[$key])) {
                $seenKeys[$key] = true;
                $mergedStream[] = $directive;
            }
        }

        // Fusionar cabeceras HTTP
        if (!empty($existing['exthttp'])) {
            foreach ($existing['exthttp'] as $key => $value) {
                if (!isset($mergedHeaders[$key])) {
                    $mergedHeaders[$key] = $value;
                }
            }
        }

        return [
            'before_stream'  => $mergedStream,
            'global_headers' => $mergedHeaders,
        ];
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASE 8: GuardianPolicyEngine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Motor de políticas guardianas.
 *
 * Aplica límites de seguridad para garantizar que las directivas
 * inyectadas no excedan las capacidades reales del hardware y la red.
 * También aplica las políticas anti-509 y anti-fantasía.
 */
class GuardianPolicyEngine
{
    /**
     * Aplica todas las políticas guardianas al estado del pipeline.
     *
     * @param  array $state Estado completo del pipeline
     * @return array Estado modificado con guardian_limits y compliance_flags
     */
    public function enforce(array $state): array
    {
        $resilience = &$state['resilience_config'];
        $capabilities = $state['capability_matrix'];
        $injected = $state['injected_directives'];
        $dna = $state['manifest_dna'];

        // Límites de guardian
        $limits = [
            'max_buffer_ms'  => $capabilities['player']['buffer_max_ms'] ?? 120000,
            'max_resolution' => $capabilities['tv']['max_resolution'] ?? [3840, 2160],
            'allowed_hdr'    => $capabilities['tv']['hdr_support'] ?? [],
            'allowed_codecs' => $capabilities['player']['codec_support'] ?? ['h264', 'hevc'],
            'max_bitrate_kbps' => (int) ($capabilities['network']['throughput_kbps'] * 0.8),
            'max_concurrent' => 1, // Anti-509: siempre 1
        ];

        // Aplicar límites de buffer
        $resilience = $this->limitBuffer(
            resilience: $resilience,
            network: $capabilities['network'],
            player: $capabilities['player']
        );

        // Aplicar límites de HDR
        $injected = $this->limitHdr(directives: $injected, tvCaps: $capabilities['tv']);

        // Aplicar límites de resolución
        $injected = $this->limitResolution(directives: $injected, tvCaps: $capabilities['tv']);

        // Aplicar límites de bitrate
        $limits = $this->limitBitrate(limits: $limits, network: $capabilities['network']);

        // Aplicar anti-509
        $state = $this->enforceAnti509(state: $state);

        // Aplicar anti-fantasía
        $state = $this->enforceAntiFantasy(state: $state);

        // Actualizar estado
        $state['guardian_limits'] = $limits;
        $state['injected_directives'] = $injected;

        // Construir flags de cumplimiento
        $state['compliance_flags'] = [
            'anti_509'       => $state['compliance_flags']['anti_509'] ?? true,
            'anti_probe'     => true,
            'anti_fantasy'   => $state['compliance_flags']['anti_fantasy'] ?? true,
            'idempotent'     => true,
            'dna_preserved'  => true,
            'no_degradation' => true,
            'limits_applied' => $this->collectAppliedLimits(state: $state),
        ];

        return $state;
    }

    /**
     * Limita los valores de buffer según la red y el reproductor.
     */
    private function limitBuffer(array $resilience, array $network, array $player): array
    {
        // Máximo que la red puede sostener
        $throughputBytesPerSec = (int) ($network['throughput_kbps'] / 8);
        $networkMaxMs = $throughputBytesPerSec > 0 ? $throughputBytesPerSec * 2 : 5000;

        // Mínimo entre red, reproductor y configurado
        $effectiveMax = min($networkMaxMs, $player['buffer_max_ms']);

        $resilience['buffer_network_ms'] = min($resilience['buffer_network_ms'], $effectiveMax);
        $resilience['buffer_live_ms']    = min($resilience['buffer_live_ms'], $effectiveMax);
        $resilience['buffer_file_ms']    = min($resilience['buffer_file_ms'], $effectiveMax);

        // Móvil: cap estricto
        if ($network['connection_type'] === ConnectionType::MOBILE->value) {
            $mobileCap = 15000;
            $resilience['buffer_network_ms'] = min($resilience['buffer_network_ms'], $mobileCap);
            $resilience['buffer_live_ms']    = min($resilience['buffer_live_ms'], $mobileCap);
        }

        return $resilience;
    }

    /**
     * Elimina directivas HDR que la TV no soporta.
     */
    private function limitHdr(array $directives, array $tvCaps): array
    {
        $allowedHdr = $tvCaps['hdr_support'] ?? [];
        $beforeStream = $directives['before_stream'] ?? [];

        // Si la TV no soporta HDR, eliminar directivas HDR
        if (empty($allowedHdr)) {
            $filtered = array_filter($beforeStream, static fn(string $d): bool => !str_contains(strtolower($d), 'hdr'
                )
            );
            $directives['before_stream'] = array_values($filtered);
        }

        return $directives;
    }

    /**
     * Elimina directivas de resolución que exceden la TV.
     */
    private function limitResolution(array $directives, array $tvCaps): array
    {
        $maxRes = $tvCaps['max_resolution'] ?? [1920, 1080];
        $maxPixels = $maxRes[0] * $maxRes[1];
        $beforeStream = $directives['before_stream'] ?? [];

        // Si la TV es 1080p o menos, eliminar directivas 4K/8K
        if ($maxPixels < 8294400) {
            $filtered = array_filter($beforeStream, static fn(string $d): bool => !(
                    str_contains(strtolower($d), '4k') ||
                    str_contains(strtolower($d), '2160') ||
                    str_contains(strtolower($d), '3840') ||
                    str_contains(strtolower($d), 'uhd')
                )
            );
            $directives['before_stream'] = array_values($filtered);
        }

        return $directives;
    }

    /**
     * Limita el bitrate máximo según la capacidad de la red.
     */
    private function limitBitrate(array $limits, array $network): array
    {
        // No exceder el 80% del throughput para dejar margen
        $maxBitrate = (int) ($network['throughput_kbps'] * 0.8);
        $limits['max_bitrate_kbps'] = max(1000, $maxBitrate);
        return $limits;
    }

    /**
     * Aplica la política anti-509: un solo consumidor, sin paralelo.
     */
    private function enforceAnti509(array $state): array
    {
        // Garantizar que no se generen directivas de prefetch o paralelismo
        $beforeStream = $state['injected_directives']['before_stream'] ?? [];

        $filtered = array_filter($beforeStream, static fn(string $d): bool => !(
                str_contains(strtolower($d), 'prefetch') ||
                str_contains(strtolower($d), 'parallel') ||
                str_contains(strtolower($d), 'concurrent')
            )
        );

        $state['injected_directives']['before_stream'] = array_values($filtered);
        $state['compliance_flags']['anti_509'] = true;

        return $state;
    }

    /**
     * Aplica la política anti-fantasía: no claiming capacidades que el ADN no declara.
     */
    private function enforceAntiFantasy(array $state): array
    {
        $dna = $state['manifest_dna'];
        $beforeStream = $state['injected_directives']['before_stream'] ?? [];

        // Si el ADN no declara HDR, no añadir directivas HDR
        if (!$dna['has_hdr']) {
            $beforeStream = array_values(array_filter($beforeStream, static fn(string $d): bool => !str_contains(strtolower($d), 'hdr'
                )
            ));
        }

        // Si el ADN no declara 4K, no añadir directivas 4K
        if (!$dna['has_4k']) {
            $beforeStream = array_values(array_filter($beforeStream, static fn(string $d): bool => !(
                    str_contains(strtolower($d), '4k') ||
                    str_contains(strtolower($d), '2160')
                )
            ));
        }

        $state['injected_directives']['before_stream'] = $beforeStream;
        $state['compliance_flags']['anti_fantasy'] = true;

        return $state;
    }

    /**
     * Recopila qué límites fueron aplicados y por qué.
     */
    private function collectAppliedLimits(array $state): array
    {
        $applied = [];

        $dna = $state['manifest_dna'];
        $resilience = $state['resilience_config'];
        $capabilities = $state['capability_matrix'];

        // Verificar si el buffer fue limitado
        if ($resilience['buffer_network_ms'] < 120000) {
            $throughput = $capabilities['network']['throughput_kbps'];
            $applied[] = "buffer_limitado_a_{$resilience['buffer_network_ms']}ms_por_throughput_{$throughput}kbps";
        }

        // Verificar si HDR fue bloqueado
        if (empty($capabilities['tv']['hdr_support']) && $dna['has_hdr']) {
            $applied[] = 'hdr_bloqueado_tv_no_soporta_hdr';
        }

        // Verificar si resolución fue limitada
        $tvPixels = $capabilities['tv']['max_resolution'][0] * $capabilities['tv']['max_resolution'][1];
        if ($tvPixels < 8294400) {
            $applied[] = 'resolucion_limitada_a_' . implode('x', $capabilities['tv']['max_resolution']);
        }

        return $applied;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASE 9: StreamSignatureCache
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Caché de firmas de stream.
 *
 * Permite omitir el pipeline completo cuando la misma solicitud
 * ya fue procesada recientemente. Usa APCu si está disponible,
 * de lo contrario usa caché basada en archivos.
 */
class StreamSignatureCache
{
    /** Directorio de caché */
    private readonly string $cacheDir;

    /** Prefijo de clave para APCu */
    private readonly string $cachePrefix;

    /** Indica si APCu está disponible */
    private readonly bool $apcuAvailable;

    /**
     * Constructor.
     *
     * @param string $cacheDir Directorio base para caché en archivo
     */
    public function __construct(string $cacheDir = '/tmp/resolve_cache')
    {
        $this->cacheDir = $cacheDir;
        $this->cachePrefix = 'rq_';
        $this->apcuAvailable = extension_loaded('apcu') && apcu_enabled();

        // Crear directorio si no existe
        if (!is_dir($this->cacheDir)) {
            @mkdir($this->cacheDir, 0755, true);
        }
    }

    /**
     * Genera una firma única para la solicitud.
     *
     * @param  array  $params Parámetros que identifican la solicitud
     * @return string Firma MD5
     */
    public function getSignature(array $params): string
    {
        // Incluir todos los parámetros relevantes en la firma
        ksort(array: $params);
        return md5($this->cachePrefix . json_encode($params, JSON_UNESCAPED_UNICODE));
    }

    /**
     * Obtiene datos cacheados para una firma dada.
     *
     * @param  string     $signature Firma de la solicitud
     * @return array|null Datos cacheados o null si no hay cache
     */
    public function getCached(string $signature): ?array
    {
        if ($this->apcuAvailable) {
            $success = false;
            $data = apcu_fetch($signature, $success);
            return $success ? $data : null;
        }

        // Caché basada en archivo
        $file = $this->cacheDir . '/' . $signature . '.cache';
        if (!file_exists($file)) {
            return null;
        }

        $content = @file_get_contents($file);
        if ($content === false) {
            return null;
        }

        $cached = json_decode($content, true);
        if (!is_array($cached)) {
            return null;
        }

        // Verificar TTL
        $expiresAt = $cached['expires_at'] ?? 0;
        if (time() > $expiresAt) {
            @unlink($file);
            return null;
        }

        return $cached['data'] ?? null;
    }

    /**
     * Almacena datos en caché con un TTL determinado.
     *
     * @param string $signature   Firma de la solicitud
     * @param array  $data        Datos a cachear
     * @param int    $ttlSeconds  Tiempo de vida en segundos
     */
    public function setCached(string $signature, array $data, int $ttlSeconds = 300): void
    {
        $cacheEntry = [
            'data'       => $data,
            'expires_at' => time() + $ttlSeconds,
            'created_at' => time(),
        ];

        if ($this->apcuAvailable) {
            apcu_store($signature, $cacheEntry, $ttlSeconds);
            return;
        }

        // Caché basada en archivo
        $file = $this->cacheDir . '/' . $signature . '.cache';
        @file_put_contents($file, json_encode($cacheEntry, JSON_UNESCAPED_UNICODE), LOCK_EX
        );
    }

    /**
     * Invalida entradas de caché que coincidan con un patrón.
     *
     * @param string $pattern Patrón de firma para invalidar (substring)
     */
    public function invalidate(string $pattern): void
    {
        if ($this->apcuAvailable) {
            // APCu: buscar y eliminar claves que contengan el patrón
            $info = apcu_cache_info(user_cache: true);
            if (isset($info['cache_list'])) {
                foreach ($info['cache_list'] as $entry) {
                    $key = is_array($entry) ? ($entry['info'] ?? '') : (string) $entry;
                    if (str_contains($key, $pattern)) {
                        apcu_delete($key);
                    }
                }
            }
            return;
        }

        // Archivo: eliminar archivos que coincidan
        $files = glob(pattern: $this->cacheDir . '/*' . $pattern . '*.cache');
        if (is_array($files)) {
            foreach ($files as $file) {
                @unlink($file);
            }
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// CLASE 10: OutputBuilder
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Constructor de salida M3U.
 *
 * Ensambla el M3U final respetando el formato original,
 * fusionando directivas existentes con las inyectadas,
 * y garantizando idempotencia en la salida.
 */
class OutputBuilder
{
    /**
     * Construye el texto M3U final a partir del estado del pipeline.
     *
     * @param  array  $state Estado completo del pipeline
     * @return string Texto M3U/M3U8 listo para servir
     */
    public function build(array $state): string
    {
        $dna = $state['manifest_dna'];
        $injected = $state['injected_directives'];
        $normalized = $state['normalized_directives'];
        $playerType = $state['capability_matrix']['player']['type'] ?? 'generic';

        // Detectar si la lista original tenía #EXTM3U
        $hasExtM3U = false;
        foreach ($dna['raw_lines'] as $line) {
            if (trim($line) === '#EXTM3U') {
                $hasExtM3U = true;
                break;
            }
        }

        $output = [];
        $extinfEntries = $dna['extinf_entries'];
        $rawLines = $dna['raw_lines'];
        $streamIndex = 0;
        $entryIndex = 0;

        // Construir mapa de directivas existentes por índice de entrada
        $existingDirectivesMap = $this->buildExistingDirectivesMap(
            rawLines: $rawLines,
            extinfEntries: $extinfEntries
        );

        // Bloque de cabeceras EXTHTTP globales (si aplica)
        if (!empty($injected['global_headers'])) {
            foreach ($injected['global_headers'] as $key => $value) {
                $output[] = "#EXTHTTP:{$key}={$value}";
            }
        }

        // Si no hay #EXTM3U, agregarlo
        if (!$hasExtM3U && !empty($rawLines)) {
            array_unshift($output, '#EXTM3U');
        }

        $processedStreamIndices = [];

        // Iterar sobre las líneas crudas para reconstruir en orden
        $i = 0;
        while ($i < count($rawLines)) {
            $line = $rawLines[$i];

            // Línea #EXTM3U: omitir si ya la agregamos
            if (trim($line) === '#EXTM3U') {
                if ($hasExtM3U) {
                    $output[] = '#EXTM3U';
                }
                $i++;
                continue;
            }

            // Línea EXTINF: reconstruirla con atributos preservados
            if (str_starts_with($line, '#EXTINF:')) {
                $entry = $extinfEntries[$entryIndex] ?? null;

                if ($entry !== null) {
                    // Reconstruir línea EXTINF preservando atributos originales
                    $extinfLine = $this->buildExtInf(entry: $entry, overrides: $normalized['extinf_overrides'] ?? []);
                    $output[] = $extinfLine;

                    // Agregar directivas existentes para esta entrada
                    $existingForEntry = $existingDirectivesMap[$entry['line_index']] ?? [];

                    // Filtrar directivas existentes según tipo de reproductor
                    $filteredExisting = $this->filterDirectivesForPlayer(
                        directives: $existingForEntry,
                        playerType: $playerType
                    );

                    // Fusionar: primero las existentes, luego las inyectadas
                    $mergedDirectives = $this->mergeDirectives(
                        existing: $filteredExisting,
                        injected: $injected['before_stream']
                    );

                    foreach ($mergedDirectives as $directive) {
                        $output[] = $directive;
                    }

                    $entryIndex++;
                } else {
                    $output[] = $line;
                    $entryIndex++;
                }

                $i++;
                continue;
            }

            // Saltar directivas que ya fueron procesadas (se reemplazan por las fusionadas)
            if ($this->isProcessedDirective(line: $line, existingMap: $existingDirectivesMap, currentLineIndex: $i)) {
                $i++;
                continue;
            }

            // Otros tags: preservarlos
            if (str_starts_with($line, '#')) {
                $output[] = $line;
                $i++;
                continue;
            }

            // URL de stream: preservarla
            $output[] = $line;
            $i++;
        }

        return implode("\n", $output) . "\n";
    }

    /**
     * Reconstruye una línea #EXTINF preservando todos los atributos originales.
     *
     * @param  array $entry    Entrada EXTINF parseada
     * @param  array $overrides Atributos adicionales a agregar
     * @return string Línea EXTINF completa
     */
    private function buildExtInf(array $entry, array $overrides): string
    {
        $parts = ['#EXTINF:'];

        // Duración
        $parts[] = $entry['duration'];

        // Atributos originales en orden (preservar orden del ADN)
        foreach ($entry['attributes'] as $key => $value) {
            // No duplicar si ya está en overrides
            if (!isset($overrides[$key])) {
                $parts[] = "{$key}=\"{$value}\"";
            }
        }

        // Agregar overrides que no existían
        foreach ($overrides as $key => $value) {
            if (!isset($entry['attributes'][$key])) {
                $parts[] = "{$key}=\"{$value}\"";
            }
        }

        // Título
        $parts[] = ',' . $entry['title'];

        return implode(' ', $parts);
    }

    /**
     * Construye un mapa de directivas existentes por índice de línea EXTINF.
     *
     * @param  array $rawLines       Líneas crudas del manifiesto
     * @param  array $extinfEntries  Entradas EXTINF parseadas
     * @return array<int, array<string>> Mapa índice → directivas
     */
    private function buildExistingDirectivesMap(array $rawLines, array $extinfEntries): array
    {
        $map = [];
        $directivePrefixes = ['#EXTVLCOPT:', '#KODIPROP:', '#EXTHTTP:'];

        foreach ($extinfEntries as $entry) {
            $lineIndex = $entry['line_index'];
            $directives = [];

            // Buscar directivas después de esta EXTINF
            for ($j = $lineIndex + 1; $j < count($rawLines); $j++) {
                $line = $rawLines[$j];

                // Si es otra EXTINF o una URL, parar
                if (str_starts_with($line, '#EXTINF:') || !str_starts_with($line, '#')) {
                    break;
                }

                // Si es una directiva conocida, registrarla
                foreach ($directivePrefixes as $prefix) {
                    if (str_starts_with($line, $prefix)) {
                        $directives[] = $line;
                        break;
                    }
                }
            }

            $map[$lineIndex] = $directives;
        }

        return $map;
    }

    /**
     * Filtra directivas existentes según el tipo de reproductor.
     * Solo se conservan las directivas que el reproductor soporta.
     */
    private function filterDirectivesForPlayer(array $directives, string $playerType): array
    {
        $supported = match ($playerType) {
            PlayerType::VLC->value      => ['EXTVLCOPT', 'EXTHTTP'],
            PlayerType::KODI->value     => ['KODIPROP', 'EXTHTTP'],
            PlayerType::OTT->value      => ['EXTHTTP'],
            PlayerType::EXO->value      => ['EXTHTTP'],
            PlayerType::TIVIMATE->value => ['EXTVLCOPT', 'EXTHTTP'],
            PlayerType::SMART_TV->value => [],
            default                     => [],
        };

        if (empty($supported)) {
            return [];
        }

        return array_values(array_filter($directives, static function (string $d) use ($supported): bool {
                foreach ($supported as $prefix) {
                    if (str_starts_with($d, '#' . $prefix . ':')) {
                        return true;
                    }
                }
                return false;
            }
        ));
    }

    /**
     * Fusiona directivas existentes con inyectadas sin duplicar.
     */
    private function mergeDirectives(array $existing, array $injected): array
    {
        $seen = [];
        $merged = [];

        // Primero las existentes
        foreach ($existing as $directive) {
            $key = strstr($directive, '=', true) ?: $directive;
            $seen[$key] = true;
            $merged[] = $directive;
        }

        // Luego las inyectadas (solo las nuevas)
        foreach ($injected as $directive) {
            $key = strstr($directive, '=', true) ?: $directive;
            if ($key !== false && !isset($seen[$key])) {
                $seen[$key] = true;
                $merged[] = $directive;
            }
        }

        return $merged;
    }

    /**
     * Verifica si una línea es una directiva que ya fue procesada por el mapa.
     */
    private function isProcessedDirective(string $line, array $existingMap, int $currentLineIndex): bool
    {
        $directivePrefixes = ['#EXTVLCOPT:', '#KODIPROP:', '#EXTHTTP:'];

        foreach ($directivePrefixes as $prefix) {
            if (str_starts_with($line, $prefix)) {
                // Verificar si esta directiva pertenece a alguna entrada
                foreach ($existingMap as $entryIndex => $directives) {
                    if ($currentLineIndex > $entryIndex) {
                        // Pertenece a esta entrada — ya procesada
                        return true;
                    }
                }
            }
        }

        return false;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SEGURIDAD v3.0 — Rate Limiting y Autenticación HMAC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verificar rate limit por IP y endpoint.
 * Usa archivos JSON en cache/ para tracking. LOCK_SH para lectura.
 * Retorna true si la petición está permitida, false si excede el límite.
 */
function rq_check_rate_limit(string $endpoint): bool
{
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $safeIp = preg_replace('/[^a-fA-F0-9.:]/', '_', $clientIp);
    $safeEndpoint = preg_replace('/[^a-z0-9_]/', '_', strtolower($endpoint));

    $rateDir = RQ_BASE_DIR . '/cache/ratelimit';
    if (!is_dir($rateDir)) {
        @mkdir($rateDir, 0755, true);
    }

    $filePath = $rateDir . '/' . $safeIp . '_' . $safeEndpoint . '.json';
    $now = time();
    $windowStart = $now - RQ_RATE_WINDOW;

    $data = ['hits' => []];
        $content = @file_get_contents($filePath);
        if ($content !== false) {
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                $data = $decoded;
        }
    }

    // Filtrar hits dentro de la ventana
    $data['hits'] = array_values(array_filter($data['hits'], fn(int $ts): bool => $ts > $windowStart));
    $hitCount = count($data['hits']);

    $maxHits = RQ_RATE_LIMITS[$safeEndpoint] ?? 30;

    if ($hitCount >= $maxHits) {
        rq_log("Rate limit alcanzado: IP={$safeIp} endpoint={$safeEndpoint} hits={$hitCount}/{$maxHits}", 'WARN');
        return false;
    }

    $data['hits'][] = $now;
    @file_put_contents($filePath, json_encode($data), LOCK_EX);
    return true;
}

/**
 * Verificar token HMAC de autenticación.
 * El token se envía en header X-RQ-Token o parámetro ?token=.
 * Formato: HMAC-SHA256(timestamp + endpoint, secret)
 */
function rq_verify_token(string $endpoint): bool
{
    $secret = RQ_SECRET_TOKEN;
    if ($secret === 'cambia_esto_por_un_secreto_aleatorio_64chars') {
        return true; // Token no configurado = deshabilitado
    }

    $token = rq_header('X-RQ-Token') ?? q('token', '');

    if ($token === '' || strlen($token) < 32) {
        return false;
    }

    // Esperamos formato: timestamp:hmac_hex
    $parts = explode(':', $token, 2);
    if (count($parts) !== 2) {
        return false;
    }

    [$timestamp, $hmac] = $parts;
    $ts = (int) $timestamp;

    // Token expira en 5 minutos
    if (abs(time() - $ts) > 300) {
        return false;
    }

    $expected = hash_hmac('sha256', $ts . $endpoint, $secret);
    return hash_equals($expected, $hmac);
}

/**
 * Generar token HMAC para uso del frontend.
 * Retorna timestamp:hmac_hex listo para usar en X-RQ-Token.
 */
function rq_generate_token(string $endpoint): string
{
    $ts = time();
    $hmac = hash_hmac('sha256', $ts . $endpoint, RQ_SECRET_TOKEN);
    return $ts . ':' . $hmac;
}


// ═══════════════════════════════════════════════════════════════════════════
// MÓDULOS v3.0 — Autonomous Playback Intelligence (ADDITIVE, no rompe v2.5)
// Se cargan desde archivos separados. Si no existen, v2.5 funciona normalmente.
// ═══════════════════════════════════════════════════════════════════════════

$v3_modules_available = false;
$v3_feedback = null;
$v3_mutator = null;
$v3_variant = null;
$v3_latency = null;
$v3_preloader = null;

$v3_modules_dir = RQ_BASE_DIR . '/modules';
$v3_files = [
    'RuntimeFeedbackCollector.php',
    'AdaptiveProfileMutator.php',
    'MultiVariantSelector.php',
    'LatencyAwareRouter.php',
    'PredictivePreloader.php',
];

foreach ($v3_files as $v3_file) {
    $v3_path = $v3_modules_dir . '/' . $v3_file;
}

// Instanciar módulos v3.0 si todas las clases están disponibles
if (class_exists('RuntimeFeedbackCollector') && class_exists('AdaptiveProfileMutator')
    && class_exists('MultiVariantSelector') && class_exists('LatencyAwareRouter')
    && class_exists('PredictivePreloader')) {
    $v3_modules_available = true;

    // Directorios persistentes para datos v3.0 (NO /tmp/ — ese se limpia en reboot)
    $v3_telemetry_dir = RQ_BASE_DIR . '/telemetry';
    $v3_mutations_dir = RQ_BASE_DIR . '/mutations';
    $v3_latency_dir   = RQ_BASE_DIR . '/latency';
    $v3_predict_dir   = RQ_BASE_DIR . '/predict';

    $v3_feedback  = new RuntimeFeedbackCollector(storageDirPath: $v3_telemetry_dir);
    $v3_mutator   = new AdaptiveProfileMutator(feedback: $v3_feedback, cooldownDirPath: $v3_mutations_dir);
    $v3_variant   = new MultiVariantSelector();
    $v3_latency   = new LatencyAwareRouter(storageDirPath: $v3_latency_dir);
    $v3_preloader = new PredictivePreloader(storageDirPath: $v3_predict_dir);
}


// ═══════════════════════════════════════════════════════════════════════════
// ORQUESTADOR: ResolveQualityPipeline
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pipeline principal que orquesta los 10 módulos.
 *
 * Flujo: PARSE → NORMALIZE → CAPABILITIES → CONTENT → ESCALATE
 *        → RESILIENCE → INJECT → GUARDIAN → CACHE → OUTPUT
 *
 * Cada módulo transforma el estado compartido de forma inmutable
 * (cada módulo devuelve el estado modificado, no lo muta directamente).
 */
class ResolveQualityPipeline
{
    /**
     * Constructor con inyección de dependencias.
     *
     * @param ManifestAnatomyParser       $parser          Analizador de manifiestos
     * @param IdempotentNormalizationEngine $normalizer     Motor de normalización
     * @param CapabilityNegotiationLayer  $capabilityLayer Capa de negociación
     * @param ContentHeuristicEngine      $contentEngine   Motor heurístico de contenido
     * @param VisualPotentialEscalator    $escalator       Escalador visual
     * @param ResilienceBrain             $resilience      Cerebro de resiliencia
     * @param PremiumDirectiveInjector    $injector        Inyector de directivas
     * @param GuardianPolicyEngine        $guardian        Motor guardian
     * @param StreamSignatureCache        $cache           Caché de firmas
     * @param OutputBuilder               $builder         Constructor de salida
     */
    public function __construct(
        private readonly ManifestAnatomyParser        $parser,
        private readonly IdempotentNormalizationEngine $normalizer,
        private readonly CapabilityNegotiationLayer   $capabilityLayer,
        private readonly ContentHeuristicEngine       $contentEngine,
        private readonly VisualPotentialEscalator     $escalator,
        private readonly ResilienceBrain              $resilience,
        private readonly PremiumDirectiveInjector     $injector,
        private readonly GuardianPolicyEngine         $guardian,
        private readonly StreamSignatureCache         $cache,
        private readonly OutputBuilder                $builder,
    ) {}

    /**
     * Procesa una lista M3U bruta y devuelve la versión mejorada.
     *
     * @param  string $raw     Contenido M3U bruto
     * @param  array  $context Contexto de la solicitud (cabeceras, params, etc.)
     * @return string Contenido M3U mejorado
     */
    public function process(string $raw, array $context = []): string
    {
        $startTime = microtime(true);

        try {
            // Verificar caché primero
            $serverHeaders = $context['server_headers'] ?? [];
            $getParams = $context['get_params'] ?? [];
            $signatureParams = [
                'raw' => md5($raw),
                'ua' => $serverHeaders['HTTP_USER_AGENT'] ?? 'unknown',
                'headers' => md5(json_encode($serverHeaders)),
            ];
            $signature = $this->cache->getSignature(params: $signatureParams);
            $ttl = $context['cache_ttl'] ?? RQ_CACHE_TTL_LIST;

            $cached = $this->cache->getCached(signature: $signature);
            if ($cached !== null && isset($cached['output'])) {
                // Cache HIT: devolver directamente (0ms de procesamiento)
                return $cached['output'];
            }

            // Inicializar estado
            $state = $this->initializeState();

            // Ejecutar pipeline
            $state = $this->runPipeline(state: $state, context: $context, raw: $raw);

            // ═══════════════════════════════════════════════════════════════════════════
            // V3.0: PROCESAMIENTO AUTÓNOMO (solo si hay datos de telemetría)
            // Estos módulos NO se ejecutan si no hay feedback del player.
            // Sin datos = comportamiento idéntico a v2.5 (zero overhead).
            // ═══════════════════════════════════════════════════════════════════════════
            global $v3_modules_available, $v3_feedback, $v3_mutator, $v3_variant, $v3_latency, $v3_preloader;

            if ($v3_modules_available) {
                // --- V3.1: Mutación Adaptativa de Perfil ---
                // Si hay telemetría del player, ajustar nivel y resiliencia
                $channelId = $context['channel_id'] ?? $context['url'] ?? 'unknown';
                $state = $v3_mutator->mutate(state: $state, channelId: $channelId);
                
                // --- V3.2: Selección Multi-Variante ---
                // Si el manifiesto tiene múltiples variantes, seleccionar la mejor
                $variantDirectives = $v3_variant->selectBestVariant(
                    variants: $state['manifest_dna'],
                    capabilities: $state['capability_matrix'],
                    telemetry: $v3_feedback->getChannelTelemetry(channelId: $channelId),
                );
                if (!empty($variantDirectives)) {
                    $state['output_overrides'] = array_merge($state['output_overrides'], $variantDirectives);
                }
                
                // --- V3.3: Routing Basado en Latencia ---
                // Ajustar timeouts y buffers según latencia medida de la red
                $streamFp = md5((string)($context['url'] ?? ''));
                $latencyProfile = $v3_latency->getLatencyProfile(streamFingerprint: $streamFp);
                if (($latencyProfile['samples'] ?? 0) >= 3) {
                    $latencyAdjustments = $v3_latency->generateTimeoutAdjustments(
                        profile: $latencyProfile,
                        baseResilience: $state['resilience_config'],
                    );
                    $state['resilience_config'] = $latencyAdjustments;
                    
                    $jitterDirectives = $v3_latency->generateJitterDirectives(
                        profile: $latencyProfile,
                        playerType: $state['capability_matrix']['player']['type'] ?? 'generic',
                    );
                    if (!empty($jitterDirectives)) {
                        $state['output_overrides'] = array_merge($state['output_overrides'], $jitterDirectives);
                    }
                }
                
                // --- V3.4: Predicción de Preloading ---
                // Registrar vista y generar hints de preload para el player
                $sessionId = $context['session_id'] ?? '';
                if ($sessionId !== '' && $channelId !== 'unknown') {
                    $v3_preloader->recordChannelView(
                        sessionId: $sessionId,
                        channelId: $channelId,
                        groupTitle: $state['manifest_dna']['group_title_map'] ? array_key_first($state['manifest_dna']['group_title_map']) : '',
                    );
                    $prediction = $v3_preloader->predictNextChannel(sessionId: $sessionId, channelId: $channelId);
                    if (($prediction['confidence'] ?? 0) >= 0.5) {
                        $preloadDirectives = $v3_preloader->generatePreloadDirectives(
                            prediction: $prediction,
                            playerType: $state['capability_matrix']['player']['type'] ?? 'generic',
                        );
                        if (!empty($preloadDirectives)) {
                            $state['output_overrides'] = array_merge($state['output_overrides'], $preloadDirectives);
                        }
                    }
                }
            }

            // Construir salida
            $output = $this->builder->build(state: $state);

            // Almacenar en caché
            $state['processing_time_ms'] = (int) ((microtime(true) - $startTime) * 1000);
            $this->cache->setCached(
                signature: $signature, data: ['output' => $output, 'state' => $state],
                ttlSeconds: $ttl
            );

            return $output;

        } catch (\Throwable $e) {
            // NUNCA devolver error al reproductor — devolver entrada original
            rq_log("Error en pipeline: {$e->getMessage()} en {$e->getFile()}:{$e->getLine()}");
            return $raw;
        }
    }

    /**
     * Inicializa el estado vacío del pipeline.
     */
    private function initializeState(): array
    {
        return [
            'manifest_dna'          => [],
            'inherited_policies'    => [],
            'normalized_directives' => [],
            'capability_matrix'     => [
                'player'  => [],
                'tv'      => [],
                'network' => [],
            ],
            'content_profile'       => [],
            'visual_escalation'     => [],
            'resilience_config'     => [],
            'injected_directives'   => [
                'before_stream'  => [],
                'global_headers' => [],
            ],
            'guardian_limits'       => [],
            'compliance_flags'      => [],
            'output_overrides'      => [],
            'processing_time_ms'    => 0,
        ];
    }

    /**
     * Ejecuta el pipeline completo de 10 módulos en secuencia.
     *
     * @param  array  $state   Estado del pipeline
     * @param  array  $context Contexto de la solicitud
     * @param  string $raw     Contenido M3U bruto
     * @return array  Estado final del pipeline
     */
    private function runPipeline(array $state, array $context, string $raw): array
    {
        $serverHeaders = $context['server_headers'] ?? [];
        $getParams = $context['get_params'] ?? [];

        // === MÓDULO 1: PARSE ===
        $state['manifest_dna'] = $this->parser->parse(raw: $raw);

        // Si no hay streams, devolver vacío
        if (empty($state['manifest_dna']['streams'])) {
            return $state;
        }

        // === MÓDULO 2: NORMALIZE ===
        $normalized = $this->normalizer->normalize(dna: $state['manifest_dna']);
        $state['inherited_policies']    = $normalized['inherited_policies'];
        $state['normalized_directives'] = $normalized['normalized_directives'];

        // === MÓDULO 3: CAPABILITIES ===
        $state['capability_matrix'] = $this->capabilityLayer->negotiate(
            serverHeaders: $serverHeaders,
            getParams: $getParams
        );

        // === MÓDULO 4: CONTENT ===
        // Clasificar basado en el primer canal (o el más representativo)
        $firstEntry = $state['manifest_dna']['extinf_entries'][0] ?? [];
        $channelName = $firstEntry['title'] ?? '';
        $groupTitle = $firstEntry['attributes']['group-title'] ?? '';
        $state['content_profile'] = $this->contentEngine->classify(
            channelName: $channelName,
            groupTitle: $groupTitle,
            metadata: $firstEntry['attributes'] ?? []
        );

        // === MÓDULO 5: ESCALATE ===
        $state['visual_escalation'] = $this->escalator->calculate(
            capabilities: $state['capability_matrix'],
            dna: $state['manifest_dna'],
            content: $state['content_profile']
        );

        // === MÓDULO 6: RESILIENCE ===
        $state['resilience_config'] = $this->resilience->configure(
            escalationLevel: $state['visual_escalation']['level'],
            capabilities: $state['capability_matrix'],
            content: $state['content_profile'],
            inherited: $state['inherited_policies']
        );

        // === MÓDULO 7: INJECT ===
        $state['injected_directives'] = $this->injector->inject(state: $state);

        // === MÓDULO 8: GUARDIAN ===
        $state = $this->guardian->enforce(state: $state);

        return $state;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// INSTANCIACIÓN DEL PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea una instancia completamente configurada del pipeline.
 * Todas las dependencias se inyectan aquí.
 */
function rq_create_pipeline(): ResolveQualityPipeline
{
    static $pipeline = null;

    if ($pipeline !== null) {
        return $pipeline;
    }

    $cacheDir = RQ_BASE_DIR . '/cache';

    $pipeline = new ResolveQualityPipeline(
        parser:          new ManifestAnatomyParser(),
        normalizer:      new IdempotentNormalizationEngine(),
        capabilityLayer: new CapabilityNegotiationLayer(),
        contentEngine:   new ContentHeuristicEngine(),
        escalator:       new VisualPotentialEscalator(),
        resilience:      new ResilienceBrain(),
        injector:        new PremiumDirectiveInjector(),
        guardian:        new GuardianPolicyEngine(),
        cache:           new StreamSignatureCache(cacheDir: $cacheDir),
        builder:         new OutputBuilder(),
    );

    return $pipeline;
}


// ═══════════════════════════════════════════════════════════════════════════
// PUNTO DE ENTRADA — Modo HTTP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maneja las solicitudes HTTP y enruta al modo correcto.
 * Este es el punto de entrada cuando se ejecuta como middleware HTTP.
 *
 * Modos soportados:
 * 1. ?url=http://...  — Procesar lista remota
 * 2. ?ch=XX&srv=BASE64 — Resolución de canal (Xtream)
 * 3. POST body — Procesar contenido bruto
 */

/**
 * Enriches bare channel M3U output with 119+ player-specific directives.
 * Replicates legacy resolver quality + adds dynamic player detection.
 * Anti-509 compliant: zero origin probing, zero curl.
 *
 * @param string $output Pipeline output (valid M3U)
 * @param string $playerUA User-Agent string from request
 * @param string $host IPTV server host
 * @return string Enriched M3U output with 119+ directives
 */
function rq_enrich_channel_output(string $output, string $playerUA, string $host, array $ctxData = [], array $qosRef = []): string
{
    $lines = explode("\n", $output);
    $enriched = [];
    $sessionId = 'SES_' . bin2hex(random_bytes(8));

    // === SNIPER MODE: Detect active channel ===
    $ch_id = intval($_GET['ch'] ?? $_GET['channel'] ?? $_GET['id'] ?? $_GET['c'] ?? 0);
    $sniper = rq_sniper_integrate($ch_id, 'P1', $host, $sessionId);
    $effective_profile = $sniper['effective_profile'];  // P1 if STREAMING, P2 if RECENT, tier if IDLE

    // === ANTI-CUT ENGINE: Generate profile-aware directives ===
    if (function_exists('rq_anti_cut_isp_strangler')) {
        $anti_cut = rq_anti_cut_isp_strangler($effective_profile, $ch_id, $host, $sessionId);
    }
    $p = $anti_cut['profile_data'];

    // ══════════════════════════════════════════════════════════════════
    // 📊 CTX OVERLAY: Override anti-cut profile with REAL M3U8 list values
    // Rule: ctx payload values from the generator take priority.
    // This ensures KODIPROP/VLCOPT/EXTHTTP all use the same source.
    // ══════════════════════════════════════════════════════════════════
    if (!empty($ctxData)) {
        if (!empty($ctxData['rs'])) {
            $p['max_resolution'] = $ctxData['rs'];
            $resParts = explode('x', $ctxData['rs']);
            if (count($resParts) === 2) {
                $p['max_width'] = (int)$resParts[0];
                $p['max_height'] = (int)$resParts[1];
            }
        }
        if (!empty($ctxData['br'])) {
            $p['max_bitrate'] = (int)$ctxData['br'] * 1000; // kbps→bps
            $p['min_bitrate'] = (int)($ctxData['br'] * 500); // floor at 50%
        }
        if (!empty($ctxData['bf'])) {
            $p['buffer_ms'] = (int)$ctxData['bf'];
        }
        if (!empty($ctxData['nc'])) {
            $p['network_cache'] = (int)$ctxData['nc'];
        }
        if (!empty($ctxData['cp'])) {
            $p['codec_primary'] = $ctxData['cp'];
        }
        if (!empty($ctxData['cs'])) {
            $p['color_space'] = $ctxData['cs'];
        }
        if (isset($ctxData['hd']) && $ctxData['hd']) {
            $p['hdr_enabled'] = true;
        }
    }
    // Also overlay qosRef values if present
    if (!empty($qosRef['buffer_total'])) {
        $p['buffer_total_c1c2c3'] = $qosRef['buffer_total'];
    }
    if (!empty($qosRef['stall_target'])) {
        $p['stall_target'] = $qosRef['stall_target'];
    }

    // === EXTRACT CHANNEL NAME ===
    $ch_name = 'Unknown';
    // Priority 1: URL param 'name'
    if (!empty($_GET['name'])) {
        $ch_name = urldecode($_GET['name']);
    }
    // Priority 2: tvg-name attribute in EXTINF
    elseif (preg_match('/tvg-name="([^"]+)"/', $output, $m_tvg)) {
        $ch_name = trim($m_tvg[1]);
    }
    // Priority 3: Channel name after comma in EXTINF (skip if generic "Channel {id}")
    elseif (preg_match('/#EXTINF:[^,]*,(.+)$/m', $output, $m_comma)) {
        $candidate = trim($m_comma[1]);
        if (!preg_match('/^Channel\s+\d+$/i', $candidate)) {
            $ch_name = $candidate;
        }
    }
    // Priority 4: Lookup from cached list file
    else {
        $listCache = '/tmp/ape_sniper/channel_names.json';
            $names = @json_decode(file_get_contents($listCache), true);
            if (isset($names[(string)$ch_id])) {
                $ch_name = $names[(string)$ch_id];
        } else {
            // Build cache from list files: map ch= param to tvg-name
            $names = [];
            foreach (array_merge(glob('/var/www/html/*.m3u8'), glob('/var/www/html/lists/*.m3u8'), glob('/var/www/html/iptv-ape/lists/*.m3u8')) as $listFile) {
                $listLines = @file($listFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if (!$listLines) continue;
                $currentName = '';
                foreach ($listLines as $ll) {
                    // Extract tvg-name from EXTINF
                    if (preg_match('/tvg-name="([^"]+)"/', $ll, $nm)) {
                        $currentName = $nm[1];
                    }
                    // Extract ch= from resolver URL and map to name
                    if ($currentName && preg_match('/resolve_quality\.php\?ch=(\d+)/', $ll, $cm)) {
                        $names[$cm[1]] = $currentName;
                        $currentName = '';
                    }
                }
            }
            if (!empty($names)) {
                @file_put_contents($listCache, json_encode($names, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
                if (isset($names[(string)$ch_id])) {
                    $ch_name = $names[(string)$ch_id];
                }
            }
        }
    }

    // === HDR TELEMETRY LOG ===
    $hdr_nits_map = [
        'MAIN-10-HDR' => ['transfer' => 'PQ/HLG', 'peak_nits' => 4000, 'avg_nits' => 1000, 'color_volume' => 'BT2020'],
        'MAIN-10'     => ['transfer' => 'SDR/HLG', 'peak_nits' => 1000, 'avg_nits' => 400,  'color_volume' => 'BT709+'],
        'MAIN'        => ['transfer' => 'SDR',     'peak_nits' => 100,  'avg_nits' => 100,  'color_volume' => 'BT709'],
    ];
    $hdr_info = $hdr_nits_map[$p['hevc_profile']] ?? $hdr_nits_map['MAIN'];
    rq_pipeline_trace([
        'event'              => 'HDR_TELEMETRY',
        'ch_id'              => $ch_id,
        'channel_name'       => $ch_name,
        'profile'            => $effective_profile,
        'sniper_status'      => $sniper['sniper']['status'],
        'sniper_label'       => $sniper['sniper']['label'],
        'hevc_profile'       => $p['hevc_profile'],
        'color_space'        => $p['color_space'],
        'hdr_transfer_func'  => $p['hdr_transfer'] ?: 'SDR',
        'peak_nits'          => $hdr_info['peak_nits'],
        'avg_nits'           => $hdr_info['avg_nits'],
        'color_volume'       => $hdr_info['color_volume'],
        'max_bitrate_mbps'   => round($p['max_bitrate'] / 1000000),
        'min_bitrate_mbps'   => round($p['min_bitrate'] / 1000000),
        'resolution'         => $p['max_resolution'],
        'quality_lock'       => $p['quality_lock'],
        'cooldown_s'         => $p['cooldown_period'],
        'dscp'               => $p['dscp'],
        'prefetch'           => $p['prefetch_segments'],
        'aggression'         => $p['aggression_multiplier'] . 'x',
        'escalation'         => $p['escalation_level'],
        'rate_control'       => $p['rate_control'],
        'timestamp'          => gmdate('Y-m-d\TH:i:s\Z'),
    ]);
    $shieldUA = 'Mozilla/5.0 (Linux; Android 14; SHIELD Android TV Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Safari/537.36';

    // === Send HTTP Response Headers (ACRP + Anti-Cache + CORS) ===
    foreach ($anti_cut['http_headers'] as $hdr) {
        @header($hdr);
    }
    // Send SNIPER HTTP headers
    foreach ($sniper['http_headers'] as $hdr) {
        @header($hdr);
    }

    // === v3.0 ATOMIC ZAPPING: Merge zapping directives ===
    if (!empty($sniper['zapping']['ext_http'])) {
        foreach ($sniper['zapping']['ext_http'] as $zap_line) {
            $enriched[] = '#EXTHTTP:' . $zap_line;
        }
    }
    if (!empty($sniper['zapping']['ext_vlcopt'])) {
        foreach ($sniper['zapping']['ext_vlcopt'] as $zap_opt) {
            $enriched[] = '#EXTVLCOPT:' . $zap_opt;
        }
    }


    // === PLAYER DETECTION ===
    $isKodi = (stripos($playerUA, 'Kodi') !== false);

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || $trimmed === '#EXTM3U') {
            $enriched[] = $trimmed;

            // After #EXTM3U: inject HLS EXT-X directives (CDP layer)
            if ($trimmed === '#EXTM3U') {
                foreach ($anti_cut['hls_ext'] as $ext) {
                    $enriched[] = $ext;
                }
                // Inject JSON commands (JCS layer)
                foreach ($anti_cut['json_commands'] as $cmd) {
                    $enriched[] = $cmd;
                }
                // Inject SNIPER JSON command
                $enriched[] = $sniper['json_command'];
            }
            continue;
        }

        // === EXTINF: Inject video-track and codec attributes ===
        if (str_starts_with($trimmed, '#EXTINF:')) {
            // Clean old attributes
            $extinf = preg_replace('/\s*video-track="[^"]*"\s*/', ' ', $trimmed);
            $extinf = preg_replace('/\s*bl-video-track="[^"]*"\s*/', ' ', $extinf);
            $extinf = preg_replace('/\s*codec="[^"]*"\s*/', ' ', $extinf);

            // Inject profile-appropriate video-track
            $extinf = preg_replace(
                '/,([\s\S]*)$/',
                ' codec="HEVC" video-track="' . $p['video_track'] . '" bl-video-track="' . $p['bl_video_track'] . '",$1',
                $extinf
            );
            $enriched[] = $extinf;

            // === EXTHTTP: Build from Anti-Cut Engine ===
            // Get base EXTHTTP from anti-cut engine
            $exthttp = $anti_cut['exthttp'];

            // === SNIPER SCALE: Multiply prefetch/buffer for active channels ===
            if ($sniper['sniper']['sniper']) {
                $mult_p = $sniper['sniper']['prefetch_mult'];
                $mult_b = $sniper['sniper']['buffer_mult'];
                $exthttp['X-Prefetch-Segments']      = (string)intval($exthttp['X-Prefetch-Segments'] * $mult_p);
                $exthttp['X-Prefetch-Parallel']       = (string)intval($exthttp['X-Prefetch-Parallel'] * $mult_p);
                $exthttp['X-Prefetch-Buffer-Target']  = (string)intval(intval($exthttp['X-Prefetch-Buffer-Target']) * $mult_b);
                $exthttp['X-Buffer-Max']              = (string)intval(intval($exthttp['X-Buffer-Max']) * $mult_b);
                $exthttp['X-Buffer-Target']           = (string)intval(intval($exthttp['X-Buffer-Target']) * $mult_b);
                $exthttp['X-Buffer-Target-Override']  = (string)intval(intval($exthttp['X-Buffer-Target-Override']) * $mult_b);
                $exthttp['X-Network-Caching']         = (string)min(intval(intval($exthttp['X-Network-Caching']) * $mult_b), 1200000);
                $exthttp['X-Live-Caching']            = (string)min(intval(intval($exthttp['X-Live-Caching']) * $mult_b), 1200000);
                $exthttp['X-Max-Bitrate']             = '300000000';
                $exthttp['X-APE-Cut-Detection']       = 'SNIPER-ACTIVE';
                // Mark SNIPER status in EXTHTTP
                $exthttp['X-APE-SNIPER-Mode']         = 'ACTIVE';
                $exthttp['X-APE-SNIPER-Profile']      = $effective_profile;
                $exthttp['X-APE-SNIPER-Label']        = $sniper['sniper']['label'];
            }

            // ══════════════════════════════════════════════════════════════════
            // 📋 PM HEADER INJECTION INTO RESOLVER EXTHTTP
            // Inject all QoS reference values from the M3U8 list ctx payload
            // so the EXTHTTP output matches what the generator emitted.
            // ══════════════════════════════════════════════════════════════════
            if (!empty($qosRef)) {
                if ($qosRef['bw_min_target'] !== '') $exthttp['X-APE-ISP-BW-Min-Target'] = $qosRef['bw_min_target'];
                if ($qosRef['bw_opt_target'] !== '') $exthttp['X-APE-ISP-BW-Opt-Target'] = $qosRef['bw_opt_target'];
                if ($qosRef['health'] !== '')        $exthttp['X-APE-Streaming-Health'] = $qosRef['health'];
                if ($qosRef['risk_score'] !== '')    $exthttp['X-APE-Risk-Score'] = $qosRef['risk_score'];
                if ($qosRef['headroom'] !== '')      $exthttp['X-APE-Headroom'] = $qosRef['headroom'];
                if ($qosRef['stall_target'] !== '')  $exthttp['X-APE-Stall-Rate-Target'] = $qosRef['stall_target'];
                if ($qosRef['buffer_total'] !== '')  $exthttp['X-APE-Buffer-Total-C1C2C3'] = $qosRef['buffer_total'];
                if ($qosRef['jitter_max'] !== '')    $exthttp['X-APE-Jitter-Max-Supported'] = $qosRef['jitter_max'];
                if ($qosRef['prefetch_seg'] !== '')  $exthttp['X-APE-Prefetch-Segments'] = $qosRef['prefetch_seg'];
                if ($qosRef['prefetch_par'] !== '')  $exthttp['X-APE-Prefetch-Parallel'] = $qosRef['prefetch_par'];
                if ($qosRef['ram_estimate'] !== '')  $exthttp['X-APE-RAM-Estimate'] = $qosRef['ram_estimate'];
                if ($qosRef['overhead'] !== '')      $exthttp['X-APE-Overhead-Security'] = $qosRef['overhead'];
            }
            // Sync ctx payload values into EXTHTTP
            if (!empty($ctxData)) {
                if (!empty($ctxData['rs'])) $exthttp['X-Max-Resolution'] = $ctxData['rs'];
                if (!empty($ctxData['br'])) $exthttp['X-Max-Bitrate'] = (string)((int)$ctxData['br'] * 1000);
                if (!empty($ctxData['cp'])) $exthttp['X-Video-Codecs'] = strtolower($ctxData['cp']);
                if (!empty($ctxData['cs'])) $exthttp['X-Color-Space'] = $ctxData['cs'];
                if (isset($ctxData['hd']) && $ctxData['hd']) $exthttp['X-HDR-Support'] = 'hdr10,hdr10+,dolby-vision,hlg';
            }
            $exthttp['X-RQ-Enforcement'] = 'NUCLEAR';
            $exthttp['X-RQ-Directive-Sync'] = 'VLCOPT+KODIPROP+EXTHTTP';

            $enriched[] = '#EXTHTTP:' . json_encode($exthttp, JSON_UNESCAPED_SLASHES);

            // === KODI: KODIPROP — InputStream.Adaptive COMPLETO (v3.1) ===
            // Kodi es el ÚNICO player que lee KODIPROP. Aquí va TODO.
            if ($isKodi) {
                // Clase y protocolo
                $enriched[] = '#KODIPROP:inputstreamclass=inputstream.adaptive';
                $enriched[] = '#KODIPROP:inputstream.adaptive.manifest_type=hls';
                $enriched[] = '#KODIPROP:inputstream.adaptive.manifest_update_parameter=full';
                // Selección de calidad: SIEMPRE la mejor
                $enriched[] = '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive';
                $enriched[] = '#KODIPROP:inputstream.adaptive.chooser_bandwidth_max=' . $p['max_bitrate'];
                $enriched[] = '#KODIPROP:inputstream.adaptive.chooser_resolution_max=' . $p['max_resolution'];
                $enriched[] = '#KODIPROP:inputstream.adaptive.chooser_resolution_secure_max=' . $p['max_resolution'];
                $enriched[] = '#KODIPROP:inputstream.adaptive.quality_select=best';
                $enriched[] = '#KODIPROP:inputstream.adaptive.min_bandwidth=' . $p['min_bitrate'];
                $enriched[] = '#KODIPROP:inputstream.adaptive.max_bandwidth=' . $p['max_bitrate'];
                // Buffer agresivo (ISP x2)
                $enriched[] = '#KODIPROP:inputstream.adaptive.stream_buffer_size=240000000';
                $enriched[] = '#KODIPROP:inputstream.adaptive.max_buffer_bytes=480000000';
                $enriched[] = '#KODIPROP:inputstream.adaptive.live_buffer=240';
                $enriched[] = '#KODIPROP:inputstream.adaptive.ghost_buffer=120';
                $enriched[] = '#KODIPROP:inputstream.adaptive.buffer_behaviour=aggressive';
                $enriched[] = '#KODIPROP:inputstream.adaptive.initial_buffer=8';
                $enriched[] = '#KODIPROP:inputstream.adaptive.pre_buffer_bytes=120000000';
                // Resolución máxima forzada
                $enriched[] = '#KODIPROP:inputstream.adaptive.max_resolution=' . $p['max_resolution'];
                // Live: cero delay, timeshift habilitado
                $enriched[] = '#KODIPROP:inputstream.adaptive.play_timeshift_buffer=true';
                $enriched[] = '#KODIPROP:inputstream.adaptive.live_delay=0';
                // Audio: passthrough para eARC/Atmos
                $enriched[] = '#KODIPROP:inputstream.adaptive.original_audio_language=*';
                // HDR 5000 nits — Maximum quantum brightness
                $enriched[] = '#KODIPROP:inputstream.adaptive.stream_headers=X-HDR-MaxCLL=5000&X-HDR-MaxFALL=1500&X-HDR-Peak=5000';
                $enriched[] = '#KODIPROP:inputstream.adaptive.preferred_color_space=bt2020';
                $enriched[] = '#KODIPROP:inputstream.adaptive.preferred_hdr_types=hdr10,hdr10plus,dolby_vision,hlg';
                $enriched[] = '#KODIPROP:inputstream.adaptive.ignore_display_resolution=true';
                // Headers stealth
                $enriched[] = '#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Linux; Android 14; SHIELD Android TV) Chrome/124.0';
            }

            continue;
        }

        // === URL line: Inject EXTVLCOPT after the URL ===
        if (str_starts_with($trimmed, 'http://') || str_starts_with($trimmed, 'https://')) {
            $enriched[] = $trimmed;

            // Get base EXTVLCOPT from Anti-Cut Engine
            $vlcopts = $anti_cut['extvlcopt'];

            // SNIPER SCALE: Multiply caching for active channels
            if ($sniper['sniper']['sniper']) {
                $mult_b = $sniper['sniper']['buffer_mult'];
                foreach ($vlcopts as $i => $opt) {
                    if (strpos($opt, 'network-caching=') === 0) {
                        $val = intval(str_replace('network-caching=', '', $opt));
                        $vlcopts[$i] = 'network-caching=' . min(intval($val * $mult_b), 1200000);
                    }
                    if (strpos($opt, 'live-caching=') === 0) {
                        $val = intval(str_replace('live-caching=', '', $opt));
                        $vlcopts[$i] = 'live-caching=' . min(intval($val * $mult_b), 1200000);
                    }
                    if (strpos($opt, 'disc-caching=') === 0) {
                        $val = intval(str_replace('disc-caching=', '', $opt));
                        $vlcopts[$i] = 'disc-caching=' . min(intval($val * $mult_b), 1200000);
                    }
                    if (strpos($opt, 'file-caching=') === 0) {
                        $val = intval(str_replace('file-caching=', '', $opt));
                        $vlcopts[$i] = 'file-caching=' . min(intval($val * $mult_b), 1200000);
                    }
                    if ($sniper['sniper']['status'] === 'STREAMING' && strpos($opt, 'adaptive-maxbw=') === 0) {
                        $vlcopts[$i] = 'adaptive-maxbw=300000000';
                    }
                }
            }

            // Emit all EXTVLCOPT
            foreach ($vlcopts as $opt) {
                $enriched[] = '#EXTVLCOPT:' . $opt;
            }

            continue;
        }

        // Pass through other lines
        $enriched[] = $trimmed;
    }

    // Safety: never return empty
    $result = implode("\n", $enriched);
    if (strlen(trim($result)) < 50) {
        return $output;
    }

    return $result;
}

/**
 * Returns a stealth User-Agent string matching the player ecosystem.
 */
function rq_get_stealth_ua(string $playerType): string
{
    return match ($playerType) {
        'vlc'      => 'Mozilla/5.0 (Linux; Android 11; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'tivimate' => 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'ott'      => 'Mozilla/5.0 (Linux; Android 14; SHIELD) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'kodi'     => 'Mozilla/5.0 (Linux; Android 14; SHIELD) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'exo'      => 'ExoPlayer/2.18.1 (Linux;Android 11) ExoPlayerLib/2.18.1',
        default    => 'Mozilla/5.0 (Linux; Android 11; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };
}

function rq_handle_request(): void
{
    // Pipeline entry trace
    rq_pipeline_trace(['event' => 'entry', 'method' => $_SERVER['REQUEST_METHOD'] ?? '?', 'params' => array_keys($_GET)]);
    // Cabeceras de respuesta (siempre las mismas)
    if (!headers_sent()) {
        header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('X-Resolver-Version: ' . RQ_VERSION);
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: *, User-Agent, X-Display-*, X-Throughput-*, X-Latency-*, X-Jitter-*, X-Connection-Type');
    }

    // Manejar preflight OPTIONS
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        return;
    }

    $pipeline = rq_create_pipeline();

    // Recopilar cabeceras del servidor
    $serverHeaders = $_SERVER;
    $getParams = $_GET;

    // ═══════════════════════════════════════════════════════════════════════════
    // V3.0: ENDPOINT DE TELEMETRÍA (feedback loop del player)
    // El player reporta métricas de reproducción para ajuste adaptativo.
    // Este endpoint NO genera tráfico hacia el proveedor (anti-509 seguro).
    // ═══════════════════════════════════════════════════════════════════════════
    global $v3_modules_available, $v3_feedback, $v3_mutator, $v3_variant, $v3_latency, $v3_preloader;

    if ($v3_modules_available && ($action = q('action', '')) !== '') {
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Cache-Control: no-store');

        if ($action === 'feedback') {
                // El player envía métricas de reproducción
                $channelId = q('ch', 'unknown');
                $sessionId = q('sid', session_id());
                $metrics = [
                    'startup_time_ms'   => (float)(q('startup', '0')),
                    'buffering_ratio'   => (float)(q('buffering', '0')),
                    'dropped_frames'    => (int)(q('drops', '0')),
                    'bitrate_real_kbps' => (float)(q('bitrate', '0')),
                    'stall_count'       => (int)(q('stalls', '0')),
                    'resolution_real'   => q('resolution', ''),
                    'fps_real'          => (float)(q('fps', '0')),
                    'error_code'        => (int)(q('error', '0')),
                    'session_id'        => $sessionId,
                    'timestamp'         => time(),
                ];
                $result = $v3_feedback->recordTelemetry(channelId: $channelId, metrics: $metrics);
                echo json_encode($result, JSON_UNESCAPED_UNICODE);
            } elseif ($action === 'health') {
                // Consultar salud de un canal específico
                $channelId = q('ch', 'unknown');
                $telemetry = $v3_feedback->getChannelTelemetry(channelId: $channelId);
                echo json_encode($telemetry, JSON_UNESCAPED_UNICODE);
            } elseif ($action === 'predict') {
                // Pedir predicción de siguiente canal
                $sessionId = q('sid', '');
                $currentCh = q('ch', '');
                if ($sessionId !== '' && $currentCh !== '') {
                    $prediction = $v3_preloader->predictNextChannel(sessionId: $sessionId, channelId: $currentCh);
                    echo json_encode($prediction, JSON_UNESCAPED_UNICODE);
                } else {
                    echo json_encode(['error' => 'missing sid or ch']);
                }
            } elseif ($action === 'latency') {
                // Registrar medición de latencia (desde el middleware, no desde el player)
                $fingerprint = q('fp', '');
                $metrics = [
                    'rtt_ms'         => (float)(q('rtt', '0')),
                    'ttfb_ms'        => (float)(q('ttfb', '0')),
                    'throughput_kbps' => (float)(q('throughput', '0')),
                    'timestamp'      => time(),
                ];
                $v3_latency->recordMeasurement(streamFingerprint: $fingerprint, metrics: $metrics);
                echo json_encode(['status' => 'recorded']);
            } elseif ($action === 'sessions') {
                // Query active QoS-monitored sessions (max 10 concurrent)
                $sessionDir = RQ_BASE_DIR . '/sessions';
                $sessionFile = $sessionDir . '/active_sessions.json';
                $sessions = [];
                if (file_exists($sessionFile)) {
                    $raw_s = @file_get_contents($sessionFile);
                    $decoded_s = json_decode($raw_s, true);
                    if (is_array($decoded_s)) {
                        // Evict stale sessions (>5 min)
                        $now = time();
                        $sessions = array_filter($decoded_s, fn($s) => ($now - ($s['ts'] ?? 0)) < 300);
                    }
                }
                echo json_encode([
                    'active_sessions' => count($sessions),
                    'max_sessions'    => 10,
                    'sessions'        => array_values($sessions),
                ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'unknown action']);
            }
        return;
    }

    // ─── MODO 1: Procesar lista remota (?url=...) ───
    if (isset($_GET['url']) && $_GET['url'] !== '') {
        $url = filter_var($_GET['url'], FILTER_VALIDATE_URL);
        if ($url === false) {
            echo rq_error_m3u(errorMessage: 'URL inválida');
            return;
        }

        $raw = rq_fetch(url: $url);
        if ($raw === null) {
            echo rq_error_m3u(errorMessage: 'No se pudo obtener la lista');
            rq_log("Fetch fallido para URL: {$url}");
            return;
        }

        $output = $pipeline->process(raw: $raw, context: [
            'server_headers' => $serverHeaders,
            'get_params'     => $getParams,
            'cache_ttl'      => RQ_CACHE_TTL_LIST,
        ]);

        echo $output;
        return;
    }

    // ─── MODO 2: Resolución de canal Xtream (?ch=XX&srv=BASE64) ───
    if (isset($_GET['ch']) && isset($_GET['srv'])) {
        $channelId = htmlspecialchars($_GET['ch'], ENT_QUOTES);
        $srvData = base64_decode($_GET['srv'], true);

        if ($srvData === false) {
            echo rq_error_m3u(errorMessage: 'Datos de servidor inválidos');
            return;
        }

        // Decodificar datos: host|user|pass
        $parts = explode('|', $srvData);
        if (count($parts) !== 3) {
            echo rq_error_m3u(errorMessage: 'Formato de servidor inválido');
            return;
        }

        [$host, $user, $pass] = $parts;
        $profile = $_GET['p'] ?? 'P3';

        // ══════════════════════════════════════════════════════════════════
        // 📊 QoS DYNAMIC MONITORING v1.0
        // Reads ALL values from inbound ctx payload + X-APE-* headers.
        // NO hardcoded values — everything from the M3U8 list at runtime.
        // Supports up to 10 concurrent channel reproductions.
        // ══════════════════════════════════════════════════════════════════

        // 1. Parse ctx B64 payload from URL (profile/resolution/bitrate/etc.)
        $ctxData = [];
        if (isset($_GET['ctx']) && $_GET['ctx'] !== '') {
            $ctxB64 = str_replace(['-', '_'], ['+', '/'], $_GET['ctx']);
            $ctxB64 = match (strlen($ctxB64) % 4) {
                2 => $ctxB64 . '==',
                3 => $ctxB64 . '=',
                default => $ctxB64,
            };
            $ctxJson = base64_decode($ctxB64, true);
            if ($ctxJson !== false) {
                $decoded = json_decode($ctxJson, true);
                if (is_array($decoded)) {
                    $ctxData = $decoded;
                }
            }
        }

        // 2. Read inbound X-APE-* QoS headers from the player request
        $qosHeaders = [];
        $qosKeys = [
            'X-APE-ISP-BW-Min-Target', 'X-APE-ISP-BW-Opt-Target',
            'X-APE-Buffer-Total-C1C2C3', 'X-APE-Jitter-Max-Supported',
            'X-APE-Streaming-Health', 'X-APE-Risk-Score', 'X-APE-Headroom',
            'X-APE-Stall-Rate-Target', 'X-APE-Prefetch-Segments',
            'X-APE-Prefetch-Parallel', 'X-APE-RAM-Estimate',
            'X-APE-Overhead-Security',
        ];
        foreach ($qosKeys as $qosKey) {
            $val = rq_header($qosKey, $serverHeaders);
            if ($val !== null && $val !== '') {
                $qosHeaders[$qosKey] = $val;
            }
        }

        // 3. Build unified QoS reference (ctx payload + headers, no hardcode)
        $qosRef = [
            'profile'       => $profile,
            'ch'            => $channelId,
            'resolution'    => $ctxData['rs'] ?? ($qosHeaders['X-APE-ISP-BW-Min-Target'] ? null : null),
            'bitrate_kbps'  => (int)($ctxData['br'] ?? 0),
            'buffer_ms'     => (int)($ctxData['bf'] ?? 0),
            'net_cache_ms'  => (int)($ctxData['nc'] ?? 0),
            'hdr'           => (bool)($ctxData['hd'] ?? false),
            'color_space'   => $ctxData['cs'] ?? '',
            'codec'         => $ctxData['cp'] ?? '',
            'bw_min_target' => $qosHeaders['X-APE-ISP-BW-Min-Target'] ?? '',
            'bw_opt_target' => $qosHeaders['X-APE-ISP-BW-Opt-Target'] ?? '',
            'buffer_total'  => $qosHeaders['X-APE-Buffer-Total-C1C2C3'] ?? '',
            'jitter_max'    => $qosHeaders['X-APE-Jitter-Max-Supported'] ?? '',
            'health'        => $qosHeaders['X-APE-Streaming-Health'] ?? '',
            'risk_score'    => $qosHeaders['X-APE-Risk-Score'] ?? '',
            'headroom'      => $qosHeaders['X-APE-Headroom'] ?? '',
            'stall_target'  => $qosHeaders['X-APE-Stall-Rate-Target'] ?? '',
            'prefetch_seg'  => $qosHeaders['X-APE-Prefetch-Segments'] ?? '',
            'prefetch_par'  => $qosHeaders['X-APE-Prefetch-Parallel'] ?? '',
            'ram_estimate'  => $qosHeaders['X-APE-RAM-Estimate'] ?? '',
            'overhead'      => $qosHeaders['X-APE-Overhead-Security'] ?? '',
            'ts'            => time(),
            'ip'            => $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0',
        ];

        // 4. Active Session Registry (max 10 concurrent, file-based, auto-evict oldest)
        $sessionDir = RQ_BASE_DIR . '/sessions';
        if (!is_dir($sessionDir)) {
            @mkdir($sessionDir, 0755, true);
        }
        $sessionFile = $sessionDir . '/active_sessions.json';
        $sessions = [];
        if (file_exists($sessionFile)) {
            $raw_sessions = @file_get_contents($sessionFile);
            $decoded_sessions = json_decode($raw_sessions, true);
            if (is_array($decoded_sessions)) {
                $sessions = $decoded_sessions;
            }
        }

        // Evict sessions older than 5 minutes (stale)
        $now = time();
        $sessions = array_filter($sessions, fn($s) => ($now - ($s['ts'] ?? 0)) < 300);

        // Update or add current channel session
        $sessionKey = $qosRef['ip'] . ':' . $channelId;
        $sessions[$sessionKey] = $qosRef;

        // Enforce max 10 concurrent — evict oldest if exceeded
        if (count($sessions) > 10) {
            uasort($sessions, fn($a, $b) => ($a['ts'] ?? 0) <=> ($b['ts'] ?? 0));
            $sessions = array_slice($sessions, -10, 10, true);
        }

        @file_put_contents($sessionFile, json_encode($sessions, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);

        // 5. Emit QoS reference response headers (player/monitor reads these)
        header('X-RQ-QoS-Profile: ' . $profile);
        if ($qosRef['bitrate_kbps'] > 0) {
            header('X-RQ-QoS-Bitrate-Kbps: ' . $qosRef['bitrate_kbps']);
        }
        if ($qosRef['buffer_ms'] > 0) {
            header('X-RQ-QoS-Buffer-Ms: ' . $qosRef['buffer_ms']);
        }
        if ($qosRef['bw_min_target'] !== '') {
            header('X-RQ-QoS-BW-Min: ' . $qosRef['bw_min_target']);
        }
        if ($qosRef['bw_opt_target'] !== '') {
            header('X-RQ-QoS-BW-Opt: ' . $qosRef['bw_opt_target']);
        }
        if ($qosRef['health'] !== '') {
            header('X-RQ-QoS-Health: ' . $qosRef['health']);
        }
        if ($qosRef['risk_score'] !== '') {
            header('X-RQ-QoS-Risk: ' . $qosRef['risk_score']);
        }
        if ($qosRef['headroom'] !== '') {
            header('X-RQ-QoS-Headroom: ' . $qosRef['headroom']);
        }
        if ($qosRef['codec'] !== '') {
            header('X-RQ-QoS-Codec: ' . $qosRef['codec']);
        }
        if ($qosRef['hdr']) {
            header('X-RQ-QoS-HDR: 1');
        }
        header('X-RQ-QoS-Active-Sessions: ' . count($sessions));
        header('X-RQ-QoS-Max-Sessions: 10');

        // Log QoS monitoring data
        rq_pipeline_trace([
            'mode' => 'qos_monitor',
            'ch' => $channelId,
            'profile' => $profile,
            'ctx_fields' => count($ctxData),
            'qos_headers' => count($qosHeaders),
            'active_sessions' => count($sessions),
            'health' => $qosRef['health'],
            'risk' => $qosRef['risk_score'],
        ]);

        // Construir M3U fragment para el canal
        // Ensure protocol prefix
        if (!str_starts_with($host, 'http://') && !str_starts_with($host, 'https://')) {
            $host = 'http://' . $host;
        }
        $channelUrl = rtrim($host, '/') .
            "/live/{$user}/{$pass}/{$channelId}.m3u8";

        $raw = "#EXTM3U\n#EXTINF:-1,Channel {$channelId}\n{$channelUrl}\n";

        $output = $pipeline->process(raw: $raw, context: [
            'server_headers' => $serverHeaders,
            'get_params'     => $getParams,
            'cache_ttl'      => RQ_CACHE_TTL_CHANNEL,
            'qos_ref'        => $qosRef,
            'ctx_data'       => $ctxData,
        ]);

        // === FALLBACK: nunca devolver vacío en modo canal ===
        // Trace pipeline output quality
        $hasExthttp = strpos($output, '#EXTHTTP:') !== false;
        $hasVlcopt = strpos($output, '#EXTVLCOPT:') !== false;
        $hasKodi = strpos($output, '#KODIPROP:') !== false;
        $hasUrl = preg_match('#https?://#', $output);
        
        if (!isValidM3UOutput($output)) {
            rq_pipeline_trace([
                'mode' => 'channel', 'ch' => $channelId ?? '?',
                'output_len' => strlen($output), 'fallback' => true,
                'raw_len' => strlen($raw),
            ]);
            $output = $raw;
        } else {
            rq_pipeline_trace([
                'mode' => 'channel', 'ch' => $channelId ?? '?',
                'output_len' => strlen($output),
                'enriched' => $hasExthttp || $hasVlcopt || $hasKodi,
                'exthttp' => $hasExthttp, 'vlcopt' => $hasVlcopt,
                'has_url' => (bool)$hasUrl, 'fallback' => false,
            ]);
        }

        // Enrich with player-specific directives if not already enriched
        $playerUA = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $output = rq_enrich_channel_output($output, $playerUA, $host, $ctxData ?? [], $qosRef ?? []);

        echo $output;
        return;
    }

    // ─── MODO 3: POST body (contenido M3U bruto) ───
    $inputStream = 'php://input';
    $raw = file_get_contents($inputStream);

    if ($raw === false || trim($raw) === '') {
        echo rq_error_m3u(errorMessage: 'Contenido vacío');
        return;
    }

    $output = $pipeline->process(raw: $raw, context: [
        'server_headers' => $serverHeaders,
        'get_params'     => $getParams,
        'cache_ttl'      => RQ_CACHE_TTL_LIST,
    ]);

    echo $output;
}


// ═══════════════════════════════════════════════════════════════════════════
// EJECUCIÓN
// ═══════════════════════════════════════════════════════════════════════════

// Solo ejecutar el manejador HTTP si no se está incluyendo como librería
if (basename($_SERVER['SCRIPT_NAME'] ?? '') === 'resolve_quality.php') {
    rq_handle_request();
}
