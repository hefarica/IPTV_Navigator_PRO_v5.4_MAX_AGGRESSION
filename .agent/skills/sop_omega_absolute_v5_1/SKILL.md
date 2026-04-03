---
name: SOP OMEGA ABSOLUTE v5.1
description: Flujo Maestro de Operaciones y Despliegue del Ecosistema OMEGA ABSOLUTE v5.1 (RFC 8216)
---

# SOP: Operaciones y Despliegue del Ecosistema OMEGA ABSOLUTE v5.0

**Versión:** 5.1-RFC8216  
**Fecha:** Abril 2026  
**Autor:** Arquitectura de Sistemas OMEGA  
**Clasificación:** Confidencial / Técnico Nivel 3  

---

## 1. Propósito y Alcance

Este Procedimiento Operativo Estándar (SOP) unifica las directrices arquitectónicas, de seguridad y de despliegue para el **Ecosistema OMEGA ABSOLUTE v5.0**. Su propósito es garantizar la correcta generación de listas M3U8, la protección de credenciales de origen mediante proxies criptográficos y el despliegue del Motor Polimórfico unificado (SSOT) en entornos de producción (VPS).

El alcance cubre desde el procesamiento inicial de una lista M3U8 cruda (inyección Phantom Hydra), pasando por el enmascaramiento de seguridad (Fallback Proxy), hasta la auditoría forense final y la resolución de problemas (Troubleshooting).

## 2. Definiciones y Terminología

| Término | Definición |
|---------|------------|
| **SSOT (Single Source Of Truth)** | Archivo `resolve_quality_unified.php` que centraliza toda la lógica del backend (Motor Polimórfico 200 OK, Enriquecedor M3U8 y Health Check). Reemplaza al obsoleto `rq_polymorphic_resolver.php`. |
| **Phantom Hydra** | Módulo de inyección Python que inserta 52 directivas extremas por canal para evasión de ISP (DoH, SNI, Traffic Morphing). |
| **Fallback Proxy** | Mecanismo de seguridad (`fallback_proxy.php`) que enmascara las credenciales del proveedor IPTV mediante un token HMAC-SHA256, evitando la exposición de la URL de origen en la directiva `#EXT-X-APE-FALLBACK-DIRECT`. |
| **Contexto (ctx)** | Payload Base64 inyectado en la URL del canal que contiene la configuración de orquestación (perfil, bitrate, codecs). |
| **Orden Canónico RFC 8216** | Estructura estricta del bloque por canal: `EXTINF` → `EXTVLCOPT` → `EXTHTTP` → `KODIPROP` → `APE` → `URL`. |

## 3. Roles y Responsabilidades

- **Arquitecto / Operador OMEGA:** Responsable de ejecutar los scripts de inyección, configurar las claves criptográficas y auditar la lista final.
- **Administrador de Sistemas (SysAdmin):** Responsable del despliegue de los archivos PHP en el VPS, configuración de Nginx/Apache, gestión de caché (APCu) y monitoreo de logs.

## 4. Prerrequisitos y Requisitos Técnicos

### 4.1 Entorno Local (Generación)
- Python 3.11 o superior.
- Dependencias estándar (no requiere paquetes externos complejos).
- Lista M3U8 cruda de entrada.

### 4.2 Entorno VPS (Producción)
- Servidor web (Nginx o Apache) con PHP 8.1 o superior.
- Extensión `php-apcu` habilitada (para rate limiting y caché).
- Extensión `php-curl` habilitada (para el modo proxy del fallback).
- Certificado SSL/TLS válido (HTTPS obligatorio).
- Base de datos de canales (mapeo `ch_id` → `URL_origen`) accesible por el SSOT.

## 5. Procedimiento Paso a Paso

El ciclo de vida del ecosistema OMEGA consta de cuatro fases secuenciales.

### FASE 1: Inyección Phantom Hydra y Generación de Lista

Esta fase toma una lista cruda y le inyecta las directivas de evasión ISP y la URL única hacia el SSOT.

1.  **Preparar el entorno local:**
    Ubica la lista M3U8 original (ej. `lista_cruda.m3u8`) y el script `inject_phantom_single_url.py`.
2.  **Verificar configuración del inyector:**
    Asegúrate de que la constante `DEFAULT_PROXY_BASE` en el script apunte al archivo SSOT correcto en el VPS:
    `DEFAULT_PROXY_BASE = "https://tu-dominio.com/resolve_quality_unified.php"`
3.  **Ejecutar la inyección:**
    Ejecuta el script desde la terminal:
    ```bash
    python3 inject_phantom_single_url.py lista_cruda.m3u8 lista_inyectada.m3u8
    ```
4.  **Validar salida:**
    Verifica que el archivo resultante (`lista_inyectada.m3u8`) contenga exactamente 53 líneas por canal (52 directivas + 1 URL).

### FASE 2: Enmascaramiento de Seguridad (Fallback Proxy)

Esta fase elimina las credenciales expuestas en la directiva `#EXT-X-APE-FALLBACK-DIRECT`.

1.  **Definir la clave criptográfica:**
    Genera una cadena aleatoria de al menos 64 caracteres. Esta clave se usará tanto en el script Python como en el backend PHP.
2.  **Ejecutar el enmascaramiento:**
    Utiliza el script `mask_fallback_direct.py` sobre la lista inyectada:
    ```bash
    python3 mask_fallback_direct.py \
        --input lista_inyectada.m3u8 \
        --output lista_segura.m3u8 \
        --proxy "https://tu-dominio.com/fallback_proxy.php" \
        --secret "TU_CLAVE_ALEATORIA_AQUI"
    ```
3.  **Recuperar artefactos:**
    El script generará tres archivos:
    - `lista_segura.m3u8` (Lista final para el usuario).
    - `origin_table.php` (Tabla de mapeo de orígenes).
    - `origin_table.json` (Copia de respaldo).

### FASE 3: Despliegue en Producción (VPS)

Esta fase actualiza el backend para soportar la nueva lista.

1.  **Configurar el Fallback Proxy (`fallback_proxy.php`):**
    - Abre el archivo `fallback_proxy.php`.
    - Configura `FALLBACK_SECRET` con la misma clave usada en la Fase 2.
    - Define `FALLBACK_MODE` (se recomienda `'rewrite'` para máxima compatibilidad).
    - Pega el contenido generado en `origin_table.php` dentro de la constante `ORIGIN_TABLE`.
2.  **Subir archivos al VPS:**
    Sube los siguientes archivos al directorio público del servidor web (ej. `/var/www/html/`):
    - `resolve_quality_unified.php` (El SSOT principal).
    - `fallback_proxy.php` (El proxy de seguridad).
3.  **Configurar permisos:**
    Asegúrate de que el usuario del servidor web (ej. `www-data`) tenga permisos de lectura sobre los archivos PHP y permisos de escritura en el directorio de logs (`/var/log/ape/`).

### FASE 4: Auditoría Forense y Control de Calidad (QA)

Antes de entregar la lista al cliente final, se debe auditar estructuralmente.

1.  **Ejecutar auditoría completa:**
    Utiliza el script `audit_full_m3u8.py` sobre la lista segura:
    ```bash
    python3 audit_full_m3u8.py
    ```
2.  **Checklist de Validación (QA):**
    - [ ] **Integridad:** `EXTINF == URL` (Relación 1:1 estricta).
    - [ ] **Orden Canónico:** Verificar que el orden del primer canal sea: `EXTINF` → `EXTVLCOPT` → `EXTHTTP` → `KODIPROP` → `APE` → `URL`.
    - [ ] **Seguridad:** Confirmar que el contador "FALLBACK-DIRECT expuesto" sea `0`.
    - [ ] **URLs:** Confirmar que todas las URLs apunten a `resolve_quality_unified.php` y NO a versiones obsoletas.

## 6. Lógica Condicional y Árboles de Decisión

### 6.1 Selección del Modo de Fallback Proxy

- **Si** se requiere compatibilidad universal con todos los reproductores (VLC, Kodi, TiviMate) y el VPS tiene ancho de banda limitado:
  → **Usar Modo `rewrite`**. (Devuelve un M3U8 mínimo con la URL real).
- **Si** el origen debe ser 100% invisible incluso en los logs de red del reproductor, y el VPS tiene ancho de banda abundante:
  → **Usar Modo `proxy`**. (El VPS proxea todo el tráfico de video).
- **Si** el rendimiento es la prioridad absoluta y la visibilidad del origen en logs no es crítica:
  → **Usar Modo `redirect`**. (Emite HTTP 302 al origen real).

## 7. Manejo de Errores y Troubleshooting

| Síntoma / Error | Causa Probable | Solución Inmediata |
|-----------------|----------------|--------------------|
| **HTTP 404 en la URL del canal** | La lista apunta a `rq_polymorphic_resolver.php` el cual fue purgado. | Actualizar el generador Python para que apunte a `resolve_quality_unified.php` y regenerar la lista. |
| **Respuesta "ADN DE CANAL CORRUPTO"** | El canal (`ch_id`) solicitado no existe en la base de datos del VPS. | Verificar que el mapeo de canales en el VPS esté actualizado y contenga el ID solicitado. |
| **Error `TypeError` en Frontend JS** | Variables malformadas enviadas por el ISP o CDN. | Asegurar que el backend PHP incluye el blindaje de Inmunidad Tipada (Fase 1-2 del Walkthrough) con casteo forzado y null-coalescing. |
| **El reproductor ignora configuraciones de hardware** | Las directivas `#EXTVLCOPT` están ubicadas después de `#EXTHTTP` o la URL. | Regenerar la lista asegurando el Orden Canónico RFC 8216 (Hardware Layer primero). |
| **Error 403 (Token inválido o expirado)** en Fallback | Desincronización de reloj entre el generador y el VPS, o claves secretas distintas. | Sincronizar NTP en el VPS. Verificar que `FALLBACK_SECRET` sea idéntico en Python y PHP. |

## 8. Control de Versiones y Registro de Cambios

| Versión | Fecha | Descripción de Cambios |
|---------|-------|------------------------|
| 4.0 | Marzo 2026 | Implementación inicial del resolver polimórfico (arquitectura 302). |
| 5.0 | Abril 2026 | Consolidación SSOT (`resolve_quality_unified.php`), eliminación de arquitectura 302, integración de Fast Probing 200 OK. |
| 5.1 | Abril 2026 | Implementación de Orden Canónico RFC 8216, Inmunidad Tipada (Erradicación de Falsos Positivos) y Fallback Proxy Cero-Credenciales. |

## 9. Diagrama de Flujo (200 OK)
![Flujo de Despliegue OMEGA 200 OK](omega_200ok_flow.png)
