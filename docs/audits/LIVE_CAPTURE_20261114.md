# Captura en vivo + censo real de errores — 2026-11-14 01:05 UTC

El operador pidió: *"haz una captura de toda la data que cada módulo esté generando
en vivo, cómo funcionan los archivos .json, los php, los lua"*. Esto es esa captura,
ejecutada **mientras el operador zapeaba**.

---

## 1. Lo que hizo falta construir

`/opt/ape-pulse/ape-live-capture.sh` (symlink `/usr/local/bin/ape-live-capture`).

Ocho secciones, un comando:

```
ape-live-capture            captura única
ape-live-capture --watch 5  cada 5 s (para zapear y mirar)
```

Regla que respeta: **lo que no puede leer lo declara NO_COMPUTADO con su motivo.**
Un módulo sin productor no es un cero.

---

## 2. Captura real con el operador zapeando

```
## 1. PULSE — cada zap entra por aquí
   77 × /pulse/368594  → PLAY SPORTS 1 4K (FR)   P1  z=1
    7 × /pulse/15419   → EUROSPORT 1 4K          P1
    5 × /pulse/3406    → WIN SPORTS HD           P3
    5 × /pulse/228924  → SUPER TENNIS 4K         P1
    4 × /pulse/15421   → SPORT 1 4K              P1
    3 × /pulse/15423   → SPORT DIGITAL FUSSBALL 4K P1
   48 × /prisma/api/conviva-event.php
   13 × /prisma/api/ape-feedforward-stream.php?device=firestick-cali

   estados últimos 200: 180×200 · 11×502 · 7×404 · 2×403
```

**La cadena funciona**: `z=1` presente, `m=cartridge`, `l=APE_LISTA_1794100720046`
(la lista nueva), perfiles P1 en los 4K y P3 en el HD. El device
`firestick-cali` está mandando feedforward.

---

## 3. Censo REAL de errores — corregí mi propio diagnóstico

Antes reporté "404 en `/pulse/` y en `conviva-event.php`". **Era un error de lectura
mío**: mi `awk` imprimía `$7` de *todas* las líneas, no solo las de estado 404.
Filtrando bien:

```
=== Contadores por código (605 líneas, 00:00:17 → 01:08:35) ===
   310  200
   260  404
    21  502
    11  403
     2  400
     1  405
```

### Los 260 × 404 son 100 % bots

```
3  /.git/config        2  /web/.env          2  /v2/.env
2  /v1/.env            2  /storage/.env      2  /site/.env
2  /public/.env        2  /_profiler/phpinfo 2  /prod/.env
2  /phpinfo            2  /laravel/.env      2  /frontend/.env
2  /favicon.ico        2  /.env.uat          2  /.env.test
```

UA: `l9explore/1.2.2` (87), Chrome genérico (165), `Infrawatch/1.0` (5).

**Cero 404 de tráfico real.** `/pulse/`: 130 × 200, **0 × 404**.

### Los 2 endpoints que creí caídos están vivos

```
conviva-event.php          GET 405 · POST 400   ← existe, 10.109 B, sintaxis OK
ape-feedforward-stream.php GET 200 · POST 200   ← existe, 7.706 B, sintaxis OK
```

El 405 en GET es **correcto**: el endpoint solo acepta POST. El 400 en POST es
**correcto**: falta el body.

### Los 21 × 502 son hipos de upstream

Repartidos entre 10 canales distintos (3, 3, 2, 2, 2, 2, 1, 1, 1, 1) — **ninguno
concentra el fallo**. `error.log` de nginx está **vacío** → el 502 lo genera PHP
(`pulse.php:438/499/527`), no el proxy. `pulse.php:476` ya documenta el criterio:
*"un hipo de 2 s se servía al player como 502 permanente"*.

---

## 4. Módulos, por estado medido

| Módulo | Estado medido |
|---|---|
| **Pulse** | 130×200 y 0×404 en `/pulse/` · `z=1` en todas las URLs |
| **Canary** | `canary.enabled` PRESENTE · timer active · último `Result=success` |
| **JIT** | service active · reconcile **success** · `/health` 200 · 21.224 canales |
| **APK / sync** | `/ara/version.json` 200 · **`/var/lib/ara/sync` NO EXISTE** |
| **PHP** | `pulse.php` 302 · `netshield-sentinel.php` 302 · `channel-hdcp-bulk.php` 302 |
| **Lua** | 18 ficheros desplegados · 7 shared_dicts · **0 errores hoy** |
| **VPS** | load 0.86 · 3 vCPU · mem 21 % · nginx active · 0 restarts |
| **ffmpeg** | 2 procesos |

### Lo NO computado, con su razón

- **Latencia de zapping** → `playlist_access.log` no tiene `$request_time`.
  `log_format iptv` con `$request_time` aplica a `access.log`, no a este.
- **ARA-ZAP desde el APK** → `/var/lib/ara/sync` no existe; el APK no ha sincronizado.
- **logcat del device** → vive en el device, no en el VPS.

---

## 5. Disco: 96 % → 73 % (8 GB liberados)

```
ANTES: 34G/38G (96 %) · libre 1.7G
AHORA: 26G/38G (73 %) · libre 9.9G
```

Purgado con `/opt/ape-pulse/ape-disk-purge.sh` (dry-run primero, confirmación `SI`):

| Qué | Cuánto |
|---|---|
| Backups de deploy > 7 días | 1.794 MB (1.340 ficheros) |
| Logs rotados `.gz` | 121 MB (193 ficheros) |
| Listas `APE_LISTA_*` antiguas | 1.192 MB (2 ficheros) |
| `/var/www/lists/APE_LISTA_1793531111695_CDN.m3u8.new` | 579 MB |
| `/tmp` > 3 días | resto |

**El hallazgo incómodo**: casi todo lo que llenaba el disco lo dejé **yo** en
sesiones anteriores — `/tmp/ape_identity_check.tmp` 576 MB, `/tmp/prod3.m3u8`
545 MB, `/tmp/newprod.m3u8` 544 MB, `/tmp/prod2.m3u8` 544 MB,
`/tmp/prodlist.m3u8` 540 MB, `/tmp/lista4k.m3u8` 537 MB, tres
`APE_LISTA_CDN_*.gz` de 133 MB cada uno, y ~600 APKs de prueba.

Verificado después: **la lista vigente sigue intacta**,
`APE_LISTA_1794100720046.m3u8` = 1.311.467.322 B (1.250 MB).

---

## 6. Lo que esta captura demuestra y lo que no

**Demuestra:**
- El operador zapea y el `pulse` responde **200** al canal que pide.
- Los 4K entran en P1, el HD en P3.
- Canary y JIT están sanos y corriendo.
- Los 260 × 404 son bots, no tráfico.
- Los 21 × 502 son hipos repartidos, no un canal roto.

**No demuestra** (y no se puede afirmar):
- **Cuánto tarda un zap.** El log no tiene `$request_time`. Medirlo exige
  añadir la variable al `log_format` o leer el tiempo en el cliente.
- **Cómo se comporta el buffer.** Eso vive en el device.
- **Que el APK mande telemetría.** No la manda: `/var/lib/ara/sync` no existe.
