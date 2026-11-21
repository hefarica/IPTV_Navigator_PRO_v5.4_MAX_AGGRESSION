<?php
/**
 * ModemPriorityManager v1.0.0 — APE v18.2 / Resilience v6.0
 *
 * Glándula Adrenal del sistema: Gestión agresiva de prioridad de red.
 * Controla la prioridad de tráfico a nivel de paquetes TCP/IP para
 * asegurar que los streams IPTV tengan máxima prioridad sobre todo
 * el tráfico del VPS.
 *
 * Funciones principales:
 *   - DSCP Enforcement: Etiquetas de prioridad en paquetes salientes
 *   - Socket Keep-Alive: Túneles TCP calientes para re-uso
 *   - Network Type Detection: WiFi/Ethernet/Móvil por heurísticas
 *   - tc qdisc Enforcement: Control de tráfico Linux para QoS
 *   - Mobile Adaptation: Ajustes para redes lentas/celulares
 *
 * Integración:
 *   - Trabaja con QoSQoEOrchestrator para obtener métricas de red
 *   - Alimenta headers al NeuroBufferController
 *   - Se invoca desde resolve_quality.php via shim
 *   - Estado persistido en /tmp/ (sin Redis)
 *
 * @package  cmaf_engine/modules
 * @version  1.0.0
 * @requires PHP 8.1+
 */
class ModemPriorityManager
{
    // ── Tipo de red ────────────────────────────────────────────────────────
    public const NET_ETHERNET  = 'ethernet';
    public const NET_WIFI      = 'wifi';
    public const NET_MOBILE_4G = 'mobile_4g';
    public const NET_MOBILE_3G = 'mobile_3g';
    public const NET_UNKNOWN   = 'unknown';

    // ── Calidad de conexión ────────────────────────────────────────────────
    public const QUALITY_EXCELLENT = 'EXCELLENT';
    public const QUALITY_GOOD      = 'GOOD';
    public const QUALITY_FAIR      = 'FAIR';
    public const QUALITY_POOR      = 'POOR';
    public const QUALITY_CRITICAL  = 'CRITICAL';

    // ── DSCP Tags ──────────────────────────────────────────────────────────
    private const DSCP_EF   = 46;  // Expedited Forwarding
    private const DSCP_AF41 = 34;  // Assured Forwarding 41
    private const DSCP_AF31 = 26;  // Assured Forwarding 31
    private const DSCP_BE   = 0;   // Best Effort

    // ── Persistencia ───────────────────────────────────────────────────────
    private const STATE_FILE    = '/tmp/modem_priority_state.json';
    private const TC_RULES_FILE = '/tmp/tc_rules_applied.json';

    // ── Keep-Alive ─────────────────────────────────────────────────────────
    private const KEEPALIVE_IDLE     = 30;   // Segundos antes del primer probe
    private const KEEPALIVE_INTERVAL = 10;   // Segundos entre probes
    private const KEEPALIVE_COUNT    = 5;    // Probes antes de desconectar

    // ── API pública ────────────────────────────────────────────────────────

    /**
     * Analiza la solicitud actual y genera el perfil óptimo de prioridad de red.
     * Este es el método principal invocado por el shim de integración.
     *
     * @param array  $channelDna ADN del canal
     * @param array  $requestInfo Información de la solicitud HTTP actual
     * @return array Perfil de prioridad de red con headers y configuración
     */
    public static function analyze(array $channelDna, array $requestInfo = []): array
    {
        // 1. Detectar tipo de red del cliente
        $networkType = self::detectNetworkType($requestInfo);

        // 2. Evaluar calidad de la conexión
        $quality = self::assessConnectionQuality($channelDna, $networkType);

        // 3. Determinar DSCP apropiado
        $dscp = self::selectDscp($channelDna, $quality);

        // 4. Generar configuración de keep-alive
        $keepAlive = self::buildKeepAliveConfig($quality);

        // 5. Generar ajustes para redes móviles
        $mobileAdjust = self::buildMobileAdjustments($networkType, $channelDna);

        // 6. Construir perfil completo
        $profile = [
            'network_type'       => $networkType,
            'connection_quality' => $quality,
            'dscp_tag'           => $dscp,
            'dscp_value'         => self::dscpToValue($dscp),
            'keep_alive'         => $keepAlive,
            'mobile_adjustments' => $mobileAdjust,
            'socket_options'     => self::buildSocketOptions($quality, $dscp),
            'tc_class_id'        => self::resolveTcClass($channelDna),
            'priority_level'     => self::resolvePriorityLevel($channelDna),
            'updated_at'         => time(),
        ];

        // 7. Persistir estado
        self::saveState($channelDna['id'] ?? 'unknown', $profile);

        return $profile;
    }

    /**
     * Genera los headers HTTP de prioridad de red para EXTHTTP.
     *
     * @param array $profile Perfil de analyze()
     * @return array Headers key => value
     */
    public static function buildPriorityHeaders(array $profile): array
    {
        $headers = [
            'X-Network-Type'        => $profile['network_type'],
            'X-Connection-Quality'  => $profile['connection_quality'],
            'X-DSCP-Tag'            => $profile['dscp_tag'],
            'X-Priority-Level'      => (string)$profile['priority_level'],
            'X-TC-Class'            => $profile['tc_class_id'],
            'X-Keep-Alive-Idle'     => (string)$profile['keep_alive']['idle'],
            'X-Keep-Alive-Interval' => (string)$profile['keep_alive']['interval'],
            'Connection'            => 'keep-alive',
            'Keep-Alive'            => "timeout={$profile['keep_alive']['idle']}, max=1000",
        ];

        // Ajustes móviles
        if (!empty($profile['mobile_adjustments']['bandwidth_cap_kbps'])) {
            $headers['X-Mobile-Bandwidth-Cap'] = (string)$profile['mobile_adjustments']['bandwidth_cap_kbps'];
        }

        return $headers;
    }

    /**
     * Genera los tags APE para el manifiesto M3U8.
     *
     * @param array $profile Perfil de analyze()
     * @return array Líneas de tags
     */
    public static function buildApeTags(array $profile): array
    {
        return [
            "#EXT-X-APE-NET-TYPE:{$profile['network_type']}",
            "#EXT-X-APE-NET-QUALITY:{$profile['connection_quality']}",
            "#EXT-X-APE-DSCP:{$profile['dscp_tag']}",
            "#EXT-X-APE-NET-PRIORITY:{$profile['priority_level']}",
        ];
    }

    /**
     * Genera el script tc qdisc para el VPS Linux.
     * Solo se ejecuta si el proceso tiene permisos root.
     *
     * @param string $interface Interfaz de red (default: eth0)
     * @param array  $streamingIps IPs de los servidores de streaming
     * @return array ['commands' => [...], 'applied' => bool, 'error' => ?string]
     */
    public static function enforceTcQdisc(
        string $interface = 'eth0',
        array  $streamingIps = []
    ): array {
        $commands = [];

        // 1. Limpiar reglas anteriores (safe reset)
        $commands[] = "tc qdisc del dev {$interface} root 2>/dev/null || true";

        // 2. Crear qdisc raíz HTB
        $commands[] = "tc qdisc add dev {$interface} root handle 1: htb default 30";

        // 3. Clase raíz: todo el ancho de banda
        $commands[] = "tc class add dev {$interface} parent 1: classid 1:1 htb rate 1000mbit ceil 1000mbit";

        // 4. Clase prioritaria para streaming (80% del BW, puede usar 100%)
        $commands[] = "tc class add dev {$interface} parent 1:1 classid 1:10 htb rate 800mbit ceil 1000mbit prio 0";

        // 5. Clase best-effort para el resto (20% del BW)
        $commands[] = "tc class add dev {$interface} parent 1:1 classid 1:20 htb rate 200mbit ceil 500mbit prio 1";

        // 6. Filtros para IPs de streaming → clase prioritaria
        foreach ($streamingIps as $ip) {
            $ip = filter_var($ip, FILTER_VALIDATE_IP);
            if ($ip) {
                $commands[] = "tc filter add dev {$interface} parent 1: protocol ip prio 1 u32 " .
                    "match ip dst {$ip}/32 flowid 1:10";
            }
        }

        // 7. Filtro DSCP EF (46) → clase prioritaria
        $commands[] = "tc filter add dev {$interface} parent 1: protocol ip prio 2 u32 " .
            "match ip tos 0xb8 0xfc flowid 1:10";

        // Intentar aplicar (solo si somos root)
        $applied = false;
        $error   = null;

        if (posix_getuid() === 0) {
            foreach ($commands as $cmd) {
                $output = shell_exec($cmd . ' 2>&1');
                if ($output && strpos($output, 'Error') !== false) {
                    $error = "Failed command: {$cmd} — Output: {$output}";
                    break;
                }
            }
            $applied = ($error === null);
        } else {
            $error = 'Not running as root — tc commands are informational only';
        }

        // Persistir estado de reglas
        self::saveTcRulesState([
            'interface'     => $interface,
            'streaming_ips' => $streamingIps,
            'commands'      => $commands,
            'applied'       => $applied,
            'error'         => $error,
            'timestamp'     => time(),
        ]);

        return [
            'commands' => $commands,
            'applied'  => $applied,
            'error'    => $error,
        ];
    }

    /**
     * Obtiene el estado de las reglas tc aplicadas.
     */
    public static function getTcRulesState(): ?array
    {
        if (!file_exists(self::TC_RULES_FILE)) {
            return null;
        }
        return json_decode(file_get_contents(self::TC_RULES_FILE), true);
    }

    /**
     * Obtiene estadísticas globales de red del sistema.
     */
    public static function getSystemNetworkStats(): array
    {
        $states  = self::loadAllStates();
        $netTypes = array_count_values(array_column($states, 'network_type'));
        $qualities = array_count_values(array_column($states, 'connection_quality'));

        return [
            'clients_tracked'        => count($states),
            'network_distribution'   => $netTypes,
            'quality_distribution'   => $qualities,
            'tc_rules_applied'       => self::getTcRulesState()['applied'] ?? false,
        ];
    }

    // ── Detección de tipo de red ───────────────────────────────────────────

    /**
     * Detecta el tipo de red del cliente usando heurísticas.
     * Analiza: User-Agent, TCP Window Size, Accept headers, y RTT.
     */
    private static function detectNetworkType(array $requestInfo): string
    {
        $userAgent   = $requestInfo['user_agent'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? '');
        $connType    = $requestInfo['connection_type'] ?? '';
        $tcpWindowMs = $requestInfo['tcp_window_ms'] ?? null;

        // 1. Detección directa por header (Kodi, VLC envían esto)
        if (stripos($connType, 'ethernet') !== false) {
            return self::NET_ETHERNET;
        }
        if (stripos($connType, 'wifi') !== false) {
            return self::NET_WIFI;
        }

        // 2. Detección por User-Agent de dispositivos móviles
        $mobilePatterns = [
            '/Android/i', '/iPhone/i', '/iPad/i', '/Mobile/i',
            '/TiviMate/i', '/IPTV Smarters/i', '/GSE/i',
        ];
        foreach ($mobilePatterns as $pattern) {
            if (preg_match($pattern, $userAgent)) {
                // Distinguir 4G vs 3G por TCP window (heurística)
                if ($tcpWindowMs !== null && $tcpWindowMs > 100) {
                    return self::NET_MOBILE_3G;
                }
                return self::NET_MOBILE_4G;
            }
        }

        // 3. Detección por players de escritorio
        $desktopPatterns = ['/VLC/i', '/Kodi/i', '/LibVLC/i', '/NVIDIA/i', '/Shield/i'];
        foreach ($desktopPatterns as $pattern) {
            if (preg_match($pattern, $userAgent)) {
                return self::NET_ETHERNET;
            }
        }

        // 4. Default: Ethernet (la mayoría de las set-top boxes están cableadas)
        return self::NET_ETHERNET;
    }

    // ── Evaluación de calidad ──────────────────────────────────────────────

    private static function assessConnectionQuality(array $channelDna, string $netType): string
    {
        // Base por tipo de red
        $baseQuality = match ($netType) {
            self::NET_ETHERNET  => self::QUALITY_EXCELLENT,
            self::NET_WIFI      => self::QUALITY_GOOD,
            self::NET_MOBILE_4G => self::QUALITY_FAIR,
            self::NET_MOBILE_3G => self::QUALITY_POOR,
            default             => self::QUALITY_GOOD,
        };

        // Ajustar por historial de fallos del canal
        $circuitState = $channelDna['circuit_breaker_state'] ?? 'CLOSED';
        if ($circuitState === 'OPEN') {
            return self::QUALITY_CRITICAL;
        }
        if ($circuitState === 'HALF_OPEN') {
            return self::QUALITY_POOR;
        }

        return $baseQuality;
    }

    // ── Selección DSCP ─────────────────────────────────────────────────────

    private static function selectDscp(array $channelDna, string $quality): string
    {
        $profile = $channelDna['quality_profile'] ?? 'P2';

        // 4K/8K siempre EF (máxima prioridad)
        if (in_array($profile, ['P0', 'P1'])) {
            return 'EF';
        }

        // Calidad crítica: EF para intentar salvar el stream
        if ($quality === self::QUALITY_CRITICAL) {
            return 'EF';
        }

        // HD: AF41
        if ($profile === 'P2') {
            return 'AF41';
        }

        // SD y inferior: AF31
        return 'AF31';
    }

    private static function dscpToValue(string $dscp): int
    {
        return match ($dscp) {
            'EF'   => self::DSCP_EF,
            'AF41' => self::DSCP_AF41,
            'AF31' => self::DSCP_AF31,
            default => self::DSCP_BE,
        };
    }

    // ── Configuración de Keep-Alive ────────────────────────────────────────

    private static function buildKeepAliveConfig(string $quality): array
    {
        // Conexiones de baja calidad necesitan keep-alive más agresivo
        $multiplier = match ($quality) {
            self::QUALITY_CRITICAL => 0.5,   // Más agresivo
            self::QUALITY_POOR     => 0.7,
            self::QUALITY_FAIR     => 0.8,
            default                => 1.0,
        };

        return [
            'idle'     => (int)(self::KEEPALIVE_IDLE * $multiplier),
            'interval' => (int)(self::KEEPALIVE_INTERVAL * $multiplier),
            'count'    => self::KEEPALIVE_COUNT,
            'enabled'  => true,
        ];
    }

    // ── Ajustes Móviles ────────────────────────────────────────────────────

    private static function buildMobileAdjustments(string $netType, array $channelDna): array
    {
        if (!in_array($netType, [self::NET_MOBILE_4G, self::NET_MOBILE_3G])) {
            return ['is_mobile' => false];
        }

        $is3G = ($netType === self::NET_MOBILE_3G);

        return [
            'is_mobile'          => true,
            'bandwidth_cap_kbps' => $is3G ? 1500 : 8000,
            'manifest_bandwidth' => $is3G ? 'BANDWIDTH=1500000' : 'BANDWIDTH=8000000',
            'buffer_boost_ms'    => $is3G ? 30000 : 15000,
            'prefetch_segments'  => $is3G ? 4 : 2,
            'adaptive_logic'     => $is3G ? 'lowest' : 'highest',
        ];
    }

    // ── Socket Options ─────────────────────────────────────────────────────

    private static function buildSocketOptions(string $quality, string $dscp): array
    {
        return [
            'SO_KEEPALIVE'  => true,
            'TCP_NODELAY'   => true,
            'SO_RCVBUF'     => 262144,  // 256KB receive buffer
            'SO_SNDBUF'     => 262144,  // 256KB send buffer
            'IP_TOS'        => self::dscpToValue($dscp) << 2,
            'TCP_QUICKACK'  => ($quality === self::QUALITY_CRITICAL),
        ];
    }

    // ── TC Class Resolution ────────────────────────────────────────────────

    private static function resolveTcClass(array $channelDna): string
    {
        $profile = $channelDna['quality_profile'] ?? 'P2';
        return in_array($profile, ['P0', 'P1', 'P2']) ? '1:10' : '1:20';
    }

    private static function resolvePriorityLevel(array $channelDna): int
    {
        $profile = $channelDna['quality_profile'] ?? 'P2';
        return match ($profile) {
            'P0' => 10,  // 8K: máxima
            'P1' => 9,   // 4K
            'P2' => 7,   // FHD
            'P3' => 5,   // HD
            'P4' => 3,   // SD
            'P5' => 1,   // Low
            default => 5,
        };
    }

    // ── Persistencia ───────────────────────────────────────────────────────

    private static function loadAllStates(): array
    {
        if (!file_exists(self::STATE_FILE)) {
            return [];
        }
        return json_decode(file_get_contents(self::STATE_FILE), true) ?? [];
    }

    private static function saveState(string $channelId, array $profile): void
    {
        $states = self::loadAllStates();
        $states[$channelId] = $profile;
        file_put_contents(
            self::STATE_FILE,
            json_encode($states, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }

    private static function saveTcRulesState(array $state): void
    {
        file_put_contents(
            self::TC_RULES_FILE,
            json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }
}
