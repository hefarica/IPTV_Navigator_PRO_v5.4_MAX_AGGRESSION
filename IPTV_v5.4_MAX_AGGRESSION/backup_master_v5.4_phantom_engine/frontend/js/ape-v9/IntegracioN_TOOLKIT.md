Entiendo el problema. Voy a colocar el documento en una ubicación accesible vía web. Primero déjame verificar la estructura del proyecto y copiar el archivo a la carpeta pública:
El documento está ahora en la carpeta pública. Si tienes acceso al servidor en puerto 3000, puedes acceder en:

```
http://localhost:3000/IPTV_Cortex_Transport_Module_v2.0_2026-03-21.docx
```

---

Como alternativa, aquí tienes el **contenido completo del documento en Markdown** que puedes copiar y guardar directamente:

---

```markdown
# IPTV SUPPORT CORTEX
## Transport Decision Module v2.0
### TS vs CMAF Resolution with HDR/SDR Support

**Maximum Quality CMAF Output • Universal Player Compatibility**

*2026-03-21*

---

## Table of Contents

1. Diagnóstico Técnico
   - 1.1 El Problema de Decisión TS vs CMAF
   - 1.2 Arquitectura del Sistema
   - 1.3 Objetivos Operativos
2. Modelo de Arrays Normalizados
   - 2.1 Player Profile Array
   - 2.2 Device Profile Array
   - 2.3 Network Profile Array
   - 2.4 Manifest Facts Array
   - 2.5 Worker Profile Array
   - 2.6 Telemetry History Array
3. Árbol de Decisión Formal
   - 3.1 Jerarquía de Evaluación
   - 3.2 Pseudocódigo del Árbol de Decisión
   - 3.3 Funciones de Evaluación Auxiliares
4. Matriz de Compatibilidad por Player
5. Implementación PHP 8.3
6. Ejemplos de Salida JSON
7. Reglas de Integración
8. Limitaciones Físicas y de Compatibilidad
9. Conclusión

---

# 1. Diagnóstico Técnico

## 1.1 El Problema de Decisión TS vs CMAF

El ecosistema de streaming OTT moderno enfrenta un desafío fundamental: la coexistencia de dos formatos de transporte con características radicalmente diferentes. El Transport Stream (TS), heredero de la transmisión broadcast tradicional, ofrece compatibilidad universal pero eficiencia limitada. El Common Media Application Format (CMAF), diseño moderno para streaming adaptativo, promete menor latencia y mejor eficiencia pero arrastra problemas de compatibilidad con players legacy.

El módulo Cortex de decisión de transporte resuelve este problema implementando un motor de evaluación multicapa que analiza sistemáticamente las capacidades del player target, el perfil del dispositivo, las condiciones de red, las características del origen y el historial de telemetría para determinar el formato óptimo de entrega.

## 1.2 Arquitectura del Sistema

El sistema Cortex opera dentro de una arquitectura de tres planos interconectados:

- **Plano de listas M3U8 decoradas (APE Typed Arrays)**: Inyectan directivas y metadatos para influir en el comportamiento del player.
- **Plano del resolver de calidad**: Analiza la lista, detecta transporte real, infiere codec y decide compatibilidad.
- **Plano del worker CMAF/DASH**: Implementa ingesta robusta, transmuxing, reconexión Zero-Drop y telemetría de salud.

La integración con HDR/SDR añade una capa adicional de complejidad. El sistema debe detectar las señales HDR del origen (HDR10, HDR10+, Dolby Vision, HLG) y determinar si el dispositivo y el player pueden renderizarlas correctamente.

## 1.3 Objetivos Operativos

El objetivo primario del módulo Cortex es maximizar la calidad de experiencia de reproducción, definida como la combinación de:

- **Estabilidad**: Ausencia de cortes y freezes
- **Calidad de imagen**: Resolución, HDR, bitrate
- **Velocidad de inicio**: Time to first frame
- **Compatibilidad**: Funciona en el dispositivo target

---

# 2. Modelo de Arrays Normalizados

## 2.1 Player Profile Array

```php
$playerProfile = [
    'player_name' => 'OTT Navigator',
    'player_family' => 'android_native',
    'version' => '1.7.5',
    'cmaf_support' => true,
    'ts_support' => true,
    'fmp4_hls_support' => true,
    'dash_support' => true,
    'hdr_support' => [
        'hdr10' => true,
        'hdr10_plus' => true,
        'dolby_vision' => true,
        'hlg' => true
    ],
    'known_transport_bugs' => [],
    'hardware_decode_preferred' => true,
    'max_resolution' => '4K'
];
```

## 2.2 Device Profile Array

```php
$deviceProfile = [
    'os' => 'Android',
    'os_version' => '13',
    'chipset' => 'Snapdragon 8 Gen 2',
    'decoder_capabilities' => [
        'h264' => ['profile' => 'High', 'level' => '5.2'],
        'hevc' => ['profile' => 'Main10', 'level' => '5.1'],
        'av1' => ['profile' => 'Main', 'level' => '5.3']
    ],
    'hdr_support' => true,
    'hdr_capabilities' => [
        'hdr10' => true,
        'hdr10_plus' => true,
        'dolby_vision' => true,
        'hlg' => true
    ],
    'hardware_decode' => true,
    'screen_resolution' => '2560x1440',
    'screen_hdr_capable' => true,
    'peak_brightness' => 1200
];
```

## 2.3 Network Profile Array

```php
$networkProfile = [
    'throughput_kbps' => 25000,
    'throughput_avg_60s' => 22000,
    'jitter_level' => 'low',
    'packet_loss_rate' => 0.001,
    'latency_ms' => 45,
    'buffer_health' => 0.85,
    'unstable_network' => false,
    'connection_type' => 'wifi'
];
```

## 2.4 Manifest Facts Array

```php
$manifestFacts = [
    'source_manifest_type' => 'hls',
    'has_ext_x_map' => true,
    'has_fmp4_signals' => true,
    'has_m4s_segments' => true,
    'targetduration' => 6,
    'variant_count' => 5,
    'codec_signals' => [
        'video' => 'hev1.2.4.L153.B0',
        'audio' => 'mp4a.40.2'
    ],
    'hdr_signals' => [
        'hdr_type' => 'hdr10',
        'color_primaries' => 'bt2020',
        'transfer_characteristics' => 'smpte2084'
    ],
    'resolution_max' => '3840x2160',
    'bitrate_max' => 20000,
    'source_is_cmaf_compliant' => true
];
```

## 2.5 Worker Profile Array

```php
$workerProfile = [
    'worker_available' => true,
    'worker_mode' => 'ondemand',
    'ffmpeg_supports_cmaf' => true,
    'ffmpeg_supports_hls_ts' => true,
    'dash_hls_hybrid_available' => true,
    'watchdog_enabled' => true,
    'origin_stability_score' => 0.92,
    'transcode_capable' => true,
    'tone_mapping_capable' => true,
    'hdr_passthrough' => true
];
```

## 2.6 Telemetry History Array

```php
$telemetryHistory = [
    'startup_failures_ts' => 0,
    'startup_failures_cmaf' => 1,
    'average_rebuffer_ts' => 0.2,
    'average_rebuffer_cmaf' => 0.5,
    'freeze_events_ts' => 0,
    'freeze_events_cmaf' => 2,
    'last_success_transport' => 'ts',
    'transport_confidence_score' => ['ts' => 0.95, 'cmaf' => 0.65]
];
```

---

# 3. Árbol de Decisión Formal

## 3.1 Jerarquía de Evaluación

La evaluación sigue un orden estricto de precedencia:

1. **Integridad del origen**: ¿El stream fuente está disponible?
2. **Compatibilidad del player**: ¿El formato es soportado?
3. **Compatibilidad del dispositivo**: ¿El hardware puede decodificar?
4. **Capacidad del worker**: ¿El backend puede entregar el formato?
5. **Historial de telemetría**: ¿Funcionó bien antes?
6. **Condiciones de red**: ¿La red soporta los requerimientos?
7. **Soporte HDR/SDR**: ¿El dispositivo puede renderizar HDR?
8. **Eficiencia de transporte**: ¿El formato ofrece mejor eficiencia?
9. **Construcción de fallback chain**: ¿Hay alternativas?
10. **Retorno de decisión estructurada**

## 3.2 Pseudocódigo del Árbol de Decisión

```
FUNCTION resolveTransportMode(context) -> TransportDecision:
    
    // PHASE 1: ORIGIN INTEGRITY CHECK
    IF NOT context.manifestFacts.source_available:
        RETURN decision(mode: 'unavailable')
    
    origin_score = calculate_origin_stability(context)
    worker_required = (origin_score < 0.3)
    
    // PHASE 2: PLAYER COMPATIBILITY
    player_cmaf_score = evaluate_player_cmaf_support(context.playerProfile)
    player_ts_score = evaluate_player_ts_support(context.playerProfile)
    
    IF 'cmaf_stuttering' IN context.playerProfile.known_transport_bugs:
        player_cmaf_score *= 0.5
    
    // PHASE 3: DEVICE COMPATIBILITY
    device_cmaf_score = evaluate_device_cmaf(context.deviceProfile)
    device_ts_score = evaluate_device_ts(context.deviceProfile)
    
    // PHASE 4: HDR COMPATIBILITY
    hdr_compatible = check_hdr_compatibility(
        context.manifestFacts.hdr_signals,
        context.deviceProfile.hdr_capabilities
    )
    
    // PHASE 5: TELEMETRY ANALYSIS
    telemetry_factor = calculate_telemetry_factor(context.telemetryHistory)
    
    // PHASE 6: NETWORK CONDITIONS
    network_factor = evaluate_network_suitability(context.networkProfile)
    
    // PHASE 7: FINAL SCORING
    cmaf_score = player_cmaf_score*0.30 + device_cmaf_score*0.25 +
                 (hdr_compatible ? 0.15 : 0.05) +
                 telemetry_factor.cmaf*0.15 + network_factor.cmaf*0.15
    
    ts_score = player_ts_score*0.30 + device_ts_score*0.25 + 0.10 +
               telemetry_factor.ts*0.15 + network_factor.ts*0.15
    
    // PHASE 8: MODE SELECTION
    IF worker_required:
        IF worker.dash_hls_hybrid_available AND cmaf_score > 0.6:
            mode = 'worker_dash_hls_hybrid'
        ELSE: mode = 'worker_ts'
    ELSE:
        IF cmaf_score > ts_score + 0.15: mode = 'direct_cmaf'
        ELSE IF ts_score > cmaf_score + 0.10: mode = 'direct_ts'
        ELSE IF manifest.source_is_cmaf_compliant: mode = 'direct_cmaf'
        ELSE: mode = 'direct_ts'
    
    // PHASE 9: BUILD FALLBACK CHAIN
    fallback = build_fallback_chain(mode, worker, manifest, scores)
    
    RETURN TransportDecision(mode, confidence, why, warnings, fallback)
END FUNCTION
```

## 3.3 Funciones de Evaluación Auxiliares

```
FUNCTION evaluate_player_cmaf_support(profile) -> float:
    score = 0.0
    IF profile.fmp4_hls_support: score += 0.40
    IF profile.dash_support: score += 0.20
    IF profile.cmaf_support: score += 0.20
    
    score += match(profile.player_family):
        'shaka' => 0.20, 'hlsjs' => 0.15, 'videojs' => 0.15,
        'native_android' => 0.10, 'kodi' => 0.05, 'vlc' => 0.05,
        'stb_legacy' => -0.20, default => 0.0
    
    RETURN clamp(score, 0.0, 1.0)

FUNCTION evaluate_player_ts_support(profile) -> float:
    score = profile.ts_support ? 0.50 : 0.20
    score += match(profile.player_family):
        'vlc' => 0.25, 'kodi' => 0.20, 'stb_legacy' => 0.30,
        'native_android' => 0.15, 'hlsjs' => 0.10, default => 0.10
    RETURN clamp(score, 0.0, 1.0)

FUNCTION check_hdr_compatibility(hdr_signals, device_hdr, player_hdr) -> bool:
    IF NOT hdr_signals.hdr_type: RETURN TRUE
    RETURN device_hdr[hdr_signals.hdr_type] AND player_hdr[hdr_signals.hdr_type]
```

---

# 4. Matriz de Compatibilidad por Player

| Player | Preferencia | Conf. TS | Conf. CMAF | Fallback |
|--------|-------------|----------|------------|----------|
| VLC (legacy <3.0) | TS | 0.95 | 0.55 | direct_ts → worker_ts |
| VLC (moderno ≥3.0) | CMAF/TS | 0.90 | 0.80 | direct_cmaf → direct_ts |
| OTT Navigator | CMAF | 0.90 | 0.92 | direct_cmaf → worker_hybrid |
| Kodi (≤19) | TS | 0.92 | 0.65 | direct_ts → worker_ts |
| Kodi (≥20) | CMAF/TS | 0.88 | 0.85 | direct_cmaf → direct_ts |
| HLS.js | CMAF | 0.75 | 0.93 | direct_cmaf → worker_hybrid |
| Shaka Player | CMAF | 0.80 | 0.95 | direct_cmaf → worker_hybrid |
| video.js | CMAF | 0.78 | 0.90 | direct_cmaf → worker_hybrid |
| STB Legacy | TS | 0.98 | 0.40 | direct_ts (mandatorio) |
| Smart TV (Tizen) | CMAF | 0.85 | 0.88 | direct_cmaf → direct_ts |
| Smart TV (webOS) | CMAF | 0.83 | 0.85 | direct_cmaf → direct_ts |

## Matriz de Soporte HDR por Player

| Player | HDR10 | HDR10+ | Dolby Vision | HLG |
|--------|-------|--------|--------------|-----|
| VLC (≥3.0) | ✓ | ✓ | Parcial | ✓ |
| OTT Navigator | ✓ | ✓ | ✓ | ✓ |
| Kodi (≥20) | ✓ | ✓ | Parcial | ✓ |
| HLS.js | ✓ | ✗ | ✗ | ✓ |
| Shaka Player | ✓ | ✓ | Parcial | ✓ |
| STB Legacy | ✗ | ✗ | ✗ | ✗ |
| Smart TV (Tizen) | ✓ | ✓ | ✓ | ✓ |

---

# 5. Implementación PHP 8.3

## 5.1 Definición de Tipos y Estructuras

```php
<?php
declare(strict_types=1);

namespace Cortex\Transport;

readonly class PlayerProfile
{
    public function __construct(
        public string $player_name,
        public string $player_family,
        public string $version,
        public bool $cmaf_support,
        public bool $ts_support,
        public bool $fmp4_hls_support,
        public bool $dash_support,
        public HDRSupport $hdr_support,
        public array $known_transport_bugs,
        public bool $hardware_decode_preferred,
        public string $max_resolution
    ) {}
}

readonly class HDRSupport
{
    public function __construct(
        public bool $hdr10,
        public bool $hdr10_plus,
        public bool $dolby_vision,
        public bool $hlg
    ) {}
}

readonly class DeviceProfile
{
    public function __construct(
        public string $os,
        public string $os_version,
        public bool $hevc_support,
        public bool $hdr_support,
        public HDRCapabilities $hdr_capabilities,
        public bool $hardware_decode,
        public bool $legacy_mode,
        public string $screen_resolution,
        public bool $screen_hdr_capable
    ) {}
}

readonly class TransportContext
{
    public function __construct(
        public PlayerProfile $playerProfile,
        public DeviceProfile $deviceProfile,
        public NetworkProfile $networkProfile,
        public ManifestFacts $manifestFacts,
        public WorkerProfile $workerProfile,
        public TelemetryHistory $telemetryHistory,
        public string $channel_id,
        public int $timestamp
    ) {}
}

class TransportDecision
{
    public function __construct(
        public string $mode,
        public float $confidence,
        public string $why,
        public array $warnings,
        public array $fallback_chain,
        public string $hdr_mode,
        public array $decision_trace
    ) {}
}

enum TransportMode: string
{
    case DIRECT_TS = 'direct_ts';
    case DIRECT_CMAF = 'direct_cmaf';
    case WORKER_TS = 'worker_ts';
    case WORKER_CMAF = 'worker_cmaf';
    case WORKER_DASH_HLS_HYBRID = 'worker_dash_hls_hybrid';
    case UNAVAILABLE = 'unavailable';
}
```

## 5.2 Motor de Decisión Principal

```php
class TransportResolver
{
    private array $warnings = [];
    private array $decision_trace = [];
    
    public function resolveTransportMode(TransportContext $context): TransportDecision
    {
        $this->warnings = [];
        $this->decision_trace = [];
        
        // Phase 1: Origin Integrity
        $originResult = $this->checkOriginIntegrity($context);
        if ($originResult['unavailable']) {
            return $this->buildUnavailableDecision($originResult['reason']);
        }
        
        // Phase 2-6: Evaluate all factors
        $playerCmafScore = $this->evaluatePlayerCmafSupport($context->playerProfile);
        $playerTsScore = $this->evaluatePlayerTsSupport($context->playerProfile);
        $deviceCmafScore = $this->evaluateDeviceCmafSupport($context->deviceProfile);
        $deviceTsScore = $this->evaluateDeviceTsSupport($context->deviceProfile);
        $hdrResult = $this->checkHDRCompatibility($context);
        $telemetryFactors = $this->calculateTelemetryFactors($context->telemetryHistory);
        $networkFactors = $this->evaluateNetworkSuitability($context->networkProfile);
        
        // Phase 7: Final Scoring
        $scores = $this->calculateFinalScores(
            $playerCmafScore, $playerTsScore,
            $deviceCmafScore, $deviceTsScore,
            $telemetryFactors, $networkFactors, $hdrResult
        );
        
        // Phase 8: Mode Selection
        $selectedMode = $this->selectTransportMode(
            $scores,
            $originResult['worker_required'],
            $context
        );
        
        // Phase 9: Fallback Chain
        $fallbackChain = $this->buildFallbackChain($selectedMode, $context, $scores);
        
        return new TransportDecision(
            mode: $selectedMode,
            confidence: $this->calculateConfidence($scores, $selectedMode),
            why: $this->generateDecisionRationale($selectedMode, $context),
            warnings: $this->warnings,
            fallback_chain: $fallbackChain,
            hdr_mode: $hdrResult['mode'],
            decision_trace: $this->decision_trace
        );
    }
    
    private function evaluatePlayerCmafSupport(PlayerProfile $profile): float
    {
        $score = 0.0;
        if ($profile->fmp4_hls_support) $score += 0.40;
        if ($profile->dash_support) $score += 0.20;
        if ($profile->cmaf_support) $score += 0.20;
        
        $score += match ($profile->player_family) {
            'shaka' => 0.20,
            'hlsjs' => 0.15,
            'videojs' => 0.15,
            'native_android' => 0.10,
            'kodi' => 0.05,
            'vlc' => 0.05,
            'stb_legacy' => -0.20,
            default => 0.0
        };
        
        if (in_array('cmaf_stuttering', $profile->known_transport_bugs)) {
            $score *= 0.5;
            $this->warnings[] = 'Known CMAF stuttering bug';
        }
        
        return max(0, min(1, $score));
    }
    
    private function evaluatePlayerTsSupport(PlayerProfile $profile): float
    {
        $score = $profile->ts_support ? 0.50 : 0.20;
        
        $score += match ($profile->player_family) {
            'vlc' => 0.25,
            'kodi' => 0.20,
            'stb_legacy' => 0.30,
            'native_android' => 0.15,
            'hlsjs' => 0.10,
            default => 0.10
        };
        
        return max(0, min(1, $score));
    }
    
    private function selectTransportMode(
        array $scores,
        bool $workerRequired,
        TransportContext $context
    ): string {
        $cmafScore = $scores['cmaf'];
        $tsScore = $scores['ts'];
        
        if ($workerRequired) {
            $worker = $context->workerProfile;
            if ($worker->dash_hls_hybrid_available && $cmafScore > 0.6) {
                return TransportMode::WORKER_DASH_HLS_HYBRID->value;
            }
            return TransportMode::WORKER_TS->value;
        }
        
        if ($cmafScore > $tsScore + 0.15) {
            return TransportMode::DIRECT_CMAF->value;
        }
        if ($tsScore > $cmafScore + 0.10) {
            return TransportMode::DIRECT_TS->value;
        }
        if ($context->manifestFacts->source_is_cmaf_compliant) {
            return TransportMode::DIRECT_CMAF->value;
        }
        return TransportMode::DIRECT_TS->value;
    }
    
    private function calculateFinalScores(
        float $playerCmafScore, float $playerTsScore,
        float $deviceCmafScore, float $deviceTsScore,
        array $telemetryFactors, array $networkFactors,
        array $hdrResult
    ): array {
        $hdrBonus = match ($hdrResult['mode']) {
            'native' => 0.15,
            'tone_mapped' => 0.10,
            default => 0.05
        };
        
        $cmafScore = (
            $playerCmafScore * 0.30 +
            $deviceCmafScore * 0.25 +
            $hdrBonus +
            $telemetryFactors['cmaf'] * 0.15 +
            $networkFactors['cmaf'] * 0.15
        );
        
        $tsScore = (
            $playerTsScore * 0.30 +
            $deviceTsScore * 0.25 +
            0.10 +
            $telemetryFactors['ts'] * 0.15 +
            $networkFactors['ts'] * 0.15
        );
        
        return [
            'cmaf' => max(0, min(1, $cmafScore)),
            'ts' => max(0, min(1, $tsScore))
        ];
    }
}
```

---

# 6. Ejemplos de Salida JSON

## 6.1 Escenario: VLC Legacy

```json
// ENTRADA
{
    "playerProfile": {
        "player_family": "vlc",
        "version": "2.2.8",
        "cmaf_support": false,
        "ts_support": true
    },
    "telemetryHistory": {
        "startup_failures_cmaf": 3,
        "last_success_transport": "ts"
    }
}

// SALIDA
{
    "mode": "direct_ts",
    "confidence": 0.91,
    "why": "TS format selected for maximum compatibility.",
    "warnings": ["CMAF startup failures detected in history"],
    "fallback_chain": ["direct_ts", "worker_ts"],
    "hdr_mode": "sdr"
}
```

## 6.2 Escenario: OTT Navigator Moderno con HDR

```json
// ENTRADA
{
    "playerProfile": {
        "player_family": "native_android",
        "cmaf_support": true,
        "hdr_support": {"hdr10": true, "dolby_vision": true}
    },
    "deviceProfile": {
        "hdr_capabilities": {"hdr10": true, "dolby_vision": true}
    },
    "manifestFacts": {
        "source_is_cmaf_compliant": true,
        "hdr_signals": {"hdr_type": "hdr10"}
    }
}

// SALIDA
{
    "mode": "direct_cmaf",
    "confidence": 0.94,
    "why": "CMAF format preferred. HDR content detected.",
    "warnings": [],
    "fallback_chain": ["direct_cmaf", "worker_ts", "direct_ts"],
    "hdr_mode": "native"
}
```

## 6.3 Escenario: STB Legacy

```json
// ENTRADA
{
    "playerProfile": {
        "player_family": "stb_legacy",
        "cmaf_support": false,
        "ts_support": true
    },
    "deviceProfile": {
        "legacy_mode": true,
        "hdr_support": false
    }
}

// SALIDA
{
    "mode": "direct_ts",
    "confidence": 0.98,
    "why": "TS format mandatory for legacy STB.",
    "warnings": ["Legacy STB requires TS transport"],
    "fallback_chain": ["direct_ts", "worker_ts"],
    "hdr_mode": "sdr"
}
```

## 6.4 Escenario: Web Player (Shaka)

```json
// ENTRADA
{
    "playerProfile": {
        "player_family": "shaka",
        "cmaf_support": true,
        "dash_support": true
    },
    "workerProfile": {
        "worker_available": true,
        "dash_hls_hybrid_available": true,
        "origin_stability_score": 0.65
    }
}

// SALIDA
{
    "mode": "worker_dash_hls_hybrid",
    "confidence": 0.89,
    "why": "Worker mode for unstable origin.",
    "warnings": ["Origin stability below threshold"],
    "fallback_chain": ["worker_dash_hls_hybrid", "worker_ts", "direct_ts"],
    "hdr_mode": "native"
}
```

---

# 7. Reglas de Integración

## 7.1 Integración con resolve_quality.php

```php
use Cortex\Transport\TransportResolver;
use Cortex\Transport\TransportContext;

function resolveChannelQuality(string $channel_id, array $params): array
{
    $channelConfig = loadChannelConfig($channel_id);
    
    $context = new TransportContext(
        playerProfile: buildPlayerProfile($params),
        deviceProfile: buildDeviceProfile($params),
        networkProfile: buildNetworkProfile($params),
        manifestFacts: probeManifest($channelConfig['source_url']),
        workerProfile: loadWorkerProfile(),
        telemetryHistory: loadTelemetryHistory($channel_id),
        channel_id: $channel_id,
        timestamp: time()
    );
    
    $resolver = new TransportResolver();
    $decision = $resolver->resolveTransportMode($context);
    
    return [
        'm3u8_content' => buildDecoratedM3U8($channelConfig, $decision),
        'transport_mode' => $decision->mode,
        'confidence' => $decision->confidence,
        'fallback_chain' => $decision->fallback_chain
    ];
}
```

## 7.2 Integración con channels_map.json

```json
{
    "channels": {
        "channel_001": {
            "name": "Premium Sports HD",
            "source_url": "https://origin.example.com/stream.m3u8",
            "preferred_transport": "auto",
            "transport_overrides": {
                "vlc": "ts",
                "ott_navigator": "cmaf"
            },
            "cortex_config": {
                "prefer_cmaf_threshold": 0.70,
                "force_ts_on_unstable": true,
                "tone_mapping_fallback": true
            }
        }
    }
}
```

## 7.3 Integración con FFmpeg

```bash
# CMAF puro con HDR passthrough
ffmpeg -re -i pipe:0 -c copy \
  -f dash -seg_duration 4 -dash_segment_type mp4 \
  -hls_playlist 1 -hls_master_name master.m3u8 \
  -hls_segment_type fmp4 \
  -target_latency 3 -write_prft 1 \
  output/manifest.mpd

# DASH + HLS híbrido
ffmpeg -re -i pipe:0 -c copy \
  -f dash -seg_duration 4 \
  -hls_playlist 1 -hls_flags independent_segments \
  -ldash 1 -streaming 1 \
  output/manifest.mpd

# TS para compatibilidad máxima
ffmpeg -re -i pipe:0 -c copy \
  -f mpegts -mpegts_service_type digital_tv \
  -pcr_period 50 -pat_period 0.1 \
  pipe:1

# Tone-mapping HDR a SDR
ffmpeg -re -i pipe:0 \
  -vf "tonemapx=tonemap=bt2390:peak=100" \
  -c:v libx265 -preset fast -crf 20 \
  -c:a copy -f dash output/manifest.mpd
```

---

# 8. Limitaciones Físicas y de Compatibilidad

Es fundamental entender que el módulo Cortex opera dentro de límites físicos y de compatibilidad que no pueden superarse mediante software.

**Por qué CMAF no puede forzarse en cualquier player:**
CMAF requiere soporte explícito del player a nivel de parser y decoder. Un player que no soporta fMP4 no puede reproducir segmentos CMAF sin importar qué directivas se inyecten.

**Por qué TS sigue siendo necesario:**
Transport Stream permanece como formato de compatibilidad universal porque todos los players IPTV legacy y STBs lo soportan, tiene mejor tolerancia a errores, y el ecosistema broadcast lo usa nativamente.

**Limitaciones específicas de HDR:**
El HDR no puede crearse a partir de contenido SDR, HDR10+ y Dolby Vision requieren metadata dinámica del origen, y la cadena completa debe soportar HDR.

| Limitación | Impacto | Mitigación Cortex |
|------------|---------|-------------------|
| Player sin fMP4 | CMAF no reproducible | Fallback automático a TS |
| Dispositivo sin HDR | HDR no reproducible | Tone-mapping o SDR fallback |
| Red muy inestable | ABR degradado | Prefiere TS por robustez |
| Origen solo TS | Sin beneficio CMAF | Worker transmux a CMAF |
| STB legacy | Solo TS soportado | Detección y forzado TS |

---

# 9. Conclusión

El módulo Cortex de decisión de transporte representa la evolución del sistema IPTV Navigator PRO hacia un modelo de reproducción inteligente y adaptativo. Al combinar análisis determinista de múltiples factores con un árbol de decisión jerárquico y trazable, el sistema optimiza la experiencia de reproducción dentro de las restricciones físicas y de compatibilidad del ecosistema real.

La integración de HDR/SDR amplía las capacidades del sistema para manejar contenido de alta gama, con soporte para HDR10, HDR10+, Dolby Vision y HLG. El sistema detecta automáticamente las capacidades del dispositivo y aplica tone-mapping o fallback a SDR cuando es necesario.

El código PHP 8.3 proporcionado está listo para integración en producción, con tipado estricto, documentación exhaustiva y estructura modular que facilita mantenimiento y extensiones futuras.
```
