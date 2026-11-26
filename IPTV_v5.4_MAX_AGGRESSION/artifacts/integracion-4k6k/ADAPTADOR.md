# ADAPTADOR — `ape-4k6k-audit-adapter.js` (JS aditivo, APAGADO por defecto)

**Artefacto:** `artifacts/integracion-4k6k/ADAPTADOR.md`
**Fecha:** 2026-11-20 (America/Bogota)
**Contrato implementado:** `artifacts/integracion-4k6k/SPEC_ADAPTADOR.md` (medido por otra tarea del equipo)
**Estado:** `deployment: not_installed` · `implementation_state: metadata_only_not_deployed` · `EXECUTED=0` siempre

---

## 1 · Archivos creados (y nada más)

| Archivo | Bytes | Líneas | Rol |
|---|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-4k6k-audit-adapter.js` | 41 670 | 802 | Adaptador UMD, sin DOM, sin red, sin dependencias |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-4k6k-audit-adapter.test.js` | 44 749 | 615 | Suite autónoma node, 177 aserciones (PASS/FAIL, exit ≠ 0 si falla) |
| `.agents/skills/ape-iptv-auditoria-4k-premium6k/` | 8 ficheros | — | Skill instalada (byte-idéntica al origen) |
| `.agents/skills_index.json` | 195 230 → 196 405 | — | Registro (308 entradas, 0 duplicados) |
| `artifacts/integracion-4k6k/ADAPTADOR.md` | — | — | este doc |

_(Los tres primeros bytes/líneas se midieron con `Get-Item`/`Measure-Object`. El propio doc no
declara su tamaño: cualquier cifra quedaría obsoleta al editarlo.)_

**No se tocó**: `index-v4.html`, `m3u8-typed-arrays-ultimate.js`, `ape-profiles-config.js`,
`profile-manager-v9.js`, `visual_profiles.json`, la lista protegida, el VPS, ni ningún fichero
del árbol ajeno sin commitear.

---

## 2 · Puntos de entrada

El adaptador expone **`window.APE_4K6K`** (UMD: en node `module.exports` **y** `root.APE_4K6K`).

| Función | Entrada | Salida | Efecto lateral |
|---|---|---|---|
| `isEnabled()` | — | `boolean` | ninguno |
| `audit(channels, opts?)` | lista de objetos de canal | `{before, implementation_state, adapter, not_computed}` (+`inventory`, +`after`/`preservation_checks` con `opts.after`) | **ninguno** (sólo lectura) |
| `auditText(text)` | texto de playlist | igual forma, con `before` del texto | **ninguno** (no reescribe) |
| `overlay()` | — | documento de política (7 claves raíz + bloque aditivo) | **ninguno** |
| `enrich(channels)` | lista de canales | lista nueva con `rea` + `APE-AUDIT-ORIGINAL` | **ninguno sobre la entrada** |

Constantes exportadas: `SCHEMAS`, `AUDIT_KEYS` (23), `PROFILE_IDS` (12), `TAGS`,
`STANDARD_4K` (3840×2160), `PREMIUM_6K` (5760×3240), `VPS_FFMPEG_6K_NOT_DECLARED` (6144).

---

## 3 · Cómo se invoca

### 3.1 En node (el modo realmente verificado)

```bash
node frontend/tests/ape-4k6k-audit-adapter.test.js
```

### 3.2 En el navegador (carga manual; **no** está cableado en `index-v4.html`)

```html
<!-- APAGADO por defecto: sin window.APE_4K6K_AUDIT=1 no hace nada -->
<script src="js/ape-v9/ape-4k6k-audit-adapter.js"></script>
<script>
  window.APE_4K6K_AUDIT = 1;                       // ← único interruptor
  var auditoria = window.APE_4K6K.audit(channels); // sólo lectura
  var enriquecidos = window.APE_4K6K.enrich(channels);
  var overlay = window.APE_4K6K.overlay();         // sidecar, NO se escribe solo
</script>
```

> **Cablearlo al pipeline del generador es una tarea aparte y NO se hizo**: exigiría tocar
> `m3u8-typed-arrays-ultimate.js` (sitio propuesto en `BASELINE.md` §5.3, dentro de
> `_apeAppendLegacyEnhancementMetadata`, L9572) e `index-v4.html`, ambos prohibidos para esta tarea.

### 3.3 Instalación de la skill (ya hecha)

```bash
node -e "JSON.parse(require('fs').readFileSync('.agents/skills_index.json','utf8'))"   # valida JSON
python -m unittest discover -s .agents/skills/ape-iptv-auditoria-4k-premium6k/scripts -p "test_*.py" -v
```

---

## 4 · Flag maestro y semántica del apagado

```text
window.APE_4K6K_AUDIT   DEFAULT: ausente  ⇒  OFF
```

- **Idiom del repo** (`BASELINE.md` §5.2/§5.3): `=== true` estricto ⇒ ausente / `0` / `false` / `undefined` = OFF.
- Se acepta además `1` / `'1'` / `'on'` / `'yes'` para el flag numérico de la misión.
- **No** se lee `process.env`: el contrato es `window`.

Con el flag apagado:

| Función | Comportamiento |
|---|---|
| `isEnabled()` | `false` |
| `audit()` / `auditText()` | sobre inerte `{enabled:false, applied:false, executed:false, reason, not_computed}` — **no recorre la lista** |
| `overlay()` | sobre inerte — `profiles` no existe |
| `enrich(channels)` | **devuelve la MISMA referencia** (coste 0, cero copia) |

---

## 5 · Rollback

**El adaptador no persiste nada.** Borrar el fichero y su entrada del índice lo revierte por completo.

```powershell
# 1) adaptador y su prueba
Remove-Item IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\ape-4k6k-audit-adapter.js
Remove-Item IPTV_v5.4_MAX_AGGRESSION\frontend\tests\ape-4k6k-audit-adapter.test.js

# 2) skill instalada
Remove-Item -Recurse .agents\skills\ape-iptv-auditoria-4k-premium6k

# 3) entrada del índice (deja skills_total=307, anchors=16, S1=31)
node -e "const fs=require('fs'),p='.agents/skills_index.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.skills=j.skills.filter(s=>s.name!=='ape-iptv-auditoria-4k-premium6k');
j.totals.skills_total--;j.totals.anchors--;j.totals.by_specialist.S1--;
fs.writeFileSync(p,JSON.stringify(j,null,2))"
```

Deshacer los **datos** producidos por `enrich()` es trivial: la intención vive en `channel.rea`
(reemplazable) y el valor previo está archivado en `channel['APE-AUDIT-ORIGINAL'].value`.
`APE-AUDIT-ORIGINAL` **nunca se re-archiva** (punto fijo), así que la restauración es estable.

---

## 6 · Conformidad con SPEC_ADAPTADOR.md

Verificado por la suite (177 aserciones, 0 fallos). Lo que el contrato fija, se copia literal:

| Contrato | Qué se verifica | Aserciones |
|---|---|---|
| §1.2 | Las 12 escalares REA con valor literal (`policyId`, `status`, `targetResolution`, `targetWidth/Height`, `boxWidth/Height`, `mode`, `enhancementRequested`, `execution`, `capacityGate`, `outputPreference`) | 2 |
| §1.3 | `outputPolicy` con **exactamente 13 claves**, nombres y literales; `floorLock` es **string** | 5 |
| §1.4 | Claves REA previas y **desconocidas** preservadas (8 + 12 + 1 = 21 en el fixture) | 4 |
| §1.6 | 12 perfiles en el orden exacto; `common` (10 claves) y `zapping`; literales de ambas variantes | 8 |
| §2.1/§2.3 | `floor_lock`/`virtual_4k`/`hdr_intent`/`APE_VISUAL_FIRST` en forma **objeto** dentro de `common`; SDR→HDR apagado | 5 |
| §3.1 | 7 claves raíz; `profiles.<p>` con **exactamente 2 claves**; `inherit_existing_profile` = la propia clave | 4 |
| §4.1/§4.2 | `{before, implementation_state}`; `before` con **exactamente 23 claves**; `network_test_scope='none_in_this_script'`; `hls_unverified_declarations` con claves ordenadas; `tag_counts` conserva `\n` sin `:` | 8 |
| §4.3 | `preservation_checks` (4 booleanos) y **aborto** si cambian canales o URIs | 6 |
| §4.4 | Inventario de 10 campos con `source_resolution`/`source_codec` **siempre `null`** | 4 |
| §5.1 | Idempotencia por **bytes** (`enrich∘enrich == enrich`), sha256 idéntico entre pasadas | 6 |
| §6 casos 2,9,10,11,12,14 | REA inválida **aborta**; `unknown` (audit) vs `runtime` (patch); ids vacíos no duplican; `\n` en `tag_counts`; `d` inválido → `"invalid"`; QoE.p registrado y no corregido | 9 |
| C3/C5 (§2.9) | Sólo `5760x3240`; `6144x3456` (VPS FFmpeg) **no se declara** | 2 |
| C7 | Ningún `executed:true` / `EXECUTED=1` en ninguna salida | 3 |
| C1 | `#EXTSHIMOTT` byte-idéntico; ninguna clave nueva fuera de `contracts/extshimott_contract.json` | 6 |

### 6.1 Divergencias DECLARADAS (no son fallos ocultos)

1. **No se renombra `#EXT-X-STREAM-INF`** a `#EXT-X-APE-AUDIT-UNVERIFIED-STREAM-INF`.
   El Python lo hace (§1.7); aquí la misión prohíbe tocar `CODECS`/`RESOLUTION`, y el adaptador
   **ni siquiera recibe texto de playlist en `enrich()`**. Los atributos quedan intactos.
2. **`enrich()` SÍ crea `rea` cuando falta.** §6 caso 1 dice que el Python **no** crea el bloque.
   La misión ordena que `enrich()` aporte la intención `ape.rea-intent/1`, así que la crea.
   Consecuencia: un canal sin REA sale con REA; `APE-AUDIT-ORIGINAL.present = false` lo deja trazado.
3. **Claves aditivas.** El contrato describe un documento de 7 claves raíz y 13/23 claves internas;
   el adaptador **no altera ninguna de ellas** y añade campos *fuera* de esos objetos:
   raíz del record (`adapter`, `not_computed`, `inventory`, `after`, `preservation_checks`) y
   raíz del overlay (`enabled`, `applied`, `executed`, `implementation_state`, `profiles_count`,
   `repo_inheritance`, `qoe_policy`, `channel_reassignment`, `not_computed`).
4. **`repo_inheritance` no existe en el Python** (no podía leer `ape-profiles-config.js`).
   Es el valor que la misión pide a `overlay()`: el tuning **real** heredado, en un bloque aparte
   para no romper `profiles.<p>` (que el contrato fija en 2 claves).
5. **`zapping` tiene 11 claves, no 12.** `SPEC_ADAPTADOR.md` §1.6 dice "12 claves"; el código
   fuente (`auditar_y_ampliar.py:73-82`) tiene **11**. Se implementa el **código** y se declara
   la discrepancia.

---

## 7 · Evidencia ejecutada

```text
$ node --check frontend/js/ape-v9/ape-4k6k-audit-adapter.js      → exit 0
$ node --check frontend/tests/ape-4k6k-audit-adapter.test.js     → exit 0
$ node frontend/tests/ape-4k6k-audit-adapter.test.js
   ... PASS 177 · FAIL 0                                          → exit 0
   N=20000 canales · enrich=19 ms · audit=859 ms · 2ª pasada=96 ms · total=974 ms
```

**Paridad del SHA-256** (no es un hash inventado): `_sha256Hex` coincide con `node:crypto` en
5 casos incluyendo UTF-8 multibyte (`Canal Ñandú Óscar 4K`, `🎬 STREAM 6K 🔥`).

### 7.1 Verificación INDEPENDIENTE (harness de otro miembro del equipo)

No es mi suite: son verificadores escritos por otra tarea del equipo que **cargan el adaptador
real**. Ambos terminan con exit 0 sobre `adapter_sha256 = 8f0e9112e10760320a99b19efb9c8472e8edf84413fa9d3fa8d1e6d2828911c5`.

```text
$ node artifacts/integracion-4k6k/verificar_no_regresion_flag.js      → RESULTADO: PASS (0 fallos)
    A) flag 0: enrich devuelve la MISMA referencia · sha256(in)==sha256(out)==e2130d85…
    B) flag 1: AÑADIDAS {"rea":3,"APE-AUDIT-ORIGINAL":3} · ELIMINADAS [] · MODIFICADAS []
    B) flag 1: 2ª pasada reproduce el mismo sha256 (idempotencia) · entrada no mutada
    flag restaurado a 0 ⇒ isEnabled()===false

$ node artifacts/integracion-4k6k/medir_escala_sintetica.js           → exit 0
    N=5000 canales · JSON 1 567 783 B · sha256 muestra 87a83541…
    flag 0 · enrich (apagado)   0.16 ms
    flag 1 · enrich             5.66 ms
    flag 1 · audit            211.63 ms
    flag 1 · enrich 2ª pasada  31.94 ms
    invariantes: 7/7 true (misma referencia, sha in==out, N preservado, idempotente, sin executed:true)
```

**Flag OFF ⇒ byte-idéntico por construcción** (`BASELINE.md` §8.1), hashes recomputados hoy:

| Archivo | sha256 §8.1 | Medido | |
|---|---|---|---|
| `m3u8-typed-arrays-ultimate.js` | `aa37dd44…` | `aa37dd44…` | IDÉNTICO |
| `ape-profiles-config.js` | `09110948…` | `09110948…` | IDÉNTICO |
| `profile-manager-v9.js` | `d1d16ad7…` | `d1d16ad7…` | IDÉNTICO |
| `index-v4.html` | `a6991020…` | `a6991020…` | IDÉNTICO |

El único código que menciona `APE_4K6K_AUDIT` son los **dos ficheros nuevos**: `index-v4.html`
no carga el adaptador, así que la salida del generador es la previa, byte a byte.

**Skill instalada** — 8/8 ficheros con `SHA-256` idéntico al origen extraído:

```text
SKILL.md                           d88ec8f3df0deebf…   OK
references/contrato_y_limites.md   0f67448fed8ea03a…   OK
scripts/auditar_y_ampliar.py       cb3ec06668a580b0…   OK
scripts/ejecutar_seguro.py         0e92d4c0f106335b…   OK
scripts/test_preservacion.py       478f1659aa11305e…   OK
scripts/test_seguridad.py          64548641a2052bb9…   OK
scripts/validar_escalado.py        964496d5b587cee8…   OK
scripts/verificar_lista.py         f9d860d69ba94d39…   OK
```

**Índice** — `node -e` valida; 308 entradas, 308 nombres únicos, 0 duplicados,
`totals` cuadra (`308 = 17 anchors + 291 satellites = Σ by_specialist`), 307 previas intactas.
La skill aparece ya en el catálogo del agente (prueba de instalación funcional).

---

## 8 · Pendiente y NO COMPUTADO

| # | Estado | Motivo exacto |
|---|---|---|
| P1 | **Cableado al generador**: NO hecho | Requiere `m3u8-typed-arrays-ultimate.js` L9572 + `index-v4.html`, prohibidos en esta tarea. Autorización del operador + revisión adversarial. |
| P2 | **Estructura de 8 ficheros + 3 subdirs** (`README.md`, `commands.md`, `checklist.md`, `tests.md`, `install.lock.json`, `audit-report.md`, `examples/`, `fixtures/`): NO creada | La misión ordenó copiar `SKILL.md`, `references/`, `scripts/`. `BASELINE.md` §3.5 la da como mínimo del repo. No se inventó contenido para una skill ajena: **pendiente de decisión**. |
| P3 | `generated_at` del índice **sí** actualizado (§3.4 paso 5) | — |
| N1 | **Mapeo `Pn` → perfil con nombre largo** | `SPEC` §7 N1: no existe tabla en el código. `overlay().not_computed` lo declara; no se inventa. |
| N2 | **Efecto en VPS / player / ADB** | No se tocó producción. Cualquier afirmación sería inventada. |
| N3 | **Reproducción real 4K/6K, latencia, arranque** | Fuera de alcance; el propio autor los excluye (`validar_escalado.py:89-91`, `not_verified`). |
| N4 | **Los 5 ficheros de nivel repo de la skill** | Ver P2. |
| N5 | **`6144x3456`** | Del FFmpeg del VPS **metadata-only**: no alcanzable en producción. No se declara (C3). |
| N6 | **Suite Python de la skill: 16/17** | Único fallo `test_preservacion.py:121` = `os.chmod(0o600)`; en NTFS el modo real es `0o666` (`438 != 384`). **Pre-existente y dependiente de plataforma**, no de la copia. Las invariantes de preservación se verificaron aparte en Windows: entrada sin cambiar, secuencia de URLs byte-exacta, 2/2 canales, `EXECUTED=1` ausente. |
| R1 | **Riesgo de seguridad detectado (no es mío)** | El Python emite la lista parcheada **con las credenciales del proveedor en claro** y por eso fuerza `0o600`; en Windows ese permiso **no se aplica** (es justo lo que falla en N6). No se explotó ni se tocó nada; se documenta. |
| R2 | **`floor_lock`/`virtual_4k` colisión de tipo** | `SPEC` §3.2 punto 3: Lua/PHP los comparan como **strings** (`combined_body_filter.lua:289,313`); el overlay los declara **objetos**. Proyectarlos sin adaptar = no-op. El adaptador no los proyecta (R3); queda para el integrador del VPS. |
