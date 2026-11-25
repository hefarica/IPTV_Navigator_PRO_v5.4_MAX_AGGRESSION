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
| 2. Respuesta de `/PULSE` | **FALLO en este canario** | La primera URL del canario, pedida con UA OTT/ExoPlayer, devolvió **HTTP 502** `Content-Type: application/json`, cuerpo `{"ok":false,"error":"upstream_not_playlist","kind":"noplaylist","format":"empty","why":"cuerpo vacio","code":302}`. No es `STREAM-INF`; es el upstream devolviendo 302 vacío tras reintentos. |
| 3. Primer segmento vídeo+audio | **NO VERIFICADA** | Depende de la etapa 2; no hay TV. |
| 4. Zapeo A→B→A con cupo único | **NO VERIFICADA** | No hay TV ni dos canales de la misma cuenta con reproducción confirmada. |

## Lectura correcta

- La **corrección de tipo** está desplegada: `pulse.php` distingue master/media/mixed y la proyección servida tiene 0 `#EXT-X-STREAM-INF` / 0 `TARGETDURATION`.
- El fallo de la etapa 2 es **del upstream del canario** (`code 302`, cuerpo vacío), no del parser de tipo. No se puede convertir en PASS.
- Para completar la checklist hace falta un **canal de prueba que responda 200 con media playlist** y un televisor real. No se ha modificado nada más en producción.

## Rollback

- `pulse.php`: `/var/backups/ape-hybrid/manual-20261125T0520Z/api/pulse.php`.
- Canario: es un fichero nuevo; retirarlo no toca el original.
- Proyección completa: fichero nuevo; el original local y el sidecar permanecen.
