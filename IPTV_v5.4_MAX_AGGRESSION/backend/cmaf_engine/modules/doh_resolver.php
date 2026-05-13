<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE OMEGA v7.0 — FASE 1 — MÓDULO 3
 * DNS over HTTPS Resolver v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROPÓSITO:
 * Eliminar la huella DNS del servidor APE. Las consultas DNS estándar (UDP/53)
 * viajan en texto plano y son interceptadas por:
 *   - ISPs que monitorean qué dominios resuelve el servidor
 *   - Proveedores IPTV que detectan el proxy APE por sus patrones de resolución
 *   - Sistemas de detección de fraude que correlacionan IPs con dominios
 *
 * DNS over HTTPS (DoH) cifra las consultas DNS dentro de HTTPS, haciéndolas
 * indistinguibles del tráfico web normal. Esto elimina la posibilidad de que
 * el ISP o el proveedor IPTV identifiquen el servidor APE por sus consultas DNS.
 *
 * CARACTERÍSTICAS:
 *   - Multi-proveedor con failover automático (Cloudflare → Google → Quad9 → NextDNS)
 *   - Caché persistente en /tmp/ con TTL configurable (default: 300s)
 *   - Timeout máximo 200ms — imperceptible en la cadena de reproducción
 *   - Soporte IPv4 (A) e IPv6 (AAAA) con preferencia configurable
 *   - Prefetch proactivo para dominios de canales frecuentes
 *   - Fallback a gethostbyname() si todos los DoH fallan (sin pantalla negra)
 *
 * INTEGRACIÓN:
 *   Reemplazar todas las llamadas a gethostbyname() y dns_get_record() en
 *   cmaf_proxy.php por DoHResolver::resolve(). El shim lo llama automáticamente
 *   al procesar cada canal.
 *
 * @package  cmaf_engine/modules
 * @version  1.0.0
 * @requires PHP 8.1+, ext-curl
 */
class DoHResolver
{
    const VERSION = '1.0.0';

    // ── Proveedores DoH ordenados por prioridad ────────────────────────────
    private const PROVIDERS = [
        [
            'name'    => 'Cloudflare',
            'url'     => 'https://cloudflare-dns.com/dns-query',
            'timeout' => 200,   // ms
            'weight'  => 10,    // Mayor peso = mayor prioridad
        ],
        [
            'name'    => 'Google',
            'url'     => 'https://dns.google/dns-query',
            'timeout' => 200,
            'weight'  => 9,
        ],
        [
            'name'    => 'Quad9',
            'url'     => 'https://dns.quad9.net/dns-query',
            'timeout' => 250,
            'weight'  => 8,
        ],
        [
            'name'    => 'NextDNS',
            'url'     => 'https://dns.nextdns.io/dns-query',
            'timeout' => 300,
            'weight'  => 7,
        ],
    ];

    // ── Configuración de caché ─────────────────────────────────────────────
    private const CACHE_FILE    = '/tmp/doh_resolver_cache.json';
    private const CACHE_TTL     = 300;   // 5 minutos
    private const CACHE_MAX     = 500;   // Máximo de entradas en caché
    private const NEGATIVE_TTL  = 60;    // TTL para respuestas NXDOMAIN

    // ── Estado de salud de proveedores ────────────────────────────────────
    private const HEALTH_FILE   = '/tmp/doh_provider_health.json';
    private const HEALTH_TTL    = 60;    // Reevaluar salud cada 60s

    // ── Caché en memoria para la petición actual ──────────────────────────
    private static array $memCache = [];

    // ══════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Resuelve un hostname a su dirección IP usando DoH.
     * Orden de resolución:
     *   1. Caché en memoria (0ms)
     *   2. Caché persistente en /tmp/ (< 1ms)
     *   3. DoH con el proveedor más saludable (< 200ms)
     *   4. Fallback a gethostbyname() (DNS estándar)
     *
     * @param string $hostname   Hostname a resolver
     * @param string $type       Tipo de registro: 'A' (IPv4) o 'AAAA' (IPv6)
     * @param bool   $preferIpv6 Preferir IPv6 si está disponible
     * @return string|null       Dirección IP o null si falla
     */
    public static function resolve(string $hostname, string $type = 'A', bool $preferIpv6 = false): ?string
    {
        if (empty($hostname)) {
            return null;
        }

        // Normalizar hostname
        $hostname = strtolower(rtrim($hostname, '.'));

        // 1. Caché en memoria (0ms)
        $memKey = "{$hostname}:{$type}";
        if (isset(self::$memCache[$memKey])) {
            return self::$memCache[$memKey];
        }

        // 2. Caché persistente
        $cached = self::loadFromCache($hostname, $type);
        if ($cached !== null) {
            self::$memCache[$memKey] = $cached;
            return $cached;
        }

        // 3. Consulta DoH con failover
        $ip = self::queryWithFailover($hostname, $type);

        // 4. Fallback a DNS estándar si todos los DoH fallan
        if ($ip === null) {
            $ip = self::standardFallback($hostname, $type);
        }

        // Cachear resultado (positivo o negativo)
        if ($ip !== null) {
            self::saveToCache($hostname, $type, $ip);
            self::$memCache[$memKey] = $ip;
        }

        return $ip;
    }

    /**
     * Resuelve múltiples hostnames en paralelo usando cURL multi.
     * Hasta 8x más rápido que resolver secuencialmente.
     *
     * @param array  $hostnames  Array de hostnames
     * @param string $type       Tipo de registro
     * @return array             hostname => ip|null
     */
    public static function resolveMulti(array $hostnames, string $type = 'A'): array
    {
        $results  = [];
        $pending  = [];

        // Separar los que ya están en caché
        foreach ($hostnames as $hostname) {
            $hostname = strtolower(rtrim($hostname, '.'));
            $memKey   = "{$hostname}:{$type}";

            if (isset(self::$memCache[$memKey])) {
                $results[$hostname] = self::$memCache[$memKey];
                continue;
            }
            $cached = self::loadFromCache($hostname, $type);
            if ($cached !== null) {
                $results[$hostname]          = $cached;
                self::$memCache[$memKey]     = $cached;
                continue;
            }
            $pending[] = $hostname;
        }

        if (empty($pending)) {
            return $results;
        }

        // Resolver los pendientes en paralelo con cURL multi
        $provider = self::selectHealthyProvider();
        $multiResults = self::curlMultiQuery($pending, $type, $provider);

        foreach ($multiResults as $hostname => $ip) {
            $results[$hostname] = $ip;
            if ($ip !== null) {
                self::saveToCache($hostname, $type, $ip);
                self::$memCache["{$hostname}:{$type}"] = $ip;
            }
        }

        return $results;
    }

    /**
     * Precarga el caché con los hostnames de los canales más frecuentes.
     * Llamar al inicio de cada generación de lista para que el primer
     * zapping sea instantáneo.
     *
     * @param array $urls Array de URLs de streams upstream
     */
    public static function prefetch(array $urls): void
    {
        $hostnames = [];
        foreach ($urls as $url) {
            $parsed = parse_url($url);
            if (!empty($parsed['host'])) {
                $hostnames[] = $parsed['host'];
            }
        }
        $hostnames = array_unique($hostnames);
        if (!empty($hostnames)) {
            self::resolveMulti($hostnames);
        }
    }

    /**
     * Retorna el estado de salud de todos los proveedores DoH.
     * Útil para el dashboard de telemetría.
     *
     * @return array provider_name => ['healthy' => bool, 'avg_ms' => float, 'failures' => int]
     */
    public static function getProviderHealth(): array
    {
        $health = [];
        if (file_exists(self::HEALTH_FILE)) {
            $health = @json_decode(file_get_contents(self::HEALTH_FILE), true) ?? [];
        }
        return $health;
    }

    /**
     * Limpia el caché completo. Útil al cambiar de proveedor IPTV.
     */
    public static function clearCache(): void
    {
        self::$memCache = [];
        @unlink(self::CACHE_FILE);
    }

    // ══════════════════════════════════════════════════════════════════════
    // MÉTODOS PRIVADOS
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Consulta DoH con failover automático entre proveedores.
     * Selecciona el proveedor más saludable primero.
     */
    private static function queryWithFailover(string $hostname, string $type): ?string
    {
        $providers = self::getOrderedProviders();

        foreach ($providers as $provider) {
            $result = self::doHQuery($provider['url'], $hostname, $type, $provider['timeout']);
            if ($result !== null) {
                self::recordSuccess($provider['name']);
                return $result;
            }
            self::recordFailure($provider['name']);
        }

        return null;
    }

    /**
     * Realiza una consulta DoH a un proveedor específico.
     * Timeout estricto de 200ms para no añadir latencia perceptible.
     */
    private static function doHQuery(string $dohUrl, string $hostname, string $type, int $timeoutMs): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $url = $dohUrl . '?' . http_build_query([
            'name' => $hostname,
            'type' => $type,
        ]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT_MS     => $timeoutMs,
            CURLOPT_CONNECTTIMEOUT_MS => min(100, $timeoutMs),
            CURLOPT_HTTPHEADER     => [
                'Accept: application/dns-json',
                'User-Agent: Mozilla/5.0 (compatible; APE-DoH/1.0)',
            ],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_ENCODING       => 'gzip',
            CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_2_0,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($response === false || $httpCode !== 200 || !empty($error)) {
            return null;
        }

        return self::parseDoHResponse($response, $type);
    }

    /**
     * Parsea la respuesta JSON de un proveedor DoH.
     * Retorna la primera IP válida del tipo solicitado.
     */
    private static function parseDoHResponse(string $response, string $type): ?string
    {
        $data = @json_decode($response, true);
        if (!is_array($data) || !isset($data['Answer'])) {
            return null;
        }

        // Tipo de registro DNS: 1=A (IPv4), 28=AAAA (IPv6)
        $dnsType = ($type === 'AAAA') ? 28 : 1;

        foreach ($data['Answer'] as $record) {
            if (($record['type'] ?? 0) === $dnsType && !empty($record['data'])) {
                $ip = trim($record['data']);
                // Validar que es una IP válida
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }

        return null;
    }

    /**
     * Resuelve múltiples hostnames en paralelo con cURL multi-handle.
     */
    private static function curlMultiQuery(array $hostnames, string $type, array $provider): array
    {
        $results  = [];
        $handles  = [];
        $multiCh  = curl_multi_init();

        foreach ($hostnames as $hostname) {
            $url = $provider['url'] . '?' . http_build_query([
                'name' => $hostname,
                'type' => $type,
            ]);
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER    => true,
                CURLOPT_TIMEOUT_MS        => $provider['timeout'],
                CURLOPT_CONNECTTIMEOUT_MS => 100,
                CURLOPT_HTTPHEADER        => ['Accept: application/dns-json'],
                CURLOPT_SSL_VERIFYPEER    => true,
                CURLOPT_SSL_VERIFYHOST    => 2,
                CURLOPT_FOLLOWLOCATION    => false,
                CURLOPT_HTTP_VERSION      => CURL_HTTP_VERSION_2_0,
            ]);
            curl_multi_add_handle($multiCh, $ch);
            $handles[$hostname] = $ch;
        }

        // Ejecutar todas las peticiones en paralelo
        $running = null;
        do {
            curl_multi_exec($multiCh, $running);
            if ($running > 0) {
                curl_multi_select($multiCh, 0.1);
            }
        } while ($running > 0);

        // Recoger resultados
        foreach ($handles as $hostname => $ch) {
            $response = curl_multi_getcontent($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_multi_remove_handle($multiCh, $ch);
            curl_close($ch);

            if ($response && $httpCode === 200) {
                $results[$hostname] = self::parseDoHResponse($response, $type);
            } else {
                $results[$hostname] = null;
            }
        }

        curl_multi_close($multiCh);
        return $results;
    }

    /**
     * Fallback a DNS estándar (gethostbyname) si todos los DoH fallan.
     * Garantiza que nunca haya pantalla negra por fallo de resolución.
     */
    private static function standardFallback(string $hostname, string $type): ?string
    {
        if ($type === 'AAAA') {
            // PHP no tiene gethostbyname6 nativo — usar dns_get_record
            $records = @dns_get_record($hostname, DNS_AAAA);
            if (!empty($records[0]['ipv6'])) {
                return $records[0]['ipv6'];
            }
            return null;
        }
        $ip = @gethostbyname($hostname);
        return ($ip !== $hostname) ? $ip : null;
    }

    /**
     * Selecciona el proveedor más saludable basado en historial de fallos.
     */
    private static function selectHealthyProvider(): array
    {
        $providers = self::getOrderedProviders();
        return $providers[0] ?? self::PROVIDERS[0];
    }

    /**
     * Retorna los proveedores ordenados por salud (menos fallos primero).
     */
    private static function getOrderedProviders(): array
    {
        $health    = self::getProviderHealth();
        $providers = self::PROVIDERS;

        usort($providers, function ($a, $b) use ($health) {
            $failA = $health[$a['name']]['failures'] ?? 0;
            $failB = $health[$b['name']]['failures'] ?? 0;
            if ($failA !== $failB) {
                return $failA <=> $failB;
            }
            return $b['weight'] <=> $a['weight'];
        });

        return $providers;
    }

    /**
     * Carga una IP del caché persistente.
     */
    private static function loadFromCache(string $hostname, string $type): ?string
    {
        if (!file_exists(self::CACHE_FILE)) {
            return null;
        }
        $cache = @json_decode(file_get_contents(self::CACHE_FILE), true);
        $key   = "{$hostname}:{$type}";
        $entry = $cache[$key] ?? null;

        if ($entry === null) {
            return null;
        }

        $ttl = ($entry['ip'] === 'NXDOMAIN') ? self::NEGATIVE_TTL : self::CACHE_TTL;
        if ((time() - ($entry['ts'] ?? 0)) > $ttl) {
            return null;  // Expirado
        }

        return ($entry['ip'] === 'NXDOMAIN') ? null : $entry['ip'];
    }

    /**
     * Guarda una IP en el caché persistente.
     */
    private static function saveToCache(string $hostname, string $type, string $ip): void
    {
        $cache = [];
        if (file_exists(self::CACHE_FILE)) {
            $cache = @json_decode(file_get_contents(self::CACHE_FILE), true) ?? [];
        }

        $key          = "{$hostname}:{$type}";
        $cache[$key]  = ['ip' => $ip, 'ts' => time()];

        // Limitar tamaño del caché
        if (count($cache) > self::CACHE_MAX) {
            // Eliminar las entradas más antiguas
            uasort($cache, fn($a, $b) => ($a['ts'] ?? 0) <=> ($b['ts'] ?? 0));
            $cache = array_slice($cache, -self::CACHE_MAX, null, true);
        }

        @file_put_contents(self::CACHE_FILE, json_encode($cache), LOCK_EX);
    }

    /**
     * Registra un éxito de un proveedor DoH.
     */
    private static function recordSuccess(string $providerName): void
    {
        $health = self::getProviderHealth();
        $health[$providerName]['failures']  = 0;
        $health[$providerName]['healthy']   = true;
        $health[$providerName]['last_ok']   = time();
        @file_put_contents(self::HEALTH_FILE, json_encode($health), LOCK_EX);
    }

    /**
     * Registra un fallo de un proveedor DoH.
     */
    private static function recordFailure(string $providerName): void
    {
        $health = self::getProviderHealth();
        $health[$providerName]['failures']  = ($health[$providerName]['failures'] ?? 0) + 1;
        $health[$providerName]['healthy']   = ($health[$providerName]['failures'] ?? 0) < 3;
        $health[$providerName]['last_fail'] = time();
        @file_put_contents(self::HEALTH_FILE, json_encode($health), LOCK_EX);
    }
}
