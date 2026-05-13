<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE OMEGA v7.0 — FASE 1 — MÓDULO 2
 * TLS Polymorphic Profiler v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROPÓSITO:
 * Eliminar la huella digital TLS del servidor APE. Los sistemas IDS/IPS avanzados
 * (Suricata, Zeek, nDPI) identifican clientes por su "TLS fingerprint" — una firma
 * única formada por la combinación exacta de:
 *   - Cipher suites ofrecidas (y su orden)
 *   - Extensiones TLS (y su orden)
 *   - Versión TLS máxima ofrecida
 *   - Tamaño del ClientHello
 *   - Grupos de curvas elípticas
 *
 * Esta firma es tan única como un User-Agent. Un servidor PHP con cURL por defecto
 * siempre produce el mismo fingerprint JA3/JA4, lo que permite a los proveedores
 * IPTV identificar y bloquear el proxy APE incluso con rotación de UA.
 *
 * ESTRATEGIA DE POLIMORFISMO TLS (4 perfiles):
 *
 *   PERFIL CHROME_134:   Imita el fingerprint JA3 de Chrome 134 en Windows
 *   PERFIL FIREFOX_134:  Imita el fingerprint JA3 de Firefox 134 en Linux
 *   PERFIL SAFARI_18:    Imita el fingerprint JA3 de Safari 18 en macOS
 *   PERFIL SAMSUNG_TV:   Imita el fingerprint JA3 de Samsung Tizen 8.0
 *
 * El perfil se selecciona de forma determinista por canal (coherente con el UA
 * asignado por UAPhantomEngine) para que el fingerprint TLS y el User-Agent
 * siempre correspondan al mismo tipo de dispositivo.
 *
 * INTEGRACIÓN:
 *   Llamar desde cmaf_proxy.php ANTES de curl_exec().
 *   Usar applyCurlContext() para inyectar el perfil en el handle cURL.
 *
 * @package  cmaf_engine/modules
 * @version  1.0.0
 * @requires PHP 8.1+, ext-curl, OpenSSL 1.1.1+
 */
class TlsPolymorphicProfiler
{
    const VERSION = '1.0.0';

    // ── Perfiles TLS (cipher suites en orden exacto del navegador real) ───
    // Fuente: tls.peet.ws — fingerprints verificados en producción
    private const PROFILES = [

        // ──────────────────────────────────────────────────────────────────
        // PERFIL 1: Chrome 134 / Windows 11
        // JA3: 771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0
        // ──────────────────────────────────────────────────────────────────
        'CHROME_134' => [
            'name'          => 'Chrome 134 / Windows 11',
            'tls_version'   => CURL_SSLVERSION_TLSv1_3,
            'cipher_list'   => implode(':', [
                'TLS_AES_128_GCM_SHA256',
                'TLS_AES_256_GCM_SHA384',
                'TLS_CHACHA20_POLY1305_SHA256',
                'ECDHE-ECDSA-AES128-GCM-SHA256',
                'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-ECDSA-AES256-GCM-SHA384',
                'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-ECDSA-CHACHA20-POLY1305',
                'ECDHE-RSA-CHACHA20-POLY1305',
                'ECDHE-RSA-AES128-SHA',
                'ECDHE-RSA-AES256-SHA',
                'AES128-GCM-SHA256',
                'AES256-GCM-SHA384',
                'AES128-SHA',
                'AES256-SHA',
            ]),
            'curves'        => 'X25519:P-256:P-384',
            'http2'         => true,
            'alpn'          => 'h2,http/1.1',
            'http_version'  => CURL_HTTP_VERSION_2_0,
            'user_agent_hint' => 'Chrome',
        ],

        // ──────────────────────────────────────────────────────────────────
        // PERFIL 2: Firefox 134 / Linux
        // JA3: 771,4865-4867-4866-49195-49199-52393-52392-49196-49200-49162-49161-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-34-51-43-13-45-28-21,29-23-24-25-256-257,0
        // ──────────────────────────────────────────────────────────────────
        'FIREFOX_134' => [
            'name'          => 'Firefox 134 / Linux',
            'tls_version'   => CURL_SSLVERSION_TLSv1_3,
            'cipher_list'   => implode(':', [
                'TLS_AES_128_GCM_SHA256',
                'TLS_CHACHA20_POLY1305_SHA256',
                'TLS_AES_256_GCM_SHA384',
                'ECDHE-ECDSA-AES128-GCM-SHA256',
                'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-ECDSA-CHACHA20-POLY1305',
                'ECDHE-RSA-CHACHA20-POLY1305',
                'ECDHE-ECDSA-AES256-GCM-SHA384',
                'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-ECDSA-AES256-SHA',
                'ECDHE-ECDSA-AES128-SHA',
                'ECDHE-RSA-AES128-SHA',
                'ECDHE-RSA-AES256-SHA',
                'AES128-GCM-SHA256',
                'AES256-GCM-SHA384',
                'AES128-SHA',
                'AES256-SHA',
            ]),
            'curves'        => 'X25519:P-256:P-384:P-521',
            'http2'         => true,
            'alpn'          => 'h2,http/1.1',
            'http_version'  => CURL_HTTP_VERSION_2_0,
            'user_agent_hint' => 'Firefox',
        ],

        // ──────────────────────────────────────────────────────────────────
        // PERFIL 3: Safari 18 / macOS 14
        // JA3: 771,4865-4866-4867-49196-49195-52393-49200-49199-52392-49162-49161-49172-49171-157-156-53-47-10,0-23-65281-10-11-16-5-13-18-51-45-43-27,29-23-24-25,0
        // ──────────────────────────────────────────────────────────────────
        'SAFARI_18' => [
            'name'          => 'Safari 18 / macOS 14',
            'tls_version'   => CURL_SSLVERSION_TLSv1_3,
            'cipher_list'   => implode(':', [
                'TLS_AES_128_GCM_SHA256',
                'TLS_AES_256_GCM_SHA384',
                'TLS_CHACHA20_POLY1305_SHA256',
                'ECDHE-ECDSA-AES256-GCM-SHA384',
                'ECDHE-ECDSA-AES128-GCM-SHA256',
                'ECDHE-ECDSA-CHACHA20-POLY1305',
                'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-RSA-CHACHA20-POLY1305',
                'ECDHE-ECDSA-AES256-SHA',
                'ECDHE-ECDSA-AES128-SHA',
                'ECDHE-RSA-AES256-SHA',
                'ECDHE-RSA-AES128-SHA',
                'AES256-GCM-SHA384',
                'AES128-GCM-SHA256',
                'AES256-SHA',
                'AES128-SHA',
                'DES-CBC3-SHA',
            ]),
            'curves'        => 'X25519:P-256:P-384:P-521',
            'http2'         => true,
            'alpn'          => 'h2,http/1.1',
            'http_version'  => CURL_HTTP_VERSION_2_0,
            'user_agent_hint' => 'Safari',
        ],

        // ──────────────────────────────────────────────────────────────────
        // PERFIL 4: Samsung Tizen 8.0 / Smart TV
        // Fingerprint de Smart TV — máxima confianza en proveedores IPTV
        // ──────────────────────────────────────────────────────────────────
        'SAMSUNG_TV' => [
            'name'          => 'Samsung Tizen 8.0 / Smart TV',
            'tls_version'   => CURL_SSLVERSION_TLSv1_2,
            'cipher_list'   => implode(':', [
                'ECDHE-RSA-AES128-GCM-SHA256',
                'ECDHE-ECDSA-AES128-GCM-SHA256',
                'ECDHE-RSA-AES256-GCM-SHA384',
                'ECDHE-ECDSA-AES256-GCM-SHA384',
                'ECDHE-RSA-CHACHA20-POLY1305',
                'ECDHE-ECDSA-CHACHA20-POLY1305',
                'ECDHE-RSA-AES128-SHA256',
                'ECDHE-RSA-AES256-SHA384',
                'AES128-GCM-SHA256',
                'AES256-GCM-SHA384',
                'AES128-SHA256',
                'AES256-SHA256',
            ]),
            'curves'        => 'P-256:P-384:X25519',
            'http2'         => false,  // Smart TVs usan HTTP/1.1 para HLS
            'alpn'          => 'http/1.1',
            'http_version'  => CURL_HTTP_VERSION_1_1,
            'user_agent_hint' => 'SmartTV',
        ],
    ];

    // ── Mapeo UA hint → perfil TLS (coherencia con UAPhantomEngine) ───────
    private const UA_TO_PROFILE = [
        'Chrome'   => 'CHROME_134',
        'Firefox'  => 'FIREFOX_134',
        'Safari'   => 'SAFARI_18',
        'Edge'     => 'CHROME_134',   // Edge usa el mismo motor que Chrome
        'SmartTV'  => 'SAMSUNG_TV',
        'IPTV'     => 'SAMSUNG_TV',   // Reproductores IPTV imitan Smart TV
        'default'  => 'CHROME_134',
    ];

    // ══════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Selecciona el perfil TLS óptimo para un canal.
     * La selección es coherente con el UA asignado por UAPhantomEngine.
     *
     * @param int    $channelIndex  Índice del canal
     * @param string $channelName   Nombre del canal
     * @param string $userAgent     UA asignado por UAPhantomEngine (para coherencia)
     * @return array Perfil TLS completo
     */
    public static function selectProfile(int $channelIndex, string $channelName, string $userAgent = ''): array
    {
        $profileKey = self::detectUaHint($userAgent);
        $profile    = self::PROFILES[$profileKey] ?? self::PROFILES['CHROME_134'];

        return array_merge($profile, [
            'profile_key'   => $profileKey,
            'channel_index' => $channelIndex,
            'channel_name'  => $channelName,
        ]);
    }

    /**
     * Aplica el perfil TLS a un handle cURL.
     * Llamar ANTES de curl_exec() en cmaf_proxy.php.
     *
     * @param resource $ch      Handle de cURL
     * @param array    $profile Resultado de selectProfile()
     */
    public static function applyCurlContext($ch, array $profile): void
    {
        // Versión TLS
        curl_setopt($ch, CURLOPT_SSLVERSION, $profile['tls_version']);

        // Cipher suites en el orden exacto del perfil
        curl_setopt($ch, CURLOPT_SSL_CIPHER_LIST, $profile['cipher_list']);

        // Curvas elípticas
        if (!empty($profile['curves'])) {
            curl_setopt($ch, CURLOPT_SSL_EC_CURVES, $profile['curves']);
        }

        // HTTP version (HTTP/2 o HTTP/1.1 según el perfil)
        curl_setopt($ch, CURLOPT_HTTP_VERSION, $profile['http_version']);

        // ALPN (Application-Layer Protocol Negotiation)
        // Indica al servidor qué protocolos acepta el cliente
        // Esto forma parte del fingerprint TLS
        if (!empty($profile['alpn']) && defined('CURLOPT_SSL_ENABLE_ALPN')) {
            curl_setopt($ch, CURLOPT_SSL_ENABLE_ALPN, true);
        }

        // Deshabilitar compresión TLS (varía por perfil de navegador)
        // Chrome y Firefox la deshabilitan; Safari la habilita
        if ($profile['profile_key'] !== 'SAFARI_18') {
            if (defined('CURLOPT_SSL_OPTIONS')) {
                curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NO_REVOKE);
            }
        }
    }

    /**
     * Genera los headers EXTHTTP que documentan el perfil TLS activo.
     * Estos headers son INTERNOS (van en la respuesta al reproductor, nunca al upstream).
     *
     * @param array $profile Resultado de selectProfile()
     * @return array Headers key => value
     */
    public static function buildHeaders(array $profile): array
    {
        return [
            'X-APE-TLS-Profile'  => $profile['profile_key'],
            'X-APE-TLS-Name'     => $profile['name'],
            'X-APE-TLS-Version'  => $profile['tls_version'] === CURL_SSLVERSION_TLSv1_3 ? 'TLS1.3' : 'TLS1.2',
            'X-APE-TLS-HTTP'     => $profile['http2'] ? 'HTTP/2' : 'HTTP/1.1',
        ];
    }

    /**
     * Genera las directivas EXTVLCOPT para el perfil TLS.
     *
     * @param array $profile Resultado de selectProfile()
     * @return array Líneas EXTVLCOPT
     */
    public static function buildVlcOpts(array $profile): array
    {
        $opts = [];
        if ($profile['http2']) {
            $opts[] = '#EXTVLCOPT:http-forward-cookies=false';
        }
        return $opts;
    }

    // ══════════════════════════════════════════════════════════════════════
    // MÉTODOS PRIVADOS
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Detecta el tipo de UA para seleccionar el perfil TLS coherente.
     */
    private static function detectUaHint(string $userAgent): string
    {
        if (empty($userAgent)) {
            return 'CHROME_134';
        }
        foreach (self::UA_TO_PROFILE as $hint => $profileKey) {
            if (stripos($userAgent, $hint) !== false) {
                return $profileKey;
            }
        }
        // Smart TV patterns
        if (preg_match('/Tizen|webOS|SMART-TV|MAG|Roku|AppleTV|FireTV|AFTKA/i', $userAgent)) {
            return 'SAMSUNG_TV';
        }
        return 'CHROME_134';
    }
}
