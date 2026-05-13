# 🛠️ APE v15.1 - COMPLETE WORKER FIX GUIDE

**Version:** 1.0.0 (FINAL)
**Date:** 2026-01-09
**Component:** Cloudflare Worker Gateway

---

## 🚨 EL PROBLEMA

El Worker original esperaba que el parámetro `original_url` fuera una URL plana (texto claro). Sin embargo, el **M3U8 Transformer v15.1** ahora codifica las URLs en **Base64** para protegerlas y evitar problemas de parsing con caracteres especiales.

Esto causaba un error **HTTP 400** cuando el Worker intentaba leer la URL sin decodificarla.

## ✅ LA SOLUCIÓN (v15.1)

Hemos actualizado el Worker (`index.js`) con la siguiente lógica robusta:

1. **Base64 Decoding:** Implementación segura de `atob(decodeURIComponent(...))`
2. **CDN Whitelist:** Verificación estricta de dominios permitidos (`tivi.com`, `tivi-ott.net`).
3. **HTTP 302 Redirect:** Redirección limpia y nativa a la fuente original.
4. **CORS Headers:** Habilitados en TODOS los endpoints (incluyendo `OPTIONS`).
5. **Logging:** Trazabilidad completa de redirecciones y errores.

---

## 🚀 GUÍA DE IMPLEMENTACIÓN (5 MINUTOS)

### PASO 1: Backup (Seguridad)

```bash
cd cf_worker/src
cp index.js index.js.backup.v15
```

### PASO 2: Instalación del Fix

Copiar el contenido de `Cloudflare_Worker_FIXED_index.js` a `index.js`.

```bash
cp Cloudflare_Worker_FIXED_index.js index.js
```

### PASO 3: Despliegue

```bash
cd ..
wrangler deploy
```

---

## 🧪 CHECKLIST DE VERIFICACIÓN

### 1. Health Check

```bash
curl https://api.ape-tv.net/health | jq
```

**Esperado:** `status: ok`, `version: 15.1.0-REDIRECT-CF`

### 2. Prueba de Redirección (Simulada)

```bash
curl -I "https://api.ape-tv.net/stream?channel_id=TEST&original_url=aHR0cDovL2xpbmUudGl2aS1vdHQubmV0L3Rlc3QubTN1OA=="
```

**Esperado:** `HTTP 302 Found`, `Location: http://line.tivi-ott.net/test.m3u8`

### 3. Prueba de CORS

```bash
curl -I -X OPTIONS https://api.ape-tv.net/stream
```

**Esperado:** `HTTP 204`, `Access-Control-Allow-Origin: *`

### 4. Prueba Real (Reproductor)

1. Abrir OTT Navigator / VLC.
2. Cargar lista: `https://api.ape-tv.net/playlist.m3u8`
3. Reproducir cualquier canal.
4. **Resultado:** Video fluido, sin errores 400/403.

---

## 🔧 TROUBLESHOOTING

| Error | Causa Probable | Solución |
|-------|----------------|----------|
| **HTTP 400** | URL mal formada o no Base64 | Verificar que el transformer esté enviando Base64 válido. |
| **HTTP 403** | Dominio no permitido | Revisar `ALLOWED_CDN_DOMAINS` en `index.js`. |
| **HTTP 500** | Error interno del Worker | Revisar logs en Cloudflare Dashboard (`wrangler tail`). |
| **Network Error** | Problema CORS | Verificar headers en respuesta `OPTIONS`. |

---

> **APE SYSTEMS - ENGINEERING DIVISION**
> *"Resilience through Intelligence"*
