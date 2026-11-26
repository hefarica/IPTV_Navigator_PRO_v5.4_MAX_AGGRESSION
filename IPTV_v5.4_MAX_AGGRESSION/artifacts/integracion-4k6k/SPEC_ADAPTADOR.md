# SPEC_ADAPTADOR — contrato exacto entre `ape-iptv-auditoria-4k-premium6k` (Python) y un adaptador JavaScript

**Artefacto:** `artifacts/integracion-4k6k/SPEC_ADAPTADOR.md`
**Fecha de medición:** 2026-11-20 (America/Bogota)
**Alcance:** especificación de semántica, no implementación. **No contiene código JS.**
**Flag de integración:** todo lo descrito queda bajo `APE_4K6K_AUDIT=0` (apagado por defecto). Con el flag apagado el generador no debe emitir ni leer ninguna de estas etiquetas: la salida previa permanece byte-idéntica.

Este documento describe **lo que el Python escribe y comprueba de verdad**, medido ejecutando el código sobre fixtures sintéticos y comparando contra los artefactos entregados por el operador. Cada afirmación lleva `archivo:línea` o el comando que la produjo. Lo que no se pudo medir está en §7 como **NO COMPUTADO** con su motivo.

---

## §0 Identidad de las fuentes y una advertencia obligatoria

### 0.1 Fuentes leídas (con hash)

| Rol | Archivo | Bytes | Líneas | SHA-256 |
|---|---|---|---|---|
| Skill | `SKILL.md` | 8.284 | 97 | `d88ec8f3df0deebfeb886109edc11daf5f33d4b06774577271af0b19060c72ad` |
| Contrato | `references/contrato_y_limites.md` | 6.957 | 52 | `0f67448fed8ea03a0cbfbda817386554fb3462c42dd434324676d063f8c2ab47` |
| Núcleo | `scripts/auditar_y_ampliar.py` | **16.159** | **338** | `cb3ec06668a580b08c154a5956b36469c46b7620a61f22cae9aaa26650b3b4fb` |
| Entrada | `scripts/ejecutar_seguro.py` | 3.931 | 91 | `0e92d4c0f106335b913b493ed7378138874682f06fb1e0e90f947683f3cabed9` |
| Verificador | `scripts/verificar_lista.py` | **2.508** | **66** | `f9d860d69ba94d39c00db53c0202f8684859a40005cfbcaf64f7e3004133f0d5` |
| Escalado | `scripts/validar_escalado.py` | 5.290 | 96 | `964496d5b587cee826fe628949e50e2840ad810932b060265f57c6c3817b6dad` |
| Test | `scripts/test_preservacion.py` | 9.367 | 202 | `478f1659aa11305edc907780ebf08ca615f7d78c260d05851b18fe1cef5d86bb` |
| Test | `scripts/test_seguridad.py` | 4.134 | 87 | `64548641a2052bb95ae507d264229ac9341d99c93c8491826390572c42d2bd00` |
| Overlay | `visual_profiles.overlay.json` (del ZIP) | 9.813 | 338 | `90e665c4de8d1e067d57da97dc117daa06c1e2683d3a7e9da6d744148c13b9cb` |
| Informe | `Auditoría APE_ 4K de salida y Premium 6K simulada.md` | 11.957 | 108 | `b9de0492c3dda1d723ff2fda5def4aa535e37b9ed32d4bf512f3bfc1b04bb0c8` |
| Muestra | `integracion_muestra_sanitizada.json` | 33.003 | 880 | `2c37d3b7f82c33c06ba9fd4b6b6e2c06627d1315dce7f8161d1ed5ec49f51335` |

**Notación de citas.** `auditar_y_ampliar.py:112` = copia de la skill (16.159 B, la vigente). `zip:` = copia embarcada en `APE_AUDITORIA_4K_PREMIUM_6K.zip` (la que produjo la entrega del operador). Cuando la diferencia importa, se cita por hash y por la línea exacta del diff, no por número de línea.

**Ruta canónica de verificación.** La skill está instalada en el repo, y sus 8 archivos son **byte-idénticos** a la extracción de trabajo (verificado con `Get-FileHash` sobre ambos árboles, hash a hash):

```text
.agents/skills/ape-iptv-auditoria-4k-premium6k/SKILL.md
.agents/skills/ape-iptv-auditoria-4k-premium6k/references/contrato_y_limites.md
.agents/skills/ape-iptv-auditoria-4k-premium6k/scripts/{auditar_y_ampliar,ejecutar_seguro,verificar_lista,validar_escalado,test_preservacion,test_seguridad}.py
```

Es decir: **cualquier `archivo:línea` de este spec se puede comprobar en el repo**, no solo en un temporal. La copia instalada **tampoco** es la del ZIP: coincide con la revisión nueva (16.159 B), no con la embarcada en la entrega (16.070 B).

### 0.2 ADVERTENCIA — existen dos revisiones y la entregada es la vieja

El ZIP del operador embarca una copia **más antigua** del núcleo y del verificador. Medido con `Compare-Object` sobre ambos archivos:

| Archivo | Skill (vigente, = instalada) | ZIP (entregado) | Diferencia medida |
|---|---|---|---|
| `auditar_y_ampliar.py` | 16.159 B · `cb3ec06668a580b08c154a5956b36469c46b7620a61f22cae9aaa26650b3b4fb` | 16.070 B · `3fe9361e28870b6aeb152ff30f74d83d34da7f694afca6c122bdb43c8c51eda4` | ZIP **no** escribe `eol` en `APE-AUDIT-ORIGINAL`; ZIP cuenta ids vacíos como duplicados |
| `verificar_lista.py` | 2.508 B · `f9d860d69ba94d39c00db53c0202f8684859a40005cfbcaf64f7e3004133f0d5` | 2.492 B · `704541dea889bfd9a05fe20d579120fdbe28ae43fbcf6e7bb1520d863d4c3378` | ZIP restaura con `+ '\n'` fijo; la vigente usa `obj.get('eol','\n')` |
| `validar_escalado.py` | 5.290 B · `964496d5…` | 5.290 B · `964496d5…` | idéntico |
| `test_preservacion.py` | 9.367 B · `478f1659…` | 9.367 B · `478f1659…` | idéntico |

Los SHA-256 del ZIP coinciden con su propio `SHA256SUMS.txt` (`3fe9361e…`, `704541de…`), así que **el ZIP es internamente consistente**: simplemente es la revisión anterior. Además el ZIP **no incluye** `test_seguridad.py` (no aparece en su índice ni en `SHA256SUMS.txt`), de modo que la suite que el informe llama "ocho pruebas unitarias" (informe:73) es la del ZIP; la skill vigente ejecuta **17**.

**Consecuencia para el adaptador JS:** debe **leer** payloads de ambas formas (§2.1) pero debe **escribir** la forma nueva, porque es la única que preserva CRLF. Divergir de esto rompe la recuperación exacta del original (§5).

Líneas exactas del diff (medidas):

```text
archive()      ZIP :    return LEGACY_TAG + encode({'line': line.rstrip('\r\n')}) + '\n'
               SKILL:  content = line.rstrip('\r\n')
                       return LEGACY_TAG + encode({'line': content, 'eol': line[len(content):]}) + '\n'
duplicados     ZIP :    if channel_id in ids:  /  stats[...] += 1  /  ids.add(channel_id)
               SKILL:  if channel_id:  /  if channel_id in ids: ...  /  ids.add(channel_id)
restore        ZIP :    result.append(obj['line'] + '\n')
               SKILL:  result.append(obj['line'] + obj.get('eol', '\n'))
```

---

## §1 (a) Bloque REA `ape.rea-intent/1` — claves exactas, valores literales y significado

### 1.1 Dónde vive y cómo se escribe

El Python **no crea** un bloque REA nuevo: **extiende** el que ya existe en la línea `#EXT-X-APE-REA:`. La reescritura es literal (`auditar_y_ampliar.py:142-144`):

```text
if line.startswith('#EXT-X-APE-REA:'):
    old = json.loads(line.split(':', 1)[1])
    new = '#EXT-X-APE-REA:' + json.dumps(extend_rea(old, profile), ensure_ascii=False, separators=(',', ':')) + '\n'
```

- La etiqueta es `#EXT-X-APE-REA:` y **el JSON va en la misma línea**, compacto (`separators=(',', ':')` → sin espacios) y **sin escapar no-ASCII** (`ensure_ascii=False`) — `:144`.
- El esquema `schema` **no se toca**: sigue siendo `ape.rea-intent/1`, que es el valor medido en la lista real (`integracion_muestra_sanitizada.json:850`). Lo que cambia es `policyId`.
- Si el canal **no tiene** línea `#EXT-X-APE-REA:`, **no se inventa ninguna** (§6, caso E1).

**Este es el punto más delicado del contrato:** el bloque conserva su `schema` `ape.rea-intent/1` pero su `policyId` pasa de `rea-adaptive-v1` (valor real medido, `integracion_muestra_sanitizada.json:851`) a `ape-4k-premium6k-intent/1`. Un consumidor que discrimine por `schema` **no verá diferencia**; el que discrimine por `policyId` sí. Ambos hechos están medidos (§1.2 y la verificación de `:112`).

### 1.2 Claves ESCRITAS por el Python (12 sobrescritas + 1 añadida)

Todas provienen de `extend_rea()` (`auditar_y_ampliar.py:109-128`). `VERSION = 'ape-4k-premium6k-intent/1'` (`:18`).

| # | Clave | Valor literal | Línea | Significado |
|---|---|---|---|---|
| 1 | `policyId` | `"ape-4k-premium6k-intent/1"` | `:112` | Identificador de la política aplicada. **Sobrescribe** `"rea-adaptive-v1"`; es reutilización de un campo existente, no un campo nuevo. |
| 2 | `status` | `"requested_only"` | `:113` | Solicitud declarada; no ejecución. |
| 3 | `targetResolution` | `"3840x2160"` | `:114` | Lienzo objetivo **standard_4k**. En la lista real estaba `null` (`integracion_muestra_sanitizada.json:854`). |
| 4 | `targetWidth` | `3840` (entero) | `:114` | Ancho objetivo. |
| 5 | `targetHeight` | `2160` (entero) | `:114` | Alto objetivo. |
| 6 | `boxWidth` | `3840` (entero) | `:115` | Caja de salida — mismo valor que `targetWidth`. |
| 7 | `boxHeight` | `2160` (entero) | `:115` | Caja de salida — mismo valor que `targetHeight`. |
| 8 | `mode` | `"upscale_if_needed"` | `:116` | Escalar solo si la fuente no alcanza. |
| 9 | `enhancementRequested` | `true` (booleano) | `:116` | Realce solicitado, no ejecutado. |
| 10 | `execution` | `"not_verified"` | `:117` | Nada verificado. |
| 11 | `capacityGate` | `"device_runtime"` | `:117` | La capacidad se decide en el dispositivo, en runtime. |
| 12 | `outputPreference` | `"preserve_verified_source"` | `:118` | Preferir la fuente verificada antes que el lienzo. |
| 13 | `outputPolicy` | objeto de 13 claves (§1.3) | `:120-127` | **Única clave nueva**. |

### 1.3 Sub-objeto `outputPolicy` (13 claves, `auditar_y_ampliar.py:120-127`)

| Clave | Valor literal | Significado |
|---|---|---|
| `schema` | `"ape-4k-premium6k-intent/1"` | Esquema de la política. |
| `profile` | el valor de `ape-profile` del `#EXTINF`, o `"runtime"` si falta (`:135`) | Perfil heredado. |
| `defaultVariant` | `"standard_4k"` | Variante activa por defecto. |
| `floorLock` | `"3840x2160"` (string) | Suelo 4K solicitado. **String, no objeto.** |
| `premiumRequested` | `true` | Premium 6K solicitada. |
| `premiumResolution` | `"5760x3240"` | Lienzo Premium 6K. |
| `premiumKind` | `"simulated_spatial_upscale"` | Simulación por escalado espacial, **no** IA. |
| `preserveHigherSource` | `true` | No bajar 8K a 4K. |
| `sourceTruthUnchanged` | `true` | La verdad de fuente no se altera. |
| `inheritExistingVisualTuning` | `true` | Hereda el ajuste visual previo. |
| `hdrPolicy` | `"preserve_verified_source"` | HDR solo si la fuente lo verifica. |
| `nativeResolutionClaim` | `false` | **No** se declara resolución nativa. |
| `executed` | `false` | No ejecutado. |

### 1.4 Claves PRESERVADAS (7 de las 19 reales)

`extend_rea()` hace `new = dict(old)` y luego `update(...)` (`:110-111`), así que **todo lo no listado sobrevive intacto**. Sobre la forma real de 19 claves (`integracion_muestra_sanitizada.json:829-849`), quedan sin tocar:

`schema`, `hdr`, `hdrVerified`, `integration`, `runtimeFallback`, `runtimePackage`, `sourceStatus`

**Aritmética verificada:** 19 originales − 12 sobrescritas = **7 preservadas**; 7 + 12 + 1 (`outputPolicy`) = **20 claves** tras el parche. Medición propia sobre un fixture con una clave desconocida adicional: **21 claves**, y `campoDesconocido` sobrevivió (`medicion.json` → `rea_campoDesconocido_preservado = {"anidado":[1,2,3]}`). Es decir: **nunca se descarta una clave desconocida** — `test_preservacion.py:160-171` lo exige.

### 1.5 Dónde vive cada variante (standard_4k vs premium_6k_simulated)

Punto que un adaptador puede equivocar: **el bloque REA solo contiene el objetivo 4K**. El 6K **no** va en `targetResolution`.

| Objetivo | Dónde se declara | Literal | Línea |
|---|---|---|---|
| 4K | `REA.targetResolution/Width/Height/box*` | `"3840x2160"` / `3840` / `2160` | `:114-115` |
| 4K | `REA.outputPolicy.floorLock` | `"3840x2160"` | `:122` |
| 6K | `REA.outputPolicy.premiumResolution` | `"5760x3240"` | `:123` |
| 6K | `#EXT-X-APE-PREMIUM-REQUEST` | `PROFILE=<p>;VARIANT=premium_6k_simulated;TARGET=5760x3240;NATIVE_CLAIM=0;EXECUTED=0` | `:164` |
| 6K | `#EXT-X-APE-CRYSTAL-6K` | `REQUESTED;TARGET=5760x3240;VARIANT=PREMIUM;CAPACITY_CHECK=RUNTIME;EXECUTED=0` | `:150` |
| 4K+6K | documento de política (`policy()`) | `profiles[p].variants.{standard_4k,premium_6k_simulated}` | `:60-68`, `:72` |

### 1.6 Documento de política de cabecera (`#EXT-X-APE-AUDIT-POLICY:`)

Se emite **una sola vez**, en el bloque de cabecera (el que no empieza por `#EXTINF:`), **al final** de ese bloque (`auditar_y_ampliar.py:132-133`). Contenido: `encode(policy())`. Se midió el árbol completo; valores literales:

**Raíz (5 claves):**

```text
schema                = "ape-4k-premium6k-intent/1"     (:70)
extends               = "ape.rea-intent/1"              (:70)
deployment            = "not_installed"                 (:70)
active_default_variant= "standard_4k"                   (:71)
common / profiles / zapping                             (:71-82)
```

**`common` (10 claves, `:33-59`)** — se listan sus hojas:

```text
common.preserve_source_truth                          = true
common.preserve_existing_metadata                     = true
common.inherit_existing_visual_tuning                 = true
common.video_path                                     = "unchanged_existing_uri"
common.codec_selection.preferred_family               = "hevc"
common.codec_selection.only_existing_verified_renditions = true
common.codec_selection.within_hevc                    = "highest_verified_quality_supported_by_device_and_network"
common.codec_selection.fallback                       = "highest_verified_compatible_source"
common.codec_selection.do_not_transcode_by_headers    = true
common.codec_selection.no_claim_of_lossless           = true
common.runtime_gate.requires_player_or_helper         = true
common.runtime_gate.verify_source_with                = "ffprobe_or_decoder"
common.runtime_gate.verify_device_capabilities        = true
common.runtime_gate.never_forge_device_descriptor     = true
common.runtime_gate.unsupported_output                = "report_blocked_do_not_label_as_4k_or_6k"
common.runtime_gate.continuity_fallback               = "native_only_with_explicit_output_status"
common.runtime_gate.preserve_higher_resolution_source = true
common.floor_lock.requested                           = true
common.floor_lock.resolution                          = "3840x2160"
common.floor_lock.state                               = "not_executed"
common.virtual_4k.requested                           = true
common.virtual_4k.resolution                          = "3840x2160"
common.virtual_4k.kind                                = "upscaled_if_needed"
common.hdr_intent.policy                              = "preserve_verified_source"
common.hdr_intent.sdr_to_hdr                          = "disabled_by_default"
common.hdr_intent.dolby_vision_synthesis              = false
common.APE_VISUAL_FIRST.default                       = 0
common.APE_VISUAL_FIRST.enabled_value                 = 1
common.APE_VISUAL_FIRST.scope                         = "experimental_local_visual_tuning"
common.APE_VISUAL_FIRST.override_source_hdr_metadata  = false
```

**`profiles`:** 12 entradas, una por `PROFILES` (`:19`, `:72`). `PROFILES` se genera con comprensión de lista: `[f'P{i}{suffix}' for suffix in ('', '.5') for i in range(6)]` → **orden exacto**: `P0, P1, P2, P3, P4, P5, P0.5, P1.5, P2.5, P3.5, P4.5, P5.5`. Cada entrada:

```text
profiles.<p>.inherit_existing_profile = "<p>"            (mismo string que la clave)
profiles.<p>.variants.standard_4k.label                = "4K escalado si la fuente lo requiere"
profiles.<p>.variants.standard_4k.width                = 3840
profiles.<p>.variants.standard_4k.height               = 2160
profiles.<p>.variants.standard_4k.requested            = true
profiles.<p>.variants.standard_4k.executed             = false
profiles.<p>.variants.standard_4k.native_quality_claim = false
profiles.<p>.variants.premium_6k_simulated.label                = "Premium 6K simulada"
profiles.<p>.variants.premium_6k_simulated.width                = 5760
profiles.<p>.variants.premium_6k_simulated.height               = 3240
profiles.<p>.variants.premium_6k_simulated.requested            = true
profiles.<p>.variants.premium_6k_simulated.executed             = false
profiles.<p>.variants.premium_6k_simulated.native_quality_claim = false
profiles.<p>.variants.premium_6k_simulated.processing           = "spatial_upscale_not_ai_superresolution"
```

Son **idénticas para los 12 perfiles**: no hay tuning por perfil, solo herencia declarada. `test_preservacion.py:123-142` lo exige (12 perfiles, 2 variantes, ambos `executed` y `native_quality_claim` en `false`).

**`zapping` (12 claves, `:73-82`):**

```text
zapping.required                        = true
zapping.method                          = "POST"
zapping.url_change_method               = "PUT"
zapping.endpoint                        = null
zapping.endpoint_state                  = "requires_existing_vps_route"
zapping.fields                          = ["channel_id","channel_name","content_type","codec_hint","timestamp","profile","variant","policy_schema"]
zapping.async_nonblocking               = true
zapping.video_path_unchanged            = true
zapping.execution_state                 = "requires_player_or_local_helper"
zapping.timestamp_format                = "RFC3339_UTC"
zapping.must_not_send_provider_credentials = true
```

`endpoint: null` es deliberado: el informe declara que no se inventa ruta del VPS (informe:59). Un adaptador JS **no debe** rellenar `endpoint` sin una ruta verificada.

**Tamaño medido de esta línea:** `encode(policy())` = **8.818 caracteres**; la línea completa con etiqueta y salto = **8.843 bytes**. Es una sola línea de ~8,8 KB en la cabecera del fichero. Cualquier parser JS con límite de longitud de línea debe soportarla (§6, caso 13).

### 1.7 Etiquetas hermanas reescritas (literales exactos)

`patch_block()` reescribe estas líneas cuando aparecen (`auditar_y_ampliar.py:145-159`). Literales completos, medidos en la salida:

| Etiqueta origen | Literal emitido | Línea |
|---|---|---|
| `#EXT-X-APE-UPSCALE:` | `#EXT-X-APE-UPSCALE:REQUESTED;TARGET=3840x2160;PREMIUM_TARGET=5760x3240;SOURCE=UNKNOWN;MODE=UPSCALE_IF_NEEDED;EXECUTOR=existing_player_or_helper;EXECUTED=0;PRESERVE_HIGHER_SOURCE=1` | `:146` |
| `#EXT-X-APE-4K-PREMIUM:` | `#EXT-X-APE-4K-PREMIUM:REQUESTED;TARGET=3840x2160;SOURCE_NATIVE_CLAIM=0;CAPACITY_CHECK=RUNTIME;EXECUTED=0` | `:148` |
| `#EXT-X-APE-CRYSTAL-6K:` | `#EXT-X-APE-CRYSTAL-6K:REQUESTED;TARGET=5760x3240;VARIANT=PREMIUM;CAPACITY_CHECK=RUNTIME;EXECUTED=0` | `:150` |
| `#EXT-X-APE-CRYSTAL-6K-MODE:` | `#EXT-X-APE-CRYSTAL-6K-MODE:SIMULATED_SPATIAL_UPSCALE;SOURCE=unknown;NATIVE_CLAIM=0;EXECUTED=0` | `:152` |
| `#EXT-X-STREAM-INF:` | `#EXT-X-APE-AUDIT-UNVERIFIED-STREAM-INF:` + el mismo contenido tras `:` | `:156` |
| `#EXTVLCOPT:video-filter=` | `#EXT-X-APE-FFMPEG-FILTER-REQUEST:` + el mismo contenido tras `=` | `:159` |
| *(insertada)* | `#EXT-X-APE-OUTPUT-REQUEST:PROFILE=<p>;VARIANT=standard_4k;TARGET=3840x2160;SOURCE_VERIFIED=0;EXECUTED=0` | `:163` |
| *(insertada)* | `#EXT-X-APE-PREMIUM-REQUEST:PROFILE=<p>;VARIANT=premium_6k_simulated;TARGET=5760x3240;NATIVE_CLAIM=0;EXECUTED=0` | `:164` |

Notas estructurales medidas en la salida real (`e2e/temp.salida.m3u8`, líneas 5-12):

1. Las dos etiquetas insertadas van en **posición 1 y 2 del bloque**, es decir **inmediatamente después del `#EXTINF`** y **antes** de cualquier metadata previa (`:163-164`, `insert(1)` / `insert(2)`).
2. El renombre de `STREAM-INF` y de `EXTVLCOPT:video-filter` es **reversible por prefijo** y no genera archivo (§2.2).
3. `#EXT-X-APE-AUDIT-UNVERIFIED-STREAM-INF` conserva los atributos HLS tal cual, incluidos `RESOLUTION` y `CODECS`. No se reinterpreta ni se reescala el codec declarado.

---

## §2 (b) `APE-AUDIT-ORIGINAL` y las políticas `floor_lock` / `virtual_4k` / `hdr_intent` / `APE_VISUAL_FIRST`

### 2.1 Formato exacto del archivo de valores modificados

**Etiqueta:** `#EXT-X-APE-AUDIT-ORIGINAL:` (`auditar_y_ampliar.py:21`).

**Payload:** base64 **urlsafe** del JSON compacto `{"line": <línea original sin EOL>, "eol": <EOL capturado>}`, con **todo** el relleno `=` eliminado (`rstrip('=')`) — `:29` y `:106`:

```text
encode(obj):
  base64.urlsafe_b64encode(
      json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
  ).decode().rstrip('=')

archive(line):
  content = line.rstrip('\r\n')
  return LEGACY_TAG + encode({'line': content, 'eol': line[len(content):]}) + '\n'
```

Características que el JS debe reproducir al pie de la letra:

| Propiedad | Valor exacto | Evidencia |
|---|---|---|
| Alfabeto | base64url (`-` y `_`, no `+` ni `/`) | `:29` `urlsafe_b64encode` |
| Relleno | **eliminado**; el decodificador debe reponerlo con `'=' * (-len % 4)` | `:29`; `verificar_lista.py:19`; `:258` |
| JSON | compacto, sin espacios | `separators=(',', ':')` `:29` |
| No-ASCII | **crudo UTF-8**, no escapado | `ensure_ascii=False` `:29` |
| Claves del payload | exactamente `line` y `eol` — nada más | `:106` |
| `line` | la línea original **sin** el salto de línea | `:105` |
| `eol` | el salto capturado: `"\n"`, `"\r\n"` o `""` | `:106` |
| Posición | la línea de archivo va **inmediatamente antes** de la línea reescrita | `:160-162` |
| Orden de claves | `line` antes que `eol` | `:106` |

**Ejemplo real medido** (de `e2e/temp.salida.m3u8` línea 8):

```text
#EXT-X-APE-AUDIT-ORIGINAL:eyJsaW5lIjoiI0VYVC1YLUFQRS1SRUE6e1wic2NoZW1hXCI6XCJhcGUucmVhLWludGVudC8xXCIsXCJwb2xpY3lJZFwiOlwicmVhLWFkYXB0aXZlLXYxXCIsXCJ0YXJnZXRSZXNvbHV0aW9uXCI6bnVsbCxcInNvdXJjZVN0YXR1c1wiOlwidW5rbm93blwifSIsImVvbCI6IlxuIn0
```

que decodifica a:

```json
{"line":"#EXT-X-APE-REA:{\"schema\":\"ape.rea-intent/1\",\"policyId\":\"rea-adaptive-v1\",\"targetResolution\":null,\"sourceStatus\":\"unknown\"}","eol":"\n"}
```

Con CRLF el mismo mecanismo produce `"eol":"\r\n"` (medido: `crlf payloads: [{"line": "#EXT-X-APE-UPSCALE:…", "eol": "\r\n"}]`).

### 2.2 Qué se archiva y qué NO (matriz medida)

La condición de archivo es `if new != line and not already and not line.startswith(('#EXT-X-STREAM-INF:', '#EXTVLCOPT:video-filter='))` (`auditar_y_ampliar.py:160`). De ahí salen cuatro reglas:

| Caso | ¿Se archiva? | Motivo |
|---|---|---|
| Línea reescrita en general (REA, UPSCALE, 4K-PREMIUM, CRYSTAL-6K, CRYSTAL-6K-MODE) | **Sí** | `:160` |
| `#EXT-X-STREAM-INF:` | **No** | excluida explícitamente en `:160`; se restaura por prefijo |
| `#EXTVLCOPT:video-filter=` | **No** | excluida explícitamente en `:160`; se restaura por prefijo |
| Bloque que **ya** tenía `#EXT-X-APE-OUTPUT-REQUEST:` (`already = true`, `:136`) | **No archiva nada** | idempotencia |
| `#EXT-X-APE-OUTPUT-REQUEST` / `#EXT-X-APE-PREMIUM-REQUEST` preexistentes | **No**: se descartan (`continue`, `:139-140`) y se reinsertan recalculadas | idempotencia |

Medición que confirma la última fila y revela una **pérdida real de información**: un bloque con `#EXT-X-APE-OUTPUT-REQUEST:PROFILE=P3` preexistente sale como `PROFILE=P3;VARIANT=standard_4k;…` y **no deja ninguna traza del valor anterior** (`archivos=0`, salida F de `medir_bordes.py`). El adaptador JS que quiera archivar ese valor **divergiría** del Python; si quiere paridad, debe aceptar la pérdida.

### 2.3 Las cuatro políticas

Aparecen en **dos sitios distintos** y con **forma distinta**. No son intercambiables.

**(1) En el documento de política de cabecera, dentro de `common` (objetos, `:52-58`):**

```text
floor_lock     = {"requested": true, "resolution": "3840x2160", "state": "not_executed"}
virtual_4k     = {"requested": true, "resolution": "3840x2160", "kind": "upscaled_if_needed"}
hdr_intent     = {"policy": "preserve_verified_source", "sdr_to_hdr": "disabled_by_default",
                  "dolby_vision_synthesis": false}
APE_VISUAL_FIRST = {"default": 0, "enabled_value": 1,
                    "scope": "experimental_local_visual_tuning",
                    "override_source_hdr_metadata": false}
```

**(2) En el bloque REA, dentro de `outputPolicy` (escalares, `:122` y `:125`):**

```text
floorLock = "3840x2160"        (string)
hdrPolicy = "preserve_verified_source"   (string; no existe "virtual_4k" ni "APE_VISUAL_FIRST" aquí)
```

Semántica obligatoria para el adaptador:

- `floor_lock.state = "not_executed"` y `virtual_4k` **no tienen** campo `executed`: son restricciones/intenciones virtuales, no prueba de hardware. Lo fija el contrato (`contrato_y_limites.md:27`) y lo verifica `test_preservacion.py:140`.
- `hdr_intent.sdr_to_hdr = "disabled_by_default"` y `dolby_vision_synthesis = false`: la conversión SDR→HDR y la síntesis de Dolby Vision están **apagadas**. `test_preservacion.py:141-142` lo exige. Ninguna de estas claves puede convertirse en una etiqueta `VIDEO-RANGE=PQ` nueva por el adaptador.
- `APE_VISUAL_FIRST.default = 0`, `enabled_value = 1`: el valor por defecto es **0**; `1` es modo experimental y `override_source_hdr_metadata` sigue en `false`. El adaptador **no debe** activarlo por su cuenta.
- El mismo nombre `floor_lock`/`virtual_4k` existe en el repo con **otro tipo** (§3.3). Esa colisión es el riesgo principal de la fusión del overlay.

### 2.4 Contrato inverso: restauración exacta (`verificar_lista.py`)

La reversibilidad es parte del formato. `restore_block()` (`verificar_lista.py:11-31`) define el algoritmo inverso que el adaptador debe poder ejecutar o al menos respetar:

1. Descartar `HEADER_TAG`, `OUTPUT_TAG`, `PREMIUM_TAG` (`:15-16`).
2. Al encontrar `LEGACY_TAG`: decodificar payload, reponer relleno, y emitir `obj['line'] + obj.get('eol', '\n')`; marcar `skip = True` (`:17-22`).
3. En la línea siguiente, si `skip`, **descartarla** y resetear `skip` (`:23-25`) — es la línea reescrita, ya reemplazada por la recuperada.
4. `#EXT-X-APE-AUDIT-UNVERIFIED-STREAM-INF:` → `#EXT-X-STREAM-INF:` (`:26-27`).
5. `#EXT-X-APE-FFMPEG-FILTER-REQUEST:` → `#EXTVLCOPT:video-filter=` (`:28-29`).

El paso 3 implica una **dependencia posicional fuerte**: el archivo DEBE preceder inmediatamente a su línea reescrita. Si el adaptador reordena líneas, la restauración se corrompe.

---

## §3 (c) `visual_profiles.overlay.json` — esquema exacto y relación con `visual_profiles.json`

### 3.1 Esquema exacto del overlay (338 líneas, 9.813 B, `90e665c4…`)

Emitido por `--policy-json` como `json.dumps(policy(), ensure_ascii=False, indent=2) + '\n'` (`auditar_y_ampliar.py:326-327`).

```text
{
  "schema": "ape-4k-premium6k-intent/1",        // :70
  "extends": "ape.rea-intent/1",                // :70
  "deployment": "not_installed",                // :70
  "active_default_variant": "standard_4k",      // :71
  "common": { ... 10 claves, ver §1.6 ... },    // :33-59
  "profiles": {                                 // :72
    "P0" | "P1" | "P2" | "P3" | "P4" | "P5"
    | "P0.5" | "P1.5" | "P2.5" | "P3.5" | "P4.5" | "P5.5": {
        "inherit_existing_profile": "<la misma clave>",
        "variants": {
          "standard_4k":        {label,width,height,requested,executed,native_quality_claim},
          "premium_6k_simulated":{label,width,height,requested,executed,native_quality_claim,processing}
        }
    }
  },
  "zapping": { ... 12 claves, ver §1.6 ... }    // :73-82
}
```

Claves raíz: exactamente **7** (`schema`, `extends`, `deployment`, `active_default_variant`, `common`, `profiles`, `zapping`). El overlay entregado tiene **338 líneas** — coincide exactamente con las 338 del `auditar_y_ampliar.py` vigente por coincidencia, no por relación.

### 3.2 Cómo se relaciona con el `visual_profiles.json` real del repo

El repo tiene un único `visual_profiles.json` de producción:

```text
IPTV_v5.4_MAX_AGGRESSION/vps/ape-uhdx/visual_profiles.json
84.924 B · 2.095 líneas · sha256 `ef1cd863d07c56eef137f6448da86f3e93d11ee93e67832b8847323922340a36`
```

Sus claves de primer nivel (medidas con `ConvertFrom-Json`) son:

```text
_doc, _contract,
P0_TRUTHFUL_SOURCE_SAFE, P1_STABLE_1080P_PREMIUM, P2_PERCEPTUAL_4K_BALANCED,
P3_CRYSTAL_UHD_SAFE, P4_CRYSTAL_UHD_EXTREME, P5_OLED_UHD_VISUAL_FIRST_EXPERIMENTAL,
P6_CHINA_BOX_8K_ULTRA_AGGRESSIVE,
TRUTHFUL_SOURCE_SAFE, STABLE_1080P_PREMIUM, PERCEPTUAL_4K_BALANCED,
CRYSTAL_UHD_SAFE, CRYSTAL_UHD_EXTREME, OLED_UHD_VISUAL_FIRST_EXPERIMENTAL,
CHINA_BOX_8K_ULTRA_AGGRESSIVE, HUAWEI_BOX_VISUAL_AGGRESSIVE,
_doc_aggressive_forced_4k,
P0_SHOWROOM_FLASH_4K, P1_DAILY_EXTREME_4K, P2_SAFE_COMPAT,
P3_HD_BOOST, P4_HD_LITE, P5_SD_RESCUE
```

**Relación medida, en cuatro puntos:**

1. **No hay colisión de claves de primer nivel.** El overlay usa `profiles` como **contenedor**; `visual_profiles.json` **no tiene** clave `profiles` — sus perfiles son claves de primer nivel. Un merge ingenuo (`{...base, ...overlay}`) añade `profiles` como clave nueva y **no toca ningún perfil existente**: el overlay queda **inerte por construcción**. Eso es coherente con `deployment: "not_installed"` (`:70`) y con el informe (:55).
2. **Vocabulario de perfiles distinto.** Overlay: `P0…P5.5` (12 tokens cortos). Archivo real: `P0_TRUTHFUL_SOURCE_SAFE…P6_CHINA_BOX_8K_ULTRA_AGGRESSIVE` + `P0_SHOWROOM_FLASH_4K…P5_SD_RESCUE`. **No existe en el código leído ninguna tabla que mapee `P3` → `P3_CRYSTAL_UHD_SAFE` o `P3_HD_BOOST`.** Es un hueco real, no un detalle (§7).
3. **Colisión de nombre con tipo divergente — el riesgo concreto.** El overlay declara `floor_lock` y `virtual_4k` como **objetos** (`:52-53`). El consumidor Lua de producción los compara con **strings**:
   - `vps/nginx/lua/combined_body_filter.lua:289` → `cfg.floor_lock == "BYPASS" or cfg.floor_lock == nil`
   - `:313` → `cfg.floor_lock == "ACTIVE"`
   - `:350`, `:357`, `:414` → `cfg.virtual_4k == "ACTIVE"`; `:369` → `cfg.virtual_4k_hdr == "ACTIVE"`
   - `:287-288` documenta el efecto: si un perfil usa `floor_lock` como objeto/valor no estándar, **la escalación no aplica** (no rompe: se degrada a no-op).
   - `backend/resolve_quality_unified.php:5596-5598` concatena esos mismos campos en cabeceras `X-APE-UHDX-HDR-Intent`, `X-APE-UHDX-Virtual-4K`, `X-APE-UHDX-Floor-Lock` — con un objeto en PHP la concatenación produce `Array`, no el literal esperado.
   - Ambos consumidores leen la ruta fija `/etc/ape-uhdx/visual_profiles.json` (`resolve_quality_unified.php:22`, `combined_body_filter.lua:105`).
4. **Fusión = extensión, nunca sustitución.** El contrato lo fija (`SKILL.md:64`: "Entregar `visual_profiles.overlay.json` como extensión, no sustitución"; `contrato_y_limites.md:23`) y el informe lo repite (:55). El adaptador JS **no debe** reescribir `visual_profiles.json` ni copiar el overlay sobre `/etc/ape-uhdx/`.

### 3.3 Reglas de fusión que el adaptador JS debe respetar

| # | Regla | Base |
|---|---|---|
| R1 | El overlay se lee como **documento aparte**; nunca reemplaza `visual_profiles.json`. | `SKILL.md:64`, `contrato_y_limites.md:23` |
| R2 | Sus 4 políticas (`floor_lock`, `virtual_4k`, `hdr_intent`, `APE_VISUAL_FIRST`) son **intención**, no ejecución. | `contrato_y_limites.md:27`, `test_preservacion.py:140-142` |
| R3 | Si se proyectan al vocabulario del repo, la forma **escalar** (`"ACTIVE"`/`"BYPASS"`/`nil`) es la que entienden los consumidores; la forma objeto del overlay **no** la entienden. Proyectar sin adaptar = no-op. | `combined_body_filter.lua:289,313,350` |
| R4 | No se inventa el mapeo `Pn` → perfil con nombre largo. | Medido: no existe tabla (§7) |
| R5 | `deployment` se lee como estado real: `not_installed` ⇒ declarar campos **no** es instalar soporte. | `:70`, `SKILL.md:64` |
| R6 | `zapping.endpoint = null` se mantiene nulo hasta tener ruta verificada. | `:75`, informe:59 |

---

## §4 (d) JSON de auditoría e inventario JSONL — nombres de campo reales

### 4.1 `--audit-json`: estructura (`auditar_y_ampliar.py:300-327`)

Raíz (medida, `e2e.json` → `audit_top_keys`):

| Clave | Tipo | Cuándo aparece | Origen |
|---|---|---|---|
| `before` | objeto de 23 claves | siempre | `:310-311` |
| `implementation_state` | `"metadata_only_not_deployed"` | siempre | `:311` |
| `after` | objeto de 23 claves (idénticas) | **solo con `--output`** | `:319` |
| `preservation_checks` | objeto de 4 booleanos | **solo con `--output`** | `:320-324` |

Sin `--output`, medido: `keys=['before','implementation_state']` — **no existen** `after` ni `preservation_checks`. Un consumidor que asuma su presencia falla en modo auditoría.

### 4.2 Las 23 claves de `before`/`after`

**Contadores (14, `:169-176`):**

| Campo | Literal inicial | Significado |
|---|---|---|
| `schema` | `"ape-audit/1"` | Esquema |
| `file_bytes` | `Path(path).stat().st_size` | Bytes del fichero |
| `channels` | `0` | Canales contados |
| `uris` | `0` | URIs (líneas no-`#` no vacías) |
| `source_resolution_verified` | `0` | `#EXT-X-APE-RESOLUTION-VERIFIED:true` (`:218-220`) |
| `source_codec_verified` | `0` | `#EXT-X-APE-CODEC-VERIFIED:true` (`:221-222`) |
| `source_hdr_verified` | `0` | `#EXT-X-APE-HDR-VERIFIED:true` (`:223-224`) |
| `rea_present` | `0` | Líneas `#EXT-X-APE-REA:` (`:225-226`) |
| `rea_null_target` | `0` | REA con `targetResolution` nulo (`:228-229`) |
| `premium_requested` | `0` | `#EXT-X-APE-CRYSTAL-6K:REQUESTED;` (`:236-238`) |
| `urls_with_full_metadata` | `0` | URI con `ape_meta`/`ape_policy`/`metadata`/`idata`/`isession` en query (`:251-254`) |
| `qoe_profile_mismatch` | `0` | `APE-QOE-CONTRACT.p` ≠ `ape-profile` (`:233-235`) |
| `duplicate_channel_ids` | `0` | `tvg-id` repetido, **solo si no está vacío** (`:199-202`) |
| `network_test_scope` | `"none_in_this_script"` | Literal fijo: el script no hace red |

**Estructuras (9, `:269-276`):** `sha256_uncompressed_text`, `uri_sequence_sha256`, `profiles`, `tag_counts`, `device_descriptors`, `hls_unverified_declarations`, `network_caching_ms`, `qoe_profile_mismatches`, `duplicate_metadata_keys_channels`.

Detalles de forma medidos, que son los que suelen romper un adaptador:

| Campo | Forma real medida | Trampa |
|---|---|---|
| `sha256_uncompressed_text` | sha256 de **todo** el texto, línea a línea, con su EOL (`:191`) | Es la huella de la restauración (§5) |
| `uri_sequence_sha256` | sha256 de cada URI + `\n`, en orden (`:248`) | Debe ser **idéntico** antes/después (`:315`) |
| `profiles` | `{"P3":3534,"P4":7645,"P1":43}` o `{"unknown":2}` | Perfil ausente = `"unknown"` en audit (`:203`), pero `"runtime"` en patch (`:135`). **Dos defaults distintos** |
| `tag_counts` | `{"#EXTINF":4,"#EXT-X-APE-REA":1,…}` | Las líneas **sin `:` conservan el `\n` en la clave**: medido `"#EXT-X-INDEPENDENT-SEGMENTS\n":1` (`:193`) |
| `device_descriptors` | `{"{}":1,"invalid":2}` (`:259-262`) | Clave = JSON del descriptor `d` re-serializado con `sort_keys`; los fallos van a la clave `"invalid"` |
| `hls_unverified_declarations` | `{"{\"BANDWIDTH\": \"1000\", \"RESOLUTION\": \"1920x1080\"}":1}` (`:241-243`) | Clave = JSON de atributos con `sort_keys=True` |
| `network_caching_ms` | `{"1000":1}` a partir de `#EXTVLCOPT:network-caching=` (`:244-245`) | Nombres de caché en ms como string |
| `qoe_profile_mismatches` | `{"P3->P5":1}` (`:235`) | Formato exacto `<perfil>-><qoe_p>` |
| `duplicate_metadata_keys_channels` | `{clave: 1}` por clave repetida **dentro** de un canal, excluyendo `#EXT-X-APE-AUDIT-ORIGINAL` (`:263`) | Excluye el propio tag de archivo |

### 4.3 `preservation_checks` (4 booleanos, `:320-324`)

```text
channel_count_unchanged          : true      // before.channels == after.channels
uri_sequence_unchanged           : true      // before.uri_sequence_sha256 == after.…
original_not_overwritten         : true      // literal fijo
source_verified_flags_not_forged : true      // after.source_resolution_verified == before.…
```

Si `uri_sequence_sha256` o `channels` divergieran, el script **aborta** con `RuntimeError` (`:315-318`) — medido `rc=0` en el caso bueno ⇒ ambas comprobaciones pasaron.

### 4.4 `--inventory-jsonl`: una fila por canal, 10 campos

Emitido en `:206-210` y `:265`, una línea compacta por canal:

| Campo | Tipo | Origen |
|---|---|---|
| `channel_id` | string (`tvg-id` o `""`) | `:198` |
| `profile` | string (`ape-profile` o `"unknown"`) | `:203` |
| `source_resolution` | **siempre `null`** | `:207` |
| `source_codec` | **siempre `null`** | `:207` |
| `source_verified` | bool (`true` si hay `RESOLUTION-VERIFIED:true`) | `:220` |
| `output_requested` | bool (hay `#EXT-X-APE-OUTPUT-REQUEST:`) | `:239-240` |
| `premium_requested` | bool (hay `CRYSTAL-6K:REQUESTED;`) | `:238` |
| `device_hint` | objeto JSON del `d` decodificado, o `null` | `:260` |
| `url_contains_full_metadata` | bool (heurística por nombre de parámetro) | `:254` |
| `qoe_profile` | `APE-QOE-CONTRACT.p` o `null` | `:232` |

`source_resolution` y `source_codec` están **hardcodeados a `null`** y nunca se rellenan: reservan el hueco sin inventarlo. Así lo exige el contrato (`contrato_y_limites.md:7`: no rellenar campos para aparentar cobertura) y lo comprueba `test_preservacion.py:149-156`.

### 4.5 Salidas de validación

| Archivo | Campos (medidos) |
|---|---|
| `validacion_lista_completa.json` | `all_channels_checked`, `idempotent_all_blocks`, `exact_original_text_recoverable`, `restored_original_sha256`, `uri_sequence_unchanged` (`verificar_lista.py:54-60`) |
| `validacion_multimedia.json` | `scope`, `ffmpeg_version`, `tests[]` (`kind`: `geometry`\|`encode_decode`\|`no_downscale_policy`), `all_passed`, `not_verified[]` (`validar_escalado.py:87-91`) |
| `validacion_unitaria.txt` | texto de `unittest -v` |

`not_verified` (7 literales fijos, `validar_escalado.py:89-91`): `subjective_image_improvement`, `live_realtime_throughput`, `vps_deployment`, `player_compatibility`, `live_channels`, `sub_30_ms_latency`, `automatic_zapping`. **Es la lista de lo que el propio autor declara no probado** — el adaptador no debe añadir campos a esas pruebas ni inferir sus resultados.

---

## §5 (e) Idempotencia: qué es y cómo se comprueba

### 5.1 Definición operativa exacta

**Idempotente significa, aquí, igualdad de bytes:** `patch_block(patch_block(B)) == patch_block(B)` para todo bloque `B` (`test_preservacion.py:76-84`). No es "no cambia el significado": es **lista de líneas idéntica**.

Los dos mecanismos que la producen:

1. **`already`** (`:136`): si el bloque ya contiene `#EXT-X-APE-OUTPUT-REQUEST:`, no se archiva nada. Al reejecutar, no se acumulan `APE-AUDIT-ORIGINAL`.
2. **Descarte + reinserción de las dos etiquetas calculadas** (`:139-140`, `:163-164`): cualquier `OUTPUT-REQUEST`/`PREMIUM-REQUEST` previo del bloque se elimina y se reinserta recalculado en posición 1 y 2. Conteo estable: exactamente **1 y 1** por bloque de canal.
3. **`patch_block` sobre un bloque no-EXTINF** (`:132-133`) filtra cualquier `HEADER_TAG` previo y añade **uno** al final ⇒ 1 política por fichero.

### 5.2 La función concreta que lo comprueba

**`verificar_lista.py`** lo verifica sobre **todos** los bloques del fichero (`verificar_lista.py:43-52`):

```text
for block in blocks(args.patched):
    assert patch_block(block) == block, 'Parche no idempotente.'
```

y además exige que la restauración reproduzca el original **exacto**:

```text
recovered.update(line.encode())  # sobre restore_block(block)
expected = record['before']['sha256_uncompressed_text']
assert recovered.hexdigest() == expected, 'No se recupera el texto original exacto.'
assert channels == record['before']['channels']
```

Medición propia (fixture de 5 bloques): `idempotente_todos: true`; y `verificar_lista.py` sobre la salida real devolvió

```json
{"all_channels_checked": 4, "idempotent_all_blocks": true, "exact_original_text_recoverable": true,
 "restored_original_sha256": "c468c48e241db92f0e2e0a6aed5b9a1e558ffc78b1772055bb70d0f75a3cff89",
 "uri_sequence_unchanged": true}
```

con `restored_original_sha256` **idéntico** a `before.sha256_uncompressed_text` — es decir, la cadena archivar→restaurar recupera el original byte a byte, **incluidos LF/CRLF**.

### 5.3 Lo que el adaptador JS debe cumplir para no romperla

| Requisito | Por qué |
|---|---|
| Escribir `eol` en todo archivo nuevo | sin `eol`, `restore_block` no recupera CRLF (revisión vieja) |
| No archivar el bloque que ya tiene `OUTPUT-REQUEST` | si no, la segunda pasada duplica archivos y `patch_block(b) != b` |
| Reinsertar las dos etiquetas calculadas, no acumular | el conteo debe ser 1/1 por canal |
| Emitir exactamente una línea de política por fichero, en el bloque de cabecera | si no, `blocks` deja de ser punto fijo |
| Mantener el archivo **inmediatamente** antes de la línea reescrita | `restore_block` descarta la línea siguiente al archivo |
| No tocar el orden ni el contenido de las URIs | `uri_sequence_sha256` y `sha256_uncompressed_text` deben cuadrar |

---

## §6 (f) Casos borde que el adaptador JS debe cubrir

Todos verificados ejecutando el Python; entre paréntesis, la prueba o medición.

| # | Caso borde | Comportamiento medido del Python | Qué debe hacer el adaptador |
|---|---|---|---|
| 1 | **REA ausente** | `patch_block` solo reescribe líneas `#EXT-X-APE-REA:` existentes: **no crea** el bloque. El canal recibe `OUTPUT-REQUEST` y `PREMIUM-REQUEST` pero **no** extensión REA (medido: `rea_present=1` de 4 canales en `e2e`). | Insertar REA donde no existe **divergiría**. O se replica (no crear) o se documenta la divergencia. |
| 2 | **REA con JSON inválido** | `json.loads` lanza `JSONDecodeError` y **aborta todo el parche** (medido: `Expecting property name enclosed in double quotes`) — `:143`. | Para paridad: abortar. Prohibido "arreglar" el JSON en silencio. |
| 3 | **Bloque ya parcheado (`already`)** | No archiva nada y **descarta sin traza** los `OUTPUT-REQUEST`/`PREMIUM-REQUEST` previos (medido: `archivos=0`) — `:136-140`. | Tratarlo como "ya integrado": no volver a archivar; aceptar la pérdida de los valores previos o declararla. |
| 4 | **`STREAM-INF` y `EXTVLCOPT:video-filter`** | Renombrados **sin** archivo (`:160`), restaurados por prefijo (`verificar_lista.py:26-29`). | No buscar `APE-AUDIT-ORIGINAL` para ellas; la restauración es por regla de prefijo. |
| 5 | **CRLF** | Vigente: `eol="\r\n"` en el payload (medido). ZIP/vieja: **sin** `eol` ⇒ CRLF perdido. | Leer con `obj.get('eol','\n')`; escribir con `eol`. Si no, la restauración exacta falla. |
| 6 | **Fichero sin salto final** | `blocks()` conserva la última línea sin EOL; `eol = ""` (medido `E1`). | No añadir `\n` al final: rompería `sha256_uncompressed_text`. |
| 7 | **Fichero sin cabecera** (empieza en `#EXTINF`) | `blocks()` **no** produce bloque de cabecera ⇒ la etiqueta `#EXT-X-APE-AUDIT-POLICY` **nunca se emite** (medido `E2`: `policy tag presente=False`). | No inventar la política: el adaptador debe tolerar su ausencia o declarar el hueco. |
| 8 | **Fichero solo cabecera** | Se emite **solo** la política; ni `OUTPUT` ni `PREMIUM` (medido `E3`). | No asumir que existen salidas por canal. |
| 9 | **Canal sin `ape-profile`** | `patch` usa `"runtime"` (`:135`); `audit` usa `"unknown"` (`:203`). **Dos defaults distintos y ambos medidos** (`PROFILE=runtime…`, `{"unknown":2}`). | Replicar la asimetría: es observable en los artefactos. |
| 10 | **`tvg-id` vacío o ausente** | Vigente: **no** cuenta como duplicado (`:199-201`). ZIP: **sí** (medido: `temp 0` vs `zip 1`). | Implementar la regla nueva (solo ids no vacíos). |
| 11 | **Etiquetas sin `:`** | `tag_counts` deja el `\n` en la clave (medido: `"#EXT-X-INDEPENDENT-SEGMENTS\n"`) — `:193`. | Replicar literalmente si se quiere auditoría byte-comparable. |
| 12 | **`d` no decodificable / no JSON** | Base64 válido + JSON inválido → clave `"invalid"`; también base64 inválido (medido `{"{}":1,"invalid":2}`) — `:255-262`. | No abortar: contar. `d` es "posible descriptor", no metadato completo (`SKILL.md:38`). |
| 13 | **Línea de política de 8.843 B** | Una sola línea en la cabecera (medido). | Parser con límite de línea debe soportarla; no truncar ni reflow. |
| 14 | **QoE ≠ perfil visual** | Se **registra** el desajuste y **no** se corrige (medido `{"P3->P5":1}`) — `:230-235`. | No "arreglar" `QoE.p`: el contrato lo prohíbe (`contrato_y_limites.md:29`). |
| 15 | **Fuente ya verificada** | Con `--output` se **rechaza** el parche (`ejecutar_seguro.py:81-82`, probado en `test_seguridad.py:73-83`); sin `--output` solo audita. | No parchear listas con `*-VERIFIED:true`: auditar y adaptar. |
| 16 | **`#EXTINF` dentro de un valor JSON** | `blocks()` corta por `line.startswith('#EXTINF:')` (`:96`): una línea así **dentro** de un JSON partiría el bloque. | Escanear por inicio de línea, nunca por subcadena. |
| 17 | **gzip transparente / salida `.gz`** | `open_text` descomprime `.gz` (`:86-88`); `ejecutar_seguro` **prohíbe** salida `.gz` (`:76-77`). | Aceptar entrada `.gz`; producir `.m3u8` plano y comprimir después. |
| 18 | **Permisos `0o600`** | `os.chmod(temp, 0o600)` (`:293`); en Windows el modo real es `0o666` (medido: `438 != 384`, causa del **único fallo** de la suite). | No usar el bit de permisos como aserción multiplataforma. |

Dieciocho casos; los 15 primeros son los que cambian bytes u orden. (Se listan los 18 porque 16-18 son baratos de implementar y su omisión sí rompe la idempotencia o la portabilidad.)

---

## §7 NO COMPUTADO — lo que este spec no puede afirmar y por qué

| # | Dato no medido | Motivo exacto |
|---|---|---|
| N1 | **Qué perfil con nombre largo corresponde a cada token `P0…P5.5`** | Ninguno de los 8 archivos leídos contiene una tabla de mapeo `Pn → Pn_CRYSTAL_UHD_SAFE`/`Pn_HD_BOOST`. El overlay declara `inherit_existing_profile: "Pn"` y el archivo real tiene otro espacio de nombres: la correspondencia no está en el código. |
| N2 | **Payload real de `APE-AUDIT-ORIGINAL` dentro de `APE_4K_PREMIUM_6K_METADATA.m3u8.gz`** | Por regla de la misión **no se extrajo** el `.m3u8.gz` (212.350.379 B). El código que lo produjo (ZIP, `3fe9361e…`) nunca escribe `eol`, así que por código **carece** de `eol`; **no** se verificó en los bytes del archivo comprimido. |
| N3 | **Efecto de las etiquetas en VPS, reproductor o ADB** | No se tocó el VPS (178.156.147.234), ni nginx, ni systemd, ni el reproductor. El informe declara HTTP 502 y ausencia de acceso (informe:31, 87). Cualquier afirmación de efecto sería inventada. |
| N4 | **Comportamiento de los parsers de player con la línea de política de 8.843 B** | No se ejecutó ningún player. Se midió solo el tamaño. |
| N5 | **Latencia de zapping, continuidad, tiempo de arranque** | No medidos; el propio autor los excluye (`validar_escalado.py:89-91`, `not_verified`) y el contrato prohíbe prometer latencia sin medición reproducible (`contrato_y_limites.md:41`). |
| N6 | **Consumo real del overlay por el frontend JS del repo** | El grep de `visual_profiles` devolvió 7 rutas con coincidencias, verificadas en PHP y Lua; **no** se auditó una por una la totalidad del JS del frontend. Se afirma lo verificado (PHP/Lua) y nada más. |
| N7 | **Equivalencia visual de `bwdif,unsharp,scale,setsar,pad` en VLC** | El contrato prohíbe afirmarla sin verificación (`contrato_y_limites.md:21`); el Python solo la **renombra** a `APE-FFMPEG-FILTER-REQUEST` (`:157-159`) conservando el texto. |
| N8 | **Estado de integridad del ZIP completo** | Se extrajeron **solo** 10 entradas pequeñas y el overlay; no se verificó el `.m3u8.gz` contra `SHA256SUMS.txt` (requeriría leer 212 MB). |

---

## §8 Reproducción de lo medido

Todo se ejecutó en local, sin red, sin git, sin tocar la lista protegida ni el VPS.

```powershell
# 1. Divergencia entre las dos revisiones del núcleo
#    (extraer SOLO los .py del ZIP a un scratch; nunca el .m3u8.gz)
#    Compare-Object sobre Get-Content de ambos archivos  -> 4 diferencias (ver §0.2)

# 2. Arbol literal de policy(), longitudes de línea, matriz de rechazo, casos borde
python C:\Users\HFRC\AppData\Local\Temp\ape-spec-scratch\medir_bordes.py

# 3. Claves REA escritas, payload de APE-AUDIT-ORIGINAL, idempotencia por bloque
python C:\Users\HFRC\AppData\Local\Temp\ape-spec-scratch\medir_contrato.py

# 4. CLI end-to-end: audit JSON, inventario JSONL, idempotencia global, divergencia de duplicados
python C:\Users\HFRC\AppData\Local\Temp\ape-spec-scratch\medir_e2e.py

# 5. Verificador del propio autor sobre la salida
cd C:\Users\HFRC\AppData\Local\Temp\ape-skill-6k\scripts
python verificar_lista.py <salida.m3u8> --audit-json <auditoria.json> --output-json <validacion.json>

# 6. Suite completa (17 pruebas; 1 fallo dependiente de plataforma en Windows, §6 caso 18)
python -m unittest discover -s . -p 'test_*.py' -v
```

Resultados crudos de referencia: `medicion.json`, `e2e/e2e.json`, `bordes.txt` (en el scratch de la sesión).

---

## §9 Resumen de lo que el adaptador JS debe copiar sin reinterpretar

1. **Etiquetas y prefijos** exactos: `#EXT-X-APE-REA:`, `#EXT-X-APE-AUDIT-POLICY:`, `#EXT-X-APE-AUDIT-ORIGINAL:`, `#EXT-X-APE-OUTPUT-REQUEST:`, `#EXT-X-APE-PREMIUM-REQUEST:`, `#EXT-X-APE-AUDIT-UNVERIFIED-STREAM-INF:`, `#EXT-X-APE-FFMPEG-FILTER-REQUEST:`.
2. **Codificación**: base64url, JSON compacto, `ensure_ascii=False`, relleno quitado.
3. **Los 12 valores literales escalares del REA** (§1.2) y las **13 claves de `outputPolicy`** (§1.3).
4. **Los 8 literales de etiquetas reescritas/insertadas** (§1.7).
5. **Los 4 bloques de política** (§2.3) con su forma exacta: objetos en `common`, escalares en `outputPolicy`.
6. **Los nombres de campo** de auditoría (23), inventario (10) y validación (§4).
7. **La regla de idempotencia** `patch_block∘patch_block = patch_block` y la restauración exacta por `eol` (§5).

Nada de esto instala procesamiento. `deployment` sigue siendo `not_installed`, `EXECUTED=0` en todas las etiquetas, y la resolución declarada es **objetivo de lienzo**, no resolución nativa de la fuente.
