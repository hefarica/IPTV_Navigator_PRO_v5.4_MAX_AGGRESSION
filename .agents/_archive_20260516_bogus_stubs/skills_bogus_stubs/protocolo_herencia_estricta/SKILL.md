---
name: protocolo_herencia_estricta
description: Regla arquitectónica suprema que exige una paridad 1:1 entre las listas estáticas (generador GUI frontend), channels_map.json (DNA) y los resolvers (resolve.php y resolve_quality.php).
---

# Protocolo de Herencia Estricta (Paridad Absoluta 1:1)

## Objetivo

Garantizar que los parámetros matemáticos, resoluciones, cabeceras HTTP y optimizaciones de QoS (como Latencia Rayo y Nivel de Evasión) definidas en la interfaz de usuario se mantengan inmutables de principio a fin. El `channels_map.json` y los perfiles generados son la LEY. Los backend resolvers (como `resolve.php` y `cmaf_worker.php`) actúan como intérpretes leales de esta ley y NUNCA deben sobreescribir ni ignorar los metadatos heredados; su único rol es acatar el contrato e inyectar sus funciones avanzadas (como Ghost Protocol, Firewall bypass) sin destruir la herencia.

## Procedimiento (Paso a Paso)

1. **Lectura Innegociable del DNA Backend**:
   - Cualquier script `.php` (o de backend) que orqueste la entrega HLS/DASH debe iniciar su proceso decodificando el `channels_map.json`.
   - Se extraerán, parsearán e inyectarán en la sesión HTTP *exactamente* las variables declaradas (ej. `math_telemetry.ping`, `math_telemetry.bw`, `security_evasion.evasion_level`).

2. **Prohibición de Redefinición Hardcodeada**:
   - Queda estrictamente prohibido usar variables en arrays estáticos tipo `array('1920x1080', '1280x720')` dentro del PHP si existen dentro de la herencia del JSON (ej. `fusion_directives.max_resolution`).
   - Los valores *default* en el PHP solo pueden usarse como último recurso de fallback en arreglos nulos empleando el operador `??`.

3. **Inyección Dinámica Directa**:
   - Variables como la Latencia (`ping`) y el Velocidad de Descarga (`qosDownloadMbps` / `bw`) deben influenciar matemáticamente a variables de buffers o de umbrales internos en vez de ser solo metadatos inactivos.

4. **El Plus del Resolver**:
   - El resolver leerá el DNA y luego inyectará sus cabeceras exclusivas (`X-Ghost-Protocol`, `X-BWDIF-Policy`, `X-Manifest-Preference`) en adición a los de herencia estricta. Nunca en vez de.

## Reglas Estrictas

- NUNCA se debe ignorar un parámetro del `channels_map.json` reemplazándolo por una decisión cruda dentro de los scripts `.php` (salvo fallas de red).
- NUNCA se debe usar la etiqueta `#EXT-X-APE-PROXY-ROTATION:true` en los generadores o `.php`, debe ser reemplazada o purgada según el Evasion Level.
- NUNCA modificar el origen de los valores en `math_telemetry` cuando un valor externo del GUI (como `ping` y `bw`) se esté leyendo correctamente vía storage local del browser (ex. `localStorage.getItem('iptv_qos_profile')`).
