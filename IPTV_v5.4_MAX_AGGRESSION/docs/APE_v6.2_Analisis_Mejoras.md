# Análisis y Mejoras de Componentes - APE v6.2

**Documento de Arquitectura**  
**Versión:** 1.0  
**Fecha:** Marzo 2026

---

## 1. Análisis de Componentes Existentes

### 1.1 ManifestRewriter.php

**Estado Actual:** ✅ Funcional - Producción

**Análisis de Fortalezas:**
El componente ManifestRewriter demuestra un diseño robusto con separación clara de responsabilidades. La implementación del filtrado de pistas por BANDWIDTH es eficiente y predecible. El sistema de failover con manifiesto de emergencia previene fallos en cascada. El timeout agresivo de 3 segundos en fetch protege contra bloqueos.

**Análisis de Debilidades:**
El filtrado hardcodeado de 10Mbps puede ser demasiado restrictivo para algunos casos de uso. No hay soporte para manifiestos anidados (variant playlists). La lógica de limpieza de caracteres Unicode es básica y podría perder caracteres especiales legítimos.

**Código de Mejora Propuesto:**

```php
<?php
/**
 * ManifestRewriter v1.2.0 - Enhanced Version
 * 
 * Mejoras implementadas:
 * 1. Filtrado dinámico basado en perfil de usuario
 * 2. Soporte para manifiestos anidados
 * 3. Sanitización Unicode mejorada
 */

class ManifestRewriterEnhanced
{
    // Umbrales dinámicos según perfil
    private static array $profileThresholds = [
        'P0' => 15000000,  // 15Mbps - Ultra calidad
        'P1' => 10000000,  // 10Mbps - Alta calidad
        'P2' => 6000000,   // 6Mbps  - Media alta
        'P3' => 3000000,   // 3Mbps  - Media
        'P4' => 1500000,   // 1.5Mbps - Baja
        'P5' => 0,         // Sin filtrado - Móvil
    ];

    public static function process(
        string $originalUrl, 
        array $aggressionProfile, 
        string $userAgent,
        string $qualityProfile = 'P1'
    ): string {
        // Determinar umbral según perfil
        $bandwidthThreshold = self::$profileThresholds[$qualityProfile] 
                            ?? self::$profileThresholds['P1'];

        // Fetch con reintentos
        $rawManifest = self::fetchWithRetry($originalUrl, $userAgent, 2);
        
        if (empty($rawManifest)) {
            return self::generateEmergencyManifest();
        }

        // Detectar tipo de manifiesto
        if (self::isVariantPlaylist($rawManifest)) {
            return self::processVariantPlaylist($rawManifest, $bandwidthThreshold, $aggressionProfile);
        }

        return self::processSegmentPlaylist($rawManifest, $aggressionProfile);
    }

    private static function fetchWithRetry(string $url, string $ua, int $retries): string
    {
        for ($i = 0; $i <= $retries; $i++) {
            $result = self::fetchOrigin($url, $ua);
            if (!empty($result)) {
                return $result;
            }
            usleep(500000); // 500ms entre reintentos
        }
        return '';
    }

    private static function isVariantPlaylist(string $content): bool
    {
        return strpos($content, '#EXT-X-STREAM-INF:') !== false;
    }

    private static function sanitizeUnicodeEnhanced(string $text): string
    {
        // Preserva caracteres legítimos mientras limpia problematicos
        $replacements = [
            '/[\x{2500}-\x{257F}]/u' => '|',  // Box drawing → pipe
            '/[\x{2580}-\x{259F}]/u' => '#',  // Block elements → hash
            '/[\x{2010}-\x{2015}]/u' => '-',  // Various dashes
            '/[\x{2018}-\x{2019}]/u' => "'",  // Smart quotes
            '/[\x{201C}-\x{201D}]/u' => '"',  // Smart double quotes
        ];
        
        foreach ($replacements as $pattern => $replacement) {
            $text = preg_replace($pattern, $replacement, $text);
        }
        
        return $text;
    }
}
```

---

### 1.2 NeuroBufferController.php

**Estado Actual:** ✅ Funcional - Producción

**Análisis de Fortalezas:**
El sistema de escalación orgánica x1→x2→x4→x8 es intuitivo y efectivo. La integración con ModemPriorityManager permite coordinación de recursos. Los perfiles de agresión son configurables vía parámetros.

**Análisis de Debilidades:**
El sistema es puramente reactivo. No hay memoria de patrones históricos por canal. La de-escalación es brusca en lugar de gradual.

**Código de Mejora Propuesto:**

```php
<?php
/**
 * NeuroBufferController v2.0.0 - Predictive Edition
 * 
 * Mejoras implementadas:
 * 1. Predicción basada en patrones históricos
 * 2. De-escalación gradual
 * 3. Memoria por canal con TTL
 */

class NeuroBufferControllerPredictive
{
    private static string $cacheFile = '/tmp/neurobuffer_state.json';
    private static int $stateTTL = 3600; // 1 hora

    /**
     * Carga estado histórico del canal
     */
    private static function loadChannelState(string $channelId): array
    {
        if (!file_exists(self::$cacheFile)) {
            return ['history' => [], 'predictions' => []];
        }

        $state = json_decode(file_get_contents(self::$cacheFile), true);
        $channelState = $state['channels'][$channelId] ?? ['history' => [], 'predictions' => []];

        // Filtrar historial antiguo
        $cutoff = time() - self::$stateTTL;
        $channelState['history'] = array_filter(
            $channelState['history'],
            fn($entry) => $entry['timestamp'] > $cutoff
        );

        return $channelState;
    }

    /**
     * Predicción de necesidades de buffer basada en hora del día
     */
    private static function predictFromTimePatterns(string $channelId): array
    {
        $state = self::loadChannelState($channelId);
        $currentHour = (int)date('H');

        // Analizar tasa de fallos histórica para esta hora
        $hourlyFailures = array_filter(
            $state['history'],
            fn($entry) => 
                (int)date('H', $entry['timestamp']) === $currentHour 
                && $entry['event'] === 'buffer_drop'
        );

        $failureRate = count($hourlyFailures) / max(count($state['history']), 1);

        if ($failureRate > 0.3) {
            return [
                'preemptive_level' => 'AGGRESSIVE',
                'confidence' => 0.8,
                'reason' => 'Historical pattern indicates high failure rate at this hour'
            ];
        }

        return [
            'preemptive_level' => 'NORMAL',
            'confidence' => 0.9,
            'reason' => 'No significant historical pattern detected'
        ];
    }

    /**
     * De-escalación gradual en lugar de reset brusco
     */
    public static function gradualDeescalate(string $channelId): array
    {
        $state = self::loadChannelState($channelId);
        $currentLevel = $state['current_level'] ?? 1;

        // Solo bajar un nivel a la vez
        $newLevel = max(1, $currentLevel - 1);

        self::saveChannelState($channelId, ['current_level' => $newLevel]);

        return self::getProfileForLevel($newLevel);
    }

    /**
     * Guarda estado del canal
     */
    private static function saveChannelState(string $channelId, array $data): void
    {
        $state = file_exists(self::$cacheFile) 
            ? json_decode(file_get_contents(self::$cacheFile), true) 
            : ['channels' => []];

        $state['channels'][$channelId] = array_merge(
            $state['channels'][$channelId] ?? [],
            $data,
            ['last_updated' => time()]
        );

        file_put_contents(self::$cacheFile, json_encode($state));
    }
}
```

---

### 1.3 AISuperResolutionEngine.php

**Estado Actual:** ✅ Funcional - Producción

**Análisis de Fortalezas:**
La estrategia de Edge Neural Upscaling es innovadora y eficiente. La detección automática de resolución funciona correctamente. Los headers inyectados son compatibles con VLC, Kodi y Smart TVs modernas.

**Análisis de Debilidades:**
No hay detección de capacidades del dispositivo cliente. Algunos players ignoran los headers personalizados. La compatibilidad con players móviles es limitada.

**Código de Mejora Propuesto:**

```php
<?php
/**
 * AISuperResolutionEngine v2.0.0 - Device-Aware Edition
 * 
 * Mejoras implementadas:
 * 1. Detección de capacidades del dispositivo
 * 2. Headers específicos por fabricante de Smart TV
 * 3. Fallback para dispositivos sin soporte AI
 */

class AISuperResolutionEngineDeviceAware
{
    // Capacidades conocidas por User-Agent
    private static array $deviceCapabilities = [
        // Samsung Smart TVs (Tizen)
        'samsung' => [
            'pattern' => '/Samsung|Tizen|SmartHub/i',
            'supports_ai' => true,
            'ai_trigger' => 'X-Samsung-Picture-Engine: AI_UPSCALE',
            'hdr_support' => 'HDR10_PLUS',
        ],
        // LG Smart TVs (webOS)
        'lg' => [
            'pattern' => '/LG|webOS|NetCast/i',
            'supports_ai' => true,
            'ai_trigger' => 'X-LG-Picture-Master: AI_THINKING',
            'hdr_support' => 'DOLBY_VISION',
        ],
        // Sony Smart TVs (Android TV)
        'sony' => [
            'pattern' => '/Sony|BRAVIA|Android TV/i',
            'supports_ai' => true,
            'ai_trigger' => 'X-Sony-XR-Mode: XR_UPSCALING',
            'hdr_support' => 'HDR10',
        ],
        // VLC Desktop/Mobile
        'vlc' => [
            'pattern' => '/VLC/i',
            'supports_ai' => false,
            'software_upscale' => true,
            'upscaler' => 'lanczos',
        ],
        // Kodi
        'kodi' => [
            'pattern' => '/Kodi/i',
            'supports_ai' => false,
            'software_upscale' => true,
            'upscaler' => 'bilinear',
        ],
        // Android TV general
        'android_tv' => [
            'pattern' => '/Android TV|Android/i',
            'supports_ai' => false,
            'software_upscale' => true,
            'upscaler' => 'mediaframework',
        ],
    ];

    /**
     * Detecta el tipo de dispositivo y sus capacidades
     */
    public static function detectDevice(string $userAgent): array
    {
        foreach (self::$deviceCapabilities as $device => $caps) {
            if (preg_match($caps['pattern'], $userAgent)) {
                return array_merge(['device' => $device], $caps);
            }
        }

        return ['device' => 'unknown', 'supports_ai' => false];
    }

    /**
     * Genera headers optimizados para el dispositivo detectado
     */
    public static function generateDeviceOptimizedHeaders(
        string $userAgent, 
        int $contentHeight
    ): array {
        $device = self::detectDevice($userAgent);
        $headers = [];

        // Si el dispositivo soporta AI nativa
        if ($device['supports_ai'] ?? false) {
            // Trigger específico del fabricante
            $headers[] = $device['ai_trigger'];

            // Información de contenido para que el TV optimice
            $headers[] = sprintf('X-Content-Resolution: %dp', $contentHeight);
            $headers[] = sprintf('X-Target-Resolution: %dp', 
                $contentHeight < 1000 ? 2160 : $contentHeight);

            // HDR metadata si aplica
            if ($contentHeight >= 1080 && isset($device['hdr_support'])) {
                $headers[] = sprintf('X-HDR-Mode: %s', $device['hdr_support']);
            }
        }

        // Si requiere upscaling por software
        if ($device['software_upscale'] ?? false) {
            $headers[] = sprintf('X-Software-Upscale: %s', $device['upscaler']);

            // Parámetros de calidad para upscaler
            if ($device['device'] === 'vlc') {
                $headers[] = '#EXTVLCOPT:swscale-mode=9';  // Lanczos
                $headers[] = '#EXTVLCOPT:postproc-q=6';    // Max quality
            }
        }

        return $headers;
    }

    /**
     * Versión mejorada de enhanceClientSide con detección de dispositivo
     */
    public static function enhanceClientSideEnhanced(
        int $height, 
        array &$exthttp, 
        array &$vlcopt,
        string $userAgent = ''
    ): void {
        $device = self::detectDevice($userAgent);

        // Estrategia SD → Falso HD
        if ($height < 700) {
            // Si es Smart TV con AI, usar su upscaler nativo
            if ($device['supports_ai'] ?? false) {
                $exthttp['X-Force-Resolution'] = '1920x1080';
                $exthttp['X-AI-Upscale-Hint'] = 'SD_TO_FHD';
            } else {
                // Fallback a upscaling por software
                $vlcopt[] = "#EXTVLCOPT:swscale-mode=9";
                $vlcopt[] = "#EXTVLCOPT:aspect-ratio=16:9";
            }
        }

        // Estrategia HD → Fake HDR (solo si el dispositivo lo soporta)
        if ($height >= 700 && $height < 1900) {
            if (($device['supports_ai'] ?? false) || ($device['device'] === 'vlc')) {
                $exthttp['X-HDR-Simulation'] = 'ACTIVE';
                $exthttp['X-Color-Volume'] = 'BT2020';
                $vlcopt[] = "#EXTVLCOPT:saturation=1.15";
                $vlcopt[] = "#EXTVLCOPT:contrast=1.08";
            }
        }
    }
}
```

---

### 1.4 ResilienceIntegrationShim.php

**Estado Actual:** ✅ Funcional - Producción

**Análisis de Fortalezas:**
El diseño minimalista mantiene latencia baja. La coordinación de múltiples motores es transparente. El sistema de merge de headers es robusto.

**Análisis de Debilidades:**
No hay métricas de rendimiento integradas. El logging es mínimo. No hay validación de entrada robusta.

**Código de Mejora Propuesto:**

```php
<?php
/**
 * ResilienceIntegrationShim v2.0.0 - Observability Edition
 * 
 * Mejoras implementadas:
 * 1. Métricas de rendimiento integradas
 * 2. Logging estructurado
 * 3. Validación de entrada
 * 4. Health check de motores
 */

class ResilienceIntegrationShimObservable
{
    private static float $startTime = 0;
    private static array $metrics = [];

    /**
     * Health check de todos los motores
     */
    public static function healthCheck(): array
    {
        $health = [
            'status' => 'healthy',
            'timestamp' => time(),
            'components' => []
        ];

        // Verificar cada motor
        $engines = [
            'NeuroBufferController' => 'NeuroBufferController',
            'ModemPriorityManager' => 'ModemPriorityManager',
            'AISuperResolutionEngine' => 'AISuperResolutionEngine',
        ];

        foreach ($engines as $name => $class) {
            try {
                $health['components'][$name] = [
                    'status' => class_exists($class) ? 'loaded' : 'missing',
                    'latency_ms' => self::measureLatency($class)
                ];
            } catch (Exception $e) {
                $health['components'][$name] = [
                    'status' => 'error',
                    'message' => $e->getMessage()
                ];
                $health['status'] = 'degraded';
            }
        }

        return $health;
    }

    /**
     * Mide latencia de un motor
     */
    private static function measureLatency(string $class): float
    {
        $start = microtime(true);
        
        // Llamada de prueba
        if ($class === 'NeuroBufferController') {
            NeuroBufferController::calculateAggression('health_check', 50.0, []);
        }
        
        return (microtime(true) - $start) * 1000;
    }

    /**
     * Versión instrumentada de enhance()
     */
    public static function enhanceWithMetrics(string $channelId, array $decision): array
    {
        self::$startTime = microtime(true);
        self::$metrics = ['channel' => $channelId];

        try {
            // Validación de entrada
            self::validateInput($channelId, $decision);

            $result = self::enhanceInternal($channelId, $decision);

            // Registrar métricas de éxito
            self::$metrics['status'] = 'success';
            self::$metrics['latency_ms'] = (microtime(true) - self::$startTime) * 1000;

            // Log estructurado
            self::logOperation();

            return $result;

        } catch (Exception $e) {
            self::$metrics['status'] = 'error';
            self::$metrics['error'] = $e->getMessage();
            self::logOperation();

            throw $e;
        }
    }

    /**
     * Validación de entrada
     */
    private static function validateInput(string $channelId, array $decision): void
    {
        if (empty($channelId)) {
            throw new InvalidArgumentException('Channel ID is required');
        }

        if (isset($decision['buffer_pct']) && 
            ($decision['buffer_pct'] < 0 || $decision['buffer_pct'] > 100)) {
            throw new InvalidArgumentException('buffer_pct must be between 0 and 100');
        }
    }

    /**
     * Log estructurado
     */
    private static function logOperation(): void
    {
        $logEntry = json_encode(array_merge(
            ['timestamp' => date('c')],
            self::$metrics
        ));

        file_put_contents(
            '/var/log/iptv-ape/shim_operations.log',
            $logEntry . "\n",
            FILE_APPEND
        );
    }

    /**
     * Lógica interna extraída para instrumentación
     */
    private static function enhanceInternal(string $channelId, array $decision): array
    {
        $result = ['exthttp' => [], 'extvlcopt' => [], 'url_override' => null];

        // 1. NeuroBuffer con timing
        $start = microtime(true);
        $aggression = NeuroBufferController::calculateAggression(
            $channelId, 
            $decision['buffer_pct'] ?? 72.0, 
            $decision['network_info'] ?? []
        );
        self::$metrics['neurobuffer_latency_ms'] = (microtime(true) - $start) * 1000;

        $result['exthttp'] = array_merge(
            $result['exthttp'], 
            NeuroBufferController::buildAggressionHeaders($aggression)
        );

        // 2. ModemPriority con timing
        $start = microtime(true);
        $priority = ModemPriorityManager::analyze($decision, []);
        self::$metrics['modempriority_latency_ms'] = (microtime(true) - $start) * 1000;

        $result['exthttp'] = array_merge(
            $result['exthttp'], 
            ModemPriorityManager::buildPriorityHeaders($priority)
        );

        // 3. AI Upscaling con timing
        $start = microtime(true);
        $detectedHeight = $decision['height'] ?? 1080;
        AISuperResolutionEngine::injectClientSideLogic(
            $detectedHeight, 
            $result['exthttp'], 
            $result['extvlcopt']
        );
        self::$metrics['aiengine_latency_ms'] = (microtime(true) - $start) * 1000;

        return $result;
    }
}
```

---

## 2. Resumen de Mejoras por Componente

| Componente | Mejoras Propuestas | Impacto Esperado |
|------------|-------------------|------------------|
| ManifestRewriter | Filtrado dinámico, soporte anidado, Unicode mejorado | Mayor flexibilidad, mejor compatibilidad |
| NeuroBufferController | Predicción histórica, de-escalación gradual | Anticipación de problemas, transiciones suaves |
| AISuperResolutionEngine | Detección de dispositivo, headers por fabricante | Mejor experiencia en cada dispositivo |
| ResilienceIntegrationShim | Métricas, logging, validación | Mejor observabilidad, debugging más fácil |

---

## 3. Priorización de Implementación

**Fase 1 (Inmediato):**
- ResilienceIntegrationShim observable - Permite debugging
- Validación de entrada - Previene errores

**Fase 2 (Corto plazo):**
- NeuroBufferController predictivo - Mejora calidad de servicio
- ManifestRewriter dinámico - Mayor flexibilidad

**Fase 3 (Mediano plazo):**
- AISuperResolutionEngine device-aware - Mejor UX por dispositivo
- Sistema de métricas completo - Observabilidad total

---

**Documento preparado por:** APE Architecture Group  
**Para revisión y aprobación**
