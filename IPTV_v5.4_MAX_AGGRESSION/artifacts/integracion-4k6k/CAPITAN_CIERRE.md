# Cierre del capitán — integración 4K/Premium6K (2026-11-20)

Complementa SPEC_ADAPTADOR.md, BASELINE.md, ADAPTADOR.md y EVIDENCIA.md con lo que **yo** medí,
más el parche de guarda que hizo falta para que la herramienta acepte la lista del propietario.

## 1 · La skill, tal como venía, rechazaba la lista del propietario

```
python .agents/skills/ape-iptv-auditoria-4k-premium6k/scripts/ejecutar_seguro.py \
  "APE_4K_PREMIUM_6K_METADATA.m3u8" --audit-json … --inventory-jsonl …
→ error: Formato hls_media_or_segment_playlist: usar auditor HLS/segmentos, no el parche de catálogo IPTV.
   exit 2 · 8,2 s
```

Contadores medidos sobre el fichero (754.247.241 B), con el mismo bucle del clasificador:

| Señal | Medición |
|---|---|
| `#EXT-X-TARGETDURATION:` | **1** (`:2`, línea 59) |
| `#EXT-X-PART-INF:` | **1** (`PART-TARGET=1.0`, línea 60) |
| `#EXTINF:` con duración positiva y sin atributos | **0** |
| `#EXTINF:-1` con atributos | **11.222** |
| URLs `/pulse/` | **11.222** |
| `#EXT-X-APE-CHANNELS:` | **1** (`11222`) |

Es un **catálogo** con dos líneas de boilerplate HLS en la cabecera. La guarda de entrada las tomaba
como prueba de media playlist. Antes de este parche: `media=2 strong=1 seg=0`.

> Corrección de un error mío: primero conté con `findstr /C:"#EXT-X-PART:"` y no cubrí
> `#EXT-X-PART-INF:`; por eso concluí «solo TARGETDURATION». La medición con el bucle real del
> clasificador mostró las dos líneas.

### Parche (`scripts/ejecutar_seguro.py`)

- Etiquetas **fuertes** (solo existen en media playlists reales): `#EXT-X-MEDIA-SEQUENCE:`,
  `#EXT-X-MAP:`, `#EXT-X-BYTERANGE:`, `#EXT-X-PART:`, `#EXT-X-PRELOAD-HINT:`,
  `#EXT-X-I-FRAMES-ONLY`.
- Etiquetas **débiles** (`TARGETDURATION`, `PART-INF`): son declaraciones sin URI; no deciden solas.
- **Firma de catálogo**: `entries >= 100` **y** sin duración de segmento **y** (`#EXT-X-APE-CHANNELS:`
  o URLs `/pulse/`). Solo entonces se acepta con `media_override='catalog_signature'`.
- Sigue rechazando: cualquier etiqueta fuerte, cualquier `#EXTINF` con duración positiva sin
  atributos, y cualquier fichero sin firma de catálogo.

Tras el parche: `kind='iptv_catalog'`, `catalog_signature=True`, `media_override='catalog_signature'`.

## 2 · Auditoría real de la lista (ejecutada, no referenciada)

```
Formato detectado: iptv_catalog
{"canales": 11222,
 "perfiles_presentes": {"P3": 3534, "P4": 7645, "P1": 43},
 "rea_sin_objetivo": 0,
 "qoe_perfil_distinto": 11222,
 "salida": null,
 "estado": "metadata_only_not_deployed"}
exit 0 · 124,5 s · auditoria.json 41.764 B · inventario.jsonl 3.244.962 B
```

Lectura honesta:

- **11.222 canales** censados (3.534 + 7.645 + 43 = 11.222, cuadra).
- `qoe_perfil_distinto = 11222`: **el 100 %** de los canales tiene perfil QoE distinto del visual.
  Confirma en el censo completo lo que el prompt solo había visto en una muestra. No se toca: la
  semántica de `QoE.p` es de su dueño.
- `rea_sin_objetivo = 0`: ningún bloque REA quedó sin objetivo declarado.
- `salida: null` y `estado: metadata_only_not_deployed`: la corrida fue **auditoría**, sin generar
  lista nueva. No se inventó despliegue.

## 3 · Lo que verifiqué yo (no lo que me contaron)

| Medición | Resultado |
|---|---|
| `git diff` de los 4 ficheros críticos | **INTACTOS** (index-v4.html, ape-profiles-config, m3u8-typed-arrays-ultimate, profile-manager-v9) |
| `node frontend/tests/ape-4k6k-audit-adapter.test.js` | **PASS 177 · FAIL 0** · exit 0 |
| `python -m unittest discover …` | **16/17** · exit 1 · única falla: `st_mode 0o666 != 0o600` (NTFS no soporta 0600). Sin fallas nuevas tras el parche |
| `check_anti_degradation_policy.js` | 8/8 · exit 0 |
| `check_crystal_4k_law.js` | 5/5 · exit 0 |
| `check_crystal_6k_law.js` | 6/6 · exit 0 |
| `check_app_continuity_wiring.js` | 8/8 · exit 0 |
| `gate_no_focus_steal.sh` | VERDICT=PASS pass=8 fail=0 · exit 0 |
| `gate_ape_crystal_flow.sh --json` | FAIL 5/2 — **idéntico en un worktree limpio de HEAD** ⇒ preexistente, ajeno al código |
| `ape-device-health.sh` | exit 1 · `no hay device en 192.168.1.3:5555` ⇒ **NO COMPUTADO** |

Sondas del gate, medidas aparte: `/var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8` **no existe**
(ni en `lists/` ni en `pulse/`) ⇒ el `http=404` es del objetivo, no del gate. `pulse-canal` responde
451/502 desde el VPS en ese momento.

### Adaptador, medido con `window === globalThis` (como en el navegador)

```
flag_default=false            OFF_igual=true
flag_on=true                  ANADIDAS=["APE-AUDIT-ORIGINAL"]  ELIMINADAS=[]
url_intacta=true              extra_intacto=true            idempotente=true
rea: preservadas schema/status/execution/keepMe · nuevas 9 · cambiadas 2 (archivadas)
policyId: "rea-adaptive-v1" → "ape-4k-premium6k-intent/1"
targetResolution: null → "3840x2160"   (con executed:false, nativeResolutionClaim:false,
                                        sourceTruthUnchanged:true, premiumKind:"simulated_spatial_upscale")
overlay: 12 perfiles P0..P5 + P0.5..P5.5
```

Juicio declarado: `targetResolution` y `policyId` **cambian** dentro de `rea`. Se acepta porque el
valor previo queda archivado en `APE-AUDIT-ORIGINAL` (recuperable byte a byte) y el bloque nuevo
declara `executed:false`. Si el propietario prefiere una dimensión aparte en vez de sobrescribir,
es un cambio de una línea en `enrich()`.

## 4 · Registro e índice

`.agents/skills_index.json`: **307 → 308** entradas, exactamente
`ape-iptv-auditoria-4k-premium6k` añadida, **0 eliminadas**, 308 nombres únicos.
Skill instalada con 8 ficheros; se borró el `__pycache__` generado (no se versiona).

## 5 · Rollback

1. `git revert a79e1377` (integración) y `git revert <este commit>` (parche de guarda).
2. O borrar: adaptador, test, `.agents/skills/ape-iptv-auditoria-4k-premium6k/` y su entrada del índice.
3. El flag `window.APE_4K6K_AUDIT` es `0` por defecto y el adaptador **no está cargado** en
   `index-v4.html`: con el rollback o sin él, el comportamiento previo es el mismo.

## 6 · Estado por capa

| Capa | Estado |
|---|---|
| Repo (código nuevo + índice + skill) | **commiteado local**, no empujado |
| Generadores | intactos (diff vacío en los 4 críticos) |
| App/UI | adaptador disponible por `window.APE_4K6K`, **no cargado**, flag apagado |
| Auditor (Python) | **ejecutado de verdad** sobre la lista de 754 MB |
| VPS | **NO TOCADO** |
| Agente / shim / APK | **NO COMPUTADO** (sin device; fuera de alcance autorizado) |
| Producción | **no activado**, no publicado |

## 7 · Salida enriquecida en staging (probada sobre 754 MB)

```
python ejecutar_seguro.py APE_4K_PREMIUM_6K_METADATA.m3u8 \
  --output %TEMP%\ape-staging-4k6k\APE_LISTA_ENRIQUECIDA_4K6K.m3u8 …
Formato detectado: iptv_catalog · canales 11222 · P3 3534 / P4 7645 / P1 43
rea_sin_objetivo 0 · qoe_perfil_distinto 11222 · estado metadata_only_not_deployed
exit 0 · 381,9 s · salida 754.247.241 B
```

La salida tiene **el mismo sha256 que la entrada** (`001713fcf1f9…`), y eso no es una copia:
la entrada **ya venía enriquecida** por una corrida anterior de esta misma habilidad —
`APE-AUDIT-ORIGINAL` 56.110 (= 5 por canal), `ape-4k-premium6k-intent` 11.222,
`standard_4k` 22.444, `premium_6k_simulated` 11.222, idénticos en entrada y salida.

Léase como lo que es: **la prueba de idempotencia sobre 754.247.241 B**, no sobre un fixture.

## 8 · Restauración: verificada pero NO exacta, y ahora se dice por qué

`verificar_lista.py` **abortaba** con `AssertionError: No se recupera el texto original exacto`.
Causa medida: **0 de 56.110** archivos `APE-AUDIT-ORIGINAL` llevan el campo `eol` — es el formato
de la revisión anterior (ver SPEC_ADAPTADOR §divergencia de revisiones). En un fichero CRLF el
texto original no es recuperable byte a byte.

Parche: en vez de reventar, clasifica. Veredicto actual:

```json
{"all_channels_checked": 11222, "idempotent_all_blocks": true,
 "exact_original_text_recoverable": false,
 "audit_original_entries": 56110, "audit_original_sin_eol": 56110,
 "uri_sequence_unchanged": true, "reason": "archivos APE-AUDIT-ORIGINAL sin campo \"eol\" …"}
exit 3  (VERDICT=NO_EXACTO)
```

Exit 3 ≠ PASS y ≠ fallo: «verificado en todo menos la exactitud del texto, con motivo y números».
La secuencia de URIs sí queda intacta.

## 9 · QoE: qué existe de verdad en el VPS (solo lectura)

| Componente | Medición |
|---|---|
| `/var/www/html/prisma/api/qoe-controller.php` | **PRESENTE** · 10.189 B · «heurístico por defecto + override del LLM validado», rangos aplicados en servidor, sin SQLite/shm (`X-APE-Qoe: controller`) |
| `/opt/ape-pulse/qoe_probe.lua` | **AUSENTE** — la captura Lua del plan no está desplegada |
| `/var/www/html/prisma/conviva.db` | **AUSENTE** en esa ruta · `sqlite3` no instalado |
| `prisma/state/qoe_emit_stats.json` | **{ok:1167, fail_timeout:5, fail_http:0, fail_nodata:0, retried:75, last_ms:1, max_ms:802, total_ms:49944}** |
| derivado | 1.167 emisiones OK · 0 fallos HTTP · 0 sin dato · 5 timeouts · media 42,8 ms/emisión |

Conclusión §10: **la autoridad de knobs está implementada**; el **probe/sink no está desplegado** y
**no hay recibo del consumidor**. El bucle QoE **no se declara cerrado**. No se tocó nada.

## 10 · Upscale-A-Video: evaluación acotada, no adoptada

- Licencia leída en el sha: **S-Lab License 1.0**, «use for non-commercial purpose», uso comercial
  exige contactar al autor. GitHub la clasifica `NOASSERTION`.
- Requisitos del propio repo: `gpu: true`, `to("cuda:0")`, torch 2.0.1 + xformers + diffusers, tiles
  256/overlap 64, 4×, DDIM 30 pasos, LLaVA 13B opcional; entrada y salida **archivos de vídeo**.
- Host medido: VPS **3 vCPU / 3.819 MB / sin GPU**; estación local **Intel UHD integrada, sin CUDA**.
- `rea_adopt sczhou/Upscale-A-Video@10ca1d75…` → **BLOQUEADO** · `modo_permitido: solo_vectores_numericos`
  · tier 3 · requiere `CONFIRMED: allowlist amendment sczhou/Upscale-A-Video` firmada por el operador.

Veredicto: **no viable en vivo y no adoptable** con esta licencia/host. No se instaló nada, no se
descargaron pesos, no se consumieron recursos pagos. No se declara Premium 6K ejecutado.

## 11 · Cierre de pruebas (mi medición, tras todos los parches)

| Prueba | Resultado |
|---|---|
| suite node del adaptador | PASS 177 · FAIL 0 · exit 0 |
| suite python de la skill | 17 ejecutadas, **1 falla** — la misma de siempre (`st_mode 0o666 != 0o600`, NTFS); sin fallas nuevas |
| `verificar_lista.py` | exit **3** · idempotente en todos los bloques · restauración no exacta con motivo |
| `check_anti_degradation` / `crystal_4k` / `crystal_6k` / `app_continuity` | 8/8 · 5/5 · 6/6 · 8/8 |
| `gate_no_focus_steal.sh` | PASS 8/0 |
| `gate_ape_crystal_flow.sh` | FAIL 5/2 **idéntico en HEAD limpio** (sondas al VPS) |
| `ape-device-health.sh` | NO COMPUTADO · sin device |
