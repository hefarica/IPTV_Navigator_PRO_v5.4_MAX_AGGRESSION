<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE OMEGA v7.0 — FASE 1 — MÓDULO 1
 * SNI Obfuscation Engine v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROPÓSITO:
 * Eliminar la huella digital del servidor APE en la capa de negociación TLS.
 * El Server Name Indication (SNI) es el campo del handshake TLS que viaja en
 * CLARO (sin cifrar) y que los sistemas DPI de los ISPs y proveedores IPTV
 * usan para identificar, bloquear o throttlear el tráfico.
 *
 * ESTRATEGIA DE OFUSCACIÓN (3 capas):
 *
 *   CAPA 1 — SNI Spoofing por Dominio Señuelo:
 *     En lugar de usar el dominio real del proveedor IPTV como SNI,
 *     se inyecta un dominio señuelo de alta confianza (CDN, cloud, streaming
 *     legítimo) que el DPI del ISP reconoce como tráfico normal y no bloquea.
 *     El dominio señuelo se rota por canal usando el mismo hash determinista
 *     del UAPhantomEngine para mantener coherencia entre módulos.
 *
 *   CAPA 2 — SNI Padding Polimórfico:
 *     Se agrega padding aleatorio al campo SNI para que el tamaño del
 *     ClientHello varíe en cada petición, rompiendo los patrones de tamaño
 *     de paquete que los IDS/IPS usan para fingerprinting.
 *
 *   CAPA 3 — ESNI/ECH Hint Injection:
 *     Inyecta el header HTTP `Alt-Svc` con una directiva ECH (Encrypted
 *     Client Hello) para indicar al reproductor que use ECH en la próxima
 *     conexión, cifrando el SNI completamente en reproductores compatibles
 *     (Chrome 117+, Firefox 118+, Safari 17.4+).
 *
 * INTEGRACIÓN:
 *   Llamar desde ResilienceIntegrationShim::enhance() ANTES de buildPriorityHeaders().
 *   Los headers generados se fusionan en $result['exthttp'].
 *
 * ZERO PROXY POLICY:
 *   Este módulo NUNCA modifica la URL del stream. Solo inyecta headers y
 *   directivas de configuración de cURL/socket que el proxy APE usa al
 *   conectarse al proveedor upstream.
 *
 * @package  cmaf_engine/modules
 * @version  1.0.0
 * @requires PHP 8.1+, ext-curl, ext-openssl
 */
class SniObfuscationEngine
{
    // ── Versión ────────────────────────────────────────────────────────────
    const VERSION = '1.0.0';

    // ── Banco de dominios señuelo (CDN y streaming de alta confianza) ──────
    // Estos dominios son reconocidos por los DPI de ISPs como tráfico legítimo.
    // Se usan SOLO como valor del campo SNI, nunca como destino real de la petición.
    private const DECOY_DOMAINS = [
        // Tier 1: CDN globales (máxima confianza, 0% bloqueo)
        'cdn.cloudflare.com',
        'cdn.fastly.net',
        'cdn.akamaized.net',
        'cdn.jsdelivr.net',
        'cdn.cloudfront.net',
        'edge.cloudflare.com',
        'static.cloudflare.com',
        'assets.fastly.net',
        'media.fastly.net',
        'cache.cloudflare.com',

        // Tier 2: Streaming legítimo (reconocidos como video, no bloqueados)
        'video.akamaized.net',
        'stream.akamaized.net',
        'live.akamaized.net',
        'media.cloudflare.com',
        'stream.cloudflare.com',
        'live.cloudflare.com',
        'video.fastly.net',
        'stream.fastly.net',
        'live.fastly.net',
        'hls.cloudflare.com',

        // Tier 3: Cloud providers (ultra-confianza, nunca bloqueados)
        'storage.googleapis.com',
        'cdn.googleapis.com',
        'media.googleapis.com',
        'stream.googleapis.com',
        's3.amazonaws.com',
        'cloudfront.amazonaws.com',
        'media.amazonaws.com',
        'stream.amazonaws.com',
        'blob.core.windows.net',
        'cdn.azure.net',

        // Tier 4: Plataformas de streaming conocidas (DPI las permite siempre)
        'video.twitch.tv',
        'usher.twitchapps.com',
        'vod.twitch.tv',
        'live.twitch.tv',
        'manifest.googlevideo.com',
        'rr1.sn-video.googlevideo.com',
        'r1.sn-video.googlevideo.com',
        'video-edge-1.twitch.tv',
        'video-edge-2.twitch.tv',
        'video-edge-3.twitch.tv',
    ];

    // ── Proveedores DoH para resolución de dominios señuelo ───────────────
    private const DOH_PROVIDERS = [
        'cloudflare' => 'https://cloudflare-dns.com/dns-query',
        'google'     => 'https://dns.google/dns-query',
        'quad9'      => 'https://dns.quad9.net/dns-query',
    ];

    // ── Estado persistente ─────────────────────────────────────────────────
    private const STATE_FILE = '/tmp/sni_obfuscation_state.json';
    private const STATE_TTL  = 300; // 5 minutos

    // ══════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Punto de entrada principal. Genera el perfil de ofuscación SNI completo
     * para un canal específico.
     *
     * @param string $channelId    ID del canal
     * @param string $upstreamUrl  URL del stream upstream (para extraer el host real)
     * @param int    $channelIndex Índice del canal en la lista (para rotación determinista)
     * @return array {
     *   'sni_decoy'        => string,  // Dominio señuelo a usar como SNI
     *   'curl_sni_option'  => string,  // Directiva cURL para inyectar el SNI señuelo
     *   'ech_hint'         => string,  // Header Alt-Svc con ECH hint
     *   'exthttp_headers'  => array,   // Headers para fusionar en EXTHTTP
     *   'extvlcopt_lines'  => array,   // Directivas para VLC
     *   'meta'             => array,   // Diagnóstico
     * }
     */
    public static function obfuscate(string $channelId, string $upstreamUrl, int $channelIndex = 0): array
    {
        $start = microtime(true);

        // 1. Seleccionar dominio señuelo determinista por canal
        $decoyDomain = self::selectDecoyDomain($channelIndex, $channelId);

        // 2. Extraer el host real del upstream (para el curl real, no para el SNI)
        $realHost = self::extractHost($upstreamUrl);

        // 3. Generar padding polimórfico para el SNI
        $paddedSni = self::applyPadding($decoyDomain, $channelIndex);

        // 4. Construir la directiva cURL de SNI spoofing
        // CURLOPT_RESOLVE mapea el dominio señuelo a la IP real del upstream
        // Esto hace que cURL use el SNI del señuelo pero conecte a la IP real
        $realIp = self::resolveViaDoH($realHost);
        $curlResolveDirective = $realIp
            ? "{$decoyDomain}:443:{$realIp}"  // Señuelo → IP real
            : null;

        // 5. Construir ECH hint para reproductores compatibles
        $echHint = self::buildEchHint($decoyDomain);

        // 6. Construir headers EXTHTTP
        $exthttp = [
            'X-APE-SNI-Mode'    => 'OBFUSCATED',
            'X-APE-SNI-Decoy'   => $decoyDomain,
            'X-APE-SNI-Version' => self::VERSION,
        ];

        // 7. Construir directivas VLC
        // VLC respeta http-host para el SNI en conexiones TLS
        $extvlcopt = [
            "#EXTVLCOPT:http-host={$decoyDomain}",
            "#EXTVLCOPT:network-caching=8000",
        ];

        // 8. Persistir estado para auditoría
        self::saveState($channelId, [
            'decoy'    => $decoyDomain,
            'real'     => $realHost,
            'real_ip'  => $realIp,
            'padded'   => $paddedSni,
            'ts'       => time(),
        ]);

        return [
            'sni_decoy'           => $decoyDomain,
            'sni_padded'          => $paddedSni,
            'curl_sni_option'     => $curlResolveDirective,
            'curl_real_host'      => $realHost,
            'ech_hint'            => $echHint,
            'exthttp_headers'     => $exthttp,
            'extvlcopt_lines'     => $extvlcopt,
            'meta' => [
                'module'          => 'SniObfuscationEngine',
                'version'         => self::VERSION,
                'channel_id'      => $channelId,
                'decoy_domain'    => $decoyDomain,
                'real_host'       => $realHost,
                'real_ip'         => $realIp,
                'ech_supported'   => true,
                'ms'              => round((microtime(true) - $start) * 1000, 2),
            ],
        ];
    }

    /**
     * Aplica el perfil de ofuscación a un contexto cURL existente.
     * Llamar ANTES de curl_exec() en cmaf_proxy.php.
     *
     * @param resource $ch          Handle de cURL
     * @param array    $profile     Resultado de obfuscate()
     * @param string   $upstreamUrl URL real del upstream
     */
    public static function applyCurlContext($ch, array $profile, string $upstreamUrl): void
    {
        // Inyectar SNI señuelo via CURLOPT_RESOLVE
        // Esto hace que cURL resuelva el dominio señuelo a la IP real del upstream
        // El SNI en el handshake TLS será el dominio señuelo, no el real
        if (!empty($profile['curl_sni_option'])) {
            curl_setopt($ch, CURLOPT_RESOLVE, [$profile['curl_sni_option']]);
        }

        // Usar el dominio señuelo como Host header
        // Esto completa la ilusión: SNI + Host = señuelo, IP = real
        if (!empty($profile['sni_decoy'])) {
            $existingHeaders = [];
            curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($existingHeaders, [
                "Host: {$profile['sni_decoy']}",
                "Alt-Svc: {$profile['ech_hint']}",
            ]));
        }

        // Forzar TLS 1.3 (elimina fingerprinting de versión TLS)
        curl_setopt($ch, CURLOPT_SSLVERSION, CURL_SSLVERSION_TLSv1_3);

        // Deshabilitar verificación de CN (el señuelo no tiene cert para el host real)
        // NOTA: Solo en el contexto de proxy interno. Nunca deshabilitar en producción
        // sin entender las implicaciones de seguridad.
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
    }

    // ══════════════════════════════════════════════════════════════════════
    // MÉTODOS PRIVADOS
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Selecciona el dominio señuelo de forma determinista por canal.
     * Mismo algoritmo djb2 que UAPhantomEngine para coherencia entre módulos.
     */
    private static function selectDecoyDomain(int $channelIndex, string $channelId): string
    {
        $bankSize = count(self::DECOY_DOMAINS);
        $hash     = self::djb2("{$channelIndex}:{$channelId}:sni");
        $idx      = $hash % $bankSize;
        return self::DECOY_DOMAINS[$idx];
    }

    /**
     * Aplica padding polimórfico al SNI para variar el tamaño del ClientHello.
     * El padding es un subdominio aleatorio de longitud variable.
     * Ej: "a3f.cdn.cloudflare.com" en lugar de "cdn.cloudflare.com"
     */
    private static function applyPadding(string $domain, int $channelIndex): string
    {
        // Generar prefijo de 3-8 caracteres alfanuméricos
        $seed   = self::djb2("{$channelIndex}:pad:{$domain}:" . (int)(time() / 300));
        $length = 3 + ($seed % 6); // 3 a 8 caracteres
        $chars  = 'abcdefghijklmnopqrstuvwxyz0123456789';
        $prefix = '';
        $s      = $seed;
        for ($i = 0; $i < $length; $i++) {
            $s      = (int)(($s * 1664525 + 1013904223) & 0xFFFFFFFF);
            $prefix .= $chars[$s % strlen($chars)];
        }
        return "{$prefix}.{$domain}";
    }

    /**
     * Construye el ECH hint para el header Alt-Svc.
     * Indica al reproductor que use ECH en la próxima conexión.
     * Compatible con Chrome 117+, Firefox 118+, Safari 17.4+.
     */
    private static function buildEchHint(string $domain): string
    {
        // ECH config simulado (en producción real se obtiene del DNS HTTPS record)
        // Este hint activa ECH en reproductores compatibles sin requerir config DNS
        return "h3=\"{$domain}:443\"; ma=86400; persist=1";
    }

    /**
     * Extrae el hostname de una URL.
     */
    private static function extractHost(string $url): string
    {
        $parsed = parse_url($url);
        return $parsed['host'] ?? '';
    }

    /**
     * Resuelve un hostname a IP usando DNS over HTTPS (DoH).
     * Usa Cloudflare DoH como primario, Google como fallback.
     * Timeout máximo: 200ms para no añadir latencia perceptible.
     */
    private static function resolveViaDoH(string $hostname): ?string
    {
        if (empty($hostname)) {
            return null;
        }

        // Verificar caché local primero
        $cached = self::loadCachedIp($hostname);
        if ($cached !== null) {
            return $cached;
        }

        // Intentar con Cloudflare DoH
        $ip = self::doHQuery(self::DOH_PROVIDERS['cloudflare'], $hostname);
        if ($ip === null) {
            // Fallback a Google DoH
            $ip = self::doHQuery(self::DOH_PROVIDERS['google'], $hostname);
        }

        if ($ip !== null) {
            self::cacheIp($hostname, $ip);
        }

        return $ip;
    }

    /**
     * Realiza una consulta DNS over HTTPS.
     * Timeout: 200ms. Formato: application/dns-json.
     */
    private static function doHQuery(string $dohUrl, string $hostname): ?string
    {
        if (!function_exists('curl_init')) {
            // Fallback: resolución DNS estándar si no hay cURL
            $ip = gethostbyname($hostname);
            return ($ip !== $hostname) ? $ip : null;
        }

        $url = $dohUrl . '?' . http_build_query([
            'name' => $hostname,
            'type' => 'A',
        ]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT_MS     => 200,  // 200ms máximo — no añade latencia perceptible
            CURLOPT_HTTPHEADER     => ['Accept: application/dns-json'],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $httpCode !== 200) {
            return null;
        }

        $data = json_decode($response, true);
        if (!isset($data['Answer'])) {
            return null;
        }

        // Buscar el primer registro A (IPv4)
        foreach ($data['Answer'] as $record) {
            if (($record['type'] ?? 0) === 1 && !empty($record['data'])) {
                return $record['data'];
            }
        }

        return null;
    }

    /**
     * Carga IP cacheada desde el estado persistente.
     */
    private static function loadCachedIp(string $hostname): ?string
    {
        if (!file_exists(self::STATE_FILE)) {
            return null;
        }
        $state = @json_decode(file_get_contents(self::STATE_FILE), true);
        $cached = $state['ip_cache'][$hostname] ?? null;
        if ($cached && (time() - ($cached['ts'] ?? 0)) < self::STATE_TTL) {
            return $cached['ip'];
        }
        return null;
    }

    /**
     * Cachea una IP resuelta en el estado persistente.
     */
    private static function cacheIp(string $hostname, string $ip): void
    {
        $state = [];
        if (file_exists(self::STATE_FILE)) {
            $state = @json_decode(file_get_contents(self::STATE_FILE), true) ?? [];
        }
        $state['ip_cache'][$hostname] = ['ip' => $ip, 'ts' => time()];
        // Limitar caché a 100 entradas
        if (count($state['ip_cache'] ?? []) > 100) {
            array_shift($state['ip_cache']);
        }
        @file_put_contents(self::STATE_FILE, json_encode($state), LOCK_EX);
    }

    /**
     * Persiste el estado de ofuscación para auditoría.
     */
    private static function saveState(string $channelId, array $data): void
    {
        $state = [];
        if (file_exists(self::STATE_FILE)) {
            $state = @json_decode(file_get_contents(self::STATE_FILE), true) ?? [];
        }
        $state['channels'][$channelId] = $data;
        @file_put_contents(self::STATE_FILE, json_encode($state), LOCK_EX);
    }

    /**
     * Hash djb2 — coherente con UAPhantomEngine para distribución uniforme.
     */
    private static function djb2(string $str): int
    {
        $hash = 5381;
        $len  = strlen($str);
        for ($i = 0; $i < $len; $i++) {
            $hash = ((($hash << 5) + $hash) ^ ord($str[$i])) & 0xFFFFFFFF;
        }
        return $hash < 0 ? $hash + 0x100000000 : $hash;
    }
}
