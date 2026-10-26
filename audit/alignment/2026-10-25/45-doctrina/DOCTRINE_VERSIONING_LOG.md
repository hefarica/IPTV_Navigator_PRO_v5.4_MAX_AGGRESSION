# DOCTRINE_VERSIONING_LOG — qué se versionó, con qué hashes, y qué queda pendiente del owner

**Tarea:** t18 · Versionar la doctrina (D-31)
**Ejecutor:** vps-edge
**Fecha:** 2026-10-26
**Decisiones que implementa:** `D-31` (no se edita el manifiesto global; se versiona en el repo) · `D-32` (rige la arquitectura desplegada) · `D-33` (contradicción `/shield/`: gana `CLAUDE.md`) · `D-25` (la doctrina Crystal no existe en producción)
**Prohibiciones respetadas:** no se editó el manifiesto global · **cero SSH** (el VPS no recibió ningún comando) · no se commiteó.

---

## 1. El problema que resuelve esta tarea

El manifiesto OMEGA que **gobierna** el repo **no estaba en el repo**. Vivía en `C:\Users\HFRC\.agents\skills\iptv-omega-working-flow-manifesto\SKILL.md` — fuera del árbol, sin historial de git, sin viajar con un clone.

Consecuencias reales, no teóricas:

1. **No es auditable.** `git log` no dice quién cambió qué ni cuándo. Un `git blame` sobre la doctrina es imposible.
2. **No viaja.** Cualquier agente que clone el repo (CI, otra máquina, otra sesión) **no recibe la doctrina** y trabaja sin ella o la reinventa.
3. **Divergió sin control.** Describe un VPS que no existe (D-25/D-32), y nada en el repo lo contradecía porque el repo no tenía el texto.

`D-31` resuelve esto sin tocar el global: **snapshot versionado + documento de realidad + aviso aditivo en `CLAUDE.md`**.

> **Por qué no se editó el global:** afecta a todas las sesiones abiertas y, aun editado, **seguiría sin quedar versionado**. Arreglar un archivo invisible cambiándolo sigue dejándolo invisible. Se versiona la copia, se corrige en el repo, y el parche al global queda como pendiente del owner.

---

## 2. Qué se copió — y con qué identidad

### 2.1 Fuente (SSOT real, fuera del repo)

| Campo | Valor |
|---|---|
| Ruta | `C:\Users\HFRC\.agents\skills\iptv-omega-working-flow-manifesto\SKILL.md` |
| Bytes | **48 262** |
| Líneas (LF) | **832** |
| sha256 | **`ffba6911373de81d15823ee7478c84a8267befad24f57c30f95837cb68e86da5`** |
| mtime | `2026-06-23T04:03:15.4734255-05:00` |
| BOM | **NO** |
| CRLF | **0** |

> El hash coincide con el `FFBA6911…` que declaraba el enunciado. **Verificado, no asumido.**

### 2.2 Snapshot en el repo

| Campo | Valor |
|---|---|
| Ruta | `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md` |
| Bytes totales | **50 411** |
| Cabecera de procedencia | **2 149 B** |
| Cuerpo (copia) | **48 262 B** |
| sha256 del **cuerpo** | **`ffba6911373de81d15823ee7478c84a8267befad24f57c30f95837cb68e86da5`** ✅ **== original** |
| sha256 del **archivo completo** | `2d24fc33fda8cb6892d0bf944493ed796849b1c733c3a1a9791775f4fba0416d` |

### 2.3 La tensión del acceptance, resuelta sin trampa

El acceptance de t18 pedía **dos cosas que no pueden ser simultáneas**:

- «byte-idéntico al manifiesto global (sha256 `FFBA6911…` verificado copia==original)»
- «**y lleva cabecera** con fuente, fecha, hash y "snapshot, no SSOT"»

**Una cabecera añadida cambia el hash del archivo.** No hay forma de tener las dos cosas en un solo hash. Cualquier entrega que afirme ambas está midiendo mal una de las dos.

**Resolución aplicada, explícita y verificable:** el archivo = `cabecera (2 149 B)` + `cuerpo (48 262 B byte-exactos)`. Se publican **los dos hashes** y el **método de recomposición**, de modo que la identidad se comprueba por slicing y no por confianza:

```powershell
$rb   = [IO.File]::ReadAllBytes("docs\manifestos\OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md")
$body = New-Object byte[] ($rb.Length - 2149)
[Array]::Copy($rb, 2149, $body, 0, $body.Length)
# sha256($body) == ffba6911…  ← verificado: IDENTICAL: True
```

Resultado medido:

```
orig sha : ffba6911373de81d15823ee7478c84a8267befad24f57c30f95837cb68e86da5
body sha : ffba6911373de81d15823ee7478c84a8267befad24f57c30f95837cb68e86da5
IDENTICAL: True     orig 48262 B / body 48262 B
```

### 2.4 Propiedad de seguridad deliberada

La cabecera es un **comentario HTML**. Eso **desplaza el front-matter `---` de la línea 1**, lo que **impide que un cargador de skills trate el snapshot como una skill activa**. Es un resultado buscado: el snapshot es **documento**, no doctrina ejecutable. Está declarado dentro del propio archivo.

La cabecera incluye: fuente, fecha del snapshot, mtime del original, bytes, líneas, sha256, la instrucción de no editar, la declaración «snapshot, NO SSOT — el SSOT sigue siendo el global», y punteros a los documentos de corrección.

---

## 3. Los archivos de esta tarea

| # | Archivo | Bytes | Función |
|---|---|---|---|
| 1 | `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md` | **50 411** | copia verbatim + cabecera de procedencia (cuerpo `ffba6911…`) |
| 2 | `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md` | ver §5 | tabla afirmación→realidad→archivo:línea, GRUPO A/B, 26-vs-14, `/shield/`, declaración rebase-only |
| 3 | `CLAUDE.md` | **+20 líneas, 0 borrados** | bloque aditivo «REALIDAD MEDIDA DEL VPS» + «PROHIBIDO: desplegar para alinear» |
| 4 | `audit/alignment/2026-10-25/45-doctrina/DOCTRINE_VERSIONING_LOG.md` | este archivo | qué se copió, hashes, pendientes del owner |

Los hashes de los archivos 2 y 4 se registran al final del commit-ready correspondiente; el 1 y el 3 se miden en la verificación de §6.

---

## 4. Correcciones de realidad que estos documentos versionan

Resumen (detalle completo con citas en `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md`):

| Familia | Lo que la doctrina dice | Lo que producción es |
|---|---|---|
| Pipeline | 5 fases Lua (`rewrite`→`access`→`header_filter`→`body_filter`→`log`) | **3 fases** (`header_filter`→`body_filter`→`log`) |
| Motor | Rust+LuaJIT `ape-crystal-rust` en `:8084`, `active (running)` | **unit inexistente**, puerto cerrado, `/health` y `/metrics` = `000` |
| Ruta | `/shield/{token}/{host}/{path}` | **404**; en `nginx -T` `/shield/` aparece 1 vez y no como `location` |
| Runtime | «Nginx / OpenResty» | **nginx 1.24.0 stock** + `ngx_http_lua_module`; sin `lua-resty-http`, sin `luajit` CLI |
| Vídeo | Null Packet, `/process` upscaling 4K, intercepta `.ts`/`.m4s` | `\.ts\|\.m4s\|\.mp4$ → 404` en ambos server públicos; **no transporta vídeo** |
| Telemetría | `conviva.db` realimenta la recalibración del LAB | **`conviva.db` = 0 B, 0 tablas** |
| Watchdogs | `/watchdog-status` con `ape-realtime-guardian` + `wg-health` + `sentinel` | **7 timers `netshield-*` inactivos**; único con poder sobre nginx: `ape-meta-watchdog` (60 s) |

**Lo que SÍ se cumple y no se toca:** `SHIELDED = solo sufijo` (verificado byte a byte: `cmp` → `IDENTICAL_PAYLOAD`, 22 271 732 líneas), `gzip_static`, BBR, `proxy_cache_valid` ausente, y **0 llamadas reales a `ngx.exit`** en los 14 módulos desplegados.

**Brecha de arquitectura (D-32):** repo 26 `.lua` vs VPS 14, sólo **4 en común** → 22 repo-only, 10 VPS-only. **Dos arquitecturas, no dos versiones.** Rige la **desplegada**: `rebase-only metadata`. El pipeline transformador es **aspiracional y no desplegado**.

**Contradicción resuelta (D-33):** `CLAUDE.md:373` («NUNCA se envuelven con `/shield/`») vs el manifiesto (URL canónica `/shield/…`). Gana `CLAUDE.md`, porque la medición da **404** y las listas usan URLs directas al proveedor.

---

## 5. Pendientes del OWNER — los bloques de T14 que NO se aplicaron

`D-31` es explícito: **el parche doctrinal no se aplica al manifiesto global**. Los 9 bloques de `DOCTRINE_CORRECTION.md` §2 siguen **sin aplicar**, por diseño.

| Bloque | Destino | Estado | Quién |
|---|---|---|---|
| **A** | `MANIFEST:148-156` — reescribir «5 fases + motor Rust» → «3 fases reales» | **PENDIENTE** | owner (manifiesto global) |
| **B** | `MANIFEST:158-194` — bloque `CRYSTAL-ENGINE-V2-KNOWLEDGE` → histórico con tabla de 7 afirmaciones desmentidas | **PENDIENTE** | owner |
| **C** | cabecera de `CRYSTAL-ENGINE-V2-FULL-DOCS` (196+) — advertencia de vigencia | **PENDIENTE** | owner |
| **D** | `CRYSTAL-ENGINE-V2-DIAGRAMS` (335-600) — marcar diagramas como diseño, no estado | **PENDIENTE** | owner |
| **E** | `APE-CRYSTAL-EDGE-SKILL` (605-643) y `-FULL100` (645+) — incluida la advertencia de que `?profile=P5` **no tiene efecto** | **PENDIENTE** | owner |
| **F** | `CLAUDE.md:381-391` autopista — alcance explícito (5 s en `/meta/` y `/cdn/`, `limit_conn` ausente, `upstream_gate` inaplicable) | **PENDIENTE** | owner · **ver nota** |
| **G** | `CLAUDE.md:368-377` SHIELDED — añadir verificación empírica (el texto actual es **correcto**) | **PENDIENTE** | owner · **ver nota** |
| **H** | inserción de puntero a la fuente de verdad en `CLAUDE.md` | **HECHO en t18** (equivalente funcional: el bloque aditivo remite a los 3 documentos) | cerrado |
| **I** | `.claude/commands/watchdog-status.md:2` — descripción real de timers | **PENDIENTE** | owner |

**Nota importante sobre F y G:** esos dos bloques van a **`CLAUDE.md`, que SÍ está en el repo**. En t18 se añadió el bloque aditivo de cabecera (que ya fija el alcance real y remite a la evidencia), pero **F y G siguen pendientes** porque `t18` tenía por contrato **solo** un bloque aditivo al inicio; reescribir las secciones AUTOPISTA y SHIELDED habría requerido **borrar líneas existentes**, y el acceptance exige `0 deletions`. **Quedan como pendientes explícitos, no como olvido.**

**Lo que el owner necesitaría para aplicarlos:** (1) decidir si el manifiesto global se edita en su ubicación o se promueve al repo; (2) autorizar explícitamente; (3) tener en cuenta que editar el global **no lo versiona** — si el objetivo es trazabilidad, el paso correcto es mover el SSOT al repo (por ejemplo `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO.md` como archivo vivo) y dejar el global como espejo.

---

## 6. Verificación ejecutada

```
# 1) hash del original (fuera del repo)
Get-FileHash "$env:USERPROFILE\.agents\skills\iptv-omega-working-flow-manifesto\SKILL.md" -Algorithm SHA256
→ FFBA6911373DE81D15823EE7478C84A8267BEFAD24F57C30F95837CB68E86DA5   (48 262 B)

# 2) hash del snapshot
Get-FileHash docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md -Algorithm SHA256
→ 2D24FC33… (50 411 B completo)   ·   cuerpo (offset 2149) → FFBA6911…  ✅ IDENTICAL: True

# 3) CLAUDE.md: solo inserciones
git diff --numstat -- CLAUDE.md
→ "20  0  CLAUDE.md"      ← 20 insertions, 0 deletions

# 4) alcance acotado
git status --porcelain -- docs/manifestos CLAUDE.md
→ solo las rutas de esta tarea
```

**Nota sobre `$env:USERPROFILE`:** el `Verify` del contrato usaba `$env:USERPROFILE`. En esta máquina el archivo resuelve y el hash coincide, así que la ruta expande correctamente. Se deja constancia porque un `$env:USERPROFILE` mal expandido daría un hash de «archivo no encontrado» que podría confundirse con un fallo de identidad.

---

## 7. Atestación de no-mutación y de alcance

| Prohibición | Cumplida | Evidencia |
|---|---|---|
| Editar el manifiesto global | **SÍ** | sólo se **leyó** (`ReadAllBytes`, `Get-FileHash`); su sha256 sigue `ffba6911…` y su mtime `2026-06-23T04:03:15` intacto |
| **SSH / cualquier comando al VPS** | **SÍ** | **cero invocaciones** en toda la tarea; ningún dato nuevo del VPS se produjo aquí (todo viene de t7) |
| Commit / push | **SÍ** | índice vacío; `git log -1` sin cambios |

**Alcance escrito, sólo en las 3 rutas del contrato:** `docs/manifestos/` (2 archivos nuevos), `CLAUDE.md` (+20 líneas, 0 borrados), `audit/alignment/2026-10-25/45-doctrina/` (este archivo). Ningún otro archivo tocado. Los `M` ajenos del working tree (18+, incluido el `_vps_stage/lua/*` de otras sesiones) **siguen intactos**: sólo se leyeron.

**Efectos secundarios locales:** ninguno en `.git/` (sin `hash-object -w` esta vez). Las únicas escrituras son los 4 archivos de §3.

---

## 8. Estado final

- **La doctrina está versionada.** A partir de ahora `git log` ve el manifiesto y la corrección.
- **Un agente que clone el repo ya no está ciego:** el bloque de cabecera de `CLAUDE.md` le dice en 20 líneas que producción es rebase-only y le prohíbe «desplegar para alinear», remitiéndole a la evidencia hasheada.
- **El global no se tocó.** Los 7 bloques que le afectan (A-G, I) quedan **pendientes del owner**, listados arriba con destino exacto.
- **El VPS no recibió un solo comando.**

---
*Fin de DOCTRINE_VERSIONING_LOG.md — 2 documentos versionados, 1 bloque aditivo, 7 bloques pendientes del owner, 0 ediciones al manifiesto global, 0 comandos al VPS, 0 commits.*
