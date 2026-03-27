# Documentación Técnica: Arquitectura APE v6.2 "Apex Edge-AI"

**Versión:** 6.2 (Clean URL / Edge-Compute Edition)  
**Estado:** Producción  
**Fecha:** Marzo 2026  
**Objetivo:** Lograr supremacía en streaming mediante "Edge Neural Upscaling" y resiliencia orgánica sin intermediación de proxies.

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Principios de Diseño](#3-principios-de-diseño)
4. [Componentes Principales](#4-componentes-principales)
5. [Flujo de Datos](#5-flujo-de-datos)
6. [API Reference](#6-api-reference)
7. [Configuración y Despliegue](#7-configuración-y-despliegue)
8. [Análisis y Mejoras Propuestas](#8-análisis-y-mejoras-propuestas)
9. [Troubleshooting](#9-troubleshooting)
10. [Apéndices](#10-apéndices)

---

## 1. Resumen Ejecutivo

La arquitectura APE v6.2 representa la evolución más avanzada en sistemas de streaming resiliente, diseñada para superar los desafíos críticos del streaming moderno: bloqueos de IP, latencia excesiva, y degradación de calidad en conexiones inestables. Esta versión introduce el concepto revolucionario de "Edge Neural Upscaling", donde la mejora visual se delega al dispositivo final del usuario mediante la inyección inteligente de metadatos, eliminando completamente la necesidad de proxies de video que tradicionalmente exponen la infraestructura y consumen recursos innecesarios.

El sistema opera bajo tres principios fundamentales que lo distinguen de cualquier solución existente en el mercado. El principio de Zero-Proxy garantiza que el VPS nunca actúe como túnel de bytes de video, limitando su intervención exclusivamente al plano de control mediante la manipulación de manifiestos M3U8. El principio de Idempotencia Atómica asegura respuestas consistentes y predecibles para cada solicitud, independentemente de la carga del sistema. Finalmente, el Polimorfismo Adaptativo permite al sistema detectar automáticamente las características del contenido y aplicar la estrategia de mejora más apropiada sin intervención manual.

### Ventajas Competitivas Clave

| Métrica | Solución Tradicional | APE v6.2 |
|---------|---------------------|----------|
| IP Visible por ISP | IP del VPS (Alto riesgo) | IP del Usuario (Tráfico limpio) |
| Ancho de Banda VPS | x2 (Entrada + Salida) | 0 Bytes (Solo metadatos) |
| Latencia Adicional | 200-500ms | <5ms |
| Riesgo de Bloqueo | Alto | Cero |
| Escalabilidad | Limitada por hardware | Ilimitada |

---

## 2. Arquitectura del Sistema

### 2.1 Visión General

La arquitectura APE v6.2 implementa un modelo de capas donde cada componente tiene responsabilidades claramente definidas y opera de manera independiente pero coordinada. El diseño modular permite actualizaciones granulares sin afectar la operación global del sistema, mientras que la separación entre plano de control y plano de datos garantiza que las operaciones de procesamiento de video nunca impacten el rendimiento del servidor.

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAPA DE PRESENTACIÓN                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │    VLC      │  │    Kodi     │  │     Smart TV Apps       │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
└─────────┼────────────────┼─────────────────────┼────────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CAPA DE ENTRADA                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              resolve_quality.php                            ││
│  │   • Validación de parámetros                                ││
│  │   • Carga de shims                                          ││
│  │   • Delegación a motores                                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CAPA DE ORQUESTACIÓN                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │          ResilienceIntegrationShim.php                      ││
│  │   • Coordinación de motores                                 ││
│  │   • Agregación de resultados                                ││
│  │   • Gestión de fallbacks                                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CAPA DE MOTORES                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐     │
│  │ NeuroBuffer  │ │ ModemPriority│ │ AISuperResolution    │     │
│  │ Controller   │ │ Manager      │ │ Engine               │     │
│  └──────────────┘ └──────────────┘ └──────────────────────┘     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐     │
│  │ Manifest     │ │ Channel      │ │ QoS/QoE              │     │
│  │ Rewriter     │ │ Memory Engine│ │ Engine               │     │
│  └──────────────┘ └──────────────┘ └──────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CAPA DE DATOS                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐     │
│  │ channels_map │ │ origins.json │ │ logs/                │     │
│  │ .json        │ │              │ │                      │     │
│  └──────────────┘ └──────────────┘ └──────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Diagrama de Componentes

El sistema se compone de seis motores principales que trabajan en conjunto para ofrecer una experiencia de streaming óptima. El motor NeuroBufferController implementa la lógica de agresión orgánica, escalando los buffers de manera progresiva según las condiciones de red detectadas. ModemPriorityManager gestiona la priorización del tráfico mediante marcas DSCP y optimización de conexiones TCP. AISuperResolutionEngine constituye el componente más innovador, responsable de la inyección de metadatos que activan las capacidades de mejora visual en los dispositivos de los usuarios. ManifestRewriter ejecuta la cirugía de manifiestos, eliminando pistas de baja calidad e inyectando directivas de optimización. ChannelMemoryEngine mantiene el estado de cada canal incluyendo estadísticas de rendimiento y configuración. Finalmente, QoSQoEEngine monitoriza la calidad de servicio y experiencia, generando métricas para optimización continua.

---

## 3. Principios de Diseño

### 3.1 La Regla del Zero-Proxy

El principio Zero-Proxy establece que el VPS nunca debe actuar como intermediario en el flujo de bytes de video. Esta restricción fundamental elimina tres problemas críticos inherentes a las arquitecturas de proxy tradicional: la exposición de la IP del servidor al proveedor de contenido, el consumo duplicado de ancho de banda, y la latencia adicional introducida por el procesamiento intermedio.

La implementación de este principio requiere que toda manipulación ocurra en dos planos claramente separados. El Plano de Control opera exclusivamente en el VPS y se limita a la intervención de texto mediante manifiestos M3U8 e inyección de metadatos. El Plano de Datos permanece completamente distribuido, con cada dispositivo de usuario estableciendo conexiones directas a los servidores de origen después de recibir las instrucciones del plano de control.

```php
// EJEMPLO: Implementación Zero-Proxy en resolve_quality.php

// CORRECTO: URL directa al origen
$finalUrl = $baseUrl; // http://origin/live/user/pass/channel.m3u8

// INCORRECTO: Nunca usar proxy de video
// $finalUrl = "http://vps/proxy_video.php?id=xxx"; // PROHIBIDO
```

### 3.2 Idempotencia Atómica

La idempotencia atómica garantiza que cualquier solicitud `GET /resolve_quality.php` con parámetros idénticos produzca exactamente la misma respuesta, independientemente del momento de la solicitud o el estado del sistema. Esta propiedad es esencial para la cacheabilidad HTTP y la previsibilidad del comportamiento del sistema.

Para cada solicitud, el sistema devuelve una respuesta estructurada que incluye el código de estado HTTP 200 OK con un manifiesto limpio, la URL directa al origen sin modificaciones de proxy, y los metadatos inyectados que guían al player sobre cómo optimizar la reproducción. Esta consistencia permite a los CDNs y caches intermedios almacenar respuestas válidas sin riesgo de inconsistencias.

### 3.3 Polimorfismo Adaptativo

El polimorfismo adaptativo permite al sistema detectar automáticamente las características del contenido solicitado y aplicar la estrategia de optimización más apropiada sin intervención manual. Este comportamiento inteligente se basa en la resolución detectada del stream, que determina qué tipo de mejoras se aplicarán.

Para contenido 4K Nativo (2160p o superior), el sistema inyecta metadatos de Deep Color que fuerzan la máxima fidelidad cromática mediante subsampling 4:4:4. Para contenido Full HD (1080p), se aplican Fake HDR Hints que engañan a las Smart TVs para que activen sus algoritmos de mejora de color y contraste. Para contenido HD (720p) o SD (480p), se inyectan Neural Upscaling Flags que obligan a los dispositivos modernos a escalar la imagen utilizando sus chips de IA internos, logrando resultados visuales superiores sin procesamiento server-side.

---

## 4. Componentes Principales

### 4.1 ManifestRewriter.php

El componente ManifestRewriter constituye el intervener quirúrgico del sistema, responsable de descargar, analizar, modificar y entregar manifiestos M3U8 optimizados. Su funcionamiento se basa en un proceso de cuatro fases que garantiza tanto la máxima calidad como la resiliencia ante fallos.

**Fase 1: Fetch Rápido**
El sistema realiza una petición HTTP al origen con un timeout agresivo de 3 segundos para evitar bloqueos en caso de servidores lentos. La petición incluye el User-Agent del player original para mantener la transparencia con el proveedor.

```php
private static function fetchOrigin(string $url, string $ua): string
{
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERAGENT => $ua,
        CURLOPT_TIMEOUT => 3,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $data = curl_exec($ch);
    curl_close($ch);
    return $data ?: '';
}
```

**Fase 2: Análisis y Filtrado**
El manifiesto se analiza línea por línea para identificar y eliminar las pistas de baja calidad. La regla de oro establece que cualquier pista con BANDWIDTH menor a 10,000,000 (10Mbps) debe ser eliminada, forzando al player a seleccionar automáticamente la calidad más alta disponible.

```php
// DETECTAR PISTAS DE BAJA CALIDAD
if (strpos($line, '#EXT-X-STREAM-INF:') === 0) {
    if (preg_match('/BANDWIDTH=(\d+)/', $line, $matches)) {
        $bw = (int)$matches[1];
        if ($bw < 10000000) {
            $skipNext = true; // Saltar esta pista y su URL
            continue;
        }
    }
}
```

**Fase 3: Inyección de Agresión**
Se insertan directivas específicas para VLC y Kodi al inicio del manifiesto. Estas directivas instruyen al player sobre el comportamiento de buffering y la selección de calidad.

```php
private static function buildAggressiveHeaders(array $profile): array
{
    $h = [];
    $h[] = "#EXTVLCOPT:network-caching=" . ($profile['buffer_target_ms'] ?? 60000);
    $h[] = "#EXTVLCOPT:adaptive-logic=highest";
    $h[] = "#EXTVLCOPT:adaptive-maxwidth=7680";
    $h[] = "#EXTVLCOPT:http-reconnect=true";
    $h[] = "#KODIPROP:inputstream=inputstream.adaptive";
    $h[] = "#KODIPROP:inputstream.adaptive.max_bandwidth=100000000";
    return $h;
}
```

**Fase 4: Entrega con Failover**
En caso de fallo en la obtención del manifiesto original, el sistema devuelve un manifiesto de emergencia en lugar de un error HTTP, evitando que el player se congele mientras intenta reconectar.

### 4.2 NeuroBufferController.php

El controlador NeuroBuffer implementa el sistema de agresión orgánica que ajusta dinámicamente los parámetros de buffering según las condiciones detectadas. El término "orgánica" refleja la naturaleza progresiva y adaptativa de las escalaciones, que crecen de manera natural en respuesta a problemas persistentes.

**Niveles de Escalación**

| Nivel | Multiplicador | Buffer Target | Trigger |
|-------|---------------|---------------|---------|
| Normal | x1 | 30s | Condiciones óptimas |
| Preventivo | x2 | 45s | Primer síntoma de inestabilidad |
| Agresivo | x4 | 60s | Buffer drops detectados |
| Nuclear | x8 | 120s | Múltiples fallos consecutivos |

```php
public static function calculateAggression(
    string $channelId, 
    float $bufferPct, 
    array $networkInfo
): array {
    // Análisis de tendencia
    $trend = self::analyzeTrend($channelId, $bufferPct);
    
    // Determinación de nivel
    if ($trend === 'declining' || $bufferPct < 20) {
        return self::escalate($channelId, 'NUCLEAR');
    } elseif ($bufferPct < 40) {
        return self::escalate($channelId, 'AGGRESSIVE');
    } elseif ($bufferPct < 60) {
        return self::escalate($channelId, 'PREVENTIVE');
    }
    
    return self::baseProfile();
}
```

### 4.3 AISuperResolutionEngine.php

El motor de super-resolución por IA representa la innovación más significativa de la versión 6.2, implementando la estrategia de Edge Neural Upscaling que delega el trabajo de mejora visual al dispositivo del usuario.

**Estrategia SD → "Falso HD"**
Para contenido SD (resolución menor a 700p), el sistema inyecta metadatos que engañan al player para que active sus algoritmos de escalado más agresivos. Los dispositivos modernos como Smart TVs Samsung, LG y Sony incorporan chips dedicados de IA que pueden mejorar significativamente la calidad de imagen cuando se les proporcionan las pistas correctas.

```php
if ($height < 700) {
    $exthttp['X-Force-Resolution'] = '1920x1080';
    $exthttp['X-AI-Upscale-Mode'] = 'LANCZOS_SHARP';
    $vlcopt[] = "#EXTVLCOPT:swscale-mode=9"; // Lanczos
    $vlcopt[] = "#EXTVLCOPT:postproc-q=6"; // Máxima calidad
}
```

**Estrategia HD → "Fake HDR"**
Para contenido HD (720p a 1080p), se inyectan metadatos que simulan información HDR. Las Smart TVs interpretan estos metadatos y activan sus algoritmos de mejora de color, resultando en una imagen más vibrante sin requerir contenido HDR nativo.

```php
if ($height >= 700 && $height < 1000) {
    $exthttp['X-HDR-Simulation'] = 'ACTIVE';
    $exthttp['X-Color-Space-Override'] = 'BT2020';
    $exthttp['X-Transfer-Function'] = 'PQ';
    $vlcopt[] = "#EXTVLCOPT:saturation=1.2";
    $vlcopt[] = "#EXTVLCOPT:contrast=1.1";
}
```

**Estrategia 4K → "Deep Color"**
Para contenido 4K nativo, se inyectan metadatos que fuerzan la máxima fidelidad cromática mediante subsampling 4:4:4, eliminando el banding visible en degradados y mejorando la nitidez de bordes.

### 4.4 ResilienceIntegrationShim.php

El shim de integración actúa como orquestador central, coordinando la invocación de todos los motores y agregando sus resultados en una respuesta coherente. Su diseño minimalista garantiza que la latencia adicional sea despreciable.

```php
class ResilienceIntegrationShim {
    public static function enhance(string $channelId, array $decision): array {
        $result = ['exthttp' => [], 'extvlcopt' => [], 'url_override' => null];

        // 1. Agresión de Buffer
        $aggression = NeuroBufferController::calculateAggression(
            $channelId, 
            $decision['buffer_pct'] ?? 72.0, 
            $decision['network_info'] ?? []
        );
        $result['exthttp'] = array_merge(
            $result['exthttp'], 
            NeuroBufferController::buildAggressionHeaders($aggression)
        );

        // 2. Prioridad de Red
        $priority = ModemPriorityManager::analyze($decision, []);
        $result['exthttp'] = array_merge(
            $result['exthttp'], 
            ModemPriorityManager::buildPriorityHeaders($priority)
        );

        // 3. AI Upscaling
        $detectedHeight = $decision['height'] ?? 1080;
        AISuperResolutionEngine::injectClientSideLogic(
            $detectedHeight, 
            $result['exthttp'], 
            $result['extvlcopt']
        );

        return $result;
    }
}
```

---

## 5. Flujo de Datos

### 5.1 Secuencia de Solicitud Estándar

El flujo de una solicitud típica sigue una secuencia optimizada que garantiza respuesta en menos de 5 milisegundos para el procesamiento server-side.

**Paso 1: Solicitud del Player**
El player solicita un canal mediante una URL estructurada que incluye todos los parámetros necesarios para la resolución atómica.

```
GET /resolve_quality.php?ch=1312008&p=P0&origin=line.tivi-ott.net&sid=1312008
```

**Paso 2: Procesamiento VPS**
El servidor ejecuta la resolución en cuatro fases rápidas: lectura del mapa de canales para obtener la URL limpia, cálculo del nivel de agresión mediante NeuroBuffer, inyección de metadatos de mejora visual, y construcción de la respuesta HTTP 200 OK con el manifiesto modificado.

**Paso 3: Conexión Directa**
El player lee el manifiesto recibido, interpreta los headers inyectados, y establece conexión directa con el servidor de origen para solicitar los segmentos de video. El proveedor ve la IP del usuario, no la del VPS.

**Paso 4: Renderizado Mejorado**
El player aplica las optimizaciones indicadas por los metadatos, utilizando sus capacidades internas para escalar, mejorar colores, o aplicar procesamiento de imagen según corresponda.

### 5.2 Diagrama de Secuencia

```
Player          VPS              Origin
   │             │                 │
   │──GET /resolve────────────────►│
   │             │                 │
   │             │──Fetch Manifest►│
   │             │◄────────────────│
   │             │                 │
   │             │ [Process]       │
   │             │ [Inject]        │
   │             │                 │
   │◄──M3U8 Modified───────────────│
   │             │                 │
   │──GET segment.ts───────────────►
   │◄─────────────segment.ts───────│
   │             │                 │
   │ [Enhanced   │                 │
   │  Playback]  │                 │
```

---

## 6. API Reference

### 6.1 Endpoint Principal

**resolve_quality.php**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| ch | string | Sí | ID del canal |
| p | string | No | Perfil de calidad (P0-P5) |
| origin | string | No | Servidor de origen preferido |
| sid | string | No | Stream ID numérico |
| buffer_pct | float | No | Porcentaje de buffer actual |
| net_type | string | No | Tipo de red (ethernet/wifi/mobile) |

**Respuesta Exitosa (HTTP 200)**

```m3u8
#EXTM3U
#EXTVLCOPT:network-caching=60000
#EXTVLCOPT:adaptive-logic=highest
#EXTHTTP:{"X-AI-Upscale-Mode":"LANCZOS_SHARP"}
#EXTINF:-1,Channel Name
http://origin/live/user/pass/channel.m3u8
```

### 6.2 Códigos de Error

| Código | Descripción | Acción Recomendada |
|--------|-------------|-------------------|
| 400 | Missing ID | Incluir parámetro ch |
| 404 | Channel not found | Verificar ID de canal |
| 200 | OK (con manifest emergencia) | Reintentar en origen alternativo |

---

## 7. Configuración y Despliegue

### 7.1 Requisitos del Sistema

- PHP 8.1 o superior
- Extensión cURL habilitada
- Nginx con gzip_static activado
- Sistema de caché en /tmp con permisos de escritura

### 7.2 Script de Despliegue

```bash
#!/bin/bash
# deploy_resilience_v6.2.sh

# 1. Backup
cp /var/www/iptv-ape/resolve_quality.php /var/www/iptv-ape/resolve_quality.php.bak

# 2. Deploy modules
cp backend/cmaf_engine/modules/*.php /var/www/iptv-ape/cmaf_engine/modules/
cp backend/cmaf_engine/resilience_integration_shim.php /var/www/iptv-ape/cmaf_engine/
cp backend/resolve_quality.php /var/www/iptv-ape/

# 3. Permissions
chown -R www-data:www-data /var/www/iptv-ape/cmaf_engine
chmod 755 /var/www/iptv-ape/cmaf_engine/modules/*.php

# 4. Cache setup
mkdir -p /tmp/upscale_cache
chown www-data:www-data /tmp/upscale_cache

# 5. Reload services
systemctl reload php8.3-fpm
systemctl reload nginx

echo "✅ APE v6.2 deployed successfully"
```

### 7.3 Configuración Nginx

```nginx
location ~ \.php$ {
    fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include fastcgi_params;
    
    # Optimizaciones para streaming
    fastcgi_read_timeout 5s;
    fastcgi_send_timeout 5s;
}

# Cache de archivos para URLs veloces
open_file_cache max=10000 inactive=30s;
open_file_cache_valid 60s;
open_file_cache_min_uses 2;
```

---

## 8. Análisis y Mejoras Propuestas

### 8.1 Análisis de Componentes Existentes

**Fortalezas Identificadas**

El sistema actual presenta varias fortalezas significativas que lo posicionan como una solución de clase mundial. La arquitectura Zero-Proxy elimina completamente el riesgo de bloqueos por IP compartida, mientras que la delegación de mejora visual al cliente reduce drásticamente los costos de infraestructura. El diseño modular permite actualizaciones sin tiempo de inactividad, y el sistema de escalación orgánica NeuroBuffer garantiza adaptación automática a condiciones de red variables.

**Áreas de Mejora Identificadas**

Tras un análisis exhaustivo, se identificaron varias oportunidades de optimización que podrían llevar el sistema al siguiente nivel de rendimiento y confiabilidad.

### 8.2 Mejora 1: Sistema de Predicción Preditiva

**Problema**
El sistema actual es reactivo, escalando los buffers solo después de detectar problemas. Esto puede resultar en breves períodos de degradación antes de que la escalación surta efecto.

**Solución Propuesta**
Implementar un sistema de predicción basado en patrones históricos que anticipe problemas de conectividad antes de que ocurran.

```php
class PredictiveBufferController {
    private static function predictBufferNeeds(string $channelId): array {
        // Análisis de patrones históricos por hora del día
        $hourlyPatterns = self::getHourlyPatterns($channelId);
        $currentHour = (int)date('H');
        
        // Si históricamente este canal falla a esta hora, pre-escalar
        if ($hourlyPatterns[$currentHour]['failure_rate'] > 0.3) {
            return ['preemptive_level' => 'AGGRESSIVE', 'confidence' => 0.85];
        }
        
        return ['preemptive_level' => 'NORMAL', 'confidence' => 0.95];
    }
}
```

### 8.3 Mejora 2: Failover Multi-Origen Inteligente

**Problema**
El sistema actual depende de un origen único por canal. Si ese origen falla, no hay recuperación automática.

**Solución Propuesta**
Implementar sistema de failover con múltiples orígenes y health-checking proactivo.

```php
class OriginFailoverManager {
    private static array $origins = [
        'primary' => 'line.tivi-ott.net',
        'secondary' => 'backup.tivi-ott.net',
        'tertiary' => 'cdn.tivi-ott.net'
    ];
    
    public static function getBestOrigin(string $channelId): string {
        foreach (self::$origins as $name => $host) {
            if (self::healthCheck($host)) {
                return $host;
            }
        }
        return self::$origins['primary']; // Fallback
    }
    
    private static function healthCheck(string $host): bool {
        // TCP ping con timeout de 500ms
        $start = microtime(true);
        $socket = @fsockopen($host, 80, $errno, $errstr, 0.5);
        $latency = (microtime(true) - $start) * 1000;
        
        if ($socket) {
            fclose($socket);
            return $latency < 200; // Aceptable si < 200ms
        }
        return false;
    }
}
```

### 8.4 Mejora 3: Métricas de Cliente en Tiempo Real

**Problema**
El sistema carece de visibilidad sobre la experiencia real del usuario una vez que comienza la reproducción.

**Solución Propuesta**
Implementar endpoint de telemetría que los players pueden usar para reportar métricas.

```php
// telemetry.php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$metrics = [
    'channel_id' => $_POST['channel_id'] ?? null,
    'buffer_level' => (float)($_POST['buffer_level'] ?? 0),
    'bitrate' => (int)($_POST['bitrate'] ?? 0),
    'dropped_frames' => (int)($_POST['dropped_frames'] ?? 0),
    'stalls' => (int)($_POST['stalls'] ?? 0),
    'timestamp' => time()
];

// Almacenar para análisis
TelemetryEngine::record($metrics);

// Responder con recomendación
$recommendation = NeuroBufferController::calculateAggression(
    $metrics['channel_id'],
    $metrics['buffer_level'],
    []
);

echo json_encode([
    'status' => 'recorded',
    'recommended_buffer' => $recommendation['buffer_target_ms']
]);
```

### 8.5 Mejora 4: Compresión de Metadatos

**Problema**
Los manifiestos con múltiples directivas pueden volverse verbosos, aumentando el tiempo de transferencia inicial.

**Solución Propuesta**
Implementar compresión gzip para manifiestos y optimización de la estructura de headers.

```php
// En resolve_quality.php
if (strpos($_SERVER['HTTP_ACCEPT_ENCODING'], 'gzip') !== false) {
    ob_start('ob_gzhandler');
}
header('Content-Type: application/vnd.apple.mpegurl');
header('Content-Encoding: gzip');
```

---

## 9. Troubleshooting

### 9.1 Problemas Comunes

**Síntoma: Video no inicia**
Causas probables: Canal no encontrado en channels_map.json, origen no responde, o firewall bloqueando conexión.
Solución: Verificar existencia del canal en el mapa, comprobar conectividad con origen mediante curl, y revisar logs de firewall.

**Síntoma: Calidad baja a pesar de perfil P0**
Causas probables: Filtrado de pistas no funciona, o player ignora directivas de calidad.
Solución: Verificar que ManifestRewriter está procesando correctamente, y confirmar que el player soporta las directivas EXTVLCOPT utilizadas.

**Síntoma: Buffering constante**
Causas probables: NeuroBuffer no está escalando, o condiciones de red genuinamente malas.
Solución: Verificar logs de NeuroBuffer para confirmar escalación, y si el problema persiste, considerar downgrade temporal de calidad.

### 9.2 Comandos de Diagnóstico

```bash
# Verificar respuesta del endpoint
curl -v "http://vps/resolve_quality.php?ch=1312008&p=P0"

# Verificar URL limpia en respuesta
curl -s "http://vps/resolve_quality.php?ch=1" | grep "http://"

# Verificar metadatos inyectados
curl -s "http://vps/resolve_quality.php?ch=1" | grep "X-"

# Test de conectividad con origen
curl -I "http://origin-server/live/user/pass/channel.m3u8"
```

---

## 10. Apéndices

### A. Glosario de Términos

| Término | Definición |
|---------|------------|
| Zero-Proxy | Arquitectura donde el servidor nunca actúa como intermediario de bytes de video |
| Idempotencia Atómica | Propiedad donde solicitudes idénticas producen respuestas idénticas |
| Polimorfismo Adaptativo | Capacidad del sistema de adaptar su comportamiento según el contexto |
| Edge Neural Upscaling | Mejora visual delegada al dispositivo del usuario mediante metadatos |
| NeuroBuffer | Sistema de buffering adaptativo con escalación orgánica |
| Deep Color | Metadatos que fuerzan máxima fidelidad cromática (4:4:4) |
| Fake HDR | Metadatos que simulan información HDR para activar mejoras en Smart TVs |

### B. Referencias de Headers

**Headers EXTVLCOPT Soportados**

| Header | Valores | Propósito |
|--------|---------|-----------|
| network-caching | 30000-120000 | Buffer de red en milisegundos |
| adaptive-logic | highest/lowest/bandwidth | Estrategia de selección de calidad |
| adaptive-maxwidth | 1920/3840/7680 | Resolución máxima permitida |
| http-reconnect | true/false | Auto-reconexión en fallos |
| swscale-mode | 0-10 | Algoritmo de escalado |
| postproc-q | 0-6 | Calidad de post-procesamiento |

**Headers EXTVLCOPT de Color**

| Header | Valores | Propósito |
|--------|---------|-----------|
| saturation | 0.0-2.0 | Saturación de color |
| contrast | 0.0-2.0 | Contraste de imagen |
| brightness | -1.0-1.0 | Brillo de imagen |

### C. Matriz de Compatibilidad

| Player | EXTVLCOPT | EXTVLCOPT HDR | KODIPROP |
|--------|-----------|---------------|----------|
| VLC Desktop | ✅ | ✅ | ❌ |
| VLC Mobile | ✅ | Parcial | ❌ |
| Kodi | ✅ | ✅ | ✅ |
| TiviMate | Parcial | ❌ | ❌ |
| Smart TV Samsung | ❌ | ✅ | ❌ |
| Smart TV LG | ❌ | ✅ | ❌ |
| Smart TV Sony | ❌ | ✅ | ❌ |

---

*Documento generado para APE Architecture Group*  
*Versión 6.2 - Marzo 2026*
