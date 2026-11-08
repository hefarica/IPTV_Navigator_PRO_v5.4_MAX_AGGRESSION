# Desktop Commander — Vigilancia de actividad y su relación con la APK

**Rol de este documento:** monitor vivo. Responde a *«¿qué está haciendo Desktop Commander y cómo avanza
el desarrollo de la APK con esto?»*. No es un informe de una vez: se re-mide con
`tools/monitor/desktop_commander_watch.ps1` y se compara contra el baseline de abajo.

**Última medición:** 2026-11-07T19:31-05:00 (America/Bogota)
**Estado:** `NO HACE TRABAJO DE APK` — ver §4. Es el hallazgo central y no es un defecto suyo.

---

## 1 · Qué es, dónde vive, cómo se identifica

`desktop-commander` es un **servidor MCP vía `npx`** montado en el cliente Claude Code / CDE. No es un
agente autónomo: **solo ejecuta lo que una sesión de LLM le pide**. Leerlo como si tuviera iniciativa
propia es el primer error de interpretación.

| Elemento | Ruta | Evidencia |
|---|---|---|
| Estado e historial | `C:\Users\HFRC\.claude-server-commander\` | `tool-history.jsonl`, `claude_tool_call.log`, `config.json`, `feature-flags.json` |
| Relay remoto (device) | `C:\Users\HFRC\.desktop-commander-device\` | `device.json` + `remote-<dow>.log` rotado por día de semana |
| `deviceId` registrado | `0b4a4f46-db57-4632-a6e5-e7415393f2eb` | `device.json` (solo tiene claves `deviceId`, `session`) |
| Inventario previo del repo | `audit/alignment/2026-10-25/00-inflight/INFLIGHT_INVENTORY.md:226` | ya lo registró como MCP con 3 procesos |

Los `remote-*.log` rotan por **día de la semana**, no por fecha: `remote-sat.log` es siempre sábado y se
sobrescribe. **Si no se archiva antes del domingo, la evidencia del sábado se pierde.** Por eso el
monitor emite un snapshot JSON con fecha en el nombre.

---

## 2 · Baseline medido (2026-11-07)

### 2.1 Volumen histórico

| Fuente | Medida | Nota |
|---|---|---|
| `tool-history.jsonl` | **2.594 llamadas**, 0 líneas corruptas | estructura: `toolName`, `arguments`, `output`, `timestamp`, `duration` |
| `claude_tool_call.log` | **11.261 líneas** | formato `ISO8601 \| toolName \| Arguments: {json}` |
| Ventana del histórico | 2026-09-15 → 2026-11-07 | cubre ~8 semanas |

### 2.2 Distribución histórica de herramientas

```
783  start_process          <- es un motor de shell
602  start_search
458  read_process_output
220  read_file
149  get_more_search_results
 79  read_multiple_files
 72  list_sessions
 57  list_directory
 52  write_file
 31  list_processes
 26  edit_block
 23  get_config / get_file_info
 18  kill_process
  1  create_directory
```

**Lectura:** el 71 % de su uso es `start_process` + `start_search` + `read_process_output`. Desktop
Commander se usa aquí como **consola y buscador**, no como editor. Eso explica por qué deja poco rastro
de cambios de código: el código lo escriben otras herramientas.

### 2.3 Hoy (2026-11-07): 1.276 llamadas, ventana 14:57:10Z → 23:51:38Z (09:57 → 18:51 Bogotá)

```
281  start_search            129  read_file
279  start_process            90  get_more_search_results
257  read_process_output      87  get_recent_tool_calls
 35  read_multiple_files      26  list_sessions
 25  list_directory           22  write_file
 13  edit_block               11  list_processes
```

### 2.4 Fiabilidad del relay remoto

| Día (`remote-*.log`) | Tool calls | Éxitos | Fallos | `CHANNEL_ERROR` | Pings `online` |
|---|---|---|---|---|---|
| sat (hoy) | **1.276** | 1.275 | 0 | **5** | 206 |
| fri | 71 | 69 | 0 | 21 | 257 |
| wed | 0 | 0 | 0 | **120** | 229 |
| tue | 0 | 0 | 0 | 24 | 255 |
| mon | 0 | 0 | 0 | 21 | 282 |
| thu | 0 | 0 | 0 | 10 | 293 |
| sun | 0 | 0 | 0 | 0 | 288 |
| **Total** | **1.347** | **1.344** | **0** | **201** | **1.810** |

**Veredicto de fiabilidad:** 1.344/1.347 = **99,78 % de éxito**, 0 fallos de herramienta registrados.
Los 201 `CHANNEL_ERROR` son caídas de transporte del socket realtime que **se recuperan** (re-autorización
por `Token refreshed`, 208 veces). El pico del miércoles (120) no degradó a fallo de herramienta.
**El relay no es el cuello de botella.**

---

## 3 · Qué está haciendo hoy, en orden

Trazado desde las últimas 18 llamadas reales (`claude_tool_call.log`, 2026-11-07T23:35–23:51Z):

| Hora UTC | Herramienta | Objeto |
|---|---|---|
| 23:35:05 | `start_process` | enumerar `DSH_HERRAMIENTAS` |
| 23:35:27 | `start_process` | lanzar `node.exe` de un runtime DSH |
| 23:35:50 | `start_process` | `powershell.exe -File ...` (script del operador) |
| 23:36:53 | `start_process` | **repo IPTV** — `$iptvRoot='...IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION'`, listar LAB files |
| 23:37:22 | `start_process` | **repo IPTV** — `git branch --show-current` |
| 23:38:34 | `start_process` | abrir `Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` (descomprimir el zip OOXML) |
| 23:43:21 | `read_file` | **LAB**, hoja `6_NIVEL_2_PROFILES`, rango `A28:G38` |
| 23:45:52 | `start_process` | **probe de dispositivos: `adb devices -l` + `ssh`** |
| 23:47:27 | `start_process` | escanear `Downloads\APE*.m3u8|m3u|mpd` |
| 23:51:35 | `start_process` | re-escanear las mismas listas |
| 23:51:38 | `read_file` | **LAB**, hoja `6_NIVEL_2_PROFILES`, rango `A1:A65` |

**Patrón:** LAB (Excel `APE_M3U8_LAB_v8_FIXED.xlsm`) → listas `.m3u8` en `Downloads` → probe ADB/SSH →
rama del repo IPTV. Es la cadena **LAB → JSON → lista**, la parte de generación.

---

## 4 · El hallazgo central: Desktop Commander NO está tocando la APK

Filtrando las **2.594** llamadas históricas por `apk|crystalagent|/ara/|version.json|apktool|d8|zipalign|apksigner|gradle|smali|ottshim|ReaBridge|AndroidManifest`:

```
4 de 2.594  (0,15 %)
```

Y de esas 4, al menos 2 son **falsos positivos**: un `regex` que buscaba extensiones `\.(exe|...|apk|...)`
y un blob base64. En el log crudo (`11.261` líneas) el filtro da 9, igualmente dominadas por el regex de
extensiones y por `DSH_RESTART_SOURCE_DELTA.b64`.

**Conclusión honesta, sin adornos:**

> Desktop Commander **no ha participado en el desarrollo de la APK** ni en su integración con el VPS.
> Ni un solo `apktool`, `d8`, `zipalign`, `apksigner`, `gradle`, `adb install` ni escritura a
> `/ara/version.json` aparece en su historial.

**Por tanto: del historial de Desktop Commander NO se puede inferir el avance del desarrollo de la APK.**
El avance de la APK vive en otras fuentes, verificadas hoy por esta sesión:

| Fuente del avance real de la APK | Evidencia medida |
|---|---|
| Git del repo | rama `feat/adb-generic-visual-enhancement-installer`, HEAD `272f417e` (2026-11-07 12:43), 642 commits sobre `master` |
| ZIP de fuentes REA | `APE_REA_FUENTES_Y_FIRMA_PRIVADA_20261107.zip` sha256 `df20e712…`, 68 entradas, `RECUPERACION.txt` con la cadena de build |
| APK en mano | `com.ape.crystalagent.rea` v652 `3.9.6-rea-ott-test`, sha256 `79c7d1fd…`, 24.289.252 B |
| APK servido en VPS | `com.ape.crystalagent` v651 `3.9.5-adb-firetv-shim`, sha256 `8d3b1458…`, 25.678.434 B |
| Gradle build local | `app/build/outputs/apk/debug/app-debug.apk` 28.102.871 B (2026-11-06 11:21), `release` 23.812.204 B (2026-11-05 04:20) |

Que Desktop Commander no toque la APK **no es un fallo**: la APK se construye con apktool/ECJ/D8 de
`build_inputs.json`, no con un shell interactivo. El repo tiene
`IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent` como fuente Gradle y
`tools/ara/repair_apk_manifest.py` para la cirugía del manifiesto.

---

## 5 · Cómo se vigila (instrumento)

```bash
pwsh tools/monitor/desktop_commander_watch.ps1              # snapshot legible
pwsh tools/monitor/desktop_commander_watch.ps1 -Json        # snapshot JSON para diff
pwsh tools/monitor/desktop_commander_watch.ps1 -Archive     # copia los remote-*.log con fecha
```

Qué mide y qué **no** mide:

| Mide | No mide |
|---|---|
| Nº de llamadas por herramienta y por día | Qué decidió el LLM ni por qué |
| Volumen de hoy y ventana temporal | Contenido íntegro del `output` de cada llamada |
| Errores de relay y re-autorizaciones | Si el cambio que hizo prosperó (eso es del repo) |
| Presencia de trabajo APK (conteo por patrón) | Autenticidad del APK construido |
| Existencia y tamaño de las 7 fuentes | Contenido del LAB (requiere COM/Excel) |

**`-Archive` es lo único que evita la pérdida:** los `remote-*.log` se sobrescriben cada semana.
Correrlo un domingo antes de medianoche.

### Protocolo de lectura cuando llegue una pregunta de progreso

1. `-Archive` primero (asegura la evidencia del día).
2. `-Json` y diff contra el snapshot anterior: ¿subió `apk_related`? ¿aparecieron `apktool`/`d8`/`adb install`?
3. Si `apk_related` sigue en ~0, **el progreso de la APK no está aquí**: ir a git (`git log -1`, divergencia con `master`), al ZIP de fuentes y a `/ara/version.json` del VPS.
4. Nunca reportar «la APK avanzó» citando volumen de llamadas. Volumen ≠ progreso.

---

## 6 · Riesgos detectados en esta vigilancia

| ID | Riesgo | Severidad | Evidencia | Mitigación |
|---|---|---|---|---|
| DC-R1 | Los `remote-*.log` rotan por día de semana y se sobrescriben: la evidencia se pierde sin archivar | MEDIUM | `remote-sat.log` 601.012 B hoy; mismo nombre cada sábado | `-Archive` semanal |
| DC-R2 | `deviceId 0b4a4f46-…` con `persistSession: true` y relay realtime permanente: la máquina ejecuta órdenes remotas | MEDIUM | `remote-sat.log:` `Saving persisted config, persistSession: true` · `Doorbell received for call` | revisar `config.json`/`feature-flags.json` si no se usa el relay |
| DC-R3 | `CHANNEL_ERROR` pico de 120 el miércoles | LOW | tabla §2.4, 0 fallos de herramienta | ninguno urgente; se auto-recupera |
| DC-R4 | Sesgo de atribución: asumir que el trabajo del repo lo hizo Desktop Commander | HIGH (metodológico) | 4/2.594 llamadas APK, 0 `write_file` a `/ara/` | atribuir por artefacto (git sha, sha256 del APK), nunca por proceso |
| DC-R5 | `config.json.bak_dc_exposure_20261005_211209` sugiere una revisión de exposición previa | LOW | nombre del backup | revisar `allowedDirectories` si se amplía el alcance |

---

## 7 · Qué NO se puede afirmar con esta vigilancia

- **No** se puede afirmar que la APK esté probada en dispositivo real: `RECUPERACION.txt` dice
  explícitamente *«No probado en Android/TV real ni con metraje AXN ni con reproducción sostenida»*.
- **No** se puede afirmar que el APK v652 esté publicado: el VPS sirve v651 (§4).
- **No** se puede atribuir trabajo de APK a Desktop Commander: no lo hizo.
- **No** se puede leer el contenido del LAB desde aquí sin COM/Excel (`iptv-excel-safe-mode`).

Estos huecos son huecos, no ceros.
