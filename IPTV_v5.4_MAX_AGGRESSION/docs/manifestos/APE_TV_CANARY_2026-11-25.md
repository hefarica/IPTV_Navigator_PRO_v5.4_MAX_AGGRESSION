# Canario TV APE `/PULSE` — estado medido 2026-11-25

## Lista canaria de 3 canales

```text
https://iptv-ape.duckdns.org/lists/APE_LISTA_1795581364449_CDN.player.3ch.m3u8
```

| Dato | Valor |
|---|---:|
| Bytes | 301.271 |
| SHA-256 | `2f5e7da4d0dc459a5ff211e7f4668fca22b6bef467b6423501bd55e6bd080385` |
| `#EXTINF` | 3 |
| URLs | 3 |
| `#EXT-X-STREAM-INF` | **0** |
| `#EXT-X-TARGETDURATION` | **0** |
| HTTP | **200** |

La lista original **no se ha tocado**. Esta copia se extrajo de los tres primeros canales de la lista auditada y se proyectó a catálogo plano; las líneas de tipo excluidas siguen en el sidecar de la proyección completa.

## Checklist

| Etapa | Estado | Evidencia |
|---|---|---|
| 1. Importación en TV | **NO VERIFICADA** | No hay televisor accesible desde esta sesión. |
| 2. Respuesta de `/PULSE` | **PASS en servidor · TV NO VERIFICADA** | Reintento de los 3 canales del canario con UA OTT/ExoPlayer: **3/3 HTTP 200**, `Content-Type: application/x-mpegURL`, `#EXTM3U`, 6 `#EXTINF`, **0 `#EXT-X-STREAM-INF`**, 1 `#EXT-X-TARGETDURATION`, ~4 KB cada uno. El primer intento había dado 502/upstream 302 vacío; fue transitorio. No hay correlación con el televisor. |
| 3. Primer segmento vídeo+audio | **NO VERIFICADA** | Depende de la etapa 2 y de un televisor; no se descodificó vídeo/audio en device. |
| 4. Zapeo A→B→A con cupo único | **NO VERIFICADA** | No hay TV ni dos canales de la misma cuenta con reproducción confirmada. |

## Reintento de etapa 2 (servidor)

```text
canal 1: HTTP 200 · application/x-mpegURL · #EXTM3U · extinf=6 · stream=0 · target=1
canal 2: HTTP 200 · application/x-mpegURL · #EXTM3U · extinf=6 · stream=0 · target=1
canal 3: HTTP 200 · application/x-mpegURL · #EXTM3U · extinf=6 · stream=0 · target=1
```

Esto demuestra que `/pulse` entrega media playlist y no master para el UA probado. **No demuestra importación, vídeo, audio ni zapeo en el televisor.**

## Lectura correcta

- La **corrección de tipo** está desplegada: `pulse.php` distingue master/media/mixed y la proyección servida tiene 0 `#EXT-X-STREAM-INF` / 0 `TARGETDURATION`.
- El fallo de la etapa 2 es **del upstream del canario** (`code 302`, cuerpo vacío), no del parser de tipo. No se puede convertir en PASS.
- Para completar la checklist hace falta un **canal de prueba que responda 200 con media playlist** y un televisor real. No se ha modificado nada más en producción.

## Rollback

- `pulse.php`: `/var/backups/ape-hybrid/manual-20261125T0520Z/api/pulse.php`.
- Canario: es un fichero nuevo; retirarlo no toca el original.
- Proyección completa: fichero nuevo; el original local y el sidecar permanecen.
