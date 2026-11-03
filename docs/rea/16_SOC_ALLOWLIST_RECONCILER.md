# 16 · Reconciliador de allowlist SoC (allowlist siempre completa, sr=1 con evidencia)

**Tarea:** `t49` (Fase 0.6) · **Alcance: REPO-ONLY.** No se instaló el timer, no se escribió en `/etc` ni `/var/lib` de ningún host, no se tocó la DB ni el VPS, sin commits.
**Autor:** `s7-sre-secops` · **Host de pruebas:** Windows, **Python 3.12.10**

## 1. Qué resuelve

El plano APE aplica ajustes por SoC (`sr_allow`, perfil PQ, VPP). Si la allowlist es una lista blanca incompleta, **todo SoC no listado queda fuera** y el device pierde mejoras que sí soporta. Este reconciliador invierte la carga: **todo SoC observado entra** al archivo y `sr=1` se concede **solo con evidencia**.

## 2. Piezas

| Archivo | Rol |
|---|---|
| `vps/prisma/tools/ape_soc_allowlist_reconciler.py` | reconciliador (stdlib puro, 463 L) |
| `vps/prisma/tools/tests/test_ape_soc_allowlist_reconciler.py` | 8 casos con exit real (243 L) |
| `vps/prisma/etc/ape_soc_allowlist.seed.json` | conocimiento de familias (ONN incluido) |
| `vps/systemd/ape-soc-allow.service` + `.timer` | unidad (propuesta, **no instalada**) |

**Rutas:** lee `/var/lib/ape/soc_seen.jsonl` (`{soc,device_id,ts}`) · escribe `/etc/ape-uhdx/ape_soc_allowlist.json` (+ `.bak`, + `soc_needs_curation.txt`). Todas son parámetros de CLI (`--seen/--out/--curation/--lock/--seed`), lo que permite probar sin tocar el host.

**Esquema v2:** el archivo lleva `version:2`, `updated`, `sr_families`, `pq_families`, `sr_min_devices`, `needs_curation` y `socs{}`. **Cada SoC** lleva los 9 campos del contrato: `sr, sr_levels[], pq, vpp (aisr|tradicional|unknown), state (confirmed|quarantine), evidence[], devices[], first_seen, note`.

## 3. Reglas (implementadas, no sólo documentadas)

1. **Todo SoC visto se añade** — mínimo en cuarentena (`sr=0`, `vpp=unknown`).
2. **`sr=1` solo con evidencia**: familia con AI-SR (`s905x5`, `s905x5m`) **y ≥3 dispositivos distintos**. Dos boxes no son evidencia.
3. **PQ conocido sin AI-SR** (`s905x4`, `s905y4`, `s928x`) ⇒ `state=confirmed`, `sr=0`, `vpp=tradicional`. **ONN 4K (S905X4/Y4)** cae aquí con nota explícita: decisión del capitán (Opción B) — no se fija `sr_allow=0` a ciegas.
4. **Nada se borra**: las entradas previas se conservan y el conjunto `devices` es una **unión monótona**, así que una promoción no se pierde en una pasada con menos tráfico. `first_seen` es el mínimo histórico.
5. **Desconocido** ⇒ `sr=0`, `vpp=unknown` y una línea en `soc_needs_curation.txt` (append, sin duplicar) para curación humana.

**Escritura segura:** temp en el mismo directorio → `fsync` → re-parseo del temporal → `.bak` del vivo → `os.replace` → `fsync` del directorio. Si el JSON existente está corrupto **no se pisa**: se aborta con **exit 10**. Lock entre procesos (`fcntl`; degrada a `msvcrt` en Windows o a sin-lock, declarándolo). Validación de esquema antes de escribir (incluye `sr=1 ⇒ state=confirmed`).

## 4. Por qué la evidencia no es un `setprop`

Un `setprop` en el device dice lo que el **vendedor declaró** o lo que un script escribió; no dice si el VPP del SoC hizo el trabajo. Contar **dispositivos distintos que reportan el mismo SoC** y exigir 3 antes de habilitar AI-SR evita que un solo box mal identificado (o un emulador) abra la puerta a los demás. La allowlist **no crea píxeles**: solo decide si se permite pedir SR; el realce real lo hace el hardware.

## 5. Riesgo y mitigación

| Riesgo | Mitigación |
|---|---|
| Reconciliador pisa la allowlist con basura | validación de esquema + re-parseo del temporal + **exit 10 sin escribir** si el previo está corrupto |
| Escritura parcial (corte de luz) | `os.replace` atómico + `fsync` de archivo y directorio |
| Dos invocaciones simultáneas | lock `fcntl`/`msvcrt` → la segunda sale con **exit 11** |
| Un SoC desconocido queda en cuarentena para siempre | línea en `soc_needs_curation.txt` (visible para un humano) |
| Allowlist demasiado permisiva | `sr=1` exige familia + 3 dispositivos; nunca por seed |

**Rollback:** el `.bak` se escribe en cada pasada exitosa → `cp -p /etc/ape-uhdx/ape_soc_allowlist.json.bak /etc/ape-uhdx/ape_soc_allowlist.json` y (si el consumidor cachea) recargar su lector. **El reconciliador no recarga nada por sí mismo.**

## 6. Verificación ejecutada (exit real)

`python vps/prisma/tools/tests/test_ape_soc_allowlist_reconciler.py` → **exit 0 · TOTAL=8 PASS=8 FAIL=0 SKIP=0**

| Caso | Resultado medido |
|---|---|
| a) SoC nuevo → cuarentena | `sr=0 vpp=unknown state=quarantine` + línea en curación |
| b) 3 devices familia SR → promoción | `sr=1 vpp=aisr devices=3 levels=['4k','8k']` |
| c) 2 devices → no promoción | `sr=0 state=quarantine devices=2` |
| d) PQ sin AI-SR → tradicional | `sr=0 state=confirmed vpp=tradicional` (nota ONN) |
| e) JSON corrupto → no pisa | **exit 10**, archivo intacto byte a byte |
| f) concurrencia/lock | backend `msvcrt` (Windows), concurrente **exit 11** |
| g) idempotencia | 2 pasadas ⇒ documentos iguales salvo `updated` |
| h) nada se borra + `.bak` (extra) | `s905x5` conservado con `sr=1`; `.bak` presente |

Los tests corren **solo en directorios temporales** (`tempfile.mkdtemp`) con rutas explícitas: no tocan `/etc`, `/var/lib` ni el VPS.

## 7. NOT_RUN declarado

| No ejecutado | Causa |
|---|---|
| Instalar/habilitar `ape-soc-allow.timer` en el VPS | **prohibido** por la tarea (repo-only); el host de trabajo es Windows, sin systemd |
| `systemctl start/status` de la unidad | idem |
| Escribir en `/etc/ape-uhdx` y `/var/lib/ape` reales | idem: los tests usan temporales |
| Lock con `fcntl` en Linux | el host es Windows → se probó el camino `msvcrt` (mismo contrato, **exit 11**); `fcntl` queda **NO VERIFICADO aquí** |
| Consumo real por el daemon del device | fuera de alcance (no hay device) |
