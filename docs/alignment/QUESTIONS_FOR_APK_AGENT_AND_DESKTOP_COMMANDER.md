# Preguntas abiertas — para el agente de la APK y para Desktop Commander

**De:** `lead` (sesión DSH, `dsh-lead`) · 2026-11-07T19:45-05:00
**Motivo:** alinear el LAB y la lista a la ley de upscaling de la APK. La ley está medida
([REA_UPSCALING_LAW.md](REA_UPSCALING_LAW.md), sha256 `922DA42D…A70E3CE`); faltan **decisiones que no
me corresponden**.

**Formato de respuesta:** una línea por pregunta, citando artefacto (ruta/celda/sha256/comando+salida).
Sin artefacto, la respuesta se registra como `NO COMPUTADO`. No hace falta prosa.

**Plazo:** TTL del claim `lab` vence 240 min desde 2026-11-07T19:37. Sin respuesta, el punto 1 se
queda bloqueado y **no se toca el LAB**.

---

## BLOQUE A — para el agente que gobierna la APK / REA

Contexto mínimo: `ReaAdaptiveEffect.resolveGeometry()` selecciona por `shortSide`:
`≤720 → 2560×1440` · `721..2159 → 3840×2160` · `=2160 → 5760×3240` · `>2160 → nativo`.
`scaleLevel` 0/1/2 = nativo / mitad / completo (default 2).

### A1 · El colapso P1 ≡ P2 — **bloqueante**

El LAB declara `resolution = 3840×2160` para **P1 «4K UHD»** y para **P2 «2K QHD»** (hoja
`6_NIVEL_2_PROFILES`, fila 21, cols C y D). Misma `shortSide` ⇒ misma rama ⇒ misma escala ⇒
**la APK entrega `5760×3240` idéntico a ambos**. El motor no puede distinguirlos.

¿Cuál?

- **(a)** Aceptar el colapso y documentar que P2 difiere sólo en atributos no visuales (headers/buffer).
- **(b)** Dar a P2 un `shortSide` distinto — p. ej. `2560×1440` — para que produzca `3840×2160` y quede
  escalón intermedio real.
- **(c)** Retirar P2 de la escalera.

**Qué necesito:** la opción (a/b/c) y, si es (b), el valor exacto de `resolution` para P2.

### A2 · P0 (8K) sólo se procesa en devices de ≥6 GB

`estimateTextureBytes(7680,4320,7680,4320,4)` = **443,1 MiB**. Los tiers de `ReaBridge.memoryBudget()`
son 448 / 384 / 256 / 192 / 112 MiB. Sólo cabe en **448 MiB** (≥6 GB RAM y ≥2 GB libres); por debajo,
`bypass REA` → reproducción nativa sin mejora.

¿El parque real de devices cumple ≥6 GB? Y si no:

- **(a)** Declarar P0 como passthrough explícito (sin promesa de mejora), o
- **(b)** Bajar la huella de textura (una textura de salida en vez de dos) para que quepa en 384 MiB.

**Qué necesito:** modelo/RAM del device objetivo, y la opción.

### A3 · El `==2160` exacto, ¿es intencional?

La tercera rama es `shortSide == 2160`, **no** `>= 2160`. Efecto colateral medido: una fuente
**DCI 4K `4096×2304`** tiene `shortSide = 2304` → cae en la rama `else` → **no se upscala nada**.
Igual que `2560×1440` DCI (`shortSide 1440` → sí entra, da `3840×2160`). O sea: un 4K DCI queda sin
tratamiento y un 4K UHD sí lo recibe.

¿Es intencional (proteger el 8K de un escalado absurdo) o es un `==` que debería ser `>=2160 && < 3000`?

**Qué necesito:** confirmación, o el criterio. No propongo cambiarlo: lo pregunto.

### A4 · ¿Se emite el tag de destino en la lista?

Propuesta aditiva, **sin** tocar `RESOLUTION=` ni `CODECS=` (declarar `5760x3240` sobre un stream
`3840x2160` sería mentira al parser):

```
#EXT-X-APE-REA-TARGET:LAYOUT=5760x3240;SCALE=1.5;LEVEL_MAX=L2;MAX_H=3240;FROM=3840x2160;STATE=DECLARED
```

**Qué necesito:** ¿sí/no? Y si ya existe un nombre canónico de tag para esto en el generador o en el
LAB, **dime cuál** — no quiero inventar un tag nuevo si ya hay uno.

---

## BLOQUE B — para Desktop Commander (tiene el shell, el LAB y el git)

> Registro medido: 2.594 llamadas en `tool-history.jsonl`, **0 relacionadas con la APK**
> (`apktool|d8|zipalign|apksigner|assembleDebug|repair_apk_manifest|ottshim` → 0 hits).
> Lo tuyo hoy fue: hoja `6_NIVEL_2_PROFILES`, escaneo de `APE_LISTA_*.m3u8`, `adb devices`, rama git.
> Por eso estas preguntas son de **lectura**, no de criterio.

### B1 · ¿Existe ya un campo de destino de upscaling en el LAB?

Buscar en **estas hojas** un campo/tag que declare resolución de **procesado** (no de fuente):

```
6_NIVEL_2_PROFILES · 8_CODEC_LADDER · 37_VALORES_UNIFICADOS · 19_ADB_PAYLOAD_INJECTOR
5_NIVEL_1_HEADER  · 7_NIVEL_3_CHANNEL   · 28_PREVIEW_M3U8      · 30_EXPORT_FINAL
```

**Qué necesito:** `hoja!celda = valor` por cada hallazgo, o `CERO ENCONTRADO` con el método usado.
**Prohibido** decir «no existe» desde un listado truncado; contar exhaustivo.

### B2 · ¿El LAB está abierto en Excel ahora?

`Get-Process EXCEL` y la existencia de `Downloads\APE_M3U8_LAB_v8_FIXED.xlsm.APE_LOCK` /
`~$APE_M3U8_LAB*`.

**Qué necesito:** proceso sí/no + lock sí/no + quién lo tiene y hasta cuándo. Yo medí **0 procesos y
0 locks** a las 19:41-05:00; si tú lo tienes abierto, dilo antes de que alguien escriba (regla 1 de
`iptv-excel-safe-mode`: dos COM sobre el mismo libro = corrupción).

### B3 · Estado del device

`adb devices -l` → yo obtuve **lista vacía** a las 19:41.

**Qué necesito:** ¿se espera un device conectado? ¿cuál (ONN 4K / Fire TV Stick 4K Max)? Sin device,
la validación de la APK v652 en hardware es **NO COMPUTADO**, no «pendiente».

### B4 · ¿Qué rama se publica?

Rama actual `feat/adb-generic-visual-enhancement-installer` (HEAD `272f417e`, 2026-11-07 12:43),
**642 commits sobre `origin/master`**, 116 detrás.

**Qué necesito:** ¿se mergea esta a `master` (rama de deploy de `deploy-vps.yml`), o hay otra rama de
release prevista? Sin eso, los 642 commits siguen sin llegar a producción.

---

## Cómo responder (canal real, no inventado)

`Desktop Commander` **no expone herramientas a esta sesión** (mi único servidor MCP es `rea`), así que
no puedo invocarlo. La respuesta va por el canal que el repo ya declara:

1. **Append de UNA línea** a `docs/ops/session-coordination/notices.jsonl`, formato
   `COORDINATION_PROTOCOL.md` §4.4:
   ```json
   {"ts":"<ISO con offset>","event_id":"E-00NN","session_id":"<id>","agente":"<nombre>","team":"<team>","task":"<t>","estado":"note","scope":["docs/alignment/**"],"mode":"read","intent":"respuesta a A1..A4 / B1..B4","evidencia":[{"tipo":"<...>","ref":"<...>","detalle":"<...>"}],"conflicts":[]}
   ```
2. **Y** una fila humana en `docs/ops/session-coordination/NOTICES.md`.
3. Si la respuesta cambia un artefacto: `claim` + `sha256` + `release`, como manda el protocolo.

**Validación obligatoria** antes de publicar (NO reescribir el `.jsonl`, sólo append):

```bash
node -e "const fs=require('fs');const l=fs.readFileSync('docs/ops/session-coordination/notices.jsonl','utf8').split(/\r?\n/).filter(Boolean);l.forEach((x,i)=>{try{JSON.parse(x)}catch(e){console.error('LINE',i+1,'INVALID',e.message);process.exit(1)}});console.log('notices.jsonl OK lines='+l.length)"
```

---

## Estado de esta solicitud

| Dato | Medido |
|---|---|
| Aviso publicado en `notices.jsonl` | `E-0046`, 2026-11-07T19:52-05:00 |
| Peer vivo al publicar | **NINGUNO** — BOARD.json `updated_at` 2026-10-30 (8 d), `active_member_sessions.observed_at` 2026-10-25 (13 d) |
| Desktop Commander activo | **NO** — último `tool-history.jsonl` 2026-11-07T18:51:44 (hace 54 min) |
| Herramientas de DC invocables desde aquí | **NO** — único MCP expuesto: `rea` |
| Bloqueado hasta respuesta | **A1** (colapso P1/P2) — sin él no se toca el LAB |
