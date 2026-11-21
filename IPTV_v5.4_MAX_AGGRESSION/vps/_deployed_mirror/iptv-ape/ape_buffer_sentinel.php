<?php
declare(strict_types=1);

/**
 * UNSTOPPABLE BUFFER SENTINEL
 *
 * Capa 20 del IPTV-APE Unified Resolver v5.0
 * Filosofía: El internet es traicionero. El resolver NUNCA se confía.
 * Siempre preparado para atacar, fuertemente, con todo.
 *
 * 7 Leyes: No confiar | Player manda | Buffer exponencial | Aprender | Velocidad | Paralelo | Implacable
 */
class UnstoppableBufferSentinel
{
    // ═══════════════════════════════════════════════
    // CONSTANTES — UMBRALES Y CONFIGURACIÓN
    // ═══════════════════════════════════════════════

    // Umbrales de nivel de buffer (% del buffer target)
    const BUFFER_LEVEL_PERFECT     = 1.0;   // 100% — operación normal
    const BUFFER_LEVEL_EARLY_WARN  = 0.80;  //  80% — alerta temprana
    const BUFFER_LEVEL_DOUBLE      = 0.60;  //  60% — DOBLE TODO
    const BUFFER_LEVEL_QUAD        = 0.40;  //  40% — CUÁDRUPLE
    const BUFFER_LEVEL_OCTUPLE     = 0.20;  //  20% — OCTUPLE + SWITCH
    const BUFFER_LEVEL_WAR         = 0.10;  //  10% — MODO GUERRA TOTAL

    // Multiplicadores de escalada exponencial
    const MULTIPLIER_EARLY_WARN    = 1.5;
    const MULTIPLIER_DOUBLE        = 2.0;
    const MULTIPLIER_QUAD          = 4.0;
    const MULTIPLIER_OCTUPLE       = 8.0;
    const MULTIPLIER_WAR           = 16.0;  // + acciones extremas

    // Umbrales de velocidad internet (bps)
    const SPEED_HIGH               = 50000000;  // 50 Mbps
    const SPEED_MEDIUM             = 20000000;  // 20 Mbps
    const SPEED_LOW                = 8000000;   //  8 Mbps
    const SPEED_CRITICAL           = 3000000;   //  3 Mbps

    // Configuración de paralelismo por velocidad
    const PARALLEL_HIGH            = 6;   // 6 conexiones paralelas
    const PARALLEL_MEDIUM          = 4;   // 4 conexiones paralelas
    const PARALLEL_LOW             = 2;   // 2 conexiones paralelas
    const PARALLEL_CRITICAL        = 1;   // 1 conexión (no saturar enlace débil)

    // Tiempos de medición
    const SPEED_SAMPLE_INTERVAL    = 30;   // Medir velocidad cada 30s
    const SPEED_SAMPLE_COUNT       = 3;    // Promedio de 3 mediciones
    const SPEED_SAMPLE_TIMEOUT     = 5000; // Timeout 5s por medición

    // Ventana de aprendizaje
    const LEARNING_WINDOW          = 200;  // Últimos 200 eventos
    const LEARNING_TTL             = 604800; // 7 días de historial
    const PATTERN_DETECT_MIN       = 10;   // Mínimo 10 eventos para detectar patrón

    // Escalada de agresividad
    const AGGRESSION_DECAY         = 0.85;  // Decaer agresividad 15% si estable 5 min
    const AGGRESSION_BOOST         = 1.0;   // Subir agresividad al máximo cuando se detecta caída
    const AGGRESSION_MIN           = 1.0;   // Mínimo absoluto (NUNCA bajar de 1.0x)
    const AGGRESSION_MAX           = 16.0;  // Máximo absoluto (16x en modo guerra total)

    // Cache Fallback Constants (si no hay redis)
    const FS_CACHE_DIR             = __DIR__ . '/.sentinel_cache';

    // Redis keys
    const RK_STATE        = 'sentinel:state:';
    const RK_SPEED        = 'sentinel:speed:';
    const RK_EVENT        = 'sentinel:event:';
    const RK_LEARN        = 'sentinel:learn:';
    const RK_PLAYER       = 'sentinel:player:';
    const RK_DEPLETION    = 'sentinel:depletion:';
    const RK_RECOVERY     = 'sentinel:recovery:';

    private $cache; // En teoria RedisCacheLayer pero se mockeará con un local-file-cache de ser necesario
    private ?array $currentState = null;
    private ?array $playerProfile = null;
    private float $aggressionMultiplier = 1.0;
    private int $consecutiveDepletions = 0;
    private int $escalationLevel = 0; // 0=normal, 1=double, 2=quad, 3=octuple, 4=war
    private ?string $sessionId = null;


    // ═══════════════════════════════════════════════
    // MÉTODOS CORE
    // ═══════════════════════════════════════════════
    public function __construct($cacheInstance = null, string $sessionId = '')
    {
        $this->cache = $cacheInstance;
        $this->sessionId = empty($sessionId) ? md5(uniqid('', true)) : $sessionId;
        $this->ensureCacheDir();
        $this->loadState();
    }

    private function ensureCacheDir(): void
    {
        if (!is_dir(self::FS_CACHE_DIR)) {
            @mkdir(self::FS_CACHE_DIR, 0777, true);
        }
    }

    // Mini wrapper the cache (File fallback x si el VPS falla al encontrar phpredis)
    private function cacheGet(string $key) {
        if ($this->cache && method_exists($this->cache, 'get')) {
            return $this->cache->get($key);
        }
        $file = self::FS_CACHE_DIR . '/' . md5($key) . '.json';
        if (file_exists($file)) {
            $data = json_decode(file_get_contents($file), true);
            if ($data && isset($data['exp']) && $data['exp'] > time()) {
                return $data['val'];
            }
        }
        return null;
    }

    private function cacheSet(string $key, $value, int $ttl = 3600): void {
        if ($this->cache && method_exists($this->cache, 'set')) {
            $this->cache->set($key, $value, $ttl);
            return;
        }
        $file = self::FS_CACHE_DIR . '/' . md5($key) . '.json';
        $payload = ['val' => $value, 'exp' => time() + $ttl];
        @file_put_contents($file, json_encode($payload), LOCK_EX);
    }
    
    private function cacheAppend(string $key, array $eventData, int $maxItems = 200, int $ttl = 604800): void {
        $history = $this->cacheGet($key) ?: [];
        $history[] = $eventData;
        if(count($history) > $maxItems) {
            array_shift($history);
        }
        $this->cacheSet($key, $history, $ttl);
    }

    private function loadState(): void
    {
        $stateKey = self::RK_STATE . $this->sessionId;
        $state = $this->cacheGet($stateKey);
        
        if ($state) {
            $this->currentState = $state;
            $this->aggressionMultiplier = $state['aggression'] ?? 1.0;
            $this->escalationLevel = $state['escalation'] ?? 0;
            $this->consecutiveDepletions = $state['depletions'] ?? 0;
        } else {
            $this->resetSession();
        }
    }

    private function saveState(): void
    {
        $stateKey = self::RK_STATE . $this->sessionId;
        $state = [
            'aggression' => $this->aggressionMultiplier,
            'escalation' => $this->escalationLevel,
            'depletions' => $this->consecutiveDepletions,
            'timestamp'  => time(),
            'buffer_level'=> $this->currentState['buffer_level'] ?? 1.0
        ];
        $this->currentState = $state;
        $this->cacheSet($stateKey, $state, 60);
    }

    private function resetSession(): void
    {
        $this->currentState = [
            'aggression' => 1.0,
            'escalation' => 0,
            'depletions' => 0,
            'buffer_level'=> 1.0,
            'timestamp' => time()
        ];
        $this->aggressionMultiplier = 1.0;
        $this->escalationLevel = 0;
        $this->consecutiveDepletions = 0;
    }

    /**
     * Mide la velocidad REAL del internet parcializando la descarga (256KB).
     */
    public function measureInternetSpeed(string $channelId, string $originChunkUrl): array
    {
        $samples = [];
        
        // Timeout de fallback para no frenar la resolucion
        // cURL es más seguro y controlable que file_get_contents con context.
        for ($i = 0; $i < self::SPEED_SAMPLE_COUNT; $i++) {
            $startTime = microtime(true);
            
            $ch = curl_init($originChunkUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT_MS, self::SPEED_SAMPLE_TIMEOUT);
            curl_setopt($ch, CURLOPT_RANGE, "0-262143"); // ~256 KB
            curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            
            $data = curl_exec($ch);
            $info = curl_getinfo($ch);
            curl_close($ch);
            
            $endTime = microtime(true);
            
            if ($data !== false && $info['http_code'] >= 200 && $info['http_code'] <= 206) {
                $bytesReceived = strlen($data);
                $elapsed = max($endTime - $startTime, 0.001); // Nunca 0
                $speedBps = ($bytesReceived * 8) / $elapsed;
                
                $samples[] = [
                    'bytes' => $bytesReceived,
                    'time_ms' => round($elapsed * 1000),
                    'speed_bps' => (int)$speedBps,
                ];
            }
        }
        
        if (empty($samples)) {
            // Evitar zeros para no colapsar estimaciones. Assumimos un buffer pobre si falla 3 veces
            return [
                'speed_bps' => 2000000, 
                'speed_mbps' => 2.0,
                'grade' => 'critical',
                'confidence' => 0
            ];
        }
        
        $speeds = array_column($samples, 'speed_bps');
        // Promediado basico
        $avg = array_sum($speeds) / count($speeds);
        
        $this->cacheSet(self::RK_SPEED . $channelId, $avg, 300);
        
        return [
            'speed_bps' => (int)$avg,
            'speed_mbps' => round($avg / 1000000, 2),
            'grade' => $this->classifySpeed($avg),
            'samples' => $samples,
            'measured_at' => time(),
            'confidence' => 1.0,
        ];
    }
    
    private function classifySpeed(float $bps): string
    {
        if ($bps >= self::SPEED_HIGH) return 'high';
        if ($bps >= self::SPEED_MEDIUM) return 'medium';
        if ($bps >= self::SPEED_LOW) return 'low';
        return 'critical';
    }
    
    // Perfilaje del player: VLC puede ser salvaje.
    public function getPlayerBufferLimits(string $playerType): array
    {
        switch ($playerType) {
            case 'vlc':
                return [
                    'buffer_ms'    => 60000,   // Base
                    'net_cache'    => 120000, 
                    'live_cache'   => 120000, 
                    'file_cache'   => 120000,
                    'prefetch_seg' => 3,
                    'player_max'   => 480000   // Límite Maximo absoluto
                ];
            case 'kodi':
                return [
                    'buffer_ms'    => 15000,
                    'net_cache'    => 30000,
                    'live_cache'   => 30000,
                    'file_cache'   => 30000,
                    'prefetch_seg' => 2,
                    'player_max'   => 80000
                ];
            case 'ott':
                 return [
                    'buffer_ms'    => 10000,
                    'net_cache'    => 15000,
                    'live_cache'   => 10000,
                    'file_cache'   => 5000,
                    'prefetch_seg' => 3,
                    'player_max'   => 30000     // Limitacion estricta del OTT Nav
                ];
            case 'exoplayer':
            case 'tivimate':
                return [
                    'buffer_ms'    => 10000,
                    'net_cache'    => 15000,
                    'live_cache'   => 15000,
                    'file_cache'   => 10000,
                    'prefetch_seg' => 2,
                    'player_max'   => 45000
                ];
            default: // smart_tv, generic
                return [
                    'buffer_ms'    => 5000,
                    'net_cache'    => 8000,
                    'live_cache'   => 8000,
                    'file_cache'   => 5000,
                    'prefetch_seg' => 1,
                    'player_max'   => 20000
                ];
        }
    }

    public function getMaxBufferForPlayer(string $playerType): int
    {
        return $this->getPlayerBufferLimits($playerType)['player_max'];
    }

    public function calculateOptimalBitrate(float $speedBps, float $headroom = 0.7): int
    {
        return (int)($speedBps * $headroom);
    }
    
    public function calculateEscalation(float $bufferLevel, int $consecutiveDepletions): array
    {
        $modMode = "normal";
        $lvl = 0;
        $mul = 1.0;

        // Si cayó más de 3 veces repetidas se mantiene agresivo para no fluctuar.
        if ($consecutiveDepletions >= 3 && $bufferLevel > self::BUFFER_LEVEL_QUAD) {
            $bufferLevel = self::BUFFER_LEVEL_QUAD; // Fuerza un modo QUAD base.
        }

        if ($bufferLevel <= self::BUFFER_LEVEL_WAR) {
            $lvl = 4;
            $mul = self::MULTIPLIER_WAR;
            $modMode = "war";
        } elseif ($bufferLevel <= self::BUFFER_LEVEL_OCTUPLE) {
            $lvl = 3;
            $mul = self::MULTIPLIER_OCTUPLE;
            $modMode = "octuple";
        } elseif ($bufferLevel <= self::BUFFER_LEVEL_QUAD) {
            $lvl = 2;
            $mul = self::MULTIPLIER_QUAD;
            $modMode = "quad";
        } elseif ($bufferLevel <= self::BUFFER_LEVEL_DOUBLE) {
            $lvl = 1;
            $mul = self::MULTIPLIER_DOUBLE;
            $modMode = "double";
        } elseif ($bufferLevel <= self::BUFFER_LEVEL_EARLY_WARN) {
            $lvl = 0;
            $mul = self::MULTIPLIER_EARLY_WARN;
            $modMode = "early_warn";
        }

        return ['level' => $lvl, 'multiplier' => $mul, 'mode' => $modMode];
    }

    public function calculateParallelism(float $speedBps, float $bufferLevel, string $playerType): array
    {
        $parallelCounts = self::PARALLEL_MEDIUM;
        $strategy = 'normal';

        if ($speedBps >= self::SPEED_HIGH && $bufferLevel >= self::BUFFER_LEVEL_EARLY_WARN) {
            $parallelCounts = self::PARALLEL_HIGH;
            $strategy = 'aggressive';
        } elseif ($speedBps >= self::SPEED_MEDIUM && $bufferLevel >= self::BUFFER_LEVEL_DOUBLE) {
            $parallelCounts = self::PARALLEL_MEDIUM;
        } elseif ($speedBps >= self::SPEED_LOW) {
            $parallelCounts = self::PARALLEL_LOW;
        } else {
            $parallelCounts = self::PARALLEL_CRITICAL;
        }

        if ($bufferLevel <= self::BUFFER_LEVEL_QUAD) {
            // Emergence Override, jalar lo mas que el player soporte sin importar red para no cortar.
            $limits = $this->getPlayerBufferLimits($playerType);
            $parallelCounts = $limits['prefetch_seg']; 
            $strategy = 'emergency';
        }

        return ['parallel_count' => $parallelCounts, 'strategy' => $strategy];
    }
    
    // Prediccion de AI simplificada (Mocking la AI requerida basado en historiales redis)
    public function buildPredictiveConfig(string $channelId): array
    {
         $history = $this->cacheGet(self::RK_EVENT . $channelId);
         $preEscalate = false;
         $mul = 1.0;

         if (is_array($history) && count($history) > self::PATTERN_DETECT_MIN) {
             // Averiguar si estamos en un gap de fallas criticas (Clusters)
             $lastEventsDecades = array_slice($history, -5);
             $depletionsCounter = 0;
             foreach ($lastEventsDecades as $e) {
                 if (isset($e['buf_lvl']) && $e['buf_lvl'] < self::BUFFER_LEVEL_DOUBLE) {
                    $depletionsCounter++;
                 }
             }

             if ($depletionsCounter >= 2) {
                 $preEscalate = true;
                 $mul = self::MULTIPLIER_QUAD;
             }
         }

         return ['pre_escalate' => $preEscalate, 'suggested_multiplier' => $mul];
    }

    public function recordEventTracking(string $channelId, float $bufLvl, float $speed): void
    {
        $this->cacheAppend(self::RK_EVENT . $channelId, [
           'timestamp' => time(),
           'buf_lvl'   => $bufLvl,
           'speed'     => $speed
        ], self::LEARNING_WINDOW, self::LEARNING_TTL);
    }
    
    /**
     * Aplica toda la magia matemática y escala. (MÉTODO PRINCIPAL PARA RESOLVER v5.0)
     */
    public function applyToConfig(array $cfg, array $playerInfo, string $channelId): array
    {
        $playerType = $playerInfo['type'] ?? 'generic';
        $playerLimits = $this->getPlayerBufferLimits($playerType);
        $playerMax = $playerLimits['player_max'];

        // Cargar/medir speeds 
        $currentSpeed = $this->cacheGet(self::RK_SPEED . $channelId);
        if (!$currentSpeed) {
            $currentSpeed = 20000000; // Asumir 20mbps default
        }

        // Estado y niveles
        $bufferLevel = $this->currentState['buffer_level'] ?? 1.0;
        
        // Anti-Freeze Interceptor (Si el sistema congeló externalmente, el BufferSentinel lo escucha)
        if (isset($cfg['freeze_severity'])) {
            if ($cfg['freeze_severity'] === 'critical') {
                 $bufferLevel = self::BUFFER_LEVEL_WAR; // Forzar agresión Absoluta
            } elseif ($cfg['freeze_severity'] === 'medium') {
                 $bufferLevel = self::BUFFER_LEVEL_QUAD;
            }
        }

        // Escalation Mathematics
        $escalation = $this->calculateEscalation($bufferLevel, $this->consecutiveDepletions);
        $multiplier = $escalation['multiplier'];
        $this->escalationLevel = $escalation['level'];

        // Tracking Depletions para agresión
        if ($bufferLevel <= self::BUFFER_LEVEL_DOUBLE) {
            $this->consecutiveDepletions++;
            // Incremento suave: NO asfixiar el reproductor pidiendo buffer infinito.
            $this->aggressionMultiplier = min($this->aggressionMultiplier * 1.25, 4.0); // Tope de x4
            
            // Tracking event redis
            $this->recordEventTracking($channelId, $bufferLevel, (float)$currentSpeed);
        } else {
            // Decay lento de la agresión (5 min sano = baja)
            if (time() - ($this->currentState['timestamp'] ?? time()) > 300) {
                 $this->aggressionMultiplier = max($this->aggressionMultiplier * self::AGGRESSION_DECAY, self::AGGRESSION_MIN);
                 $this->consecutiveDepletions = 0;
            }
        }
        
        // Paralelismo a fuego
        $parallel = $this->calculateParallelism((float)$currentSpeed, $bufferLevel, $playerType);
        
        // Buffer final limitando al playerMax (Nunca reventar hardwares pobres)
        $cfg['buffer_ms']    = min((int)($playerLimits['buffer_ms'] * $multiplier * $this->aggressionMultiplier), $playerMax);
        $cfg['net_cache']    = min((int)($playerLimits['net_cache'] * $multiplier * $this->aggressionMultiplier), $playerMax);
        $cfg['live_cache']   = min((int)($playerLimits['live_cache'] * $multiplier * $this->aggressionMultiplier), $playerMax);
        $cfg['file_cache']   = min((int)($playerLimits['file_cache'] * $multiplier * $this->aggressionMultiplier), $playerMax);
        
        $cfg['prefetch_seg'] = min((int)($playerLimits['prefetch_seg'] * $multiplier), 20); // Extremo 20 frags
        $cfg['prefetch_par'] = $parallel['parallel_count'];

        // Guardar metadata interna de rastreo
        $cfg['_sentinel'] = [
            'active'        => true,
            'mode'          => $escalation['mode'],
            'multiplier'    => $multiplier,
            'aggression'    => $this->aggressionMultiplier,
            'parallel'      => $parallel['parallel_count'],
            'speed_bps'     => $currentSpeed,
            'speed_grade'   => $this->classifySpeed((float)$currentSpeed),
            'escalation'    => $this->escalationLevel,
            'depletions'    => $this->consecutiveDepletions,
            'player_type'   => $playerType,
            'buffer_level'  => $bufferLevel
        ];

        // Guardar estado actual a persistencia
        $this->currentState['buffer_level'] = $bufferLevel;
        $this->saveState();

        return $cfg;
    }

    public function generateSentinelHeaders(array $sentinelConfig, string $playerType): array
    {
        return [
            "X-Sentinel-Active: true",
            "X-Sentinel-Mode: " . ($sentinelConfig['mode'] ?? 'normal'),
            "X-Sentinel-Aggression: " . ($sentinelConfig['aggression'] ?? 1.0),
            "X-Sentinel-Escalation: " . ($sentinelConfig['escalation'] ?? 0),
            "X-Sentinel-Speed: " . ($sentinelConfig['speed_bps'] ?? 0),
            "X-Sentinel-Speed-Grade: " . ($sentinelConfig['speed_grade'] ?? 'unknown'),
            "X-Sentinel-Parallel: " . ($sentinelConfig['parallel'] ?? 1),
            "X-Sentinel-Consecutive-Depletions: " . ($sentinelConfig['depletions'] ?? 0)
        ];
    }

    public function generateSentinelDNATags(array $sentinelConfig): array
    {
        return [
            "#EXT-X-APE-SENTINEL-ACTIVE: true",
            "#EXT-X-APE-SENTINEL-MODE: " . ($sentinelConfig['mode'] ?? 'normal'),
            "#EXT-X-APE-SENTINEL-AGGRESSION: " . ($sentinelConfig['aggression'] ?? 1.0),
            "#EXT-X-APE-SENTINEL-PARALLEL: " . ($sentinelConfig['parallel'] ?? 1),
            "#EXT-X-APE-SENTINEL-SPEED-GRADE: " . ($sentinelConfig['speed_grade'] ?? 'unknown'),
            "#EXT-X-APE-SENTINEL-DEPLETIONS: " . ($sentinelConfig['depletions'] ?? 0)
        ];
    }

    public function generateOverrideDirectives(array $cfg, string $playerType): array
    {
        $overrides = ['vlcopt' => [], 'exthttp' => [], 'kodiprop' => []];

        if ($playerType === 'vlc') {
            $overrides['vlcopt'][] = "network-caching={$cfg['net_cache']}";
            $overrides['vlcopt'][] = "live-caching={$cfg['live_cache']}";
            $overrides['vlcopt'][] = "disc-caching={$cfg['file_cache']}";
            $overrides['vlcopt'][] = "prefetch-threads={$cfg['prefetch_par']}";
        }

        if ($playerType === 'kodi') {
             $overrides['kodiprop'][] = "inputstream.adaptive.stream_buffer.size={$cfg['net_cache']}";
             $overrides['kodiprop'][] = "buffer_behavior=aggressive";
        }

        if (in_array($playerType, ['ott', 'exoplayer', 'tivimate'])) {
            $overrides['exthttp']['X-Network-Caching'] = $cfg['net_cache'];
            $overrides['exthttp']['X-Prefetch-Parallel'] = $cfg['prefetch_par'];
            $overrides['exthttp']['X-Load-Control'] = "max-concurrent={$cfg['prefetch_par']}";
        }
        
        return $overrides;
    }
}
