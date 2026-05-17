---
name: resolver_blindaje_total
description: MANDATORY skill — How to prevent Fatal PHP errors from crashing ALL channels. Every new module deployment MUST follow these rules. Read this BEFORE any deployment to the resolver.
---

# Skill: Blindaje Total del Resolver — Prevención de Crashes

## ⚠️ LEE ESTO ANTES DE TOCAR resolve_quality.php

Este skill existe porque **3 veces** el resolver se cayó completamente por errores de funciones indefinidas. Cada caída mata TODOS los canales para TODOS los usuarios.

---

## Regla #1: NUNCA llamar una función externa sin `function_exists`

```php
// ❌ PROHIBIDO — si el archivo no existe, CRASH TOTAL
rq_anti_cut_isp_strangler($profile, $ch_id, $host);

// ✅ OBLIGATORIO — falla silenciosamente si no existe
if (function_exists('rq_anti_cut_isp_strangler')) {
    rq_anti_cut_isp_strangler($profile, $ch_id, $host);
}
```

---

## Regla #2: NUNCA hacer `require_once` sin `file_exists`

```php
// ❌ PROHIBIDO — si el archivo no está en el VPS, CRASH TOTAL
require_once __DIR__ . "/ape_hdr_peak_nit_engine.php";

// ✅ OBLIGATORIO — solo carga si existe
if (file_exists(__DIR__ . "/ape_hdr_peak_nit_engine.php")) {
    require_once __DIR__ . "/ape_hdr_peak_nit_engine.php";
}
```

---

## Regla #3: Usar `ape_safe_call()` para llamadas opcionales

```php
// El resolver tiene una función helper:
ape_safe_call('ape_hdr_peak_nit_integrate', $sniper_status, $ua);

// Si la función no existe, retorna null y loguea en missing_functions.log
// CERO crashes. CERO errores fatales.
```

---

## Regla #4: SIEMPRE verificar después de CUALQUIER patch

```bash
# OBLIGATORIO después de CUALQUIER cambio:
php -l /var/www/html/iptv-ape/resolve_quality.php

# Si dice "No syntax errors" → reiniciar FPM:
systemctl restart php8.3-fpm

# Verificar que el resolver responde:
curl -sk -o /dev/null -w '%{http_code}' https://localhost/iptv-ape/resolve_quality.php?ch=12

# DEBE ser 200. Si es 500 o vacío → ROLLBACK INMEDIATO
```

---

## Regla #5: SIEMPRE hacer backup ANTES de parchear

```bash
cp /var/www/html/iptv-ape/resolve_quality.php /var/www/html/iptv-ape/resolve_quality.pre_patch.bak
```

---

## Regla #6: NUNCA usar `sed` para inyectar código PHP

Los `sed -i` y scripts `.sh` que inyectan código dentro de archivos PHP son la causa #1 de corrupción. Ejemplos reales de corrupción por sed:

```php
// Residuo #1: Array literal malformado (inject_sniper_v2.sh)
if (!empty([" zapping][ext_http])) {  // ← BASURA de sed roto

// Residuo #2: Expresión duplicada
$extinf = preg_replace('/codec/', '', $extinf);$extinf);  // ← doble pegado

// Residuo #3: Llaves huérfanas
 }
 }
 }
 }  // ← 4 llaves que no cierran nada
```

**Alternativa segura:** Usar scripts Python que leen el archivo, hacen replace exacto, y verifican con `php -l` antes de escribir.

---

## Módulos Externos del Resolver

| Módulo | Archivo | Funciones Principales |
|--------|---------|----------------------|
| Sniper Mode | `rq_sniper_mode.php` | `rq_sniper_integrate()` |
| Anti-Cut ISP | `rq_anti_cut_engine.php` | `rq_anti_cut_isp_strangler()` |
| Anti-Noise | `ape_anti_noise_engine.php` | `ape_noise_engine_integrate()` |
| HDR Peak Nit | `ape_hdr_peak_nit_engine.php` | `ape_hdr_peak_nit_integrate()` |
| Stream Validator | `ape_stream_validator_proxy.php` | `ape_sniper_stream_guard()` |

**TODOS** deben tener:
1. `file_exists()` guard en su `require_once`
2. `function_exists()` guard en cada llamada
3. Fallback graceful (retornar array vacío o null)

---

## Diagnóstico Rápido: "Ningún canal funciona"

```bash
# 1. ¿Hay error PHP?
curl -sk 'https://localhost/iptv-ape/resolve_quality.php?ch=12' | head -3

# Si ves "<br /><b>Fatal error</b>" → hay un crash PHP
# Si ves "#EXTM3U" → el resolver funciona

# 2. ¿Qué función falta?
grep -o 'Call to undefined function [^(]*' /var/log/php8.3-fpm.log | tail -1

# 3. ¿El módulo existe?
ls -la /var/www/html/iptv-ape/ape_*.php /var/www/html/iptv-ape/rq_*.php

# 4. Fix rápido: ejecutar el blindaje
python3 /tmp/blindaje_total.py
```

---

## Checklist Pre-Deployment (OBLIGATORIO)

- [ ] Backup creado: `cp resolve_quality.php resolve_quality.bak`
- [ ] Todas las nuevas funciones usan `function_exists()` guard
- [ ] Todos los nuevos `require_once` usan `file_exists()` guard
- [ ] `php -l resolve_quality.php` → No syntax errors
- [ ] `systemctl restart php8.3-fpm`
- [ ] `curl` test devuelve `200` y `#EXTM3U`
- [ ] grep confirma: cero `[" ` corrupciones
- [ ] El archivo del módulo existe en el VPS (no solo en local)

---

## Incidentes Históricos

| Fecha | Error | Causa | Resolución |
|-------|-------|-------|------------|
| 2026-03-28 21:00 | Parse error L3583 | `sed` corrupto dejó `[" zapping]` | Borrar 5 líneas corruptas |
| 2026-03-28 23:30 | Fatal: undefined function | `rq_anti_cut_engine.php` no tenía `require_once` | Agregar `require_once` con `file_exists` |
| 2026-03-28 23:35 | Todos los canales caídos | El body del M3U era HTML de error PHP | Blindaje total: `function_exists` en todas las llamadas |
| 2026-04-05 05:00 | Error 403 False Positive | SSRF Whitelist estático bloqueó `nov202gg.xyz` | Eliminado Hara Kiri completamente (2026-04-11) |
| 2026-04-05 05:05 | Error 500 DivisionByZero | `UAPhantomEngine` tenía array vacío | Poblado con fallbacks y redefinido protección Zero-State |

---

## Regla #7: Anti-SSRF Dinámico
Usar listas de dominios fijos rompe las listas. Siempre verifica la resolución IP contra rangos internos (`10.x.x.x`, `192.168.x.x`, `127.0.0.1`, `169.254.x.x`). Hara Kiri fue eliminado completamente el 2026-04-11.

## Regla #8: Zero-State Resilience (Data Pools)
Todo array usado en rotaciones modulares matematicas ($hash % count($array)) **DEBE OBLIGATORIAMENTE** tener valores por defecto y garantías de división distinta de cero `max(1, count($array))`. **Ver skill: `skill_php_zero_state_resilience`**.
