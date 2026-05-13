---
name: SOP OMEGA ABSOLUTE v5.2
description: Flujo Maestro de Arquitectura, Despliegue y Hardening del Ecosistema OMEGA ABSOLUTE v5.2 (200 OK, Pilar 5 y Enmascaramiento HMAC).
---
# SOP: Arquitectura y Despliegue del Ecosistema OMEGA ABSOLUTE 200 OK

**Versión:** 5.2-RFC8216  
**Fecha:** Abril 2026  
**Clasificación:** Confidencial / Técnico Nivel 3  

---

## 1. Propósito y Alcance

Este Procedimiento Operativo Estándar (SOP) unifica las directrices arquitectónicas, de seguridad y de despliegue para el **Ecosistema OMEGA ABSOLUTE v5.2**. Su propósito es garantizar la correcta generación de listas M3U8, la protección de credenciales de origen mediante proxies criptográficos, el blindaje semántico del frontend JavaScript y el despliegue del Motor Polimórfico unificado (SSOT) en entornos de producción.

El alcance cubre desde el procesamiento inicial de una lista M3U8 cruda (inyección Phantom Hydra), pasando por la auditoría preventiva del frontend, el enmascaramiento de seguridad (Fallback Proxy), hasta el despliegue atómico y la resolución de problemas automatizada.

## 2. Definiciones y Terminología

| Término | Definición |
|---------|------------|
| **SSOT (Single Source Of Truth)** | Archivo `resolve_quality_unified.php` que centraliza toda la lógica del backend (Motor Polimórfico 200 OK, Enriquecedor M3U8 y Health Check). |
| **Phantom Hydra** | Módulo de inyección Python que inserta 52 directivas extremas por canal para evasión de ISP (DoH, SNI, Traffic Morphing). |
| **Fallback Proxy** | Mecanismo de seguridad (`fallback_proxy.php`) que enmascara las credenciales del proveedor IPTV mediante un token HMAC-SHA256. |
| **Orden Canónico RFC 8216** | Estructura estricta del bloque por canal: `EXTINF` → `EXTVLCOPT` → `EXTHTTP` → `KODIPROP` → `APE` → `URL`. |
| **Object Mismatch** | Falso positivo generado cuando el frontend intenta leer propiedades de un String (ej. `profile.settings`) provocando un `TypeError`. |
| **Pilar 5 (Superioridad del 95%)** | Córtex JavaScript que diagnostica y resuelve el 99% de los errores HTTP (400, 401, 403, 405) en menos de 60 ms. |

## 3. Roles y Responsabilidades

- **Arquitecto / Operador OMEGA:** Responsable de ejecutar los scripts de inyección, configurar las claves criptográficas, auditar la lista final y auditar semánticamente el código JavaScript.
- **Administrador de Sistemas (SysAdmin):** Responsable del despliegue atómico en el VPS, configuración de Nginx/Apache, gestión de caché (APCu) y monitoreo de logs.

## 4. Prerrequisitos y Requisitos Técnicos

### 4.1 Entorno Local (Generación)
- Python 3.11 o superior.
- Repositorio local inicializado en `backend/omega_ecosystem_v5.2`.

### 4.2 Entorno VPS (Producción)
- Servidor web (Nginx o Apache) con PHP 8.1 o superior.
- Extensión `php-apcu` habilitada (para rate limiting y caché).
- Certificado SSL/TLS válido (HTTPS obligatorio).

### 4.3 Prerrequisitos de Auditoría (Skills)
Antes de cualquier despliegue, el sistema debe tener activadas las siguientes skills maestras:
- `falso_positivo_semantic_detector`: Protocolo forense para NUNCA culpar a la red por errores de tipado.
- `semantic_typecheck_and_audit`: Flujo pre-despliegue que obliga al uso de Optional Chaining (`?.`) y fusiones nulas (`??`).

## 5. Procedimiento Paso a Paso

El ciclo de vida del ecosistema OMEGA consta de cinco fases secuenciales.

### FASE 1: Inyección Phantom Hydra y Generación de Lista

Esta fase toma una lista cruda y le inyecta las directivas de evasión ISP y la URL única hacia el SSOT.

1.  **Verificar configuración del inyector:**
    Asegúrate de que `DEFAULT_PROXY_BASE` en el script apunte al SSOT correcto:
    `DEFAULT_PROXY_BASE = "https://tu-dominio.com/resolve_quality_unified.php"`
2.  **Ejecutar la inyección:**
    ```bash
    python3 inject_phantom_single_url.py lista_cruda.m3u8 lista_inyectada.m3u8
    ```
3.  **Validar salida:**
    Verifica que el archivo resultante contenga exactamente 53 líneas por canal.

### FASE 2: Auditoría Semántica del Frontend (Hardening JS)

Antes de generar la lista final, se debe blindar el frontend JavaScript (`m3u8-typed-arrays-ultimate.js`, `streaming-calculator.js`).

1.  **Ejecutar el `semantic_typecheck_and_audit`:**
    Revisar el código fuente en busca de variables expuestas sin Optional Chaining.
2.  **Erradicar el "Object Mismatch":**
    Asegurar que la configuración del perfil se lea exclusivamente de la variable maestra `cfg` (obtenida de `getProfileConfig(profile)`) y **NUNCA** de `profile.settings` (ya que `profile` es un String).
3.  **Aplicar casteo forzado:**
    Implementar Fallbacks de Dios en todos los cálculos críticos:
    ```javascript
    resolution: cfg?.resolution || '3840x2160',
    codec: cfg?.codec || 'HEVC-MAIN10,AV1,H264-HIGH',
    fps: parseInt(cfg?.fps || 120, 10),
    ```

### FASE 3: Enmascaramiento de Seguridad (Fallback Proxy)

Esta fase elimina las credenciales expuestas en la directiva `#EXT-X-APE-FALLBACK-DIRECT`.

1.  **Autogenerar el Token Maestro:**
    Genera un token seguro HMAC-SHA256 de 64 caracteres.
2.  **Ejecutar el enmascaramiento:**
    ```bash
    python3 mask_fallback_direct.py \
        --input lista_inyectada.m3u8 \
        --output lista_segura.m3u8 \
        --proxy "https://tu-dominio.com/fallback_proxy.php" \
        --secret "TU_CLAVE_ALEATORIA_AQUI"
    ```

### FASE 4: Despliegue Atómico en Producción (VPS)

1.  **Inyección Asíncrona de Claves:**
    Inyecta el `FALLBACK_SECRET` maestro en `fallback_proxy.php` y en los scripts Python locales de forma simultánea.
2.  **Despliegue al VPS:**
    Sube `resolve_quality_unified.php` y `fallback_proxy.php` a `/var/www/html/`.
3.  **Prueba de Sintaxis Post-Deploy:**
    Ejecuta en el VPS: `php -l /var/www/html/resolve_quality_unified.php`
4.  **Test del Endpoint Health Check:**
    Ejecuta inmediatamente: `curl https://tu-dominio.com/resolve_quality_unified.php?mode=health`
    Debe retornar HTTP 200 y el estado JSON de los subsistemas.

### FASE 5: Auditoría Forense y Control de Calidad (QA)

1.  **Ejecutar auditoría completa:**
    ```bash
    python3 audit_full_m3u8.py
    ```
2.  **Checklist de Validación (QA):**
    - [ ] **Integridad:** `EXTINF == URL` (Relación 1:1 estricta).
    - [ ] **Orden Canónico:** `EXTINF` → `EXTVLCOPT` → `EXTHTTP` → `KODIPROP` → `APE` → `URL`.
    - [ ] **Seguridad:** Contador "FALLBACK-DIRECT expuesto" = `0`.

## 6. Lógica Condicional y Árboles de Decisión

### Selección del Modo de Fallback Proxy
- **Si** se requiere compatibilidad universal y ancho de banda limitado: → **Modo `rewrite`** (recomendado).
- **Si** el origen debe ser 100% invisible en logs de red: → **Modo `proxy`**.
- **Si** el rendimiento es prioridad absoluta: → **Modo `redirect`**.

## 7. Manejo de Errores y Troubleshooting

| Síntoma / Error | Causa Probable | Solución Inmediata |
|-----------------|----------------|--------------------|
| **Error `TypeError` en Frontend JS** | Object Mismatch (ej. leer `.codec` de un String). | Activar `falso_positivo_semantic_detector`. Corregir el código JS para usar `cfg?.codec` en lugar de `profile.settings.codec`. |
| **HTTP 404 en la URL del canal** | La lista apunta al archivo obsoleto. | Actualizar el generador Python a `resolve_quality_unified.php`. |
| **Respuesta "ADN DE CANAL CORRUPTO"** | Canal no existe en BD del VPS. | Actualizar el mapeo de canales en el VPS. |
| **Errores HTTP 400, 401, 403, 405** | Restricción del ISP o bloqueo del CDN. | El **Pilar 5 (Córtex JS)** interceptará el error y rotará el User-Agent o aplicará fallback automáticamente en <60ms. |
| **Error 403 en Fallback** | Desincronización de reloj o claves distintas. | Sincronizar NTP. Verificar `FALLBACK_SECRET`. |

## 8. Gestión de Artefactos (Repositorio Local)

Todos los scripts y archivos generados deben ser consolidados en el repositorio local bajo la ruta `backend/omega_ecosystem_v5.2/`. Esto incluye:
- `audit_full_m3u8.py`
- `mask_fallback_direct.py`
- `inject_phantom_single_url.py`
- `resolve_quality_unified.php`

## 9. Integración con el Agente (Skills)

Este documento SOP debe ser integrado como una habilidad permanente del agente para asegurar que todas las generaciones futuras cumplan con este estándar.
**Ruta del Skill:** `.agent/skills/sop_omega_absolute_v5_2/SKILL.md`

## 10. Control de Versiones y Registro de Cambios

| Versión | Fecha | Descripción de Cambios |
|---------|-------|------------------------|
| 4.0 | Marzo 2026 | Implementación inicial (arquitectura 302). |
| 5.0 | Abril 2026 | Consolidación SSOT, integración de Fast Probing 200 OK. |
| 5.1 | Abril 2026 | Orden Canónico RFC 8216 y Fallback Zero-Credenciales. |
| 5.2 | Abril 2026 | Integración de Hardening Frontend JS, Skills Semánticos, Despliegue Atómico y Gestión de Errores Pilar 5. |
