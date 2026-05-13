<?php
/**
 * APE Anti-407 Module v1.0.0-PHANTOM
 * ====================================
 * Eliminación definitiva del error HTTP 407 Proxy Authentication Required
 * en entornos IPTV/OTT con resolver PHP.
 *
 * CAUSAS IDENTIFICADAS DEL 407 EN EL RESOLVER:
 * 1. Headers excesivos/agresivos que activan proxies corporativos del proveedor.
 * 2. User-Agent que coincide con patrones de bots/scrapers en listas negras de proxy.
 * 3. Ausencia de cabecera Proxy-Authorization cuando el upstream la exige.
 * 4. Bitrates declarados demasiado altos que activan throttling con proxy-auth.
 *
 * ESTRATEGIA DE EVASIÓN (5 capas):
 * Capa 1 — Header Sanitizer: elimina headers que disparan el 407.
 * Capa 2 — UA Rotator: rota User-Agents legítimos por canal y hora.
 * Capa 3 — Proxy-Auth Injector: inyecta credenciales vacías/bypass cuando el proxy las exige.
 * Capa 4 — Redirect Follower: sigue 302 antes de que el proxy intervenga.
 * Capa 5 — Fallback Chain: si el upstream responde 407, reintenta con perfil limpio.
 */

class ApeAnti407 {

    // ─── CONSTANTES ────────────────────────────────────────────────────────────

    const VERSION = '1.0.0-PHANTOM';

    /**
     * Headers que PROVOCAN el 407 en proxies corporativos de proveedores IPTV.
     * Estos headers delatan que la petición viene de un resolver/proxy propio,
     * lo que activa la autenticación de proxy en el upstream.
     */
    const HEADERS_BLACKLIST = [
        'X-Forwarded-For',
        'X-Real-IP',
        'X-Proxy-ID',
        'Via',
        'Forwarded',
        'X-Original-URL',
        'X-Rewrite-URL',
        'X-Custom-IP-Authorization',
        'X-No-Proxy',          // Paradójicamente, este header activa proxies en algunos ISPs
        'X-APE-Engine',        // Nunca exponer la firma del motor al upstream
        'X-APE-Channel',
        'X-APE-Profile',
    ];

    /**
     * Pool de User-Agents legítimos de reproductores reales.
     * Rotados por canal_id % count para consistencia por sesión.
     */
    const UA_POOL = [
        // VLC (el más transparente para proxies)
        'VLC/3.0.20 LibVLC/3.0.20',
        'VLC/3.0.18 LibVLC/3.0.18',
        // Kodi
        'Kodi/20.2 (X11; Linux x86_64) App_Bitness/64 Version/20.2-Git:20230726-2c2b1f1',
        'Kodi/19.4 (Windows NT 10.0; WOW64) App_Bitness/32 Version/19.4',
        // OTT Navigator (el reproductor del usuario)
        'OTT Navigator/2.1.6 (Linux; Android 11; SHIELD Android TV)',
        'OTT Navigator/2.1.6 (Linux; Android 12; Xiaomi Mi Box S)',
        // TiviMate
        'TiviMate/4.7.0 (Linux; Android 11)',
        // Smart IPTV (Samsung Tizen)
        'SmartTV/2.0 (SMART-TV; Linux; Tizen 6.0)',
        // Navegadores legítimos (último recurso)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    ];

    /**
     * Cabeceras mínimas y seguras que NO activan proxies.
     * Solo las estrictamente necesarias para que el upstream acepte la petición.
     */
    const SAFE_HEADERS = [
        'Accept'          => '*/*',
        'Accept-Language' => 'en-US,en;q=0.9',
        'Cache-Control'   => 'no-cache',
        'Connection'      => 'keep-alive',
    ];

    // ─── CAPA 1: HEADER SANITIZER ──────────────────────────────────────────────

    /**
     * Limpia los headers de la petición saliente hacia el upstream,
     * eliminando todos los que pueden activar el 407.
     *
     * @param array $headers Headers originales a enviar al upstream
     * @return array Headers saneados
     */
    public static function sanitizeHeaders(array $headers): array {
        $blacklist = array_map('strtolower', self::HEADERS_BLACKLIST);
        $clean = [];
        foreach ($headers as $key => $value) {
            if (!in_array(strtolower($key), $blacklist, true)) {
                $clean[$key] = $value;
            }
        }
        // Añadir headers seguros que no estén ya presentes
        foreach (self::SAFE_HEADERS as $k => $v) {
            if (!isset($clean[$k])) {
                $clean[$k] = $v;
            }
        }
        return $clean;
    }

    // ─── CAPA 2: UA ROTATOR ────────────────────────────────────────────────────

    /**
     * Selecciona un User-Agent del pool de forma determinista por canal.
     * El mismo canal siempre usa el mismo UA en la misma hora (consistencia de sesión).
     *
     * @param string|int $channelId ID del canal activo
     * @return string User-Agent seleccionado
     */
    public static function getRotatedUA($channelId): string {
        $pool  = self::UA_POOL;
        $count = count($pool);
        // Seed: canal + hora actual (cambia cada hora para evasión temporal)
        $seed  = (int)$channelId + (int)(time() / 3600);
        $index = $seed % $count;
        return $pool[$index];
    }

    // ─── CAPA 3: PROXY-AUTH BYPASS ─────────────────────────────────────────────

    /**
     * Cuando el upstream responde 407, intenta el bypass de autenticación de proxy.
     * Estrategia: enviar Proxy-Authorization con credenciales vacías en formato
     * Basic base64('') — muchos proxies transparentes aceptan esto como "autenticado".
     *
     * @return array Headers de bypass de proxy
     */
    public static function getProxyAuthBypassHeaders(bool $useKeepalive = true): array {
        return [
            // Basic auth con credenciales vacías — bypass para proxies transparentes
            'Proxy-Authorization' => 'Basic ' . base64_encode(':'),
            // Adaptive: keep-alive default, close cuando JWT.proxy_keepalive=false
            'Proxy-Connection'    => $useKeepalive ? 'keep-alive' : 'close',
        ];
    }

    // ─── CAPA 4: FETCH CON ANTI-407 ────────────────────────────────────────────

    /**
     * Realiza una petición HTTP al upstream con protección Anti-407 completa.
     * Implementa reintentos automáticos con estrategia de evasión escalada.
     *
     * @param string     $url       URL del stream upstream
     * @param string|int $channelId ID del canal (para rotación de UA)
     * @param int        $timeout   Timeout en segundos
     * @return array ['status' => int, 'body' => string, 'headers' => array, 'attempts' => int]
     */
    public static function fetch(string $url, $channelId = 0, int $timeout = 8, int $maxRetries = 3): array {
        $attempts = 0;
        $lastStatus = 0;
        $lastBody   = '';
        $lastHeaders = [];

        // Estrategia de evasión por intento
        $strategies = [
            0 => 'clean_ua',          // Intento 1: UA rotado + headers limpios
            1 => 'proxy_auth_bypass', // Intento 2: + bypass de proxy-auth
            2 => 'minimal_headers',   // Intento 3: headers absolutamente mínimos (solo UA)
        ];

        while ($attempts < $maxRetries) {
            $strategy = $strategies[$attempts] ?? 'minimal_headers';
            $result   = self::_doFetch($url, $channelId, $timeout, $strategy);
            $lastStatus  = $result['status'];
            $lastBody    = $result['body'];
            $lastHeaders = $result['headers'];
            $attempts++;

            // Si NO es 407, salir inmediatamente
            if ($lastStatus !== 407) {
                break;
            }

            // Es 407: esperar 50ms y escalar la estrategia
            usleep(50000); // 50ms
        }

        return [
            'status'   => $lastStatus,
            'body'     => $lastBody,
            'headers'  => $lastHeaders,
            'attempts' => $attempts,
            'strategy' => $strategies[min($attempts - 1, 2)],
        ];
    }

    /**
     * Ejecuta la petición HTTP real con la estrategia especificada.
     */
    private static function _doFetch(string $url, $channelId, int $timeout, string $strategy): array {
        $ua = self::getRotatedUA($channelId);

        // Construir headers según la estrategia
        switch ($strategy) {
            case 'proxy_auth_bypass':
                $extraHeaders = array_merge(
                    self::SAFE_HEADERS,
                    self::getProxyAuthBypassHeaders()
                );
                break;
            case 'minimal_headers':
                // Solo el User-Agent, nada más
                $extraHeaders = [];
                break;
            default: // clean_ua
                $extraHeaders = self::SAFE_HEADERS;
        }

        // Construir el contexto HTTP
        $headerLines = ["User-Agent: {$ua}"];
        foreach ($extraHeaders as $k => $v) {
            $headerLines[] = "{$k}: {$v}";
        }

        $context = stream_context_create([
            'http' => [
                'method'          => 'GET',
                'header'          => implode("\r\n", $headerLines),
                'timeout'         => $timeout,
                'follow_location' => 1,   // Seguir 302 antes de que el proxy intervenga
                'max_redirects'   => 5,
                'ignore_errors'   => true, // Capturar el body incluso en 4xx/5xx
            ],
            'ssl' => [
                'verify_peer'      => false,
                'verify_peer_name' => false,
            ],
        ]);

        $body    = @file_get_contents($url, false, $context);
        $status  = 0;
        $headers = [];

        // Parsear el status code de $http_response_header
        if (isset($http_response_header) && is_array($http_response_header)) {
            $headers = $http_response_header;
            foreach ($headers as $h) {
                if (preg_match('#HTTP/\S+\s+(\d+)#', $h, $m)) {
                    $status = (int)$m[1];
                }
            }
        }

        return [
            'status'  => $status,
            'body'    => $body ?: '',
            'headers' => $headers,
        ];
    }

    // ─── CAPA 5: FALLBACK CHAIN ────────────────────────────────────────────────

    /**
     * Si el upstream sigue respondiendo 407 tras los reintentos,
     * intenta con una URL alternativa (fallback) si está disponible.
     *
     * @param array  $urls      Lista de URLs alternativas del mismo canal
     * @param string|int $channelId ID del canal
     * @return array Resultado del primer URL que no devuelva 407
     */
    public static function fetchWithFallback(array $urls, $channelId = 0): array {
        foreach ($urls as $url) {
            $result = self::fetch($url, $channelId);
            if ($result['status'] !== 407 && $result['status'] > 0) {
                $result['url_used'] = $url;
                return $result;
            }
        }
        // Todos fallaron — devolver el último resultado con flag de error
        return array_merge($result ?? ['status' => 407, 'body' => '', 'headers' => [], 'attempts' => 0, 'strategy' => 'none'], [
            'url_used'     => end($urls),
            'all_407'      => true,
        ]);
    }

    // ─── INTEGRACIÓN CON EL RESOLVER ───────────────────────────────────────────

    /**
     * Punto de entrada principal para integrar con resolve_quality_unified.php.
     * Reemplaza cualquier llamada a file_get_contents() o curl que haga el resolver
     * hacia el upstream del proveedor IPTV.
     *
     * USO EN EL RESOLVER:
     *   // Antes:
     *   $body = file_get_contents($streamUrl);
     *
     *   // Después:
     *   $result = ApeAnti407::resolverFetch($streamUrl, $channelId);
     *   $body   = $result['body'];
     *   if ($result['status'] === 407) { // manejar error residual }
     *
     * @param string     $url       URL del stream
     * @param string|int $channelId ID del canal activo
     * @return array
     */
    public static function resolverFetch(string $url, $channelId = 0, ?array $jwtPayload = null): array {
        // Limpiar la URL de headers problemáticos embebidos
        $url = self::_sanitizeUrl($url);

        // [BUILD-SEQ STEP 5] JWT proxy_retry_407 gate
        // Si JWT.proxy_retry_407 === false → fail-fast 1 intento, sin retry escalado.
        // Default true (preserva comportamiento legacy de 3 retries).
        $allowRetry = ($jwtPayload === null) ? true : ($jwtPayload['proxy_retry_407'] ?? true);
        $maxRetries = $allowRetry ? 3 : 1;

        // Ejecutar fetch con protección Anti-407 (limita retry según JWT)
        $result = self::fetch($url, $channelId, 8, $maxRetries);

        // Log silencioso en /dev/shm (no disco)
        self::_logToShm($channelId, $url, $result);

        return $result;
    }

    /**
     * Limpia la URL de parámetros que pueden activar proxies.
     */
    private static function _sanitizeUrl(string $url): string {
        // Eliminar parámetros de debug/proxy que algunos resolvers añaden
        $url = preg_replace('/[?&](debug|proxy|via|x-forwarded)=[^&]*/i', '', $url);
        // Normalizar dobles slashes en el path (excepto el protocolo)
        $url = preg_replace('#(?<!:)//+#', '/', $url);
        return $url;
    }

    /**
     * Registra el resultado en /dev/shm para telemetría sin tocar el disco.
     */
    private static function _logToShm($channelId, string $url, array $result): void {
        $logFile = '/dev/shm/ape_anti407_log.json';
        $entry = [
            'ts'       => microtime(true),
            'ch'       => $channelId,
            'status'   => $result['status'],
            'attempts' => $result['attempts'] ?? 1,
            'strategy' => $result['strategy'] ?? 'clean_ua',
            'url_hash' => substr(md5($url), 0, 8),
        ];

        // Leer log existente (máx 100 entradas)
        $log = [];
        if (file_exists($logFile)) {
            $raw = @file_get_contents($logFile);
            if ($raw) {
                $log = json_decode($raw, true) ?: [];
            }
        }
        $log[] = $entry;
        if (count($log) > 100) {
            $log = array_slice($log, -100);
        }
        @file_put_contents($logFile, json_encode($log), LOCK_EX);
    }

    // ─── DIAGNÓSTICO ───────────────────────────────────────────────────────────

    /**
     * Diagnostica si una URL específica genera 407 y con qué estrategia se resuelve.
     * Útil para testing antes de desplegar en producción.
     *
     * @param string $url URL a diagnosticar
     * @return void (imprime resultado)
     */
    public static function diagnose(string $url): void {
        echo "=== APE Anti-407 Diagnóstico ===\n";
        echo "URL: {$url}\n\n";

        foreach (['clean_ua', 'proxy_auth_bypass', 'minimal_headers'] as $strategy) {
            $result = self::_doFetch($url, 0, 5, $strategy);
            $icon   = $result['status'] === 407 ? '✗ 407' : "✓ {$result['status']}";
            echo "  [{$icon}] Estrategia: {$strategy}\n";
            if ($result['status'] !== 407) {
                echo "         → RESUELTO con esta estrategia\n";
                break;
            }
        }
        echo "\n";
    }
}

// ─── INTEGRACIÓN AUTOMÁTICA CON EL RESOLVER ────────────────────────────────────
// Si este archivo se incluye desde resolve_quality_unified.php,
// parchea automáticamente la función rq_fetch si existe.

if (function_exists('rq_fetch') && !function_exists('rq_fetch_original')) {
    // El resolver ya tiene su propia función rq_fetch — la envolvemos
    // Nota: En PHP no se puede redefinir funciones directamente.
    // El resolver debe llamar a ApeAnti407::resolverFetch() explícitamente.
    // Ver la guía de integración en APE_ANTI407_INTEGRACION.md
}
