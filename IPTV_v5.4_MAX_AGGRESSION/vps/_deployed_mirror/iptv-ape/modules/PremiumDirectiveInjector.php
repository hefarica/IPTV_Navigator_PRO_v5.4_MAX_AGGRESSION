<?php
declare(strict_types=1);

/**
 * MÓDULO 7: PremiumDirectiveInjector — Inyector de Directivas Premium
 * ====================================================================
 * Genera directivas específicas para cada tipo de reproductor,
 * fusionándolas con las directivas existentes de la lista sin duplicar.
 *
 * Tipos de reproductor soportados:
 * - VLC: EXTVLCOPT (cache, reconexión, clock, HW decode, deinterlace)
 * - Kodi: KODIPROP (InputStream Adaptive buffer)
 * - OTT Navigator: EXTHTTP (headers personalizados)
 * - ExoPlayer/Smarters: EXTHTTP (headers mínimos)
 * - TiviMate: EXTVLCOPT + EXTHTTP (mix)
 * - Smart TV: Sin directivas (no soporta)
 * - Genérico: Sin directivas (no asumir soporte)
 *
 * REGLA FUNDAMENTAL: Todos los valores provienen del estado calculado.
 * NINGÚN valor está hardcodeado (excepto strings fijos como "true").
 *
 * @package ResolveQuality v2.5 ULTRA
 * @module  PremiumDirectiveInjector
 */

class PremiumDirectiveInjector
{
    /** User-Agent detectado para las directivas */
    private string $userAgent;

    /** Referer detectado (si existe) */
    private string $referer;

    /**
     * Constructor — extrae User-Agent y Referer del entorno HTTP.
     *
     * @param string $userAgent User-Agent a usar en las directivas
     * @param string $referer   Referer a usar (opcional)
     */
    public function __construct(string $userAgent = '', string $referer = '')
    {
        $this->userAgent = $userAgent ?: ($_SERVER['HTTP_USER_AGENT'] ?? 'Unknown');
        $this->referer = $referer ?: ($_SERVER['HTTP_REFERER'] ?? '');
    }

    /**
     * Inyecta directivas en el estado del pipeline.
     *
     * Selecciona el generador adecuado según el tipo de reproductor
     * y fusiona las nuevas directivas con las existentes.
     *
     * @param  array $state Estado completo del pipeline
     * @return array{before_stream: array<string>, global_headers: array<string, string>}
     */
    public function inject(array $state): array
    {
        $playerType = $state['capability_matrix']['player']['type'] ?? 'generic';
        $resilience = $state['resilience_config'];
        $existing = $state['normalized_directives'];
        $capabilities = $state['capability_matrix'];
        $escalation = $state['visual_escalation'];

        // Seleccionar generador según tipo de reproductor
        $directives = match ($playerType) {
            PlayerType::VLC->value      => $this->buildVlcDirectives(config: $resilience, capabilities: $capabilities, escalation: $escalation),
            PlayerType::KODI->value     => $this->buildKodiDirectives(config: $resilience, capabilities: $capabilities),
            PlayerType::OTT->value      => $this->buildOttDirectives(config: $resilience, capabilities: $capabilities),
            PlayerType::EXO->value      => $this->buildExoDirectives(config: $resilience, capabilities: $capabilities),
            PlayerType::TIVIMATE->value => $this->buildTivimateDirectives(config: $resilience, capabilities: $capabilities),
            PlayerType::SMART_TV->value => $this->buildSmartTvDirectives(config: $resilience),
            default                     => $this->buildGenericDirectives(config: $resilience),
        };

        // Fusionar con directivas existentes (sin duplicar por clave)
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
     * Construye directivas EXTVLCOPT para VLC Media Player.
     *
     * Directivas generadas (todas basadas en el estado calculado):
     * - Cache de red, live y archivo
     * - Reconexión HTTP
     * - Control de reloj
     * - Anti-stall
     * - Decodificación por hardware
     * - Deinterlazado
     * - User-Agent y Referer
     */
    private function buildVlcDirectives(array $config, array $capabilities, array $escalation): array
    {
        $directives = [];
        $headers = [];

        $networkMs = $config['buffer_network_ms'];
        $liveMs = $config['buffer_live_ms'];
        $fileMs = $config['buffer_file_ms'];

        // Directivas de cache (valores del estado de resiliencia)
        $directives[] = "#EXTVLCOPT:network-caching={$networkMs}";
        $directives[] = "#EXTVLCOPT:live-caching={$liveMs}";
        $directives[] = "#EXTVLCOPT:file-caching={$fileMs}";

        // Reconexión HTTP continua
        $directives[] = '#EXTVLCOPT:http-reconnect=true';
        $directives[] = '#EXTVLCOPT:http-continuous=true';

        // Control de reloj (solo si clock_recovery está activo)
        if ($config['clock_recovery']) {
            $directives[] = '#EXTVLCOPT:clock-jitter=0';
            $directives[] = '#EXTVLCOPT:clock-synchro=0';
        }

        // Anti-stall (solo si stall_protection está activo)
        if ($config['stall_protection']) {
            $directives[] = '#EXTVLCOPT:sout-keep=1';
        }

        // Decodificación por hardware (si el reproductor la soporta)
        if ($capabilities['player']['hw_decode']) {
            $directives[] = '#EXTVLCOPT:avcodec-hw=any';
            $directives[] = '#EXTVLCOPT:avcodec-threads=0';
            $directives[] = '#EXTVLCOPT:avcodec-fast=1';
        }

        // Deinterlazado (solo si el nivel de escalamiento lo permite)
        if ($escalation['can_escalate_buffer']) {
            $directives[] = '#EXTVLCOPT:deinterlace-mode=bwdif';
        }

        // User-Agent y Referer personalizados (del estado)
        $directives[] = "#EXTVLCOPT:http-user-agent={$this->userAgent}";
        if ($this->referer !== '') {
            $directives[] = "#EXTVLCOPT:http-referrer={$this->referer}";
        }

        return ['before_stream' => $directives, 'global_headers' => $headers];
    }

    /**
     * Construye directivas KODIPROP para Kodi.
     *
     * Usa InputStream Adaptive para control de buffer.
     */
    private function buildKodiDirectives(array $config, array $capabilities): array
    {
        $directives = [];
        $headers = [];

        $networkMs = $config['buffer_network_ms'];
        $liveMs = $config['buffer_live_ms'];

        // Buffer de playback y límite
        $directives[] = "#KODIPROP:inputstream.adaptive.buffer_for_playback={$networkMs}";
        $directives[] = '#KODIPROP:inputstream.adaptive.buffer_limit_mult=10';
        $directives[] = "#KODIPROP:inputstream.adaptive.live_buffer={$liveMs}";

        // Sin límite de ancho de banda (dejar que InputStream Adaptive decida)
        if (!empty($capabilities['network']['throughput_kbps'])) {
            $directives[] = '#KODIPROP:inputstream.adaptive.max_bandwidth=0';
        }

        return ['before_stream' => $directives, 'global_headers' => $headers];
    }

    /**
     * Construye directivas EXTHTTP para OTT Navigator.
     *
     * OTT Navigator usa cabeceras HTTP personalizadas para control.
     */
    private function buildOttDirectives(array $config, array $capabilities): array
    {
        $directives = [];
        $headers = [
            'User-Agent'      => $this->userAgent,
            'X-Buffer-Target' => (string) $config['buffer_network_ms'],
            'X-Reconnect'     => 'true',
        ];

        if ($config['failover_enabled']) {
            $headers['X-Failover'] = $config['failover_mode'];
        }

        return ['before_stream' => $directives, 'global_headers' => $headers];
    }

    /**
     * Construye directivas para ExoPlayer / IPTV Smarters.
     *
     * ExoPlayer solo soporta headers HTTP, sin directivas especiales.
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
     *
     * TiviMate soporta EXTVLCOPT limitado + EXTHTTP.
     */
    private function buildTivimateDirectives(array $config, array $capabilities): array
    {
        $directives = [];
        $headers = [];

        // Solo network-caching como EXTVLCOPT
        $directives[] = "#EXTVLCOPT:network-caching={$config['buffer_network_ms']}";

        // Headers HTTP
        $headers['User-Agent'] = $this->userAgent;

        return ['before_stream' => $directives, 'global_headers' => $headers];
    }

    /**
     * Construye directivas para Smart TV.
     *
     * Smart TVs generalmente no soportan directivas avanzadas.
     * No se asume ningún soporte.
     */
    private function buildSmartTvDirectives(array $config): array
    {
        return ['before_stream' => [], 'global_headers' => []];
    }

    /**
     * Construye directivas para jugador genérico/desconocido.
     *
     * No se asume ningún soporte de directivas para evitar
     * incompatibilidades con reproductores desconocidos.
     */
    private function buildGenericDirectives(array $config): array
    {
        return ['before_stream' => [], 'global_headers' => []];
    }

    /**
     * Fusiona directivas nuevas con las existentes sin duplicar.
     *
     * Orden de precedencia:
     * 1. Directivas existentes de la lista original (se preservan)
     * 2. Directivas nuevas del pipeline (solo las que no existen)
     *
     * @param  array  $newDirectives Directivas nuevas a insertar
     * @param  array  $existing      Directivas existentes de la lista
     * @param  string $playerType    Tipo de reproductor
     * @return array{before_stream: array<string>, global_headers: array<string, string>}
     */
    private function mergeWithExisting(array $newDirectives, array $existing, string $playerType): array
    {
        $mergedStream = [];
        $seenKeys = [];
        $mergedHeaders = $newDirectives['global_headers'] ?? [];

        // Mapear tipo de reproductor a directivas existentes
        $existingStream = match ($playerType) {
            PlayerType::VLC->value      => $existing['extvlcopt'] ?? [],
            PlayerType::TIVIMATE->value => $existing['extvlcopt'] ?? [],
            PlayerType::KODI->value     => $existing['kodiprop'] ?? [],
            default                     => [],
        };

        // Primero: agregar directivas existentes (mantener orden original)
        foreach ($existingStream as $directive) {
            $key = strstr($directive, '=', true) ?: $directive;
            $seenKeys[$key] = true;
            $mergedStream[] = $directive;
        }

        // Segundo: agregar directivas nuevas (solo claves no vistas)
        foreach (($newDirectives['before_stream'] ?? []) as $directive) {
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

        // Fusionar cabeceras HTTP existentes
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
