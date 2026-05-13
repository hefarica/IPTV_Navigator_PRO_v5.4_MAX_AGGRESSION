# 📊 ESTADO ACTUAL COMPLETO - IPTV Navigator PRO

**Fecha:** 2026-01-15  
**Última actualización:** Configuración con dominio DuckDNS

---

## 🌐 Configuración de Red

| Componente | Valor Actual |
|------------|--------------|
| **Dominio Principal** | `https://iptv-ape.duckdns.org` |
| **IP del VPS** | `178.156.147.234` |
| **Protocolo** | HTTPS (certificado auto-firmado) |
| **Puerto HTTP** | 80 (redirige a HTTPS) |
| **Puerto HTTPS** | 443 (activo) |

---

## 📁 Estructura de Directorios

| Directorio | Propósito | Estado |
|------------|-----------|--------|
| `/var/www/html/` | **Directorio activo** - Archivos PHP y M3U8 | ✅ Activo |
| `/var/www/m3u8/` | Directorio antiguo (backup) | ⚠️ Legacy |
| `/var/www/html/chunks/` | Chunks temporales de upload | ✅ Activo |
| `/var/www/html/versions/` | Versiones históricas de M3U8 | ✅ Activo |

---

## 🔧 Archivos PHP (Backend)

| Archivo | Ubicación | Estado | Funcionalidad |
|---------|-----------|--------|---------------|
| `upload.php` | `/var/www/html/` | ✅ Activo | Upload directo (hasta 512MB) |
| `upload_chunk.php` | `/var/www/html/` | ✅ Activo | Upload por chunks (SHA-256) |
| `finalize_upload.php` | `/var/www/html/` | ✅ Activo | Ensamblar chunks |
| `upload_status.php` | `/var/www/html/` | ✅ Activo | Estado de uploads |
| `health.php` | `/var/www/m3u8/` | ⚠️ Legacy | Health check (mover a html/) |

**Nota:** Los headers CORS fueron eliminados de los PHP porque Nginx los maneja globalmente.

---

## 🔒 Configuración SSL/TLS

| Componente | Estado | Detalles |
|------------|--------|----------|
| **Certificado** | ✅ Activo | Auto-firmado (sin dominio) |
| **Ubicación** | `/etc/nginx/ssl/server.crt` | 1.3KB |
| **Clave** | `/etc/nginx/ssl/server.key` | 1.7KB |
| **Protocolos** | TLSv1.2, TLSv1.3 | ✅ |
| **Renovación** | Manual (auto-firmado) | N/A |

---

## 🌐 Configuración Nginx

| Parámetro | Valor |
|-----------|-------|
| **Root Directory** | `/var/www/html/` |
| **Server Name** | `_` (cualquier dominio) |
| **Client Max Body Size** | `600M` |
| **Client Body Timeout** | `600s` |
| **CORS Headers** | ✅ Global (en Nginx) |

**Ubicación config:** `/etc/nginx/sites-available/m3u8`

---

## 📝 Archivos JavaScript (Frontend)

| Archivo | URL Default | Estado |
|---------|-------------|--------|
| `gateway-manager.js` | `https://iptv-ape.duckdns.org` | ✅ Actualizado |
| `vps-adapter.js` | `https://iptv-ape.duckdns.org` | ✅ Actualizado |
| `upload-manager-v1.js` | `https://iptv-ape.duckdns.org` | ✅ Actualizado |
| `vps-monitor-v1.js` | `https://iptv-ape.duckdns.org` | ✅ Actualizado |

**Nota:** Todos los archivos JS ahora usan el dominio DuckDNS por defecto.

---

## 🔐 Seguridad

| Característica | Estado | Detalles |
|----------------|--------|----------|
| **CORS** | ✅ Activo | Headers en Nginx (global) |
| **SHA-256 Checksum** | ✅ Activo | Verificación en `upload_chunk.php` |
| **MD5 Checksum** | ✅ Fallback | Si no hay SHA-256 |
| **Auth Token** | ⚠️ Deshabilitado | `auth_token` vacío en config |
| **HTTPS** | ✅ Activo | Certificado auto-firmado |

---

## 📊 Endpoints Disponibles

| Endpoint | Método | Propósito | Estado |
|----------|--------|-----------|--------|
| `/health` | GET | Health check del servidor | ✅ |
| `/upload.php` | POST | Upload directo M3U8 | ✅ |
| `/upload_chunk.php` | POST | Upload por chunks | ✅ |
| `/finalize_upload.php` | POST | Ensamblar chunks | ✅ |
| `/upload_status.php` | GET | Estado de upload | ✅ |
| `/*.m3u8` | GET | Servir playlists | ✅ |
| `/versions/*.m3u8` | GET | Versiones históricas | ✅ |

---

## 🎯 Estrategias de Upload

| Estrategia | Descripción | Estado |
|------------|-------------|--------|
| **replace** | Reemplazar archivo principal | ✅ |
| **version** | Solo crear versión con timestamp | ✅ |
| **both** | Reemplazar + crear versión | ✅ |

---

## 📦 Límites Configurados

| Parámetro | Valor | Ubicación |
|-----------|-------|-----------|
| **Upload Max (PHP)** | `600M` | `php.ini` |
| **Post Max (PHP)** | `600M` | `php.ini` |
| **Memory Limit (PHP)** | `1024M` | `php.ini` |
| **Nginx Max Body** | `600M` | `nginx.conf` |
| **Nginx Timeout** | `600s` | `nginx.conf` |
| **PHP Timeout** | `300s` (chunks), `600s` (finalize) | PHP files |

---

## 🔄 Flujo de Upload

### Upload Directo (< 50MB):
```
Frontend → POST /upload.php → /var/www/html/[filename].m3u8
```

### Upload Chunked (> 50MB):
```
Frontend → POST /upload_chunk.php (chunk 1/N)
         → POST /upload_chunk.php (chunk 2/N)
         → ...
         → POST /upload_chunk.php (chunk N/N)
         → POST /finalize_upload.php
         → /var/www/html/[filename].m3u8
```

---

## ✅ Checklist de Verificación

- [x] Dominio DuckDNS configurado y funcionando
- [x] Nginx apunta a `/var/www/html/`
- [x] Archivos PHP en `/var/www/html/`
- [x] Todos los JS usan dominio DuckDNS
- [x] HTTPS funcionando (certificado auto-firmado)
- [x] CORS configurado en Nginx
- [x] SHA-256 checksum implementado
- [x] Límites de upload configurados (600MB)
- [x] Health endpoint funcionando

---

## 🚨 Notas Importantes

1. **Certificado Auto-firmado:** El navegador mostrará advertencia la primera vez. Debe aceptarse manualmente.

2. **Directorio Activo:** Todos los uploads van a `/var/www/html/`, no a `/var/www/m3u8/`.

3. **CORS:** Los headers CORS están en Nginx, no en los archivos PHP.

4. **Dominio DuckDNS:** Si el dominio cambia, actualizar en:
   - `upload.php` (línea 20)
   - `finalize_upload.php` (línea 84)
   - Todos los archivos JS (default URLs)

---

## 🔜 Próximos Pasos Recomendados

1. **Mover `health.php`** a `/var/www/html/` para consistencia
2. **Configurar Let's Encrypt** si se quiere certificado válido (requiere dominio real)
3. **Habilitar Auth Token** si se necesita autenticación
4. **Configurar backups** automáticos de `/var/www/html/versions/`

---

**Estado:** ✅ **TODO FUNCIONANDO CORRECTAMENTE**
