# OWNER DECISION — 2026-11-21 · ATRIBUTOS NATIVOS DE OBJETIVO SIN PROBE

**Estado:** `binding` · **Autoridad:** el propietario del sistema, respuesta literal en sesión 2026-11-21 ante la pregunta de si el generador puede emitir `CODECS=hvc1.2.4.L183.B0` con `RESOLUTION=5760x3240` y `FRAME-RATE=60` para una fuente **sin probe**: *«El propietario autoriza declararlos sin probe»*.
**Alcance:** autoriza la **declaración** de atributos nativos de **objetivo** sin probe. **No deroga la Ley Cardinal 1, ni la prohibición de declarar una fuente falsa, ni `applied` sin recibo.** No toca gates ni contratos por sí sola.
**Motivo:** el 2026-11-15 ya quedó grabado que *«el objetivo manda, no la fuente»* (`docs/policies/OWNER_DECISION_2026-11-15_TARGET_AND_ENHANCEMENT_TOKENS.md` §P-1, §P-3, §P-4) y `AGENTS.md` fija la app como `4K FAKE · 6K SIMULATE · 8K FAKE`. Declarar el objetivo exigía, hasta hoy, un probe medido; esta decisión quita esa condición **sólo** para la declaración del objetivo.

---

## 1 · Lo que SÍ autoriza (queda grabado)

### A-1 · Los cuatro atributos nativos pueden declararse sin probe

En `#EXT-X-STREAM-INF`, **sin exigir probe** de la fuente, se autoriza declarar:

| Atributo | Qué declara | Ejemplo autorizado |
|---|---|---|
| `CODECS` | codec del **objetivo** (incluido el nivel que lo representa) | `CODECS="hvc1.2.4.L183.B0,mp4a.40.2"` |
| `RESOLUTION` | resolución del **objetivo** | `RESOLUTION=5760x3240` |
| `FRAME-RATE` | fps del **objetivo** | `FRAME-RATE=60.000` |
| `VIDEO-RANGE` | rango de **salida** declarado | `VIDEO-RANGE=PQ` |

**Razón escrita:** la lista declara el **objetivo de reconstrucción**, no una fuente medida. Es la misma línea doctrinal que §P-1 de la decisión del 2026-11-15 (`RESOLUTION` puede declarar el objetivo aunque la fuente medida sea menor) y §P-3 (`la simulación UHD es OBLIGATORIA`), extendida aquí a `CODECS`, `FRAME-RATE` y `VIDEO-RANGE`, y al caso en que **no existe** medición de la fuente.

### A-2 · Ejemplo literal medido del generador (no inventado)

El generador real emite hoy, para un fixture **sin metadata de fuente**:

```
#EXT-X-STREAM-INF:BANDWIDTH=25000000,AVERAGE-BANDWIDTH=20000000,CODECS="hvc1.2.4.L183.B0,mp4a.40.2",RESOLUTION=5760x3240,FRAME-RATE=60.000,VIDEO-RANGE=PQ
```

Esa línea es exactamente lo que esta decisión autoriza. Medido con el arnés real (`IPTV_v5.4_MAX_AGGRESSION/frontend/tests/rea-generation-dispatch.test.js`), 2 variantes para 2 canales, en `_DIRECTA` y en `_CDN`.

### A-3 · La declaración sigue siendo verificable en su FORMA

La ausencia de probe **no** es la ausencia de formato. Un `STREAM-INF` declarado debe seguir cumpliendo: atributos con forma `NOMBRE=valor`, sin duplicados, `BANDWIDTH` numérico > 0, `AVERAGE-BANDWIDTH` ≤ `BANDWIDTH`, cada entrada de `CODECS` con forma RFC 6381 válida, `RESOLUTION` parseable `WxH` con dimensiones > 0, `FRAME-RATE` numérico > 0 si se declara, y `VIDEO-RANGE` en `{SDR, PQ, HLG}` si se declara.

**Traducción operativa en el arnés:** el guard `unknown fixture source does not gain invented native attributes` de `rea-generation-dispatch.test.js` deja de vetar la **presencia** de `#EXT-X-STREAM-INF` (era un veto a la declaración) y pasa a verificar la **forma** de lo declarado, con cite a este documento. Ver §3.

---

## 2 · Lo que esta decisión NO autoriza (frontera, y es dura)

**N-1 · La Ley Cardinal 1 sigue intacta — nivel incapaz de la resolución/fps declarados.**
Un `CODECS` cuyo nivel no puede representar la `RESOLUTION`/`FRAME-RATE` declarados sigue **prohibido**. La decisión del 2026-11-15 lo dejó medido (§3 B-2): con `RESOLUTION=5760x3240@60`, `hvc1.2.4.L123.B0` (**Level 4.1**) queda **8,38×** por encima de `MaxLumaPs` (2.228.224) y `MaxLumaSr` (133.693.056); el nivel que sí la representa es **`L183` (6.1)**.
⇒ Esta decisión autoriza declarar `L183` en `5760x3240@60` **sin probe**. **No** autoriza declarar `L123` en `5760x3240@60`. Lo que cambia es la **ausencia de probe**, no la **capacidad del nivel**.

**N-2 · Sigue prohibido declarar una FUENTE falsa.**
`RESOLUTION`/`FRAME-RATE`/`CODECS` declaran el **objetivo**; afirmar en los tags de verdad que la **fuente** es 5760×3240 sigue prohibido. `AGENTS.md`: *«Lo prohibido no es simular: es afirmar que la FUENTE ya es UHD»*; *«La fuente se declara real; el enhancement se declara como enhancement»*; y la decisión del 2026-11-15 §P-1 exige que el objetivo viaje **acompañado de la fuente** (`#EXT-X-APE-STREAM-TRUTH:src=,w=,h=,fps=,range=,codec=` · `#EXT-X-APE-UPSCALE:…SOURCE=…`).
⇒ Declarar el objetivo **y** la fuente es la doctrina vigente. Declarar el objetivo **ocultando** la fuente sigue siendo una mentira.

**N-3 · Sigue prohibido `applied`/`verified` sin recibo del motor.**
Esta decisión autoriza **declarar**, no afirmar ejecución. Los truth-guards (`EXECUTED=0`, `STATUS=DECLARED_ONLY`, `EXECUTION=engine_dependent`, `RPU=DECLARED`) siguen siendo obligatorios (2026-11-15 §3 B-5).

**N-4 · Siguen prohibidos** degradar (4K→FHD/HD, HEVC→H264, HDR→SDR, bajar fps/bitrate/audio: `AGENTS.md` · Ley anti-degradación), `SUPPLEMENTAL-CODECS` inventado, `#EXT-X-MAP`/`#EXT-X-PART` sin init/partes reales y CMAF declarado sin init (2026-11-15 §3 B-1, B-3).

**N-5 · No cambia ningún gate ni contrato por sí sola.** Quien implemente debe pasar por los gates existentes (`tools/check_crystal_4k_law.js`, `check_crystal_6k_law.js`, `check_anti_degradation_policy.js`); esta decisión no los relaja.

---

## 3 · Alcance técnico exacto de esta decisión

| Artefacto | Efecto |
|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/tests/rea-generation-dispatch.test.js` (`checkPlaylist`) | El guard de «invented native attributes» **deja de vetar la declaración** y pasa a verificar su **forma** (§1 A-3), con cita a este documento y su fecha en el comentario. |
| Aserciones de URL/auth del mismo test (URI envuelta por `/pulse/`, `u=` byte-idéntico a la fuente, `d=` presente, `APE_PULSE_WRAP=false` → URL del proveedor) | **Intactas.** Esta decisión no toca ninguna. |
| Guard de **capacidad** (nivel ↔ resolución/fps) | **No se añade en este encargo.** Si ya existiera, se deja intacto. Queda como decisión pendiente (§4). |
| Generador (`m3u8-typed-arrays-ultimate.js`), panel, controller, `vps/` | **Fuera de alcance.** No se tocan. |

**Quién decide:** el propietario del sistema. **Quién ejecuta:** el agente implementador, bajo este documento y sin ampliarlo por analogía.

---

## 4 · Pendiente de decidir (para que nadie lea esto como un permiso total)

1. **Capacidad de nivel (Ley Cardinal 1):** qué nivel exacto se declara en función de `RESOLUTION`/`FRAME-RATE`, y qué se hace si el decoder del device no lo sostiene. Esta decisión autoriza declarar el nivel **correcto** sin probe; **no** decide el mapeo ni la política de fallback. Sigue vigente la regla del 2026-11-15 §P-5 (escalera con fallback **al 4K simulado**, nunca por debajo).
2. **Capacidad del nivel derivado `L183` para 5760×3240@60.** Corregido el 2026-11-21 por medición: no hay «alineación pendiente» que hacer. `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/rea-export-finalizer.js:310-318` **ya deriva el nivel por tabla** y para `(5760, 3240, 60)` devuelve `L183`, que es el que se emite; los atributos declarados los compone ese mismo finalizer (`:321-326`), **no** el generador `m3u8-typed-arrays-ultimate.js`. Lo que queda por decidir es si `L183` (Level 6.1) es **capaz** de `5760×3240@60`: `5760 × 3240 × 60 = 1 119 744 000` muestras de luma/s frente al máximo de Level 6.1 `1 116 787 200` → **0,26 % por encima**. Hay que confirmarlo contra la tabla A.8 antes de aceptar el mapeo; si se confirma, la corrección es subir a `L186` o bajar `FRAME-RATE`, nunca degradar la resolución.
3. **`VIDEO-RANGE=PQ` sobre fuentes SDR:** la decisión del 2026-11-15 (P-1 y la doctrina PQ-incondicional de `AGENTS.md`) ya lo autoriza como hint de display; esta decisión **no añade** nada nuevo sobre eso.

---

## 5 · Efecto medido sobre el arnés (no se inventa nada)

- Antes: `assert.ok(!/#EXT-X-STREAM-INF:/.test(text), 'unknown fixture source does not gain invented native attributes')` → **rojo** con el generador actual (emite 2 variantes), porque el guard vetaba la declaración que esta decisión autoriza.
- Después: el mismo punto del test verifica **una variante por canal** y la **forma** de cada atributo declarado (§1 A-3). El resto del test no cambia: las aserciones de URI envuelta, `u=` byte-idéntico, `d=` y `APE_PULSE_WRAP=false` siguen como estaban, y no se añade ningún guard de capacidad.

**Regla para sesiones futuras:** este documento **no** se cita como permiso para declarar una fuente falsa, para saltarse la capacidad del nivel, ni para afirmar `applied` sin recibo. Si un hallazgo choca con lo aquí escrito, se reporta como **capacidad** (§4.1) o como **truth-guard** (§2 N-3), no como violación de esta decisión.
