<?php
/**
 * ListaGuardianEngine v1.0.0 — APE v18.2
 *
 * Blinda la reproducción cuando la lista M3U8 no envía datos.
 * Usa el channels_map.json como fuente de verdad para garantizar
 * la continuidad de la reproducción ante caídas del proveedor IPTV.
 *
 * Estados del Guardian:
 *   ONLINE      → Lista disponible, reproducción normal
 *   DEGRADED    → Lista parcialmente disponible, usando fallback de URLs
 *   GUARDIAN    → Lista caída, usando channels_map como fuente de verdad
 *   RECOVERY    → Lista recuperándose, transición suave de vuelta a ONLINE
 */
class ListaGuardianEngine
{
    // ── Constantes de estado ───────────────────────────────────────────────
    public const STATE_ONLINE    = 'ONLINE';
    public const STATE_DEGRADED  = 'DEGRADED';
    public const STATE_GUARDIAN  = 'GUARDIAN';
    public const STATE_RECOVERY  = 'RECOVERY';

    private const STATE_FILE     = '/tmp/guardian_state.json';
    private const PROBE_TIMEOUT  = 3;    // segundos para probe de URL
    private const DEGRADED_THRESHOLD = 3; // fallos consecutivos para DEGRADED
    private const GUARDIAN_THRESHOLD = 7; // fallos consecutivos para GUARDIAN

    // ── API pública ────────────────────────────────────────────────────────

    /**
     * Punto de entrada principal.
     * Evalúa si la lista está disponible y decide qué URL servir al player.
     *
     * @param string $channelKey  Clave del canal (slug_streamid)
     * @param array  $channelDna  ADN del canal desde el channels_map.json
     * @param string $requestedUrl URL original solicitada por el player
     * @return array ['url' => string, 'state' => string, 'source' => string, 'degradation_level' => int]
     */
    public static function resolve(string $channelKey, array $channelDna, string $requestedUrl): array
    {
        $state = self::getCurrentState();
        $consecutiveFails = $state['consecutive_fails'][$channelKey] ?? 0;

        // Determinar el estado del guardian para este canal
        $guardianState = self::computeGuardianState($consecutiveFails);

        switch ($guardianState) {
            case self::STATE_ONLINE:
                // Lista disponible: servir URL original
                return [
                    'url'               => $requestedUrl,
                    'state'             => self::STATE_ONLINE,
                    'source'            => 'lista_directa',
                    'degradation_level' => 1,
                    'guardian_active'   => false,
                ];

            case self::STATE_DEGRADED:
                // Lista parcialmente disponible: intentar URL de fallback del canal
                $fallbackUrl = self::selectFallbackUrl($channelDna, 2);
                return [
                    'url'               => $fallbackUrl ?? $requestedUrl,
                    'state'             => self::STATE_DEGRADED,
                    'source'            => $fallbackUrl ? 'channel_map_fallback' : 'lista_directa',
                    'degradation_level' => 2,
                    'guardian_active'   => true,
                    'consecutive_fails' => $consecutiveFails,
                ];

            case self::STATE_GUARDIAN:
                // Lista caída: usar channels_map como fuente de verdad
                $guardianUrl = self::buildGuardianUrl($channelDna);
                return [
                    'url'               => $guardianUrl,
                    'state'             => self::STATE_GUARDIAN,
                    'source'            => 'channel_map_guardian',
                    'degradation_level' => self::selectDegradationLevel($channelDna),
                    'guardian_active'   => true,
                    'consecutive_fails' => $consecutiveFails,
                    'guardian_reason'   => 'lista_no_disponible',
                ];

            case self::STATE_RECOVERY:
                // Lista recuperándose: transición suave
                $recoveryUrl = self::selectFallbackUrl($channelDna, 1) ?? $requestedUrl;
                return [
                    'url'               => $recoveryUrl,
                    'state'             => self::STATE_RECOVERY,
                    'source'            => 'recovery_transition',
                    'degradation_level' => 1,
                    'guardian_active'   => false,
                ];

            default:
                return [
                    'url'               => $requestedUrl,
                    'state'             => self::STATE_ONLINE,
                    'source'            => 'default',
                    'degradation_level' => 1,
                    'guardian_active'   => false,
                ];
        }
    }

    /**
     * Registra un fallo de reproducción para un canal.
     * Incrementa el contador de fallos consecutivos.
     */
    public static function recordFailure(string $channelKey, string $reason = 'unknown'): void
    {
        $state = self::getCurrentState();
        $state['consecutive_fails'][$channelKey] = ($state['consecutive_fails'][$channelKey] ?? 0) + 1;
        $state['last_failure'][$channelKey] = [
            'timestamp' => time(),
            'reason'    => $reason,
        ];
        $state['total_failures'] = ($state['total_failures'] ?? 0) + 1;
        self::saveState($state);
    }

    /**
     * Registra una reproducción exitosa para un canal.
     * Resetea el contador de fallos consecutivos.
     */
    public static function recordSuccess(string $channelKey): void
    {
        $state = self::getCurrentState();
        $state['consecutive_fails'][$channelKey] = 0;
        $state['last_success'][$channelKey] = time();
        $state['total_successes'] = ($state['total_successes'] ?? 0) + 1;
        self::saveState($state);
    }

    /**
     * Verifica si la URL de la lista está disponible haciendo un probe HTTP.
     * Retorna true si está disponible, false si no.
     */
    public static function probeUrl(string $url): bool
    {
        if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
            return false;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_NOBODY         => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::PROBE_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => self::PROBE_TIMEOUT,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT      => 'IPTV-Guardian-Probe/4.1',
        ]);
        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_errno($ch);
        curl_close($ch);

        return ($curlError === 0 && $httpCode >= 200 && $httpCode < 400);
    }

    /**
     * Obtiene el estado actual del guardian.
     */
    public static function getStatus(): array
    {
        $state = self::getCurrentState();
        $channelStates = [];

        foreach (($state['consecutive_fails'] ?? []) as $key => $fails) {
            $channelStates[$key] = self::computeGuardianState($fails);
        }

        $guardianChannels = array_filter($channelStates, fn($s) => $s === self::STATE_GUARDIAN);
        $degradedChannels = array_filter($channelStates, fn($s) => $s === self::STATE_DEGRADED);

        return [
            'global_state'      => count($guardianChannels) > 100 ? self::STATE_GUARDIAN : self::STATE_ONLINE,
            'guardian_channels' => count($guardianChannels),
            'degraded_channels' => count($degradedChannels),
            'online_channels'   => count($channelStates) - count($guardianChannels) - count($degradedChannels),
            'total_failures'    => $state['total_failures'] ?? 0,
            'total_successes'   => $state['total_successes'] ?? 0,
            'uptime_pct'        => self::computeUptimePct($state),
        ];
    }

    // ── Métodos privados ───────────────────────────────────────────────────

    private static function computeGuardianState(int $consecutiveFails): string
    {
        if ($consecutiveFails === 0) {
            return self::STATE_ONLINE;
        }
        if ($consecutiveFails < self::DEGRADED_THRESHOLD) {
            return self::STATE_ONLINE; // Tolerancia a 1-2 fallos esporádicos
        }
        if ($consecutiveFails < self::GUARDIAN_THRESHOLD) {
            return self::STATE_DEGRADED;
        }
        return self::STATE_GUARDIAN;
    }

    /**
     * Construye una URL de reproducción desde el channels_map.json (modo guardián).
     * Usa la degradation_chain del canal para seleccionar la mejor URL disponible.
     */
    private static function buildGuardianUrl(array $channelDna): string
    {
        $chain = $channelDna['degradation_chain'] ?? [];

        // Intentar cada nivel de la cadena de degradación
        foreach ($chain as $level => $levelData) {
            if (!isset($levelData['url']) || empty($levelData['url'])) {
                continue;
            }
            // En modo guardián, no hacemos probe para no añadir latencia
            // Confiamos en el channels_map.json como fuente de verdad
            return $levelData['url'];
        }

        // Fallback final: URL directa del canal
        return $channelDna['url_hls'] ?? $channelDna['url_ts'] ?? $channelDna['url'] ?? '';
    }

    /**
     * Selecciona una URL de fallback del canal según el nivel de degradación.
     */
    private static function selectFallbackUrl(array $channelDna, int $degradationLevel): ?string
    {
        $chain = $channelDna['degradation_chain'] ?? [];
        $levelKey = "level_{$degradationLevel}";

        if (isset($chain[$levelKey]['url']) && !empty($chain[$levelKey]['url'])) {
            return $chain[$levelKey]['url'];
        }

        // Buscar cualquier nivel disponible
        foreach ($chain as $level => $data) {
            if (isset($data['url']) && !empty($data['url'])) {
                return $data['url'];
            }
        }

        return null;
    }

    /**
     * Selecciona el nivel de degradación óptimo para el modo guardián.
     */
    private static function selectDegradationLevel(array $channelDna): int
    {
        $profile = $channelDna['quality_profile'] ?? 'P2';
        return match($profile) {
            'P0', 'P1' => 2, // 4K/8K: degradar a HLS/fMP4+HEVC
            'P2'       => 3, // FHD: degradar a HLS/fMP4+H.264
            'P3'       => 4, // HD: degradar a HLS/TS+H.264
            default    => 5, // SD: degradar a HLS/TS+Baseline
        };
    }

    private static function computeUptimePct(array $state): float
    {
        $total = ($state['total_failures'] ?? 0) + ($state['total_successes'] ?? 0);
        if ($total === 0) {
            return 100.0;
        }
        return round(($state['total_successes'] ?? 0) / $total * 100, 2);
    }

    private static function getCurrentState(): array
    {
        if (!file_exists(self::STATE_FILE)) {
            return [];
        }
        $raw = file_get_contents(self::STATE_FILE);
        return json_decode($raw, true) ?? [];
    }

    private static function saveState(array $state): void
    {
        // Limpiar entradas antiguas (más de 24 horas sin actividad)
        $cutoff = time() - 86400;
        foreach (($state['last_success'] ?? []) as $key => $ts) {
            if ($ts < $cutoff) {
                unset($state['consecutive_fails'][$key]);
                unset($state['last_success'][$key]);
                unset($state['last_failure'][$key]);
            }
        }

        file_put_contents(
            self::STATE_FILE,
            json_encode($state, JSON_UNESCAPED_UNICODE),
            LOCK_EX
        );
    }
}
