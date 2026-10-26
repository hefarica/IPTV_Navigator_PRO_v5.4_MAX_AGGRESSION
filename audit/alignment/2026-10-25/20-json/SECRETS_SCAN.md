# SECRETS_SCAN — Credenciales, URLs firmadas y superficies de riesgo en los JSON del SSOT

**Tarea:** t5 / T4 · **Auditor:** `json-ssot` · **Política de reporte:** se documenta **clave + ruta + longitud/tipo**.
**Ningún valor secreto se transcribe en este informe.** Los valores vistos durante la auditoría no se reproducen.

---

## 1. Método

Tres pasadas independientes, todas de sólo lectura:

| Pasada | Herramienta | Qué detecta |
|---|---|---|
| A | `tools/secret_scan.mjs` (`JSON.parse` + walk con tope de profundidad 14) | nombres de clave sensibles, `scheme://user:pass@`, parámetros de URL firmada (`token, expires, signature, sig, hdnts, hmac, auth_key, st, e, X-Amz-Signature, Policy, Key-Pair-Id`), JWT (`eyJ…`), `Bearer …`, hex de ≥32 chars |
| B | `tools/sensitive_fields.mjs` (streaming por chunks de 8 MB sobre los 73 MB) | tipo + longitud + vacío/no-vacío de `username, password, server, url_m3u8, url_ts, cookie, referer, origin, x_forwarded_for, custom_header_1..3, drm_server_url, token_auth_enabled` **sin imprimir valores** |
| C | `tools/toxic_scan.mjs` + `tools/locate_vps_refs.mjs` | headers tóxicos EXTHTTP y Referer/Origin apuntando al VPS propio |

**Artefactos cubiertos:** A1 `frontend/lab_master_22.6.0.json` · A2
`backend/APE_ALL_PROFILES_v10_REALTIME_ENGINE.json` · A3 `frontend/js/ape-v9/APE_ALL_PROFILES_OPTIMIZED.json` ·
A4 `vps/ape-uhdx/visual_profiles.json` · C1/C2/C3 `channels_map.json` · B2 baseline doctrinal
(`…MEMC-TOTAL-8K120.json`).

---

## 2. Secretos encontrados (en claro, dentro de archivos del repo y de los baselines)

### 2.1 `servers[]` de A1 — 4 credenciales de proveedor en texto plano · **CRITICAL (contenido) / MEDIUM (exposición)**

| Ruta exacta | Tipo de valor | Longitud | Estado |
|---|---|---|---|
| `servers[0].username` / `servers[0].password` | string | 6 / 6 | **no vacío** |
| `servers[1].username` / `servers[1].password` | string | 12 / 10 | **no vacío** |
| `servers[2].username` / `servers[2].password` | string | 8 / 8 | **no vacío** |
| `servers[3].username` / `servers[3].password` | string | 7 / 7 | **no vacío** |

`servers[i].base_url` (hosts, no secretos): `line.tivi-ott.net`, `cf.business-cloud-8k.ru`,
`nfqdeuxu.x1megaott.online`, `tivigo.cc` — con `servers[i].note` =
`"TIVIVISION (from frontend)"`, `"MAMAIPTV (from frontend)"`, `"MegaOTT (from frontend)"`,
`"TiVistation (from frontend)"`.

**Confirmación bruta:** `"password"\s*:` aparece **4 veces** y `"username"\s*:` **4 veces** en el archivo
(`raw_counts` de `secrets_scan.json`). **No hay otras credenciales en A1.**

### 2.2 `channels_map.json` (C1) — credenciales por canal, 9.293 pares · **CRITICAL (contenido)**

| Ruta | Presente | No vacío | Forma observada (sin valor) |
|---|---:|---:|---|
| `[*].username` | 9.293 | **9.293** | `text(10)` × 6.323 · `text(6)` × 2.970 |
| `[*].password` | 9.293 | **9.293** | `text(12)` × 3.795 · `text(10)` × 2.528 · `text(6)` × 2.970 |
| `[*].server` | 9.293 | 9.293 | `url(scheme)` → 3 hosts: `126958958431.4k-26com.com:80` · `line.tivi-ott.net` · `line.dndnscloud.ru` |
| `[*].url_m3u8` | 9.293 | 9.293 | `url(scheme)` con **credenciales embebidas en el path** |
| `[*].url_ts` | 9.293 | 9.293 | idem |

**Patrón de exposición (estructural, no accidental):** la plantilla declarada por el propio SSOT en
`lab_master…nivel3_per_layer.URL[0].value` = `"{server_url}/live/{user}/{pass}/{stream_id}.m3u8"` — es decir,
**usuario y contraseña forman parte de la ruta de la URL**, así que **cada una de las 18.586 URLs de C1
(`url_m3u8` + `url_ts`) contiene las credenciales en claro**. Cualquier log de acceso, cualquier lista emitida
con URL directa (doctrina SHIELDED) y cualquier dump de `channels_map.json` expone el par completo.

- Los **3 hosts de C1** y los **4 `base_url` de A1** **no coinciden** (sólo `line.tivi-ott.net` está en ambos).
  Es decir, el SSOT tiene **dos conjuntos disjuntos de credenciales**: 4 proveedores en `servers[]` de A1 y
  3 proveedores en C1 (2 de ellos ausentes de A1). Esto es drift de credenciales, además de exposición.
- C2 y C3 **no contienen credenciales** (0 campos `username`/`password`/`server`/`url_*`).

### 2.3 Negativos verificados (lo que NO hay) — tan importante como lo que sí

| Patrón buscado | A1 | A2 | A3 | A4 | C1 | C2/C3 |
|---|---|---|---|---|---|---|
| URLs firmadas (`?token=`, `?expires=`, `?signature=`, `hdnts=`, `X-Amz-Signature=`, `Policy=`, `Key-Pair-Id=`) | **0** | 0 | 0 | 0 | **0** | 0 |
| JWT en claro (`eyJ…`) | **0** | 0 | 0 | 0 | 0 | 0 |
| `Bearer <token>` | **0** | 0 | 0 | 0 | 0 | 0 |
| `scheme://user:pass@host` (userinfo en URL) | **0** | 0 | 0 | 0 | 0 | 0 |
| `Authorization` / `api_key` / `secret` / `private_key` | **0** | 0 | 0 | 0 | 0 | 0 |
| `Cookie` con valor | 0 | 0 | 0 | 0 | **0** (9.293 vacíos) | 0 |
| `x_forwarded_for` con valor | — | — | — | — | **0** (9.293 vacíos) | — |
| `custom_header_1..3` con valor | — | — | — | — | **0** (9.293 × 3 vacíos) | — |
| `drm_server_url` con valor | — | — | — | — | **0** (9.293 vacíos, `drm_type` = `text(4)` en todos) | — |
| `token_auth_enabled` | — | — | — | — | **boolean** en 9.293 (no hay token que rotar) | — |

**Interpretación honesta:** en estos JSON **no hay URLs firmadas, ni JWT, ni Bearer, ni cookies con valor**.
El riesgo real no es un token: son **contraseñas de proveedor en texto plano** (§2.1, §2.2).

### 2.4 Falsos positivos a desactivar (para que nadie los cuente como secreto)

- `nivel3_per_layer.VLC[*].key` / `KOD[*].key` / `HTT[*].key` … → **109 coincidencias** del escáner por la palabra
  `key`, pero son **nombres de directiva** (`http-user-agent`, `inputstream.adaptive.manifest_type`, …), no claves.
- `config_global.Frontend_Profiles_Hash = "sha256:9ffec0b5…"` → es un **hash declarado**, no una clave. Además
  **no declara de qué archivo es** → no reproducible (`UNKNOWN` razonado).
- `config_global.JWT_Default_Key_ID = "jwt_v1"` → identificador de clave, no la clave.
- `inputstream.adaptive.stream_headers = "[ENCODED_HEADERS]"` (kodiprop) → **placeholder**, no valor.

---

## 3. Superficie de riesgo (no son secretos, pero rompen reproducción/seguridad)

### 3.1 Propio dominio del VPS usado como `Referer`/`Origin` — **trampa EXTHTTP #14 (SPOF)**

| Archivo | Rutas afectadas | Total |
|---|---|---:|
| **A1** `lab_master_22.6.0.json` | `profiles_calibrated.P0..P5.headerOverrides.Referer` **y** `.Origin` → `https://iptv-ape.duckdns.org/…` | **12** |
| **A3** `APE_ALL_PROFILES_OPTIMIZED.json` | `profiles.P0..P5.headerOverrides.Referer/Origin` **y** `profiles.P0..P5.headers.Referer/Origin` | **24** |
| A1 (otro nodo) | `omega_gap_plan.items[].detail` menciona el dominio (texto, no header) | 1 |
| **C1** `channels_map.json` | `[*].origin` = host **del proveedor** (no del VPS): `126958958431.4k-26com.com` 2.528 · `line.tivi-ott.net` 2.970 · `line.dndnscloud.ru` 3.795 | **0 riesgos** (REFUTA la sospecha: el mapa NO filtra el VPS) |

Riesgo doctrinal: un bloqueo del CDN del proveedor contra `iptv-ape.duckdns.org` **mata los 9.293 canales a la
vez**, y el dominio propio es una huella de generador (contradice el pool rotativo de 20 dominios neutros).

### 3.1.b Exposición real en git (F-13 del capitán) — medido, no asumido

| Archivo | ¿Trackeado por git? | Evidencia | Contenido sensible |
|---|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json` | **NO** | `.gitignore` línea **149** lo excluye explícitamente; `git ls-files --error-unmatch` → *"did not match any file(s) known to git"* | 4 pares `servers[].username/password` |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json` | **SÍ** | `git ls-files --error-unmatch` → OK; `git log --oneline` sobre la ruta devuelve **3 commits**: `e425b3c` (initial), `a10edeb`, `0b9c111` | **9.293 pares `[*].username`/`[*].password`** + **18.586 URLs** (`url_m3u8`, `url_ts`) con usuario y contraseña en el path |
| `…/backend/channels_map.json`, `…/backend/APE_ALL_PROFILES_v10_REALTIME_ENGINE.json`, `…/frontend/js/ape-v9/APE_ALL_PROFILES_OPTIMIZED.json` | SÍ | `git ls-files` OK | **ninguno** contiene credenciales (0 campos `username`/`password`) |

**Conclusión F-13:** el archivo que el capitán señaló (`lab_master`, 4 pares) **no está en el historial** gracias a
`.gitignore:149`; el riesgo **mayor** es `frontend/channels_map.json`, **trackeado y con 9.293 pares de
credenciales de proveedor en el historial**. Recomendación (no ejecutada, decide el capitán): mover credenciales a
config server-side con referencias (`{server.id}`), **rotar** lo ya commiteado, y `gitignore` + `git rm --cached`
para `channels_map.json` cuando se autorice. Esta auditoría **no** sanea, **no** commitea y **no** transcribe valores.

### 3.2 Headers tóxicos EXTHTTP presentes en los JSON de perfiles — **trampas #9, #10, #13**

| Archivo | Hits | Detalle por ruta |
|---|---:|---|
| **A3** `APE_ALL_PROFILES_OPTIMIZED.json` | **84** | `profiles.P0..P5.headerOverrides` **y** `.headers`: `Range`, `If-None-Match`, `If-Modified-Since`, `TE`, `Priority`, `Upgrade-Insecure-Requests`, `X-Requested-With`. Valores observados (forma): `Range: "bytes=0-,bytes=0-,bytes=0-,bytes=0-"`, `If-None-Match: "*,*,*,*"`, `TE: "trailers,chunked,compress,deflate"`, `Priority: "u=0,i,i,i"`, `Upgrade-Insecure-Requests: "1,0,0,0"` |
| **A1** `lab_master_22.6.0.json` | **6** | `profiles_calibrated.P0..P5.headerOverrides["X-Requested-With"] = "XMLHttpRequest,fetch,null,null"` (trampa #13: señal de browser en un request de player nativo). Los otros 5 headers tóxicos **no están** en A1 ✅ |
| **B2** baseline doctrinal | **6** | idéntico a A1 (el `X-Requested-With` **viene del baseline**, no lo introdujo el repo) |
| **A2** `APE_ALL_PROFILES_v10_REALTIME_ENGINE.json` | **0** | limpio ✅ |

> Nota: en A1 las 6 coincidencias de la palabra `priority` bajo
> `prisma_lab_sync_v20…components_pending.*.priority` (`"MAXIMA"`, `"URGENTE"`, …) **no son headers**: son
> metadatos de planificación. El escáner los lista y aquí se descartan explícitamente.

### 3.3 `X-HDCP-Level` / `X-APE-PLAYER-ENSLAVEMENT-*` (no secretos; sí riesgo de compatibilidad)

- `profiles_calibrated.P0..P2.headerOverrides["X-HDCP-Level"] = "TYPE-1"` · `P3..P5 = "NONE"`
  (consistente con la doctrina HDCP-adaptive, no es un secreto).
- `headerOverrides["X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC"] = "TRUE,ENABLED,ADAPTIVE,AUTO"` en los 6 perfiles
  → no es secreto, pero es la palanca que puede cruzar `hvc1`/`hev1` (GOLDEN RULE). Se reporta aquí sólo como
  superficie, con el detalle técnico en `JSON_PROFILES_MATRIX.json`.

---

## 4. Veredicto y límites

| Clase | Veredicto |
|---|---|
| Credenciales de proveedor en texto plano | **SÍ** — 4 pares en `servers[]` (A1/B1–B4) y 9.293 pares por canal en C1, más 18.586 URLs con usuario/contraseña embebidos |
| URLs firmadas / tokens en claro | **NO** — 0 en los 6 artefactos y en los baselines (verificado por 2 métodos) |
| Cookies / headers de auth con valor | **NO** — campos presentes pero 100 % vacíos en C1 |
| Propio dominio VPS en Referer/Origin | **SÍ** — 12 rutas en A1, 24 en A3 |
| Headers tóxicos EXTHTTP en perfiles | **SÍ** — 84 en A3 (6 headers × 6 perfiles × 2 contenedores), 6 en A1 (sólo `X-Requested-With`) |
| Baseline doctrinal limpio de tóxicos | **PARCIAL** — B2 arrastra los mismos 6 `X-Requested-With` que A1 |

**Límites honestos de este escaneo:**

1. **No se auditó el historial de git** (`git log -p`, objetos sueltos): un secreto puede estar ya commiteado
   aunque hoy no esté en el working tree. Queda `UNKNOWN` explícito; requiere `gitleaks`/`trufflehog` sobre `.git`
   (fuera del alcance de sólo-lectura de JSON y del lock de otros lanes).
2. **No se probaron** las credenciales contra los proveedores (prohibido: cero curl a producción).
3. **No se inspeccionaron** `vps/prisma/config/*.json` ni `.env`/`config.php` del VPS (fuera de alcance T4).
4. La longitud reportada (`text(12)`, etc.) es la **única** información de los valores que este informe expone,
   deliberadamente, para permitir correlacionar sin publicar el secreto.
