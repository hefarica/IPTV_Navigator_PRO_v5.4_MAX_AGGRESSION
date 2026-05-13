---
name: resolve_text_html_error
description: How to diagnose and fix when the IPTV resolver returns text/html or HTML error body instead of M3U8, causing players to show "None of the available extractors could read the stream"
---

# Skill: Resolver text/html Error Fix

## Síntoma
El player (OTT Navigator, VLC, Kodi) muestra:
```
Error occurred
None of the available extractors (b, b, a, d, f, a, w, c, C, b, e, a, c, d, a)
could read the stream [[text/html; charset=UTF-8]].
```
O también (NUEVA VARIANTE — mismo error, diferente content-type):
```
could read the stream [[application/vnd.apple.mpegurl; charset=utf-8]].
```
**IMPORTANTE:** Si dice `application/vnd.apple.mpegurl` pero no funciona, el PHP tiene un **Fatal Error** — el header Content-Type se envía ANTES del crash, pero el BODY es HTML de error PHP.

## Causas Raíz (3 tipos)

### Tipo 1: PHP Syntax Error (parse error)
PHP tiene un error de sintaxis en `resolve_quality.php`. Nginx devuelve la página de error como `text/html`.

### Tipo 2: PHP Fatal Error — Undefined Function (MÁS COMÚN)
Un patch agregó una llamada a una función de un módulo externo que NO tiene `require_once`. PHP empieza a procesar, envía el header `Content-Type: application/vnd.apple.mpegurl`, y luego CRASHEA cuando llega a la función inexistente. El body se convierte en HTML de error.

### Tipo 3: CDN del proveedor caído
La URL del stream apunta a un CDN que devuelve HTML (error 404 o mantenimiento). Solo afecta canales individuales, NO TODOS.

**¿Cómo distinguir?**
- Si TODOS los canales fallan → Tipo 1 o Tipo 2
- Si solo UN canal falla → Tipo 3

## Diagnóstico (4 pasos)

### 1. ¿El BODY tiene error PHP?
```bash
curl -sk 'https://localhost/iptv-ape/resolve_quality.php?ch=12' | head -3
```
- ✅ Correcto: `#EXTM3U`
- ❌ Tipo 1: `PHP Parse error: ...`
- ❌ Tipo 2: `<br /><b>Fatal error</b>: Uncaught Error: Call to undefined function...`

### 2. Verificar PHP syntax
```bash
php -l /var/www/html/iptv-ape/resolve_quality.php 2>&1
```

### 3. Buscar función indefinida
```bash
grep -o 'Call to undefined function [^(]*' /var/log/php8.3-fpm.log | tail -1
```

### 4. Buscar patrones corruptos
```bash
# Buscar inyecciones de sed rotas
grep -n '\[" zapping' /var/www/html/iptv-ape/resolve_quality.php
# Buscar require_once sin file_exists guard
grep -n 'require_once' /var/www/html/iptv-ape/resolve_quality.php | grep -v file_exists
```

## Fixes

### Fix para Tipo 1 (Syntax Error)
```bash
# Encontrar la línea corrupta
php -l /var/www/html/iptv-ape/resolve_quality.php 2>&1
# Ver el contexto
sed -n 'LINE-5,LINE+5p' /var/www/html/iptv-ape/resolve_quality.php
# Eliminar las líneas corruptas
sed -i 'START,ENDd' /var/www/html/iptv-ape/resolve_quality.php
```

### Fix para Tipo 2 (Undefined Function) — MÁS COMÚN
```bash
# Opción A: Agregar require_once con guard
# Editar resolve_quality.php y agregar:
if (file_exists(__DIR__ . "/MODULO_FALTANTE.php")) {
    require_once __DIR__ . "/MODULO_FALTANTE.php";
}

# Opción B: Ejecutar blindaje automático
python3 /tmp/blindaje_total.py
```

### Fix para Tipo 3 (CDN caído)
No hay fix — es el proveedor. Cambiar de canal y esperar.

## Verificación Post-Fix
```bash
php -l /var/www/html/iptv-ape/resolve_quality.php
systemctl restart php8.3-fpm
curl -sk 'https://localhost/iptv-ape/resolve_quality.php?ch=12' | head -3
# DEBE mostrar: #EXTM3U
```

## Prevención
**Leer skill `resolver_blindaje_total` ANTES de cualquier deployment.**

## Incidentes Históricos

| Fecha | Tipo | Error | Causa |
|-------|------|-------|-------|
| 2026-03-28 | 1 | Parse error L3583 | sed corrupto dejó `[" zapping]` |
| 2026-03-28 | 2 | undefined rq_anti_cut_isp_strangler | require_once faltante |
| 2026-03-28 | 2 | Todos canales caídos con `application/vnd.apple.mpegurl` | Body era HTML de Fatal Error |
