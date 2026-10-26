# SCOPE AUDIT v2 — ¿se salió este equipo de su lane? (ronda 2 · t13)

> **v2 (2026-10-25T23:05-05:00, t13 / attempt `a011a235…cdfe`).** Cambios respecto de v1: (1) el scope
> vigente pasa a ser el de **D-14**, que amplía la cuarta raíz a `.agent/COORDINATION.md*` e incorpora
> el backup; (2) por tanto el veredicto sube de *9/10 + 1 excepción* a **10/10 PASS limpio**; (3) se
> añade §10 con la posición de **D-19** sobre el heartbeat de `session-guard`.
> El cuerpo original se conserva: solo se corrigen las filas afectadas por D-14.

> **Auditoría contra nosotros mismos.** No documenta lo que hicieron otros: documenta **cada byte que
> escribió `coord-sesiones`** (t2 + t3 + t10) y lo clasifica contra el scope autorizado.
> Si algo está fuera, se declara aquí antes de que lo encuentre t9.
>
> **Medición:** `2026-10-25T22:57-05:00` · board **rev 5** · sesión `be3f50f9-ee2d-4be4-a3e9-54e5ad8e2753`

---

## 1 · Scope autorizado (el contrato)

| # | Ruta | Autorización | Modo |
|---|---|---|---|
| 1 | `docs/ops/session-coordination/**` | t2 (entregables 1 y 2) | escritura nueva |
| 2 | `.agent-teams/session-board/**` | t2 (entregable 3) + t10 (rev5/rev6) | escritura nueva |
| 3 | `audit/alignment/2026-10-25/00-inflight/**` | t2 (entregable 5), t3, t10 | escritura nueva |
| 4 | `.agent/COORDINATION.md*` (**glob ampliado por D-14**) | t2 (entregable 4) | **prepend-only**, con backup y gate de preservación. El `*` cubre el backup `.bak_20261026T034317Z`, aprobado explícitamente por D-14 |

**Fuera de esto, cualquier escritura nuestra es un hallazgo contra nosotros.** Punto.

---

## 2 · Método (reproducible, sin confiar en la memoria)

```powershell
# a) todo lo que hay en las 3 carpetas propias + el archivo de la adenda
Get-ChildItem -Recurse -File docs/ops,.agent-teams/session-board,audit/alignment/2026-10-25/00-inflight
Get-ChildItem -File .agent

# b) hash + bytes + mtime de cada escritura propia
Get-ChildItem -Recurse -File docs/ops,.agent-teams/session-board,audit/alignment/2026-10-25/00-inflight,.agent/COORDINATION.md* |
  ForEach-Object { "{0} {1} {2}" -f $_.Length,(Get-FileHash $_.FullName -Algorithm SHA256).Hash,$_.FullName }

# c) ¿alguien escribió fuera de las raíces permitidas desde el inicio de la ronda?
#    (barrido por mtime > 22:43 sobre .agent, .agents, .agent-teams, .session, .dsh, audit, audit_teams_REA,
#     contracts, docs, scripts, tools, _vps_stage y los árboles calientes de IPTV_v5.4_MAX_AGGRESSION)
# d) integridad de la adenda: el hash NO debe haber cambiado desde t2
(Get-FileHash .agent/COORDINATION.md -Algorithm SHA256).Hash   # esperado 86159F7A…05C4
```

Resultado del barrido (c): **69 archivos con `mtime` > 22:43** fuera de `.git`. De ellos **8 son míos**
(los de §3 que ya existían en el instante del barrido; `LIVE_STATUS.md` y este `SCOPE_AUDIT.md` se
escribieron **después**) y **61 son de otras sesiones** (§6). No hubo ninguna escritura mía fuera de las
4 raíces, salvo la excepción declarada en §4.

---

## 3 · Inventario completo de mis escrituras (9 + este archivo)

| # | Ruta | Bytes | SHA-256 (16) | mtime | Tarea | ¿En scope? |
|---|---|---|---|---|---|---|
| 1 | `docs/ops/session-coordination/COORDINATION_PROTOCOL.md` | 22.834 | `04450384777368CA` | 22:45:10 | t2 | ✅ |
| 2 | `docs/ops/session-coordination/NOTICES.md` | 7.130 | `3C3EE508D8353DD8` | 22:48:16 | t2 (+E-0010) | ✅ |
| 3 | `docs/ops/session-coordination/notices.jsonl` | 9.962 | `ECC88910D1C6F19A` | 22:53:43 | t2/t3 (+t10) | ✅ |
| 4 | `.agent-teams/session-board/BOARD.json` | 46.276 | `12A2C8A64BF6719E` | 22:56:59 | t2/t3/t10 (rev5) | ✅ |
| 5 | `audit/alignment/2026-10-25/00-inflight/INFLIGHT_INVENTORY.md` | 37.609 | `7DF3EE1F77636238` | 22:53:27 | t2 + adenda t3 | ✅ |
| 6 | `audit/alignment/2026-10-25/00-inflight/CHANGE_MAP.json` | 18.689 | `7079E247A3171154` | 22:52:35 | t3 | ✅ |
| 7 | `audit/alignment/2026-10-25/00-inflight/NO_TOUCH_LIST.md` | 11.951 | `903050EE439DE1DA` | 22:53:01 | t3 | ✅ |
| 8 | `audit/alignment/2026-10-25/00-inflight/LIVE_STATUS.md` | 13.450 | `839595C22D105CDD` | 22:57:53 | t10 | ✅ |
| 9 | `.agent/COORDINATION.md` | 21.516 | `86159F7A46A04C7B` | 22:45:44 | t2 (prepend) | ✅ (prepend-only, verificado) |
| — | `audit/alignment/2026-10-25/00-inflight/SCOPE_AUDIT.md` | (este archivo) | — | 22:58 | t10 | ✅ |
| **E1** | `.agent/COORDINATION.md.bak_20261026T034317Z` | 16.805 | `348862964AD42E09` | 22:18:27* | t2 (backup) | ✅ **(D-14: dentro del glob `.agent/COORDINATION.md*`)** |

\* mtime heredado del original porque es una **copia byte a byte** (`Copy-Item` conserva la fecha del
contenido de origen en NTFS al copiar sin `-Force` sobre archivo nuevo… en cualquier caso el `mtime` que
muestra es el del original, y su hash **es** el del original, que es lo que importa).

**Total de las 10 filas de arriba: 206.222 B** (medido en t10; `LIVE_STATUS.md` y `notices.jsonl` han
crecido después con las rondas 1 y 2 — sus hashes vivos están en `BOARD.json → deliverables`).
`SCOPE_AUDIT.md` se **autoexcluye** del cómputo porque su propio tamaño cambia al corregirse (un
documento que se mide a sí mismo siempre miente por un párrafo).
**Con D-14, las 10 filas están dentro de scope: 10/10.**

---

## 4 · Excepción CERRADA por D-14: el backup de la adenda

| Campo | Valor |
|---|---|
| Ruta | `.agent/COORDINATION.md.bak_20261026T034317Z` |
| Qué es | copia byte a byte del original **antes** del prepend |
| Por qué existe | el encargo de t2 lo **exigía literalmente**: *"backup `.agent/COORDINATION.md.bak_<timestamp>` antes de tocar"* |
| ¿Por qué es una excepción? | es un archivo **nuevo** en `.agent/`, y el scope listaba `.agent/COORDINATION.md` (sin glob). Estrictamente, un archivo nuevo al lado no está en esa lista |
| Severidad | **info** — no es una violación de lane ajena, no toca trabajo de nadie, y es la red de seguridad de un archivo compartido |
| Verificación | `sha256(backup) = 348862964AD42E0942541FFF1D4CB9ED81D4E4D316918A5817E8AB2972E9E591` = **hash del original**. Restauración trivial: `Copy-Item <bak> .agent/COORDINATION.md -Force` |
| Decisión tomada | **D-14** (capitán): se amplía el scope a `.agent/COORDINATION.md*`. El backup **no se borra** — es evidencia obligatoria de preservación byte a byte. Queda **en scope**, no como excepción |

**Declaración honesta:** prefiero reportar esta excepción a esconderla en un "todo en orden". Si t9 lee
"0 escrituras fuera de scope" sin esta nota, el reporte sería falso.

---

## 5 · Integridad de la adenda (lo que más riesgo tenía)

| Comprobación | Esperado (t2) | Medido (t10) | Veredicto |
|---|---|---|---|
| `sha256(.agent/COORDINATION.md)` | `86159F7A46A04C7B9F78848F26E6C8A0375B6685A138C960C84B04B9537F05C4` | idéntico | ✅ no ha derivado |
| Bytes | 21.516 | 21.516 | ✅ |
| mtime | 22:45:44 | 22:45:44 | ✅ nadie lo tocó después |
| Backup presente | 16.805 B / `34886296…E591` | idéntico | ✅ |
| `git diff --numstat` | `74 0` (solo agrega) | sin cambios | ✅ |

**Nadie ha editado `.agent/COORDINATION.md` después de mí** (ni yo). Es el único archivo compartido
que toqué, y sigue exactamente como lo dejé.

---

## 6 · Escrituras de OTRAS sesiones fuera de nuestras raíces (no son nuestras)

Barrido de 69 archivos con `mtime > 22:43`; 60 no son míos. Los relevantes, con atribución por lane
(no por adivinanza):

| Ruta | mtime | Lane / dueño probable | Qué es |
|---|---|---|---|
| `audit_teams_REA/SHA_TABLES.json` | 22:45:20 | sesión REA/VPS | actualización de sus tablas de hashes |
| `docs/REA_EVIDENCE_AUDIT.md` (37.687 B) | 22:54:28 | **`rea-recon`** (su ledger dice que escribe `docs/REA_*.md`) | auditoría de evidencia REA |
| `_vps_stage/ops/ape-nginx-restart-audit.sh` (1.439 B) | **22:52:44** | **t46 / dsh-lead** (lane `_vps_stage/**`) | **X-008: subdir sin lock** |
| `_vps_stage/tests/T46_cache_first_measurement.md` | 22:44:02 | t46 | medición cache-first |
| `tools/crystal-upscale/**` (24 archivos, 35.167.261 B: `_bench/`, `_selftest/`, `_work/`) | 22:43:22–22:53:22 | **t47 / dsh-lead** (L-003) | benchmarks + **X-007** (el `.mkv` aplanado en la raíz) |
| `.session/alineacion-omni-crystal-1025.json` | 22:50:10 | `tools/session-guard.js` (dsh-lead) | heartbeat del guard sobre nuestro equipo → **X-009** |
| `.agent-teams/{alineacion…,auditoria-roku…,rea-recon}/{team.json,inbox/*.jsonl}` | 22:50:32–22:56:29 | harness `agent_teams_*` | estado de equipos (no edición manual) |
| `audit/alignment/2026-10-25/{00-captain,10-excel,20-json,30-app,40-vps}/**` | 22:53:13–22:56:47 | capitán, excel-ssot, json-ssot, app-generador, vps-edge | **dentro de `audit/alignment/**`** → en scope del equipo, cada uno en su lane |

**Ninguna de estas la escribí yo.** Y ninguna la he tocado: se listan, se hashean cuando hace falta,
se dejan quietas.

---

## 7 · Lo que NO escribimos (y es importante decirlo)

| Ruta | Estado | Prueba de que no la tocamos |
|---|---|---|
| `.session/locks.json` (estado de `session-guard`) | sin cambios: 3 locks, `updatedAt 2026-10-26T03:40:05Z` | `mtime` 22:40:05, anterior a mi primera escritura (22:45:10) |
| `tools/session-guard.js` | intacto | `sha256 1B95B2BE…983E` = el de t2 |
| `COORDENADAS_SESIONES.md` | intacto | `sha256 BD198A7A…E5EC` = el de t2 |
| Los **17 archivos ajenos modificados** | intactos | `numstat` y `mtime` idénticos a t3 (p. ej. `m3u8-typed-arrays-ultimate.js` `+427/−1` @21:52:01, `2315184E…BCDB`) |
| Los **3.172 borrados** de `/target/` | intactos | `git status` sigue mostrando `D` (no los restauré ni los commiteé) |
| `contracts/**` (L-007) | intacto | no aparece en mis escrituras; el gate sigue en rojo por X-006, **no lo "arreglé"** |
| Cualquier `*.xlsm` | nunca abierto en escritura | 0 procesos `EXCEL`/`php` en la máquina durante las 3 rondas |
| VPS `178.156.147.234` | **nunca accedido** | 0 `ssh`, 0 `curl`, 0 `scp`, 0 `systemctl`, 0 `nginx` en t2/t3/t10 |

---

## 8 · Veredicto

| Comprobación | Resultado |
|---|---|
| Escrituras propias dentro de las 4 raíces (con glob D-14) | **10 de 10** |
| Excepciones abiertas | **0** (`E1` quedó cerrada por D-14, §4) |
| Violaciones de lane ajena | **0** |
| Escrituras propias en producción / Excel / VPS | **0** |
| Archivos ajenos modificados o borrados | **0** |
| Adenda `.agent/COORDINATION.md` | **estable y verificada** (hash `86159F7A…05C4` sin cambios en 19 min) |
| **Veredicto** | **PASS limpio (10/10)** |

**De "PASS con 1 excepción declarada" (v1) a "PASS limpio" (v2)**: no cambié los hechos, cambió la regla
— el capitán aprobó por **D-14** que `.agent/COORDINATION.md*` forma parte del scope, con el backup
incluido y sin borrarlo. La excepción no se "arregló" borrando evidencia; se resolvió ampliando el contrato.

---

## 9 · Límites de esta auditoría (para no sobre-afirmar)

1. **Solo audito lo mío.** La atribución de §6 es por *lane*, no por autor verificado: no hay índice
   sesión→archivo y no voy a inventar quién escribió qué.
2. **El barrido por `mtime` tiene un punto ciego**: un archivo escrito y luego *restaurado* con su fecha
   original no aparecería. Mitigación parcial: los hashes de §5 y §7 demuestran que los archivos
   sensibles siguen idénticos.
3. **`git status` no distingue autor.** Que los 17 archivos sucios sigan con el mismo `numstat` y `mtime`
   prueba que **no cambiaron**, no que yo no los haya tocado; eso lo prueba el hecho de que ninguna de
   mis escrituras está en esas rutas (§3) y que mis 10 rutas están todas listadas.
4. **La excepción `E1` está cerrada por D-14**, no eliminada: si t9 aplica la regla al pie de la letra
   contra el scope **v1** (sin glob) marcaría un FAIL contra nosotros; contra el scope **vigente** (D-14)
   es 10/10. Se deja constancia de ambos para que el veredicto no dependa de qué versión del contrato lea.

---

## 10 · D-19 — posición sobre el heartbeat de `session-guard` (X-009)

**Lo que dice el estado del guard:** `.session/alineacion-omni-crystal-1025.json` incluye en `modified[]`
los **17 archivos ajenos** modificados y las **3.172 rutas `*/target/**`** borradas.

**Lo que eso significa:** nada. Ese campo es el **`git status` crudo** que el guard captura en el momento
del heartbeat; **no es autoría**. Cualquier lector que lo interprete como "este equipo escribió eso"
llega a una conclusión falsa.

**Lo que sí es autoría nuestra:** las **10 rutas** de §3, todas dentro del scope D-14. Es la contraprueba,
y es verificable: `Get-ChildItem -Recurse -File docs/ops,.agent-teams/session-board,audit/alignment/2026-10-25/00-inflight,.agent/COORDINATION.md*`
devuelve exactamente ese conjunto.

**Restricción técnica encontrada al intentar cumplir D-19 al pie de la letra:**

```text
comandos: status | claim <path> | release <path> | check <path...> | heartbeat | guard <path...>
```

- `heartbeat` **no acepta `--note` ni `--owner`** → no hay forma de escribir la aclaración *dentro* del JSON.
- Editarlo a mano = escribir `.session/**`, que **no** está en el scope D-14 y que el protocolo §9.1
  prohíbe tocar (estado máquina ajeno).
- Editarlo con el script = editar `tools/session-guard.js`, **prohibido por D-19**.
- Ejecutarlo ahora crearía una **11.ª escritura fuera de scope** y rompería el 10/10 que pide esta ronda.

**Por eso la aclaración se emite donde este equipo sí manda:** aquí (§10), en `LIVE_STATUS.md` v2 §7,
en `BOARD.json → conflicts[X-009]` y en `notices.jsonl` (E-0025). **Acción propuesta al capitán:** que el
dueño del guard añada `--note`/`--owner` al CLI, o que incorpore en el `note` del heartbeat la frase
`modified[] = git status crudo, NO autoría`. Mientras eso no pase, el JSON seguirá siendo un señuelo de
atribución — y este documento, la prueba de que el señuelo es falso.
