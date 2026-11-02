# audit-report.md — log de uso y detección de drift

## 2026-11-02 · creación

**Origen:** sesión `iptv-suprema-2026-premium`. El operador pidió generar una super-skill con todo
lo aprendido al implementar el recetario de imagen.

**Método:** la skill no se escribió de memoria. Cada afirmación cuantitativa sale de un artefacto
producido en la misma sesión, y **seis afirmaciones propias fueron refutadas** por los miembros del
equipo `ape-lista-cartografia` y quedaron registradas en `tools/ape-image-recipes/CORRECTIONS.md`.

### Refutaciones incorporadas

| # | Afirmación propia | Refutada por | Artefacto |
|---|---|---|---|
| 1 | `me=umh`/`me=tss` no existen | t2 | re-test propio: ambos PASS |
| 2 | `bt1886 = 0` | t1 | `BT.1886` = 12.043 case-insensitive |
| 3 | 256/189/108 por canal | t3 + t1 | 134/103/54 |
| 4 | fallo por `pp`/`blue-noise`/`accurate_rnd` | t2 | el fallo universal es `chroma_msize_x=0` |
| 5 | la lista tiene P5 | t2 | 0 instancias |
| 6 | el URI cierra el bloque | t1 | hay 2 tags después |

### Verificación de la propia skill

- `SKILL.md` con frontmatter `name` idéntico al directorio.
- 138 opciones `#EXTVLCOPT` auditadas contra 365 binarios de VLC (150 MB).
- 6 proyecciones ffmpeg validadas con `ffmpeg -filter_script` → 6/6 exit 0.
- Módulos VLC verificados uno a uno por log propio (`using video filter module`).
- Ningún número sin comando y sin ruta de artefacto.

### Huecos declarados (no rellenados)

- Aplicación **conjunta** de varios módulos VLC: no verificada end-to-end (el arnés headless aborta
  con `Too high level of recursion` tras el primer módulo). Requiere vout real en device.
- Fuentes de prueba sintéticas, no TS HLS real.
- Fps medidos en host sin GPU; no extrapolan a VPS ni device.
- Presencia de una opción en un binario = upper bound, no prueba de registro.
- Corroboración conductual de opciones: n=4.
- ExoPlayer/OTT/TiviMate/Kodi: veredicto normativo, no empírico.

### Drift a vigilar

| Señal de drift | Acción |
|---|---|
| VLC actualizado a 4.x | re-auditar módulos y las 138 opciones; el parser de cadena puede cambiar |
| ffmpeg actualizado | re-verificar rangos (`-h filter=`) y que `pp` siga ausente |
| Aparece un plugin avfilter en `plugins/video_filter` | **reescribir la skill**: el modelo de tres carriles cambia |
| El generador empieza a emitir `video-filter` con sintaxis de módulo | actualizar `recipes.json` y el ledger |
| Cambia el layout del bloque (URI + 2 tags) | actualizar `emitM3uBlock()` y T9 |
| La lista de referencia cambia de sha256 | **re-medir todo**; no reutilizar cifras |

**Regla de drift:** cualquier cambio en el toolchain invalida las mediciones, no la metodología.
Se vuelve a medir; no se re-cita.
