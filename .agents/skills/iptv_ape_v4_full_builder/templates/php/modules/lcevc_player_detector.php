<?php
declare(strict_types=1);
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LCEVC Player Detector v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Detecta si el reproductor que realiza la petición tiene soporte LCEVC,
 * usando tres métodos de detección en orden de prioridad:
 *
 *   1. Query param:  ?lcevc=1
 *   2. HTTP Header:  X-LCEVC-Supported: 1
 *   3. User-Agent:   Análisis del UA para identificar players conocidos
 *
 * Implementa la Fase 3 del plan de integración LCEVC:
 * "Player Routing → solo entregar LCEVC a players compatibles"
 *
 * AUTOR: Manus AI
 * VERSIÓN: 1.0.0
 * FECHA: 2026-03-15
 * ═══════════════════════════════════════════════════════════════════════════
 */

class LcevcPlayerDetector
{
    // ─────────────────────────────────────────────────────────────────────
    // PATRONES DE USER-AGENT PARA PLAYERS CONOCIDOS
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Mapa de patrones UA → nombre del player.
     * Los patrones se evalúan en orden; el primero que coincide gana.
     */
    const UA_PATTERNS = [
        // Players con soporte LCEVC nativo/integrado
        'ExoPlayer'     => ['ExoPlayer', 'com.google.android.exoplayer'],
        'Shaka'         => ['shaka-player', 'ShakaPlayer'],
        'hls.js'        => ['hls.js', 'hlsjs'],
        // Players sin soporte LCEVC
        'OTT Navigator' => ['OTT Navigator', 'OTTNavigator', 'ottnavigator'],
        'Tivimate'      => ['TiviMate', 'tivimate'],
        'Kodi'          => ['Kodi', 'XBMC'],
        'VLC'           => ['VLC', 'LibVLC'],
        'Safari'        => ['Safari', 'AppleWebKit'],
        'AVPlayer'      => ['AVFoundation', 'CoreMedia'],
    ];

    // ─────────────────────────────────────────────────────────────────────
    // MÉTODO PRINCIPAL
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Detecta el player y su soporte LCEVC a partir de la petición HTTP.
     *
     * @param array $serverVars  Normalmente $_SERVER
     * @param array $queryParams Normalmente $_GET
     * @return array Resultado con campos:
     *               - player_name (string)
     *               - lcevc_supported (bool)
     *               - detection_method (string): 'query_param' | 'header' | 'user_agent' | 'unknown'
     */
    public static function detect(array $serverVars = [], array $queryParams = []): array
    {
        $serverVars  = $serverVars  ?: $_SERVER;
        $queryParams = $queryParams ?: $_GET;

        // ─────────────────────────────────────────────────────────────────
        // MÉTODO 1: Query param ?lcevc=1
        // El player o el frontend puede indicar explícitamente el soporte.
        // ─────────────────────────────────────────────────────────────────
        if (isset($queryParams['lcevc']) && $queryParams['lcevc'] === '1') {
            return [
                'player_name'      => self::detectPlayerName($serverVars),
                'lcevc_supported'  => true,
                'detection_method' => 'query_param',
            ];
        }

        // ─────────────────────────────────────────────────────────────────
        // MÉTODO 2: HTTP Header X-LCEVC-Supported: 1
        // Players con DIL integrado pueden enviar este header.
        // ─────────────────────────────────────────────────────────────────
        $lcevcHeader = $serverVars['HTTP_X_LCEVC_SUPPORTED']
                    ?? $serverVars['HTTP_X-LCEVC-SUPPORTED']
                    ?? null;
        if ($lcevcHeader === '1') {
            return [
                'player_name'      => self::detectPlayerName($serverVars),
                'lcevc_supported'  => true,
                'detection_method' => 'header',
            ];
        }

        // ─────────────────────────────────────────────────────────────────
        // MÉTODO 3: Análisis del User-Agent
        // Identificar players conocidos y cruzar con la matriz de soporte.
        // ─────────────────────────────────────────────────────────────────
        $playerName = self::detectPlayerName($serverVars);
        $supported  = self::isPlayerLcevcCapable($playerName);

        return [
            'player_name'      => $playerName,
            'lcevc_supported'  => $supported,
            'detection_method' => 'user_agent',
        ];
    }

    // ─────────────────────────────────────────────────────────────────────
    // MÉTODOS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Detecta el nombre del player a partir del User-Agent.
     *
     * @param array $serverVars
     * @return string Nombre del player o 'Unknown'
     */
    private static function detectPlayerName(array $serverVars): string
    {
        $ua = $serverVars['HTTP_USER_AGENT'] ?? '';
        if (empty($ua)) {
            return 'Unknown';
        }

        foreach (self::UA_PATTERNS as $playerName => $patterns) {
            foreach ($patterns as $pattern) {
                if (stripos($ua, $pattern) !== false) {
                    return $playerName;
                }
            }
        }

        return 'Unknown';
    }

    /**
     * Determina si un player tiene soporte LCEVC según la matriz.
     *
     * @param string $playerName
     * @return bool
     */
    private static function isPlayerLcevcCapable(string $playerName): bool
    {
        // Solo ExoPlayer, Shaka y hls.js tienen soporte LCEVC real
        return in_array($playerName, ['ExoPlayer', 'Shaka', 'hls.js'], true);
    }
}
