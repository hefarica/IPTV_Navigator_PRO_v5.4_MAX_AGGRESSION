# Tabla de decisión de perfil: firma, clave, regla y política sin entrada

**Contrato:** `contracts/realtime_profile_table_v1.json` — `ape.realtime.profile_table.v1`, JSON Schema draft 2020-12, ver **1**.
**Fecha:** 2026-11-15.
**Objetivo:** que decidir el perfil de un canal sea un **lookup** (leer una fila) y no una **medición** (1.653 ms p50 por canal, t75).

---

## 0. Qué se decide y por qué lookup

Medir cuesta **1.653 ms de p50** por canal — 330,6× el presupuesto de 5 ms (t75). Decidir, en cambio, cabe: **p50 0,97–1,76 ms · p99 2,79–4,46 ms** medidos en este host (t74).

La conclusión de diseño es una sola línea: **medir una vez, fuera del camino; decidir siempre, leyendo la tabla**. El probe sigue existiendo — pero en segundo plano, y su resultado *es* la fila.

Hoy ocurre lo contrario por partida doble:

- El clasificador (`IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js`) exige `probe.verified === true` (L382) y **nunca lo recibe**: la rama verificada (L390) no se ejecuta jamás y todo cae a heurísticas de nombre con `confidence: 'low'` (L485).
- Para colmo, el motor relee y parsea el mapa de 21.224 canales **en cada petición** (`server.js:4727-4730`, llamado desde `9461` por segmento): p50 **53,3–70,5 ms**, p99 **89,9–241,4 ms**; prueba A/B en el mismo proceso, **77×–105×** (t74).

**La tabla no sustituye la escalera: la alimenta.** Meter la fila en `probe` con `verified: true` despierta la rama que ya existe, así que el suelo anti-degradación (`enforceResolutionFloor`, L279) y el fallback (`resolveFallback`, L304) siguen funcionando sin tocar una línea del clasificador.

---

## 1. La firma del canal

### 1.1 Lo que se midió

Censo en streaming sobre la lista de evidencia completa (`ara-x/evidence/APE_LISTA_4K_ARA-X_once.m3u8`, 572.171.381 B, sha256 `c8b5039e…0d1ea07`):

| Campo | Medido | Comentario |
|---|---|---|
| Canales | **10.631** | la lista *servida* de t52 tiene 21.224: son listas distintas |
| `tvg-id` presente | **10.631 (100 %)** | |
| `tvg-id` distintos | **10.631** | |
| `tvg-id` duplicados | **0** | clave limpia, de momento |
| `ape-profile` presente | **10.631 (100 %)** | P4 7.523 · P3 2.300 · P1 808 · **P0 0 · P2 0** |
| Hosts distintos en la URL | **1** | `iptv-ape.duckdns.org` (el proxy) |
| Familias de path | **75** | el proveedor real vive **dentro** del path: `cdn/line.tivi-ott.net/live/<user>/<pass>/<id>` |

### 1.2 La clave

```
clave = "tvg:" + tvg_id_normalizado            (cuando hay tvg-id: 100 % medido)
clave = "prov:" + provider_host + "/" + slug   (fallback, cuando no hay)
```

Normalización: `trim`, minúsculas, sin query, sin credenciales.

### 1.3 Por qué estos campos son estables (y no inventados)

- **`tvg-id` es el identificador del canal en el EPG**, no su nombre: sobrevive a que el operador renombre el canal, y el censo lo da al **100 % con 0 duplicados**.
- **`provider_host` + familia de path** identifican *de dónde sale la señal*. Cuando el canal cambia de proveedor, la señal cambia de verdad y la entrada vieja debe invalidarse — que es justo lo que queremos.
- El host del proxy **no** sirve: los 10.631 canales comparten uno solo (`iptv-ape.duckdns.org`). Distingue cero.

### 1.4 Lo que queda FUERA de la clave, y por qué

| Campo | Por qué no |
|---|---|
| Nombre del canal | Renombres del operador: la misma señal con otro nombre es la misma señal. |
| `group-title` | Recategorización. Se guarda como **contexto/desempate**, nunca como clave. |
| `tvg-logo` | URL que cambia por temporadas; no dice nada de la señal. |
| **Usuario y contraseña del path** (`3JHFTC/U56BDP`) | **Secreto y rotativo.** Entran enmascarados (`<u>/<p>`): así la clave no filtra credenciales y sobrevive a una rotación. |
| Query y tokens | Cambian por sesión. |
| Orden de la lista, mtime | Cambian en cada generación. |
| `X-Request-Id`, `X-Session-Id`, `X-Client-Timestamp` | Identidad por petición: harían una fila por visita. |
| **`ape-profile`** | Es la **salida** que queremos decidir. Usarlo como clave sería circular: se guarda como *incumbente* para la regla anti-degradación (paso 7), no como firma. |

---

## 2. La tabla

Una fila por firma. Campos, en el contrato §`$defs/entrada`:

| Campo | Tipo | Para qué |
|---|---|---|
| `clave` | string | el lookup. `^[a-z0-9][a-z0-9:_.@-]{2,159}$` |
| `valor` | objeto | `width`, `height`, `fps`, `hdr`, `codec`, `bitrate` — lo que se midió |
| `procedencia` | enum | `probe` · `classifier` · `operator` · `declared` |
| `confianza` | 0–100 | **≥60 = entra como medida**; <60 = contexto |
| `ts` | date-time | cuándo se produjo el valor |
| `ver_contrato` | const 1 | versión del contrato |
| `invalidacion` | objeto | `ttl_s`, `invalidado_por[]`, `expira_en` |

**TTL por procedencia** (propuesta, en el contrato): `probe` 24 h · `classifier` 6 h · `declared` 1 h · `operator` sin TTL (lo cambia el operador).

**Invalidación** (`invalidado_por`): `cambio_de_url`, `cambio_de_host`, `probe_contradice`, `operador`, `version_de_contrato`, `ttl`. Si el probe contradice a la tabla, gana el probe y la fila se reescribe — la medición nueva siempre manda.

### 2.1 Dónde vive (no es un detalle)

| Almacén | Coste medido (t74) |
|---|---|
| **APCu** | **0,000 ms** |
| **SQLite** | **0,0029 ms** |
| `json_decode` del índice por petición | **4,041 ms p50 / 6,606 ms p99** = 80,8 % del presupuesto del VPS |

El contrato lo deja escrito como prohibición: **nunca `json_decode` del índice en el camino**, nunca releer y parsear el mapa por petición. APCu o SQLite, y punto.

---

## 3. La regla de decisión, línea a línea

```
D(firma, previo):
 1  k ← clave(firma)                              # tvg:<id> o prov:<host>/<slug>
 2  e ← tabla[k]
 3  si e existe y e.confianza ≥ 60 y no caducada:
 4      probe ← {w:e.w, h:e.h, f:e.f, hdr:e.hdr, codec:e.codec, bitrate:e.bitrate,
 5               verified:true}                    # despierta la rama L390 del clasificador
 6      d ← profileForMeasured(probe)              # escalera L250-273, la del repo
 7      d ← enforceResolutionFloor(d, e.h)         # R4, L279: nunca por debajo de la altura medida
 8      si previo existe y rango(d) < rango(previo): d ← previo   # anti-degradación
 9      devolver {perfil:d, origen:"tabla", resuelto:true, confianza:e.confianza}
10  si no:
11      d ← max(P3, previo)                        # defecto declarado, NUNCA por debajo de lo servido
12      devolver {perfil:d, origen:"defecto", resuelto:false, marcador:"UNRESOLVED", confianza:0}
13      encolar probe(firma) en segundo plano      # fuera del camino caliente
```

Cada paso, con su razón:

| Línea | Razón |
|---|---|
| 1 | La clave es un hash determinista de campos estables (§1.3): la misma firma siempre da la misma clave. |
| 2 | **Un solo acceso** al almacén. Aquí se juega el presupuesto: APCu 0,000 ms o SQLite 0,0029 ms. |
| 3 | El umbral 60 no es inventado: es el que ya usa el repo para `ape-classify-confidence` (hoy solo lo supera el 44,1 %). |
| 6 | La escalera **no se reimplementa**: se llama a la del clasificador (L250-273), que es la que ya está probada. |
| 7 | Si la tabla dijera P4 con altura 2160, R4 lo sube: un perfil cuyo cap queda por debajo de la altura medida es degradación. |
| 8 | **Anti-degradación**: la tabla puede subir el perfil, nunca bajarlo respecto a lo que ya se sirve. |
| 11 | El defecto es un **suelo**, no un reemplazo: `max(P3, previo)` evita que un canal que iba en P1 caiga a P3 por no tener fila. |
| 13 | El probe se encola y se ejecuta fuera: cuesta 1.653 ms, así que no puede estar en el camino. |

### 3.1 La escalera, citada (no redefinida)

De `ape-profile-classifier.js:250-273`:

| Condición | Perfil |
|---|---|
| `h ≥ 4320` | P0 |
| `h ≥ 3240` | P0 (guarda de techo 6K) |
| `h ≥ 2160` y (`hdr ≠ sdr` **o** `fps ≥ 50`) | P1 |
| `h ≥ 2160` y no lo anterior | P2 |
| `h ≥ 1080` | P3 |
| `h ≥ 720` | P4 |
| resto | P5 |

**Matiz medido que la paraphrase suele perder:** `fps` desconocido (`null`) **no** cuenta como ≥50 (L266: `f !== null && f >= 50`). Un 4K sin fps cae en **P2**, no en P1.

**P0 y P2 están vacíos en la práctica** — en la lista de evidencia: P4 7.523 · P3 2.300 · P1 808 · P0 0 · P2 0; en la servida de t52: P1 933 + P3 20.222 + P4 58 + P5 11 = 21.224, con P0 y P2 a cero. Las ramas existen y se quedan: el día que aparezca un 8K real, la regla ya lo sabe clasificar.

---

## 4. Sin entrada en la tabla: **fail-open con default declarado**

### 4.1 La decisión

`perfil = max(P3, previo)`, `origen = "defecto"`, `resuelto = false`, `marcador = "UNRESOLVED"`, `confianza = 0`, y el probe se encola.

### 4.2 El coste de cada opción

| | Fail-closed | **Fail-open (elegido)** |
|---|---|---|
| Qué pasa el día 1 (tabla vacía) | **ningún canal tiene perfil** | todos se sirven con P3 (o mejor, si ya iban mejor) |
| Canales afectados | **21.224** de la lista servida / **10.631** de la de evidencia = el 100 % | el 100 %, pero **reproducen** |
| Coste para el operador | pierde el catálogo entero hasta que el probe corra 21.224 × 1,653 s ≈ **9,7 h** de barrido | un canal puede ir a FHD cuando podría ir a 4K, **declarado** con `UNRESOLVED` |
| Choca con la ley del repo | **sí**: `COVERAGE ALWAYS / NO CHANNEL LOSS` | no |
| Riesgo de mentira | ninguno (no sirve nada) | bajo y **declarado**: P3 es un perfil real, no una invención |

El cálculo del barrido es el argumento decisivo: fail-closed significa **9,7 horas sin servicio** (21.224 canales × 1,653 s), y ni siquiera en régimen normal se puede exigir el 100 % de cobertura: **solo el 44,1 % de los canales supera confianza 60** y no existe ni un marcador de verdad (`ape-source-truth`, `ape-probe`, `STREAM-TRUTH`: cero). Fail-closed mataría más de la mitad del catálogo para siempre, no por 9,7 h.

### 4.3 La honestidad no se negocia

Fail-open **no** es «inventarse un perfil»: el marcador `UNRESOLVED` viaja en cada respuesta, `resuelto: false`, `confianza: 0`, y la fila se crea en cuanto el probe termina. El operador ve qué está decidido por medida y qué está decidido por defecto.

---

## 5. Cómo se comprueba que decide en <5 ms

**Percentil de aceptación: p99**, no p50. El p50 ya se cumple de sobra (0,97–1,76 ms); lo que el operador *siente* es la cola: un zape de cada cien.

| | |
|---|---|
| Objetivo | **p99 ≤ 4,46 ms** (medido en t74) con presupuesto duro de **5 ms** |
| Muestras | **n = 10.000** decisiones sobre firmas reales de la lista |
| Instrumentación | `process.hrtime.bigint()` alrededor de `D(firma, previo)` |
| Se reporta | p50 · p95 · **p99** · max |
| Gate 1 | `p99 ≤ 5 ms` |
| Gate 2 | el camino **no contiene** `json_decode` ni relectura del mapa (grep del código del endpoint) |
| Gate 3 | el almacén es APCu o SQLite (0,000 / 0,0029 ms), nunca el índice por petición (4,041 ms) |
| Qué NO se mide aquí | el `max-age` del motor y el ciclo de recarga del player: eso es entrega, no decisión |

Por qué estos números: con el antipatrón actual (`loadMap()` por petición) el p50 ya es **53,3–70,5 ms** y el p99 **89,9–241,4 ms** — 10–48× por encima del presupuesto. Con la tabla, el coste del lookup desaparece del ruido (0,000–0,0029 ms) y lo que queda es el clasificador en memoria, que ya está medido por debajo de 5 ms en p99.

---

## 6. Casos resueltos

| Caso | Firma | Tabla | Previo | Salida | Por qué |
|---|---|---|---|---|---|
| A | `tvg:es_c01` | h=2160, hdr=hdr10, fps=50, conf 90 | P1 | **P1** · origen `tabla` · resuelto | rama P1 de la escalera, y no baja: igual al previo |
| B | `tvg:es_c02` | — (sin fila) | P1 | **P1** · origen `defecto` · `UNRESOLVED` | `max(P3, previo=P1) = P1`: el defecto es suelo, no reemplazo |
| C | `prov:line.tivi-ott.net/live/<id>` | — (sin fila) | — | **P3** · origen `defecto` · `UNRESOLVED` | sin fila y sin incumbente: P3 declarado y probe en cola |

Y un cuarto que demuestra que la escalera sigue viva: fila con `h=2160, hdr=sdr, fps=null` → **P2** (no P1), porque `fps` desconocido no cuenta como ≥50.

---

## 7. Lo que este contrato NO computa

- **Unicidad de `tvg-id` en la lista servida** (21.224): medida solo en la de evidencia (10.631, 0 duplicados). Si hubiera duplicados, la clave compuesta `tvg:…@host` los separa, pero no está medido.
- **Tasa de acierto de la tabla**: no hay tabla poblada todavía; el contrato la describe, no la llena.
- **Ciclo de recarga del player**: cada cuánto vuelve a pedir el manifest. Método: contar peticiones al mismo `tvg-id` por minuto en el log del motor.
- **Que el APK lea la tabla**: hoy lee `ape-profile="Px"` (`ListLoader.kt:90`), `#EXT-X-APE-LAB-METADATA` (L59-81) y `fields.<seccion>.<clave>` (`LabMetadataStore.kt:26-66`). La tabla es del lado VPS; para el APK habría que publicar el resultado en esos tres canales.
- **Latencia del almacén en el VPS**: APCu 0,000 ms y SQLite 0,0029 ms son de t74, no re-medidos aquí.

---

## 8. Repro

```bash
# censo de la firma (una pasada en streaming sobre 572 MB)
node <firma_census.js>            # -> channels 10631 · withTvgId 10631 · distinctTvgId 10631 · duplicateTvgIds 0

# la escalera que la tabla NO redefine
sed -n '250,273p' IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js

# validación del contrato
python3 -c "import json;d=json.load(open('contracts/realtime_profile_table_v1.json'));print(d['\$id'],len(d['\$defs']))"

# el gate del presupuesto (cuando exista endpoint): p99 <= 5 ms
```

### Huellas

| Artefacto | Bytes | sha256 |
|---|---|---|
| `contracts/realtime_profile_table_v1.json` | 10.399 | `4661ab773d10e0f573567897e053fdb94b6e0dc9b3ced36da07797569838a2ab` |
| `ara-x/evidence/APE_LISTA_4K_ARA-X_once.m3u8` | 572.171.381 | `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07` |
| `IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js` | 32.630 | `69969fa450ff7779009d20576fc66b4bb18f5da013d12b33146fd190353c38f8` |

### Ámbito respetado

Sólo se escribieron `contracts/realtime_profile_table_v1.json` y `docs/audits/DECISION_TABLE_20261115.md`. **No** se tocaron las listas servidas, ni el VPS, ni el clasificador, ni el generador.
