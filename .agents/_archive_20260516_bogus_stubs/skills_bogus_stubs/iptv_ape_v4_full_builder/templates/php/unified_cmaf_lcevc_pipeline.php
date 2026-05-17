<?php
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   Unified CMAF+LCEVC Pipeline v4.0 — Cadena de Degradación de 7 Niveles   ║
 * ║   IPTV Navigator PRO v4.0 FULL                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Pipeline unificado que integra:
 *  - CMAF Universal (HLS con segmentos fMP4 como estándar único)
 *  - LCEVC (MPEG-5 Part 2) como capa de mejora en TODOS los canales
 *  - Cadena de Degradación Graceful de 7 Niveles
 *  - Integración con ApeOmniOrchestratorV18, TelchemyTvqmEngine y PlayerCapabilityResolver
 *  - Señalización completa en manifiestos HLS y DASH
 */

declare(strict_types=1);

// Cargar dependencias del pipeline
$cmafDir = __DIR__;
require_once $cmafDir . '/ape_omni_orchestrator_v18.php';
require_once $cmafDir . '/telchemy_tvqm_engine.php';
require_once $cmafDir . '/modules/player_capability_resolver.php';
require_once $cmafDir . '/modules/lcevc_state_engine.php';
require_once $cmafDir . '/modules/lcevc_media_validator.php';
require_once $cmafDir . '/modules/dual_manifest_generator.php';
require_once $cmafDir . '/modules/cmaf_packaging_engine.php';
require_once $cmafDir . '/modules/cdn_routing_engine.php';
require_once $cmafDir . '/modules/universal_fallback_engine.php';

class UnifiedCmafLcevcPipeline
{
    const VERSION = '4.0.0';

    // Cadena de Degradación Graceful — 7 Niveles (idéntica a ApeOmniOrchestratorV18)
    const DEGRADATION_CHAIN = [
        1 => ['label' => 'CMAF+HEVC/AV1',   'format' => 'cmaf',         'codec' => 'hevc_av1',   'container' => 'fmp4', 'lcevc' => true],
        2 => ['label' => 'HLS/fMP4+HEVC',   'format' => 'hls_fmp4',     'codec' => 'hevc',       'container' => 'fmp4', 'lcevc' => true],
        3 => ['label' => 'HLS/fMP4+H.264',  'format' => 'hls_fmp4',     'codec' => 'h264',       'container' => 'fmp4', 'lcevc' => false],
        4 => ['label' => 'HLS/TS+H.264',    'format' => 'hls_ts',       'codec' => 'h264',       'container' => 'ts',   'lcevc' => false],
        5 => ['label' => 'HLS/TS+Baseline', 'format' => 'hls_ts',       'codec' => 'h264_base',  'container' => 'ts',   'lcevc' => false],
        6 => ['label' => 'TS Direct',        'format' => 'ts_direct',    'codec' => 'any',        'container' => 'ts',   'lcevc' => false],
        7 => ['label' => 'HTTP redirect',    'format' => 'http_redirect','codec' => 'any',        'container' => 'any',  'lcevc' => false],
    ];

    // ═══════════════════════════════════════════════════════════════════════════
    // MÉTODO PRINCIPAL: process — Ejecuta el pipeline completo
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Ejecuta el pipeline CMAF+LCEVC completo para un canal.
     *
     * Pipeline de 7 etapas:
     *  1. Detección de player y capacidades
     *  2. Validación de media LCEVC
     *  3. Determinación del nivel de degradación
     *  4. Empaquetado CMAF (si aplica)
     *  5. Generación de manifiesto HLS/DASH
     *  6. Señalización LCEVC + APE DNA
     *  7. Entrega con headers HTTP correctos
     *
     * @param array  $channelConfig Configuración completa del canal
     * @param array  $requestData   Datos de la request HTTP (UA, headers, etc.)
     * @return array                Resultado del pipeline con URL, headers y manifiesto
     */
    public static function process(array $channelConfig, array $requestData = []): array
    {
        $startTime = microtime(true);

        // ── Etapa 1: Detección de Player ──────────────────────────────────────
        $ua           = $requestData['user_agent'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? '');
        $playerResult = PlayerCapabilityResolver::detect($ua, $requestData);
        $playerCaps   = $playerResult['capabilities'] ?? [];
        $playerName   = $playerResult['player'] ?? 'unknown';
        $playerProfile = $playerResult['profile'] ?? 'STANDARD';

        // Sobreescribir el perfil del canal con el detectado si no está configurado
        if (empty($channelConfig['player_profile'])) {
            $channelConfig['player_profile'] = $playerProfile;
        }

        // ── Etapa 2: Validación de Media LCEVC ───────────────────────────────
        $lcevcEnabled = (bool)($channelConfig['lcevc_enabled'] ?? false);
        $lcevcState   = 'OFF';
        $lcevcValid   = false;

        if ($lcevcEnabled) {
            $lcevcResult = LcevcStateEngine::determineState($channelConfig, $playerCaps);
            $lcevcState  = $lcevcResult['state'];
            $lcevcValid  = $lcevcResult['valid'];
            $channelConfig['lcevc_state'] = $lcevcState;
        }

        // ── Etapa 3: Determinar Nivel de Degradación ─────────────────────────
        $degradationLevel = self::determineDegradationLevel($channelConfig, $playerCaps);
        $degradationInfo  = self::DEGRADATION_CHAIN[$degradationLevel];

        // ── Etapa 4: Selección de URL y Empaquetado ───────────────────────────
        $streamUrl    = $channelConfig['stream_url'] ?? '';
        $manifests    = self::buildManifestMap($channelConfig, $degradationInfo);
        $selectedUrl  = ApeOmniOrchestratorV18::selectBestUrlFromDegradationChain(
            array_merge($channelConfig, ['player_profile' => $playerProfile]),
            $manifests
        );

        // Si no hay URL seleccionada, usar fallback directo
        if (empty($selectedUrl)) {
            $selectedUrl = $streamUrl;
        }

        // ── Etapa 5: Calcular Métricas TVQM ──────────────────────────────────
        $tvqm = TelchemyTvqmEngine::calculateTvqmMetrics($channelConfig);
        $channelConfig['tvqm_vstq']  = $tvqm['vstq'];
        $channelConfig['tvqm_vsmq']  = $tvqm['vsmq'];
        $channelConfig['vqs_score']  = $tvqm['vqs_score'];
        $channelConfig['vqs_tier']   = $tvqm['vqs_tier'];

        // ── Etapa 6: Generar Manifiesto CMAF Universal ────────────────────────
        $hydraMode = (bool)($channelConfig['hydra_stealth_enabled'] ?? false);
        $manifests['selected'] = $selectedUrl;

        $manifest = ApeOmniOrchestratorV18::generateCmafUniversalManifest(
            $channelConfig,
            $requestData['base_url'] ?? '',
            $manifests
        );

        // Aplicar Hydra Stealth si está habilitado
        if ($hydraMode) {
            $manifest = ApeOmniOrchestratorV18::applyHydraStealthToManifest($manifest);
        }

        // ── Etapa 7: Construir Headers HTTP de Respuesta ──────────────────────
        $responseHeaders = self::buildResponseHeaders(
            $channelConfig,
            $playerName,
            $lcevcState,
            $degradationLevel,
            $tvqm
        );

        $elapsed = round((microtime(true) - $startTime) * 1000, 2);

        return [
            'success'           => true,
            'url'               => $selectedUrl,
            'manifest'          => $manifest,
            'headers'           => $responseHeaders,
            'player'            => $playerName,
            'player_profile'    => $playerProfile,
            'degradation_level' => $degradationLevel,
            'degradation_label' => $degradationInfo['label'],
            'lcevc_state'       => $lcevcState,
            'vqs_score'         => $tvqm['vqs_score'],
            'vqs_tier'          => $tvqm['vqs_tier'],
            'quality_profile'   => $tvqm['quality_profile'],
            'processing_ms'     => $elapsed,
            'pipeline_version'  => self::VERSION,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DETERMINACIÓN DEL NIVEL DE DEGRADACIÓN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Determina el nivel de degradación óptimo para el player y canal dados.
     * Garantiza que NINGÚN player quede sin reproducción.
     *
     * @param array $channelConfig Configuración del canal
     * @param array $playerCaps   Capacidades del player
     * @return int                 Nivel de degradación (1-7)
     */
    public static function determineDegradationLevel(array $channelConfig, array $playerCaps): int
    {
        $cmafEnabled   = (bool)($channelConfig['cmaf_enabled'] ?? false);
        $lcevcEnabled  = (bool)($channelConfig['lcevc_enabled'] ?? false);
        $playerProfile = $channelConfig['player_profile'] ?? 'STANDARD';

        $supportsFmp4  = (bool)($playerCaps['fmp4'] ?? false);
        $supportsHevc  = (bool)($playerCaps['hevc'] ?? false);
        $supportsAv1   = (bool)($playerCaps['av1'] ?? false);
        $supportsLcevc = (bool)($playerCaps['lcevc'] ?? false);
        $supportsDash  = (bool)($playerCaps['dash'] ?? false);

        // Nivel 1: CMAF+HEVC/AV1 (PREMIUM)
        if ($cmafEnabled && $supportsFmp4 && ($supportsHevc || $supportsAv1) && $playerProfile === 'PREMIUM') {
            return 1;
        }

        // Nivel 2: HLS/fMP4+HEVC (HIGH)
        if ($supportsFmp4 && $supportsHevc && in_array($playerProfile, ['PREMIUM', 'HIGH'])) {
            return 2;
        }

        // Nivel 3: HLS/fMP4+H.264 (STANDARD)
        if ($supportsFmp4 && in_array($playerProfile, ['PREMIUM', 'HIGH', 'STANDARD'])) {
            return 3;
        }

        // Nivel 4: HLS/TS+H.264 (COMPAT)
        if ($playerProfile !== 'MINIMAL') {
            return 4;
        }

        // Nivel 5: HLS/TS+Baseline (LEGACY)
        if ($playerProfile === 'LEGACY') {
            return 5;
        }

        // Nivel 6: TS Direct (MINIMAL)
        if ($playerProfile === 'MINIMAL') {
            return 6;
        }

        // Nivel 7: HTTP redirect (LAST RESORT)
        return 7;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCCIÓN DEL MAPA DE MANIFIESTOS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Construye el mapa de URLs de manifiestos disponibles para el canal.
     * Incluye todas las variantes de formato para la cadena de degradación.
     *
     * @param array $channelConfig  Configuración del canal
     * @param array $degradationInfo Información del nivel de degradación actual
     * @return array                 Mapa formato → URL
     */
    private static function buildManifestMap(array $channelConfig, array $degradationInfo): array
    {
        $streamUrl = $channelConfig['stream_url'] ?? '';
        $backup1   = $channelConfig['stream_url_backup'] ?? '';
        $backup2   = $channelConfig['stream_url_backup2'] ?? '';

        // Detectar el formato de la URL principal
        $isM3u8   = str_ends_with(strtolower($streamUrl), '.m3u8') ||
                    str_contains($streamUrl, 'format=hls') ||
                    str_contains($streamUrl, '/hls/');
        $isMpd    = str_ends_with(strtolower($streamUrl), '.mpd') ||
                    str_contains($streamUrl, 'format=mpd') ||
                    str_contains($streamUrl, 'format=dash');
        $isTs     = str_ends_with(strtolower($streamUrl), '.ts') ||
                    str_contains($streamUrl, '/ts/');

        // Construir variantes de URL por formato
        $manifests = [];

        if ($isM3u8) {
            // La URL principal es HLS — generar variantes
            $manifests['hls']         = $streamUrl;
            $manifests['m3u8']        = $streamUrl;
            $manifests['hls_ts']      = $streamUrl;
            $manifests['hls_fmp4']    = self::convertUrlToFormat($streamUrl, 'fmp4');
            $manifests['hls_cmaf']    = self::convertUrlToFormat($streamUrl, 'cmaf');
            $manifests['cmaf']        = self::convertUrlToFormat($streamUrl, 'cmaf');
            $manifests['hls_hevc']    = self::convertUrlToFormat($streamUrl, 'hevc');
            $manifests['hls_fmp4_hevc'] = self::convertUrlToFormat($streamUrl, 'fmp4_hevc');
            $manifests['cmaf_hevc']   = self::convertUrlToFormat($streamUrl, 'cmaf_hevc');
        } elseif ($isMpd) {
            // La URL principal es DASH — convertir a HLS
            $manifests['dash']        = $streamUrl;
            $manifests['mpd']         = $streamUrl;
            $hlsUrl = str_replace(['format=mpd', 'format=dash', '.mpd'], ['format=hls', 'format=hls', '.m3u8'], $streamUrl);
            $manifests['hls']         = $hlsUrl;
            $manifests['m3u8']        = $hlsUrl;
            $manifests['hls_ts']      = $hlsUrl;
            $manifests['hls_fmp4']    = self::convertUrlToFormat($hlsUrl, 'fmp4');
        } elseif ($isTs) {
            // La URL principal es TS directo
            $manifests['ts_direct']   = $streamUrl;
            $manifests['ts']          = $streamUrl;
            $manifests['hls_ts']      = $streamUrl;
        } else {
            // URL genérica — asumir HLS
            $manifests['hls']         = $streamUrl;
            $manifests['m3u8']        = $streamUrl;
            $manifests['hls_ts']      = $streamUrl;
            $manifests['ts_direct']   = $streamUrl;
        }

        // Añadir backups como fallback de último recurso
        if (!empty($backup1)) {
            $manifests['backup1']     = $backup1;
            $manifests['hls_baseline'] = $backup1;
        }
        if (!empty($backup2)) {
            $manifests['backup2']     = $backup2;
        }

        // HTTP redirect siempre apunta a la URL original
        $manifests['http_redirect']   = $streamUrl;

        return $manifests;
    }

    /**
     * Convierte una URL HLS a una variante de formato específica.
     * Intenta añadir parámetros de formato si la URL lo soporta.
     *
     * @param string $url    URL original
     * @param string $format Formato destino (fmp4, cmaf, hevc, etc.)
     * @return string        URL convertida
     */
    private static function convertUrlToFormat(string $url, string $format): string
    {
        // Si la URL ya tiene parámetros de formato, reemplazarlos
        if (str_contains($url, 'format=')) {
            return preg_replace('/format=[^&]+/', 'format=' . $format, $url);
        }

        // Si la URL tiene query string, añadir el parámetro
        if (str_contains($url, '?')) {
            return $url . '&format=' . $format;
        }

        // URL sin query string — añadir el parámetro
        // Solo si la URL parece ser un endpoint de streaming (no un archivo estático)
        if (str_contains($url, '/stream') || str_contains($url, '/live') ||
            str_contains($url, '/hls') || str_contains($url, '/iptv')) {
            return $url . '?format=' . $format;
        }

        // Para archivos .m3u8 estáticos, retornar la URL original
        return $url;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCCIÓN DE HEADERS HTTP DE RESPUESTA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Construye los headers HTTP de respuesta con información completa del pipeline.
     * Incluye headers LCEVC, APE DNA, VQS, Telchemy y degradación.
     *
     * @param array  $channelConfig   Configuración del canal
     * @param string $playerName      Nombre del player detectado
     * @param string $lcevcState      Estado LCEVC (OFF/SIGNAL_ONLY/PACKAGED/PLAYER_VALIDATED)
     * @param int    $degradationLevel Nivel de degradación (1-7)
     * @param array  $tvqm            Métricas TVQM
     * @return array                  Headers HTTP como array asociativo
     */
    private static function buildResponseHeaders(
        array  $channelConfig,
        string $playerName,
        string $lcevcState,
        int    $degradationLevel,
        array  $tvqm
    ): array {
        $hydra  = (bool)($channelConfig['hydra_stealth_enabled'] ?? false);
        $prefix = $hydra ? 'X-SYS-' : 'X-APE-';

        $headers = [
            // Headers estándar
            'Content-Type'                  => 'application/vnd.apple.mpegurl',
            'Cache-Control'                 => 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin'   => '*',
            'Access-Control-Allow-Headers'  => 'Origin, X-Requested-With, Content-Type, Accept',

            // APE v18.2 Identity
            $prefix . 'Version'             => ApeOmniOrchestratorV18::VERSION,
            $prefix . 'Engine'              => 'APE-OMNI-ORCHESTRATOR-V18',
            $prefix . 'Format'              => 'CMAF-UNIVERSAL',
            $prefix . 'Player'              => $playerName,
            $prefix . 'Player-Profile'      => $channelConfig['player_profile'] ?? 'STANDARD',
            $prefix . 'Pipeline-Version'    => self::VERSION,

            // LCEVC
            $prefix . 'LCEVC-State'         => $lcevcState,
            $prefix . 'LCEVC-Enabled'       => ($channelConfig['lcevc_enabled'] ?? false) ? '1' : '0',

            // Cadena de Degradación
            $prefix . 'Degradation-Level'   => (string)$degradationLevel,
            $prefix . 'Degradation-Label'   => self::DEGRADATION_CHAIN[$degradationLevel]['label'] ?? 'unknown',

            // VQS Score
            $prefix . 'VQS-Score'           => (string)($tvqm['vqs_score'] ?? 0),
            $prefix . 'VQS-Tier'            => $tvqm['vqs_tier'] ?? 'STANDARD',
            $prefix . 'Quality-Profile'     => $tvqm['quality_profile'] ?? 'P3',

            // Telchemy TVQM
            $prefix . 'TVQM-VSTQ'           => (string)($tvqm['vstq'] ?? 0),
            $prefix . 'TVQM-VSMQ'           => (string)($tvqm['vsmq'] ?? 0),
            $prefix . 'TR101290-Status'      => $tvqm['tr101290_status'] ?? 'PASS',

            // HDR
            $prefix . 'HDR-Profile'         => $channelConfig['hdr_profile'] ?? 'SDR',

            // AI SR
            $prefix . 'AI-SR-Enabled'       => ($channelConfig['ai_sr_enabled'] ?? false) ? '1' : '0',
            $prefix . 'AI-SR-Mode'          => $channelConfig['ai_sr_mode'] ?? 'OFF',

            // DNA Hash
            $prefix . 'DNA-Hash'            => substr(md5(json_encode($channelConfig)), 0, 16),
        ];

        return $headers;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTEGRACIÓN CON resolve_quality.php
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Punto de entrada para la integración con resolve_quality.php.
     * Reemplaza la lógica de resolución existente con el pipeline unificado.
     *
     * Uso en resolve_quality.php:
     *   require_once __DIR__ . '/cmaf_engine/unified_cmaf_lcevc_pipeline.php';
     *   $result = UnifiedCmafLcevcPipeline::intercept($ch, $decision, $map);
     *   if ($result !== null) { /* emitir headers y URL */ }
     *
     * @param string $channelId  ID del canal
     * @param array  $decision   Decisión del mapDecision()
     * @param array  $channelMap Mapa completo de canales
     * @return array|null        Resultado del pipeline o null si no aplica
     */
    public static function intercept(string $channelId, array $decision, array $channelMap): ?array
    {
        // Solo interceptar si el canal tiene CMAF habilitado
        $channelConfig = $channelMap[$channelId] ?? [];
        if (empty($channelConfig)) return null;

        $cmafEnabled = (bool)($channelConfig['cmaf_enabled'] ?? false);
        if (!$cmafEnabled) return null;

        // Construir datos de la request
        $requestData = [
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
            'base_url'   => (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'),
        ];

        // Ejecutar el pipeline completo
        return self::process($channelConfig, $requestData);
    }

    /**
     * Emite los headers HTTP y la URL de respuesta.
     * Llamar después de intercept() si el resultado no es null.
     *
     * @param array $pipelineResult Resultado del pipeline
     */
    public static function emit(array $pipelineResult): void
    {
        // Emitir headers
        foreach ($pipelineResult['headers'] as $name => $value) {
            header($name . ': ' . $value);
        }

        // Emitir la URL seleccionada
        echo $pipelineResult['url'];
    }

    /**
     * Retorna la cadena de degradación completa.
     */
    public static function getDegradationChain(): array
    {
        return self::DEGRADATION_CHAIN;
    }
}
