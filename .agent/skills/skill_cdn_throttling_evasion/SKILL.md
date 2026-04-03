---
name: Skill_CDN_Throttling_Evasion
description: Rotación de User-Agents y Headers anárquicos (Hardware Spoofing) agresiva al inicio L7 para evadir escaneo CDN y priorización baja.
category: L7 Hardware Spoofing
---
# 1. Teoría de Compresión y Anomalía
CDN de bajo costo identifican programas genéricos (`Lavf/58.20.100`, `VLC/3.0.11`, `Python/3.8`) e inmediatamente limitan su conexión al piso (Throttling asimétrico). Un User-Agent "genérico" es igual a un bit-bloat o buffering infinito, arruinando deportes de lata tasa, ya que el firewall del proveedor asume que eres un "Scraper" o pirata en vez de un televidente humano.

# 2. Directiva de Ejecución (Código / Inyección)
Se utiliza un motor de mutación estocástica de encabezados dentro de los proxies de PHP o directamente en la carga del archivo M3U8 (`user-agent=` en el URI M3U8). Inyectamos identificadores de dispositivos Premium "Rey".

```php
// Engaño Supremo de Dispositivo Premium (God-Tier King Agent):
$premium_ua = "Nvidia_Shield_TV/11.0 (Linux; U; Android TV 11; NVIDIA SHIELD Android TV Pro Build/RQ1A.210105.003) ExoPlayerLib/2.15.1";
curl_setopt($ch, CURLOPT_USERAGENT, $premium_ua);
```
*(Opcionalmente inyectado en `#EXTHTTP:{"User-Agent":"$premium_ua"}`)*.

# 3. Flanco de Orquestación
(Hardware Agent Spoofing). Cuando el firewall y los analizadores del CDN ven "NVIDIA SHIELD Android TV Pro" con ExoPlayer nativo, sus algoritmos (por miedo a reportes de mal servicio en dispositivos premium muy caros y críticos) otorgan "Vía Rápida" (Priority Queue) al socket IP. El cliente obtiene prioridad VIP para recibir cuadros I-Frames UHD, erradicando los retrasos de buffer.
