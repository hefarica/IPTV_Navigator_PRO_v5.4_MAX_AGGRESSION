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
