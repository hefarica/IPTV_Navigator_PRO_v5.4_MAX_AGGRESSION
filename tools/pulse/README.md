# /pulse — contrato de la MEDIA SESIÓN

Término del operador: **media sesión** = la reproducción activa de un canal.
Este documento fija lo que el sistema debe recordar y cumplir en cada sesión.

## 1 · Quién es la media sesión

| Cliente real | UA medido | Trato |
|---|---|---|
| Fire TV Stick (player Xtream) | `Xtream-Codes/2.5 IPTV` · `Dalvik/2.1.0 … AFTWMST22` | **proxy** |
| Smart TV (Philips/Tizen/webOS/Roku/…) | `Mozilla/5.0 (SMART-TV; PHILIPS; …)` | **proxy** |
| Navegador | Firefox/Chrome | **proxy** |
| VLC | `VLC/3.0.20 LibVLC/3.0.20` | **cartridge** (dialecto `vlc`) |
| Kodi / LibreELEC | `Kodi/20.5 …` | **cartridge** (dialecto `kodi`) |
| ExoPlayer / Media3 | `ExoPlayerLib/…` | **cartridge** (dialecto `exo`, con CMAF estándar) |
| OTT Navigator / TiviMate / Smarters | UA propio | **cartridge** (dialecto `android`) |

## 2 · Reglas que no se rompen

1. **Nunca un master a un cliente no capaz.** Un `#EXT-X-STREAM-INF` servido a un
   parser que espera media playlist produce `Loaded playlist has unexpected type.`
   (medido en Fire TV y Philips). Los no-capaces reciben `mode=proxy`.
2. **`mode=proxy`** sirve la media playlist del proveedor con segmentos ABSOLUTOS
   (el vídeo no pasa por el VPS) y caché APCu de 2 s: dos recargas simultáneas =
   **una** conexión al proveedor (evita el **509** intermitente).
3. **Una sola URL por canal** en las listas envueltas.
4. **El log no guarda credenciales**: `id`, `chan`, `list`, `host`, `url_sha`,
   `ip_sha`, `ua`, `device`, `mode`, `zapping`. Nunca la URL del canal.
5. **Atribución**: cada pulso lleva `list=<lista>` (la pone el envoltorio) para
   saber **qué lista** se reproduce, no sólo el canal.

## 3 · Dónde se mira

```bash
tail -f /var/log/ara/pulses.jsonl        # media sesión en vivo
tail -f /var/log/ara/canary.log          # canary (si el flag está ON)
tail -f /var/log/ara/pulse-sync.log      # listas envueltas
```

## 4 · Qué se considera "media sesión sana"

- 302/200 en `/pulse` y ~1 petición de manifest cada `TARGETDURATION` del proveedor.
- Sin `509` del proveedor (proxy coalescido, canary OFF salvo prueba explícita).
- `id`+`chan`+`list` presentes en cada pulso.

## 5 · `#EXTSHIMOTT` en la lista envuelta (contrato `ape.extshimott.v1`)

`ape-pulse-wrap.js` emite **una** línea `#EXTSHIMOTT:{json}` por canal, como
**última línea de tag e inmediatamente antes de la URI**. Es una capa **aditiva**:
no sustituye `EXTHTTP`, `EXTVLCOPT`, `KODIPROP` ni `EXT-X-APE-*`, y no toca
`CODECS=`/`RESOLUTION=`/`BANDWIDTH=` del `STREAM-INF`. Un player HLS genérico
ignora el tag (RFC 8216: tags desconocidos); lo lee el shim de la APK.

**Qué campos emite (y de qué dato real sale cada uno):**

| Campo | Origen | Si falta el dato |
|---|---|---|
| `ver` | constante del contrato (`1`) | — |
| `id` | `tvg-id` del canal; si no, `tvg-chno`; si tampoco, `ch<ordinal>` | nunca falta (el ordinal es la identidad que usa /pulse) |
| `tgt` | `ott` + `vlc` si el bloque trae `#EXTVLCOPT:` + `kod` si trae `#KODIPROP:` | mínimo `ott` |
| `v.c`, `v.f` | `#EXT-X-APE-STREAM-TRUTH` (`family`, `rawfps`/`fps`) | se omite `v` entero |
| `v.w`, `v.h` | `#EXT-X-APE-STREAM-TRUTH` **solo si `src` no dice `fake`** | se omiten (no se declara 4K falso) |
| `hdr.ua`, `hdr.rf` | `#EXTHTTP` del propio canal, verbatim | se omite el campo |

**No se emiten** `a.*`, `cad`, `dev`, `ott`, `vlc`, `kod` ni `flt`: el envoltorio
no conoce esos datos. `dev.*` lo aporta el VPS por el bus (`ape-feedforward*.php`,
campo `shimott`), y `flt` no se copia de la cadena de filtros de la lista.

**Reglas duras:** si la lista YA trae el tag en el bloque, **no se añade otro**;
si un valor viola el contrato (`%20`/CRLF en UA, Referer al VPS propio, fuera de
rango), se **omite** y se cuenta en el JSON de salida (`shimott_ua_dropped`,
`shimott_rf_dropped`, …). No hay centinelas.

**Verificación:**

```bash
node -c tools/pulse/ape-pulse-wrap.js
node tools/pulse/test_ape_pulse_wrap.js          # incluye las aserciones del tag
node tools/pulse/test_extshimott_wrap.js         # fixture + muestra real + validador
node tools/quality/validate_extshimott.js <salida.m3u8>
```

**Despliegue (leer antes de desplegar):**

1. Copiar `tools/pulse/ape-pulse-wrap.js` a `/opt/ape-pulse/` (deploy map
   `pulse-wrap-engine`), y `ape-shimott-emit.php` + los dos `ape-feedforward*.php`
   al dir `/var/www/html/prisma/api/`. El helper PHP es **nuevo**: los dos
   endpoints lo cargan con guarda, así que si no se despliega responden
   exactamente como hoy (el campo se omite). **Añadir su entrada al deploy map**
   (`tools/cicd/vps_deploy_map.json`, fuera del ámbito de `tools/pulse/`):

   ```json
   { "id": "php-prisma-ape-shimott-emit",
     "src": "IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/ape-shimott-emit.php",
     "dest": "/var/www/html/prisma/api/ape-shimott-emit.php",
     "type": "php", "post": "none", "enabled": true }
   ```

2. `ape-pulse-sync.sh` cachea por **su propia** constante `WRAPPER_VERSION` — que va
   **en par** con la del wrapper: ahora las dos son `1.7.0`. Si el `.js` sube de
   versión y el `.sh` no, las listas ya envueltas **nunca** se re-envuelven (el
   `.state` guarda `wrapper_version` y da `need=0`), así que no reciben los tags
   nuevos. Al subir el wrapper hay que subir esa línea en el mismo cambio; si no,
   queda `ape-pulse-sync.sh --force` para forzarlo una vez.
3. `php -l` de los tres PHP. Este host Windows no tiene intérprete; se verificó
   por **stdin** contra el VPS (PHP 8.3.6, sin escribir ningún fichero allí):
   `ssh hetzner-iptv "php -l /dev/stdin" < ape-feedforward.php`. Repetirlo tras
   cualquier edición.
