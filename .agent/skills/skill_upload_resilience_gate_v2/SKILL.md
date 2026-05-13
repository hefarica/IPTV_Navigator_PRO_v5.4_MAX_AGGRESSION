---
name: Skill Upload Resilience Gate v2 (Anti-No-Space & Anti-Double-Underscore)
description: Regla de resiliencia paramétrica para el Upload Gateway. Instituye la gestión absoluta de nombres (Sanitización sin dobles guiones) y la doctrina obligatoria de footprint del Gzip Proxy para evitar asfixia de almacenamiento en el VPS.
---

# Skill_Upload_Resilience_Gate_v2

## 🚨 REGLAS ABSOLUTAS — NUEVA ARQUITECTURA DE SUBIDA Y STORAGE

### 1. Zero Double-Underscore Doctrine (`__1_`)
Históricamente, los navegadores (como Chrome) auto-completan descargas repetidas envolviendo el iterador en paréntesis, ejemplo: `Lista (1).m3u8`. El reemplazo ciego `[^a-zA-Z0-9._-]` transformaba los paréntesis e insertaba asimetrías como `Lista__1_.m3u8`.
* **Regla Absoluta de Sanitización (Client & Server):**
  - **Fase 1:** Eliminar paréntesis primero y de forma silenciosa: `.replace(/[()]/g, '')`
  - **Fase 2:** Transformar múltiples espacios a un guión bajo: `.replace(/\s+/g, '_')`
  - **Fase 3:** Remover caracteres prohíbidos (manteniendo extensión): `.replace(/[^a-zA-Z0-9._-]/g, '')`
  - **Fase 4 (ANTI-BLEED):** Colapsar guiones bajos dobles resultantes: `.replace(/_+/g, '_')`

> **Backend Compliance:** Esto se debe cumplir **1:1** en \`gateway-manager.js\` y sus contrapartes en PHP (\`upload.php\`, \`finalize_upload.php\`) y Rust (\`upload-server\`). ¡Sin divergencias!

### 2. GZIP Payload Storage Forensics & The "No Space Left on Device" Blockade
La directiva de compresión por Streaming o Bash via `gzip -9 -k -f` requiere **el doble del peso del archivo** disponible en \`/var/www/lists/\` como cuota de scratch space (espacio temporal).
* **Escenario de Falla Nuclear:** Si un archivo M3U8 es de 320 MB, y el VPS (`/dev/sda1`) tiene solo 310 MB disponibles, el comando `gzip` fallará silenciosamente o con error `No space left on device`.
* **Consecuencia Destructiva:**
  - El `.m3u8.gz` quedará corrupto o vacío.
  - El Placeholder Trick (`#EXTM3U\n` de 8 bytes) NUNCA se escribirá.
  - NGINX tratará de servir el M3U8 crudo de 320 MB matando el ancho de banda, o peor, un `.gz` truncado.

#### 🛡 Acción Coercitiva (SRE):
- Si el proceso falla por espacio, se ordena iniciar sesión en la IP `178.156.147.234` mediante SSH y ejecutar limpieza forense.
- Buscar .zip viejos o `.m3u8` crudos atascados sin compresión.
- La confirmación visual de que el proceso ha sido exitoso debe ser un archivo `.m3u8` base mutilado a exactos **8 bytes**, mientras el `.m3u8.gz` contiene el payload íntegro de +100MB.

### 3. Placeholder Integrity Standard
La Manifest URL para el cliente IPTV **SIEMPRE ES LA BASE NO-GZ**:
* Ej: `https://iptv-ape.duckdns.org/lists/APE_TYPED_ARRAYS_ULTIMATE_2026MMDD_1.m3u8`
* Si OTT Navigator hace un GET, el subsistema `gzip_static;` en el bloque de Nginx captura esta solicitud y secretamente inyecta el disco comprimido en el proxy buffer con header `Content-Encoding: gzip`.
* Por ende, NUNCA expongas la ruta acabada en `.gz` al cliente final o en la respuesta JSON. El JSON de telemetría debe escudarse con `url` = archivo `.m3u8`.
