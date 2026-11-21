<?php
/**
 * ChannelMemoryEngine v1.0.0 — APE v18.2
 *
 * Motor de persistencia del channels_map.json.
 * Garantiza que el sistema tenga siempre acceso al ADN de los canales,
 * incluso si el VPS se reinicia o la lista M3U8 no está disponible.
 *
 * Responsabilidades:
 *   - Mantener un snapshot del channels_map.json en /tmp/cm_snapshot.json
 *   - Detectar cambios en la lista M3U8 mediante un hash de heartbeat
 *   - Reconstruir el channels_map.json en segundo plano si la lista cambia
 *   - Proveer acceso rápido al ADN de un canal por su slug o stream_id
 *   - Registrar el estado de reproducción de cada canal (playback_memory)
 */
class ChannelMemoryEngine
{
    // ── Rutas de almacenamiento ────────────────────────────────────────────
    private const SNAPSHOT_PATH    = '/tmp/cm_snapshot.json';
    private const HEARTBEAT_PATH   = '/tmp/cm_heartbeat.json';
    private const PLAYBACK_LOG     = '/tmp/cm_playback_log.json';
    private const SNAPSHOT_TTL     = 300;   // 5 minutos
    private const HEARTBEAT_TTL    = 30;    // 30 segundos

    private static ?array $cache   = null;
    private static ?array $hbCache = null;

    // ── API pública ────────────────────────────────────────────────────────

    /**
     * Obtiene el ADN completo de un canal por su slug o stream_id.
     * Primero busca en el snapshot, luego en el channels_map.json real.
     */
    public static function getChannel(string $identifier, string $channelMapPath): ?array
    {
        $map = self::loadMap($channelMapPath);
        if (!$map) {
            return null;
        }

        // Búsqueda directa por clave (slug_streamid)
        if (isset($map[$identifier])) {
            return $map[$identifier];
        }

        // Búsqueda por stream_id
        foreach ($map as $key => $ch) {
            if (isset($ch['stream_id']) && $ch['stream_id'] === $identifier) {
                return $ch;
            }
        }

        // Búsqueda por slug parcial
        foreach ($map as $key => $ch) {
            if (isset($ch['slug']) && str_contains($key, $identifier)) {
                return $ch;
            }
        }

        return null;
    }

    /**
     * Registra el estado de reproducción de un canal.
     * Permite al sistema recordar qué se estaba viendo y con qué configuración.
     */
    public static function recordPlayback(string $channelKey, array $playbackData): void
    {
        $log = self::loadPlaybackLog();
        $log[$channelKey] = array_merge($log[$channelKey] ?? [], [
            'last_played_at'    => time(),
            'last_player'       => $playbackData['player'] ?? 'unknown',
            'last_quality'      => $playbackData['quality'] ?? 'unknown',
            'last_url'          => $playbackData['url'] ?? '',
            'last_degradation_level' => $playbackData['degradation_level'] ?? 1,
            'play_count'        => ($log[$channelKey]['play_count'] ?? 0) + 1,
            'total_watch_time'  => ($log[$channelKey]['total_watch_time'] ?? 0) + ($playbackData['duration'] ?? 0),
            'last_qoe_score'    => $playbackData['qoe_score'] ?? 5.0,
            'last_qos_score'    => $playbackData['qos_score'] ?? 5.0,
            'last_rebuffer_count' => $playbackData['rebuffer_count'] ?? 0,
            'last_error'        => $playbackData['error'] ?? null,
        ]);
        self::savePlaybackLog($log);
    }

    /**
     * Obtiene el historial de reproducción de un canal.
     */
    public static function getPlaybackHistory(string $channelKey): array
    {
        $log = self::loadPlaybackLog();
        return $log[$channelKey] ?? [];
    }

    /**
     * Procesa el heartbeat de la lista M3U8.
     * Si el hash cambió, dispara una reconstrucción del channels_map en background.
     *
     * @return array ['changed' => bool, 'last_hash' => string, 'new_hash' => string]
     */
    public static function processHeartbeat(string $listContent, string $channelMapPath): array
    {
        $newHash = md5(substr($listContent, 0, 65536)); // Hash de los primeros 64KB (cabecera)
        $hb = self::loadHeartbeat();
        $lastHash = $hb['list_hash'] ?? '';
        $changed = ($newHash !== $lastHash);

        if ($changed) {
            // Actualizar el heartbeat
            $hb['list_hash']    = $newHash;
            $hb['last_change']  = time();
            $hb['change_count'] = ($hb['change_count'] ?? 0) + 1;
            self::saveHeartbeat($hb);

            // Disparar reconstrucción en background (non-blocking)
            // En producción, esto sería un job en cola (Redis, RabbitMQ, etc.)
            // Aquí lo marcamos como pendiente para que el siguiente request lo procese
            $hb['rebuild_pending'] = true;
            self::saveHeartbeat($hb);
        }

        return [
            'changed'   => $changed,
            'last_hash' => $lastHash,
            'new_hash'  => $newHash,
            'rebuild_pending' => $hb['rebuild_pending'] ?? false,
        ];
    }

    /**
     * Guarda un snapshot del channels_map.json en /tmp para recuperación rápida.
     */
    public static function saveSnapshot(array $channelMap): bool
    {
        $snapshot = [
            'timestamp'  => time(),
            'channel_count' => count($channelMap),
            'version'    => '4.1',
            'data'       => $channelMap,
        ];
        $result = file_put_contents(
            self::SNAPSHOT_PATH,
            json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            LOCK_EX
        );
        return $result !== false;
    }

    /**
     * Carga el snapshot más reciente si está dentro del TTL.
     * Si el snapshot expiró, devuelve null para forzar la recarga desde la lista.
     */
    public static function loadSnapshot(): ?array
    {
        if (!file_exists(self::SNAPSHOT_PATH)) {
            return null;
        }
        $raw = file_get_contents(self::SNAPSHOT_PATH);
        if (!$raw) {
            return null;
        }
        $snapshot = json_decode($raw, true);
        if (!$snapshot || !isset($snapshot['timestamp'])) {
            return null;
        }
        // Verificar TTL
        if ((time() - $snapshot['timestamp']) > self::SNAPSHOT_TTL) {
            return null; // Snapshot expirado
        }
        return $snapshot['data'] ?? null;
    }

    /**
     * Verifica si el snapshot está disponible y es válido (para modo guardián).
     */
    public static function hasValidSnapshot(): bool
    {
        if (!file_exists(self::SNAPSHOT_PATH)) {
            return false;
        }
        $raw = file_get_contents(self::SNAPSHOT_PATH);
        $snapshot = json_decode($raw, true);
        if (!$snapshot || !isset($snapshot['timestamp'])) {
            return false;
        }
        // En modo guardián, aceptamos snapshots de hasta 24 horas
        return (time() - $snapshot['timestamp']) < 86400;
    }

    /**
     * Obtiene estadísticas del sistema de memoria.
     */
    public static function getStats(): array
    {
        $hb = self::loadHeartbeat();
        $snapshotAge = null;
        if (file_exists(self::SNAPSHOT_PATH)) {
            $raw = json_decode(file_get_contents(self::SNAPSHOT_PATH), true);
            $snapshotAge = $raw ? (time() - ($raw['timestamp'] ?? 0)) : null;
        }
        $playbackLog = self::loadPlaybackLog();

        return [
            'snapshot_exists'    => file_exists(self::SNAPSHOT_PATH),
            'snapshot_age_secs'  => $snapshotAge,
            'snapshot_valid'     => self::hasValidSnapshot(),
            'heartbeat_hash'     => $hb['list_hash'] ?? null,
            'last_change'        => $hb['last_change'] ?? null,
            'change_count'       => $hb['change_count'] ?? 0,
            'rebuild_pending'    => $hb['rebuild_pending'] ?? false,
            'channels_in_log'    => count($playbackLog),
            'total_plays'        => array_sum(array_column($playbackLog, 'play_count')),
        ];
    }

    // ── Métodos privados ───────────────────────────────────────────────────

    private static function loadMap(string $channelMapPath): ?array
    {
        // 1. Intentar desde caché en memoria (más rápido)
        if (self::$cache !== null) {
            return self::$cache;
        }

        // 2. Intentar desde snapshot (rápido, desde /tmp)
        $snapshot = self::loadSnapshot();
        if ($snapshot !== null) {
            self::$cache = $snapshot;
            return $snapshot;
        }

        // 3. Cargar desde el archivo real (más lento, pero siempre disponible)
        if (!file_exists($channelMapPath)) {
            return null;
        }
        $raw = file_get_contents($channelMapPath);
        if (!$raw) {
            return null;
        }
        $map = json_decode($raw, true);
        if (!$map) {
            return null;
        }

        // Guardar snapshot para la próxima vez
        self::saveSnapshot($map);
        self::$cache = $map;
        return $map;
    }

    private static function loadHeartbeat(): array
    {
        if (self::$hbCache !== null) {
            return self::$hbCache;
        }
        if (!file_exists(self::HEARTBEAT_PATH)) {
            return [];
        }
        $raw = file_get_contents(self::HEARTBEAT_PATH);
        self::$hbCache = json_decode($raw, true) ?? [];
        return self::$hbCache;
    }

    private static function saveHeartbeat(array $data): void
    {
        self::$hbCache = $data;
        file_put_contents(
            self::HEARTBEAT_PATH,
            json_encode($data, JSON_UNESCAPED_UNICODE),
            LOCK_EX
        );
    }

    private static function loadPlaybackLog(): array
    {
        if (!file_exists(self::PLAYBACK_LOG)) {
            return [];
        }
        $raw = file_get_contents(self::PLAYBACK_LOG);
        return json_decode($raw, true) ?? [];
    }

    private static function savePlaybackLog(array $log): void
    {
        // Limitar el log a los últimos 1000 canales para no crecer indefinidamente
        if (count($log) > 1000) {
            uasort($log, fn($a, $b) => ($b['last_played_at'] ?? 0) <=> ($a['last_played_at'] ?? 0));
            $log = array_slice($log, 0, 1000, true);
        }
        file_put_contents(
            self::PLAYBACK_LOG,
            json_encode($log, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            LOCK_EX
        );
    }
}
