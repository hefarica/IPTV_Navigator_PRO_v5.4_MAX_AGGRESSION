# Producción · proyección de catálogo `APE_LISTA_1795581364449_CDN`

**Estado:** desplegado y servido. **No se ha sobrescrito ni borrado la lista original.**  
**Lista para el player:** `https://iptv-ape.duckdns.org/lists/APE_LISTA_1795581364449_CDN.player.m3u8`

## Identidad

| Dato | Valor |
|---|---|
| Entrada original `.gz` | `APE_LISTA_1795581364449_CDN.m3u8.gz` · 502.719.820 B |
| SHA-256 `.gz` | `680ae917fe8fff410aeee286293334e48dde5e30e79f4a6b8d12c1c3c2315f08` |
| SHA-256 contenido descomprimido | `25dd708bcb03a31054ad9e5694f227a387608482b872e7242441acabe80d94ca` |
| Proyección servida | 1.828.925.042 B |
| SHA-256 proyección | `b3c7c6fab6c61201b6bc896a42fadda27899146fb2b6cbafeddc488783a941b5` |
| Canales | 28.655 |
| Líneas | 29.576.832 (entrada) → 29.519.488 (salida) |
| Líneas de tipo excluidas | 57.344 |
| HTTP | 200 (GET) · 206 (Range) |

La salida conserva **28.655 `#EXTINF`**, **28.655 URLs**, **28.655 `#EXT-X-APE-UNIVERSAL`** y **28.655 `#EXT-X-APE-HYBRID-PULSE`**. Tiene **0 `#EXT-X-STREAM-INF`** y **0 `#EXT-X-TARGETDURATION`**, por lo que el parser la clasifica como catálogo plano.

Las 57.344 líneas retiradas de la **proyección** (no del original) están en:

`/var/www/lists/APE_LISTA_1795581364449_CDN.player.m3u8.excluded`

con número de línea y tipo. Nada se ha perdido del original.

## Parser desplegado

- `/var/www/html/prisma/api/pulse.php` · SHA-256 `825d220cf31193159c18779a3424a48601388525074667e546a3e5dfc160e04e`.
- `php -l` en producción: **No syntax errors detected**.
- `ape_pulse_shape()` distingue `master`, `media` y **`mixed`**; un catálogo mixto ya no se resuelve como master ni se elige una variante al azar.
- Prueba del clasificador en `/tmp` del VPS: **PASS master / media / mixed**.
- Backup: `/var/backups/ape-hybrid/manual-20261125T0520Z/api/pulse.php` (45.593 B).
- Herramienta de proyección: `/opt/ape-pulse/catalog-projection.cjs` · SHA-256 `8a6df0a86e9a57232db9bc00fd84e833febe5b74f79e0d43000cf00eaace7f69`.

## Estrellas y límites

- **6K no certificado**: las 28.655 líneas `#EXT-X-APE-STREAM-TRUTH` tienen `src=unknown`; la lista declara 5760×3240 / `hvc1.2.4.L183.B0`, pero no hay probe. Es `DECLARED_ONLY`, no 6K medido.
- Las URLs no traen `m=`; el modo lo decide `pulse.php` por UA (VLC/Kodi cartridge; el resto proxy).
- **No se probó reproducción real** en un dispositivo; no hay credenciales en este audit.
- **Disco:** 955 MB libres (98 %). La proyección ocupa 1,8 GB; no hay margen para más copias grandes.
- La lista original en el VPS se subió a `/tmp` solo para proyectar y se eliminó la **copia temporal**; el original local y la proyección/sidecar permanecen.

## Rollback

```bash
sudo cp -a /var/backups/ape-hybrid/manual-20261125T0520Z/api/pulse.php \
  /var/www/html/prisma/api/pulse.php
sudo php -l /var/www/html/prisma/api/pulse.php
sudo systemctl reload php8.3-fpm   # o php-fpm
# La proyección es un fichero nuevo; para retirarla:
sudo rm -f /var/www/lists/APE_LISTA_1795581364449_CDN.player.m3u8 \
  /var/www/lists/APE_LISTA_1795581364449_CDN.player.m3u8.excluded \
  /var/www/lists/APE_LISTA_1795581364449_CDN.player.m3u8.stats.json
```

La lista original no se toca en el rollback.
