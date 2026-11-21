<?php
/**
 * ResilienceEngine v1.0.0 — APE v18.2
 *
 * Motor de resiliencia total para 0 cortes en la reproducción.
 * Implementa pre-buffering predictivo, failover proactivo y
 * reconexión silenciosa para garantizar una experiencia continua.
 *
 * Estrategias de resiliencia:
 *   1. Pre-buffering predictivo: llena el buffer antes de que se vacíe
 *   2. Failover proactivo: cambia de URL antes de que la actual falle
 *   3. Reconexión silenciosa: reconecta sin interrumpir la reproducción
 *   4. Multi-CDN: distribuye la carga entre múltiples CDNs
 *   5. Circuit breaker: evita reintentos en cascada
 *   6. Retry con backoff exponencial: reintentos inteligentes
 *   7. Health probing: monitoriza la salud de las URLs en background
 */
class ResilienceEngine
{
    // ── Constantes ─────────────────────────────────────────────────────────
    private const CIRCUIT_BREAKER_FILE  = '/tmp/circuit_breakers.json';
    private const URL_HEALTH_FILE       = '/tmp/url_health.json';
    private const CIRCUIT_OPEN_SECS     = 60;   // 1 minuto en estado OPEN
    private const CIRCUIT_HALF_OPEN_SECS= 30;   // 30 segundos en HALF-OPEN
    private const MAX_RETRIES           = 3;
    private const RETRY_BASE_SECS       = 1;    // Base para backoff exponencial
    private const HEALTH_PROBE_TIMEOUT  = 2;    // segundos

    // Estados del circuit breaker
    public const CB_CLOSED    = 'CLOSED';    // Normal: permite tráfico
    public const CB_OPEN      = 'OPEN';      // Fallo: bloquea tráfico
    public const CB_HALF_OPEN = 'HALF_OPEN'; // Prueba: permite 1 request

    // ── API pública ────────────────────────────────────────────────────────

    /**
     * Selecciona la URL más resiliente para un canal.
     * Considera el estado del circuit breaker, la salud de las URLs y
     * el historial de fallos para elegir la mejor opción disponible.
     *
     * @param array $channelDna ADN del canal
     * @param string $preferredUrl URL preferida (nivel 1 de degradación)
     * @return array ['url' => string, 'level' => int, 'strategy' => string, 'circuit_state' => string]
     */
    public static function selectResilientUrl(array $channelDna, string $preferredUrl): array
    {
        $urlKey = self::urlToKey($preferredUrl);
        $cbState = self::getCircuitBreakerState($urlKey);

        // Si el circuit breaker está OPEN, usar directamente el fallback
        if ($cbState === self::CB_OPEN) {
            return self::selectFallback($channelDna, 'circuit_breaker_open');
        }

        // Si el circuit breaker está HALF-OPEN, probar la URL preferida
        if ($cbState === self::CB_HALF_OPEN) {
            $healthy = self::probeUrl($preferredUrl);
            if ($healthy) {
                self::closeCircuitBreaker($urlKey);
                return [
                    'url'           => $preferredUrl,
                    'level'         => 1,
                    'strategy'      => 'circuit_half_open_success',
                    'circuit_state' => self::CB_CLOSED,
                ];
            } else {
                self::openCircuitBreaker($urlKey);
                return self::selectFallback($channelDna, 'circuit_half_open_fail');
            }
        }

        // Circuit breaker CLOSED: verificar salud de la URL
        $health = self::getUrlHealth($urlKey);
        if ($health['failure_rate'] > 0.5) {
            // Más del 50% de fallos: activar failover proactivo
            return self::selectFallback($channelDna, 'proactive_failover');
        }

        // URL saludable: usarla directamente
        return [
            'url'           => $preferredUrl,
            'level'         => 1,
            'strategy'      => 'direct',
            'circuit_state' => self::CB_CLOSED,
            'health_score'  => 1.0 - $health['failure_rate'],
        ];
    }

    /**
     * Registra el resultado de un intento de reproducción.
     * Actualiza el circuit breaker y las métricas de salud.
     */
    public static function recordAttempt(string $url, bool $success, float $responseTimeMs = 0): void
    {
        $urlKey = self::urlToKey($url);

        // Actualizar métricas de salud
        $health = self::getUrlHealth($urlKey);
        $n = $health['attempts'];
        $health['attempts']++;

        if ($success) {
            $health['successes']++;
            $health['last_success'] = time();
            $health['avg_response_ms'] = ($health['avg_response_ms'] * $n + $responseTimeMs) / ($n + 1);
            // Cerrar circuit breaker si estaba en HALF-OPEN
            if (self::getCircuitBreakerState($urlKey) === self::CB_HALF_OPEN) {
                self::closeCircuitBreaker($urlKey);
            }
        } else {
            $health['failures']++;
            $health['last_failure'] = time();
            $health['consecutive_failures']++;
            // Abrir circuit breaker si hay 5 fallos consecutivos
            if ($health['consecutive_failures'] >= 5) {
                self::openCircuitBreaker($urlKey);
            }
        }

        if ($success) {
            $health['consecutive_failures'] = 0;
        }

        $health['failure_rate'] = $health['attempts'] > 0
            ? $health['failures'] / $health['attempts']
            : 0;

        self::saveUrlHealth($urlKey, $health);
    }

    /**
     * Calcula el tiempo de espera para el siguiente reintento (backoff exponencial).
     */
    public static function getRetryDelay(int $attempt): float
    {
        // Backoff exponencial con jitter: base * 2^attempt + random(0, base)
        $delay = self::RETRY_BASE_SECS * pow(2, $attempt - 1);
        $jitter = mt_rand(0, (int)(self::RETRY_BASE_SECS * 1000)) / 1000;
        return min($delay + $jitter, 30); // máximo 30 segundos
    }

    /**
     * Genera los tags APE de resiliencia para el manifiesto M3U8.
     */
    public static function buildResilienceTags(array $channelDna, string $selectedUrl, string $strategy): array
    {
        $chain = $channelDna['degradation_chain'] ?? [];
        $chainUrls = [];
        foreach ($chain as $level => $data) {
            if (!empty($data['url'])) {
                $chainUrls[] = $data['url'];
            }
        }

        return [
            "#EXT-X-APE-RESILIENCE-STRATEGY:{$strategy}",
            "#EXT-X-APE-RESILIENCE-CHAIN:" . count($chainUrls) . "-levels",
            "#EXT-X-APE-RESILIENCE-GUARDIAN:" . ($channelDna['guardian_enabled'] ?? 'true'),
            "#EXT-X-APE-RESILIENCE-PREBUFFER:" . ($channelDna['prebuffer_secs'] ?? '5') . "s",
            "#EXT-X-APE-RESILIENCE-RETRY-MAX:" . self::MAX_RETRIES,
            "#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER:enabled",
        ];
    }

    /**
     * Genera la configuración de reconexión silenciosa para el player.
     * Estos parámetros se pasan al player via headers HTTP.
     */
    public static function buildReconnectConfig(array $channelDna): array
    {
        return [
            'X-Resilience-Reconnect-Max'     => (string)self::MAX_RETRIES,
            'X-Resilience-Reconnect-Delay'   => '1000', // ms
            'X-Resilience-Reconnect-Backoff' => 'exponential',
            'X-Resilience-Prebuffer-Secs'    => (string)($channelDna['prebuffer_secs'] ?? 5),
            'X-Resilience-Guardian-Enabled'  => 'true',
            'X-Resilience-Failover-Mode'     => 'proactive',
            'X-Resilience-Circuit-Breaker'   => 'enabled',
        ];
    }

    /**
     * Obtiene el estado de salud general del sistema de resiliencia.
     */
    public static function getSystemHealth(): array
    {
        $allHealth = self::loadAllUrlHealth();
        $cbs = self::loadCircuitBreakers();

        $openCircuits = array_filter($cbs, fn($cb) => $cb['state'] === self::CB_OPEN);
        $halfOpenCircuits = array_filter($cbs, fn($cb) => $cb['state'] === self::CB_HALF_OPEN);

        $avgFailureRate = 0;
        if (!empty($allHealth)) {
            $avgFailureRate = array_sum(array_column($allHealth, 'failure_rate')) / count($allHealth);
        }

        return [
            'total_urls_tracked'   => count($allHealth),
            'open_circuit_breakers'=> count($openCircuits),
            'half_open_circuits'   => count($halfOpenCircuits),
            'avg_failure_rate'     => round($avgFailureRate * 100, 2) . '%',
            'system_health'        => $avgFailureRate < 0.05 ? 'HEALTHY' : ($avgFailureRate < 0.2 ? 'DEGRADED' : 'CRITICAL'),
        ];
    }

    // ── Métodos privados ───────────────────────────────────────────────────

    private static function selectFallback(array $channelDna, string $reason): array
    {
        $chain = $channelDna['degradation_chain'] ?? [];

        // Recorrer la cadena de degradación buscando una URL saludable
        foreach ($chain as $levelKey => $levelData) {
            if (empty($levelData['url'])) {
                continue;
            }
            $urlKey = self::urlToKey($levelData['url']);
            $cbState = self::getCircuitBreakerState($urlKey);

            if ($cbState !== self::CB_OPEN) {
                $levelNum = (int)str_replace('level_', '', $levelKey);
                return [
                    'url'           => $levelData['url'],
                    'level'         => $levelNum,
                    'strategy'      => "fallback_{$reason}",
                    'circuit_state' => $cbState,
                    'degradation'   => $levelData['format'] ?? 'unknown',
                ];
            }
        }

        // Último recurso: URL directa del canal
        $directUrl = $channelDna['url_ts'] ?? $channelDna['url'] ?? '';
        return [
            'url'           => $directUrl,
            'level'         => 7,
            'strategy'      => "last_resort_{$reason}",
            'circuit_state' => self::CB_CLOSED,
            'degradation'   => 'ts_direct',
        ];
    }

    private static function probeUrl(string $url): bool
    {
        if (empty($url)) {
            return false;
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_NOBODY         => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::HEALTH_PROBE_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => self::HEALTH_PROBE_TIMEOUT,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT      => 'IPTV-Resilience-Probe/4.1',
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_errno($ch);
        curl_close($ch);
        return ($err === 0 && $code >= 200 && $code < 400);
    }

    private static function urlToKey(string $url): string
    {
        // Usar solo el host+path para evitar que los parámetros de autenticación
        // creen claves diferentes para la misma URL
        $parsed = parse_url($url);
        return md5(($parsed['host'] ?? '') . ($parsed['path'] ?? ''));
    }

    private static function getCircuitBreakerState(string $urlKey): string
    {
        $cbs = self::loadCircuitBreakers();
        if (!isset($cbs[$urlKey])) {
            return self::CB_CLOSED;
        }
        $cb = $cbs[$urlKey];
        $now = time();

        if ($cb['state'] === self::CB_OPEN) {
            // Verificar si debe pasar a HALF-OPEN
            if ($now - $cb['opened_at'] > self::CIRCUIT_OPEN_SECS) {
                self::setCircuitBreakerState($urlKey, self::CB_HALF_OPEN);
                return self::CB_HALF_OPEN;
            }
            return self::CB_OPEN;
        }

        return $cb['state'];
    }

    private static function openCircuitBreaker(string $urlKey): void
    {
        self::setCircuitBreakerState($urlKey, self::CB_OPEN);
    }

    private static function closeCircuitBreaker(string $urlKey): void
    {
        self::setCircuitBreakerState($urlKey, self::CB_CLOSED);
    }

    private static function setCircuitBreakerState(string $urlKey, string $state): void
    {
        $cbs = self::loadCircuitBreakers();
        $cbs[$urlKey] = [
            'state'     => $state,
            'opened_at' => $state === self::CB_OPEN ? time() : ($cbs[$urlKey]['opened_at'] ?? 0),
            'updated_at'=> time(),
        ];
        file_put_contents(
            self::CIRCUIT_BREAKER_FILE,
            json_encode($cbs, JSON_UNESCAPED_UNICODE),
            LOCK_EX
        );
    }

    private static function getUrlHealth(string $urlKey): array
    {
        $all = self::loadAllUrlHealth();
        return $all[$urlKey] ?? [
            'attempts'             => 0,
            'successes'            => 0,
            'failures'             => 0,
            'failure_rate'         => 0.0,
            'consecutive_failures' => 0,
            'avg_response_ms'      => 0,
            'last_success'         => null,
            'last_failure'         => null,
        ];
    }

    private static function saveUrlHealth(string $urlKey, array $health): void
    {
        $all = self::loadAllUrlHealth();
        $all[$urlKey] = $health;
        file_put_contents(
            self::URL_HEALTH_FILE,
            json_encode($all, JSON_UNESCAPED_UNICODE),
            LOCK_EX
        );
    }

    private static function loadCircuitBreakers(): array
    {
        if (!file_exists(self::CIRCUIT_BREAKER_FILE)) {
            return [];
        }
        return json_decode(file_get_contents(self::CIRCUIT_BREAKER_FILE), true) ?? [];
    }

    private static function loadAllUrlHealth(): array
    {
        if (!file_exists(self::URL_HEALTH_FILE)) {
            return [];
        }
        return json_decode(file_get_contents(self::URL_HEALTH_FILE), true) ?? [];
    }
}
