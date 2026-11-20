# Fase 2 — cableado real y compatibilidad (2026-11-20)

Continúa la integración de la fase 1. Corrige dos defectos **introducidos por mi propia fase 1**,
cablea el módulo en staging y deja medido qué está probado y qué no.

## 1 · Lo que cambió (y por qué)

### 1.1 · REA: la política base ya NO se toca

Fase 1 escribía `rea.policyId` (`rea-adaptive-v1` → `ape-4k-premium6k-intent/1`) y
`rea.targetResolution` (`null` → `3840x2160`), y lo justificaba con el archivo `APE-AUDIT-ORIGINAL`.
Un consumidor que decida por `policyId` o por la semántica de `targetResolution` ve un cambio de
política; el archivo prueba procedencia, **no compatibilidad**.

Ahora `enrich()` devuelve `rea` con **la misma referencia** (mismos bytes, mismos campos
desconocidos) y la intención viaja en un sidecar propio:

| Antes | Ahora |
|---|---|
| `out.rea.policyId = 'ape-4k-premium6k-intent/1'` | `out.rea` **verbatim** (`rea_misma_ref = true`) |
| `out.rea.targetResolution = '3840x2160'` | `out['APE-4K6K-INTENT'].targetResolution` |
| REA sintética si faltaba | si no había `rea`, **no se inventa** (`sin_rea_no_se_inventa = true`) |
| `APE-AUDIT-ORIGINAL` (formato Python base64url) en el objeto JS | no se escribe; es un artefacto distinto con su verificador propio |

El sidecar conserva los mismos 12 escalares + `outputPolicy` de 13 claves, más
`reaPolicyPreserved: true` y `reaFieldsWritten: 0`. Sin cambio de consumidor probado, no se emite
`outputPolicy` hacia REA.

### 1.2 · `intentTag()`: frontera de emisión explícita

Nuevo helper puro (`intentTag(ch)`) que devuelve **una línea** `#EXT-X-APE-4K6K-INTENT:{json}` sin
salto, para insertar **inmediatamente antes de la URI del canal**. Medido: una sola URI por bloque,
EXTSHIMOTT v1 intacto (no recibe ni un campo: `additionalProperties=false`), tag antes de la URI.
No consulta el flag por diseño: el punto de llamada es el que debe comprobarlo.

### 1.3 · Guarda de formato: de umbral a estructura

La corrección de fase 1 usaba `entries >= 100`, que **rechazaba catálogos legítimos pequeños**
(1, 62 o 99 canales). Regla actual, estructural:

> catálogo = **todas** las líneas `#EXTINF:` son de canal (atributos M3U Plus) **y** ninguna es una
> duración de segmento positiva sin atributos.

Se mantiene el rechazo de media playlists reales por etiquetas que solo existen ahí
(`MEDIA-SEQUENCE`, `MAP`, `BYTERANGE`, `PART:` con URI, `PRELOAD-HINT`, `I-FRAMES-ONLY`) y por
duración positiva. Ambiguo ⇒ se rechaza.

Medido sobre la lista real de 754.247.241 B: `entries=11222`, `attr_entries=11222`,
`kind=iptv_catalog`, `media_override=catalog_signature`.

## 2 · Matriz de resultados (comando · hash · resultado)
| Prueba | Comando | Resultado |
|---|---|---|
| Suite Node del adaptador | `node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-4k6k-audit-adapter.test.js` | **PASS 183 · FAIL 0** · exit 0 |
| Suite Python de la skill | `python -m unittest discover -s .agents/skills/ape-iptv-auditoria-4k-premium6k/scripts -p "test_*.py"` | **30 tests · 29 PASS · 1 FAIL** (`st_mode 0o666 != 0o600`, NTFS) |
| Guarda: 13 regresiones | `test_formato_guarda.py` (nuevo) | catálogos 1/62/99/100 ✓ · muestra truncada ✓ · .gz ✓ · media/LL-HLS/mezcla/master/sin-EXTINF rechazados ✓ |
| Lista real 754 MB | `ejecutar_seguro.py inspect_format` | `iptv_catalog`, `entries=11222`, `attr_entries=11222` |
| `intentTag` | sonda node (OFF y ON) | 1 línea · payload parsea · `executed=false` · `rea` intacta · EXTSHIMOTT intacto · 1 URI |
| `enrich` OFF | sonda node | `off_igual=true`, misma referencia (coste 0) |
| `enrich` ON | sonda node | añade solo `APE-4K6K-INTENT`; `url`/`extra` intactos; idempotente |
| **Navegador real** (Chrome 157.0.8103.80) | `node %TEMP%\fase2-browser3.js` (loopback + `--headless=old --dump-dom`) | `{"loaded":true,"flagDefault":false,"offMs":0.1,"offIdentical":true,"onAdded":["APE-4K6K-INTENT"],"reaKept":true,"tagOk":true,"intentStatus":"requested_only"}` |

Hashes de esta fase (sha256, 16 primeros):

```
20c8a66f3194eff6  ape-4k6k-audit-adapter.js      (fase 1: 8f0e9112)
0242f0e20b09285a  ape-4k6k-audit-adapter.test.js (fase 1: 5e0c2334)
bfaefbcbb04a761c  ejecutar_seguro.py
7227deaf234da384  test_formato_guarda.py
```

## 3 · OFF → ON → OFF

- OFF (ausente/false/0): `enrich()` devuelve la **misma referencia** de la lista; no parsea, no copia,
  no audita, no emite. Cargar el módulo solo define `window.APE_4K6K`.
- ON (`true`, o `1`/`'1'`/`'on'`/`'yes'` normalizados en `isEnabled`): `enrich()` produce lista nueva
  con el sidecar; la entrada no se muta.
- Vuelta a OFF: el siguiente `enrich()` vuelve a devolver la misma referencia y no emite nada.
- `intentTag()` es puro: emitir o no depende del punto de llamada, no del helper.

## 4 · Cableado en staging (pendiente de aprobación)

Worktree aislado: `C:\Users\HFRC\Desktop\IPTV_FASE2_STAGING` (detached en `5376eef6`).
Cambio: **una línea** en `frontend/index-v4.html`, tras `ape-profiles-config.js`:

```html
  <script src="js/ape-v9/ape-4k6k-audit-adapter.js?v=20261120-fase2"></script>
```

Diff exacto guardado en [`FASE2_INDEX_CARGA.diff`](FASE2_INDEX_CARGA.diff) (794 B, 1 inserción).
El árbol principal **no** se ha tocado: `index-v4.html` y el generador siguen intactos.

## 5 · NO COMPUTADO (con motivo y repro)

| Tramo | Estado | Motivo |
|---|---|---|
| Prueba en navegador real (carga + flag + resultado visible) | **PASS medido** | Chrome 157.0.8103.80 headless sobre el `frontend/` del worktree servido por loopback: módulo cargado, flag OFF por defecto, `enrich` OFF devuelve la misma referencia en 0,1 ms, ON añade solo `APE-4K6K-INTENT`, `rea` intacta, `intentTag` emitido. Nota: el worktree estaba en `5376eef6` (anterior a esta fase) y hubo que traer el adaptador `20c8a66f…`; el primer intento falló con `intentTag is not a function`, lo que confirma que la prueba depende del código real y no de una copia |
| Hook real en el generador | **HECHO en staging** | el emisor por canal termina en `_apeAppendExtshimottTag(...)`; se sustituyó su `return` por `var b = X; if (flag && insertIntentTag) b = insertIntentTag(b, channel); return b`. Con OFF el bloque sale idéntico (probado en el navegador sobre el index real) |
| Generación/exportación real OFF vs ON (bytes de la lista completa) | **NO COMPUTADO** | requiere tu LAB JSON y una corrida de la UI. Lo que sí está medido: el hook OFF devuelve el bloque idéntico (identidad por referencia), y el diff del generador es una sola sentencia sustituida |
| Consumidor real del sidecar | **NO COMPUTADO** | no existe consumidor probado; por eso no se emite `outputPolicy` hacia REA |
| 754 MB en navegador (memoria pico, cancelación) | **NO COMPUTADO** | no se descarga la lista productiva para benchmarks |
| Device / VPS / APK / QoE en hardware | **NO COMPUTADO** | sin device; producción intacta por instrucción |

## 6 · Contratos respetados

- **EXTSHIMOTT v1 cerrado**: el sidecar va por tag propio, nunca dentro del tag del shim.
- **Dos dominios 6K**: REA `5760x3240` (este sidecar) y legacy VPS JIT `6144x3456` — sin unificar.
- **REA**: campos previos y desconocidos preservados; una intención nueva no convierte un recibo
  anterior en falso ni demuestra aplicación.
- **Una URI por canal**; el tag se emite antes de esa URI.
- **Archivo de recuperación**: el objeto JS no es el payload Python; se declaran como artefactos
  distintos y no se atribuye compatibilidad de verificador.

## 7 · Rollback

- Esta fase (árbol principal): `git revert <commit>` — toca adaptador, test, dos scripts de la skill
  y docs. La skill **no se desinstala**.
- Staging: `git worktree remove --force C:\Users\HFRC\Desktop\IPTV_FASE2_STAGING`.
- Funcional: dejar `window.APE_4K6K_AUDIT` ausente/false ⇒ comportamiento previo exacto.

## 8 · Separación de estados

| Capa | Estado |
|---|---|
| Habilidad registrada | sí (fase 1, entrada única, sin duplicar) |
| Adaptador probado (Node) | **sí** — 183 aserciones |
| App conectada | **sí en staging**, carga real verificada en Chrome 157 (módulo desde la misma ruta que usa `index-v4.html`); hook de generación **pendiente** |
| Generador/exportador probado OFF/ON | **no** |
| Consumidor probado | **no** |
| Staging | sí (worktree + diff) |
| Producción | **no** |
