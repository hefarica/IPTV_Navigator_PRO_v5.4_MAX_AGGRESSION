# EVIDENCIA — verificación de la integración `ape-iptv-auditoria-4k-premium6k`

**Artefacto:** `artifacts/integracion-4k6k/EVIDENCIA.md`
**Tarea:** [verify] — demostrar con salidas reales que la integración no rompe nada y que lo nuevo está apagado por defecto.
**Fecha de ejecución:** 2026-11-20, America/Bogota (ventana 01:54–02:04).
**Entorno:** Windows 10.0.26200 (NTFS) · Node v24.12.0 · Python 3.12.10 · `bash` = WSL2 Ubuntu (kernel 6.6.114.1-microsoft-standard-WSL2) · `python3` 3.14.4 dentro de WSL.

> **Qué NO hice** (reglas duras de la misión, cumplidas): no ejecuté `git` en ninguna forma; no escribí en el VPS `178.156.147.234`, ni en nginx, ni en systemd; no modifiqué la lista protegida ni el ZIP de auditoría (solo lecturas HTTP de rango, que se citan); no toqué el reproductor ni secretos; no modifiqué las skills para "arreglar" un fallo.

---

## 0 · Identidad de lo verificado (bytes + sha256)

Los dos ficheros nuevos cambiaron **durante** la ventana de verificación: a las 01:51/01:54 existía una revisión previa (36 713 B / 552 líneas la suite) y el implementador la reescribió a las 01:58:26 y 01:59:33. **Toda la evidencia de esta tabla está fijada a la revisión final**, y cada corrida se ejecutó con el hash idéntico antes y después (comprobado en la misma invocación).

| Artefacto | Bytes | Líneas | SHA-256 | mtime |
|---|---:|---:|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-4k6k-audit-adapter.js` | 41 670 | 802 | `8f0e9112e10760320a99b19efb9c8472e8edf84413fa9d3fa8d1e6d2828911c5` | 2026-11-20T01:58:26-05:00 |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-4k6k-audit-adapter.test.js` | 44 749 | 615 | `5e0c233414a5532f821b34d0fd9ce65e114aa7808f2186b906393394a5525d8c` | 2026-11-20T01:59:33-05:00 |

Los 8 ficheros de la skill instalada tienen el SHA-256 que `SPEC_ADAPTADOR.md` §0.1 declara para el origen (comprobado con `Get-FileHash`, salida en la sesión):

| Fichero de la skill | SHA-256 medido |
|---|---|
| `SKILL.md` | `d88ec8f3df0deebfeb886109edc11daf5f33d4b06774577271af0b19060c72ad` |
| `references/contrato_y_limites.md` | `0f67448fed8ea03a0cbfbda817386554fb3462c42dd434324676d063f8c2ab47` |
| `scripts/auditar_y_ampliar.py` | `cb3ec06668a580b08c154a5956b36469c46b7620a61f22cae9aaa26650b3b4fb` |
| `scripts/ejecutar_seguro.py` | `0e92d4c0f106335b913b493ed7378138874682f06fb1e0e90f947683f3cabed9` |
| `scripts/verificar_lista.py` | `f9d860d69ba94d39c00db53c0202f8684859a40005cfbcaf64f7e3004133f0d5` |
| `scripts/validar_escalado.py` | `964496d5b587cee826fe628949e50e2840ad810932b060265f57c6c3817b6dad` |
| `scripts/test_preservacion.py` | `478f1659aa11305edc907780ebf08ca615f7d78c260d05851b18fe1cef5d86bb` |
| `scripts/test_seguridad.py` | `64548641a2052bb95ae507d264229ac9341d99c93c8491826390572c42d2bd00` |

Los logs literales de cada corrida quedaron en `artifacts/integracion-4k6k/logs/` (un fichero por prueba, con la línea `[EXIT CODE: N]` al final).

---

## 1 · Tabla de pruebas (comando literal · exit · resultado · veredicto)

| # | Comando (literal) | Exit | Resultado medido | Veredicto | Log |
|---|---:|---|---|---|---|
| 1 | `python -m unittest discover -s .agents/skills/ape-iptv-auditoria-4k-premium6k/scripts -p 'test_*.py' -v` (cwd = raíz del workspace) | **1** | `Ran 17 tests in 0.457s` · `FAILED (failures=1)` · 16 PASS / 1 FAIL | **FAIL EXTERNO** (permiso POSIX en NTFS, §2.1) | `logs/python-suite-windows.log` |
| 2 | misma suite, copiada byte a byte a `/tmp` de WSL2 Linux y ejecutada allí (`python3 -m unittest discover -s scripts …`) | **0** | `Ran 17 tests in 0.064s` · `OK` · **17/17 PASS** | **PASS real** | `logs/python-suite-linux.log` |
| 3 | `python -c "os.chmod(p,0o600); stat.S_IMODE(...)"` sobre un fichero temporal en NTFS | 0 | `chmod pedido: 0o600 (384)` · `st_mode real: 0o666 (438)` · `IGUALDAD: False` | **PASS (diagnóstico)** — reproduce el fallo #1 | sesión |
| 4 | `node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-4k6k-audit-adapter.test.js` (cwd = raíz) | **0** | `PASS 177 · FAIL 0` | **PASS real** | `logs/node-suite.log` |
| 5 | `node --check frontend/js/ape-v9/ape-4k6k-audit-adapter.js` | **0** | sin salida | **PASS real** | sesión |
| 6 | `node --check frontend/tests/ape-4k6k-audit-adapter.test.js` | **0** | sin salida | **PASS real** | sesión |
| 7 | `node artifacts/integracion-4k6k/verificar_no_regresion_flag.js` | **0** | `RESULTADO: PASS (0 fallos)` · diff exacto en §3 | **PASS real** | `logs/no-regresion-flag.log` |
| 8 | `node --expose-gc artifacts/integracion-4k6k/medir_escala_sintetica.js 5000` | **0** | 7/7 invariantes `true` · números en §4 | **PASS real** | `logs/escala-5000.log` |
| 9 | `node tools/check_anti_degradation_policy.js` | **0** | `TOTAL=8 PASS=8 FAIL=0` | **PASS real** | `logs/gates-node.log` |
| 10 | `node tools/check_crystal_4k_law.js` | **0** | `TOTAL=5 PASS=5 FAIL=0` | **PASS real** | `logs/gates-node.log` |
| 11 | `node tools/check_crystal_6k_law.js` | **0** | `TOTAL=6 PASS=6 FAIL=0` | **PASS real** | `logs/gates-node.log` |
| 12 | `node tools/check_app_continuity_wiring.js` | **0** | `TOTAL=8 PASS=8 FAIL=0` | **PASS real** | `logs/gates-node.log` |
| 13 | `bash tools/quality/gate_no_focus_steal.sh` (WSL2) | **0** | `VERDICT=PASS pass=8 fail=0` | **PASS real** | `logs/gate-focus-steal.log` |
| 14 | `bash tools/quality/gate_ape_crystal_flow.sh --json` (WSL2) | **1** | `{"verdict":"FAIL","pass":5,"fail":2,…}` → `lista-cableada http=404`, `pulse-canal 451` | **FAIL EXTERNO** demostrado (§2.2) | `logs/gate-crystal-flow.log` |
| 15 | `bash tools/ops/ape-device-health.sh` (WSL2) | **1** | `no hay device en 192.168.1.3:5555` | **FAIL EXTERNO** demostrado (§2.3) | `logs/gate-device-health.log` |
| 16 | `curl` directo a las 3 URLs del gate (#14) | 0 | `lista http=404` · `pulse http=451` · `health http=200` | **PASS (reproducción)** | sesión |
| 17 | `curl -r 0-511` a la lista **protegida vigente** (solo 512 B, solo lectura) | 0 | `http=206 bytes=512 type=application/vnd.apple.mpegurl` | **PASS (contexto)** | sesión |
| 18 | `Get-FileHash` de los 4 ficheros núcleo del pipeline | 0 | los 4 sha256 **idénticos** a `BASELINE.md` §8.1 | **PASS real** | sesión |
| 19 | `node -e "JSON.parse('.agents/skills_index.json')"` + conteo | 0 | `entradas=308 unicos=308 duplicados=0 has_nueva=true` · `totals: 308 = 17 anchors + 291 satellites` | **PASS real** | sesión |

**Nota de método sobre los gates:** no existe `bash` nativo en Windows; se usó el de WSL2 (`C:\Windows\system32\bash.exe`), que **sí está disponible** (Ubuntu, `uname` verificado). Por eso los gates `.sh` son PASS/FAIL reales, no SKIP. Los gates se ejecutaron desde la raíz del workspace `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`, que es donde viven realmente `tools/…` (en la subcarpeta del proyecto **no existen**: intentar ejecutarlos ahí da `MODULE_NOT_FOUND`, y eso quedó medido, no supuesto).

---

## 2 · Los tres fallos, demostrados ajenos a la integración

### 2.1 Suite Python 16/17 en Windows — artefacto de plataforma, no de la integración

`logs/python-suite-windows.log`:

```text
FAIL: test_patch_a_destino_diferente_conserva_urls_exactas
  File "...\test_preservacion.py", line 121, in test_patch_a_destino_diferente_conserva_urls_exactas
    self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)
AssertionError: 438 != 384
Ran 17 tests in 0.457s
FAILED (failures=1)
```

La aserción exige el modo POSIX `0o600` (384). En NTFS `chmod` no puede expresarlo: se midió aparte, sobre un fichero temporal, que `os.chmod(p, 0o600)` produce `st_mode real: 0o666 (438)` — **exactamente el 438 del fallo**. Prueba cruzada decisiva: los mismos scripts (sha256 `cb3ec066…` y `f9d860d6…`, idénticos) copiados a `/tmp` de WSL2 Linux dan `Ran 17 tests … OK`, exit 0.

Conclusión: **la integración ejecuta 17/17 en un filesystem POSIX**; el único fallo es el permiso POSIX no representable en NTFS. No se "arregló" la prueba (prohibido por la misión): se documenta. Ya estaba declarado por el implementador en `ADAPTADOR.md` §8 (N6) con el mismo número `438 != 384`.

### 2.2 `gate_ape_crystal_flow.sh` FAIL (2 de 7 checks) — estado del VPS, no de nuestros ficheros

El gate sondea **solo HTTP** contra `https://iptv-ape.duckdns.org`; su propia cabecera lo declara (`gate_ape_crystal_flow.sh:32`: *"NO ESCRIBE NADA: solo lecturas HTTP. Sin VPS, sin adb, sin ficheros"*). No lee ningún fichero del repo salvo a sí mismo.

Reproducción directa e independiente del gate (curl, sin pasar por él):

```text
[3] lista-cableada  GET /lists/APE_LISTA_1794100720046_CABLEADA.m3u8 (Range 0-1023)
    http=404 bytes=146        cuerpo: <html>…<h1>404 Not Found</h1>…<center>nginx</center>
[5] pulse-canal     GET /pulse/27.m3u8?u=…&d=…  (UA "OTT Navigator/1.7.3.3")
    http=451 bytes=124
    x-ape-pulse: logged;mode=proxy;upstream_not_playlist;kind=noplaylist;code=451
[1] health          GET /health
    http=200 bytes=3
```

Y el servicio **sí** sirve la lista vigente: `curl -r 0-511` a la lista protegida devuelve `http=206`, `type=application/vnd.apple.mpegurl`. Es decir: el gate sondea un **nombre de fichero obsoleto** (`…1794100720046_CABLEADA.m3u8`) y un canal cuyo **upstream ya no entrega playlist** (`upstream_not_playlist`); el gate no contempla 451 como "canal bloqueado" (sí contempla 403/407/461, `gate_ape_crystal_flow.sh:115`). Ambos son hechos de producción preexistentes.

Pruebas de que la integración no puede ser la causa:

1. El gate **no menciona** la integración en ningún sitio: `grep -c -E 'APE_4K6K|4k6k|ape-4k6k-audit-adapter' tools/quality/gate_ape_crystal_flow.sh` → **0**.
2. Los 4 ficheros núcleo del pipeline conservan su sha256 de `BASELINE.md` §8.1 **byte a byte** (§5), así que la salida del generador es la previa.
3. No se desplegó nada (prohibido por la misión): el VPS no puede haber cambiado por esta integración.

**No lo arreglé**: la misión ordena reportarlo tal cual. Candidatos de arreglo (fuera de alcance): actualizar la URL de la lista y añadir `451` a la rama de "canal bloqueado".

### 2.3 `ape-device-health.sh` exit 1 — dispositivo ausente, preexistente

```text
no hay device en 192.168.1.3:5555
```

El mismo estado ya lo registraba el watchdog del repo **antes** de esta integración, en `artifacts/device-truth/LATEST.json` (ts `2026-11-20T06:57:06Z`): `"verdict":"SIN_MEDIDA"`, `adb.exe: device '192.168.1.3:5555' not found`. `grep` recursivo de `APE_4K6K|4k6k` sobre `tools/` → **0** coincidencias: ningún gate o script de ops conoce la integración.

---

## 3 · No-regresión del flag: diff EXACTO 0 vs 1

`logs/no-regresion-flag.log` (adaptador `8f0e9112…`; fixture de 3 canales con `u=`, `d=`, STREAM-INF, SUPPLEMENTARY-CODECS, EXTSHIMOTT, campo desconocido):

```text
A) FLAG 0
  PASS  isEnabled() === false con flag 0
  PASS  enrich devuelve LA MISMA referencia (no copia)
  PASS  sha256(input JSON) === sha256(output JSON)
  PASS  la entrada queda intacta tras enrich
  PASS  audit() devuelve sobre inerte (enabled:false)
  MEDIDO  sha256(input)  = e2130d855b5c8277b7f150841f86c740aa53fb72c7b2b24b76f0923852c58df6
  MEDIDO  sha256(output) = e2130d855b5c8277b7f150841f86c740aa53fb72c7b2b24b76f0923852c58df6

B) FLAG 1
  claves AÑADIDAS por canal : {"rea":3,"APE-AUDIT-ORIGINAL":3}
  claves ELIMINADAS         : []
  claves MODIFICADAS        : []
  claves AÑADIDAS en rea    : []
  claves MODIFICADAS en rea : []
  MEDIDO  sha256(input ON)  = e2130d855b5c8277b7f150841f86c740aa53fb72c7b2b24b76f0923852c58df6
  MEDIDO  sha256(output ON) = e4cb5a90f5b3e34901362fa2b2220e6a69b5f61cf46f736c8c97aaa4149755b2
  PASS  la 2ª pasada reproduce el mismo sha256 (idempotencia)
RESULTADO: PASS (0 fallos)
```

**Diferencia exacta de campos (flag 0 → flag 1):** por canal se **añaden** `rea` y `APE-AUDIT-ORIGINAL`, y **nada más**. Cero claves eliminadas, cero claves previas modificadas, cero claves internas de `rea` alteradas sobre un `rea` previo (el fixture no traía `rea`; el caso con `rea` preexistente lo cubre la suite, aserción *"extiende REA existente conservando campos previos"*). Con flag 0, `sha256(entrada) == sha256(salida)` y además `enrich` devuelve **la misma referencia** (coste 0).

---

## 4 · Escala: 5.000 canales sintéticos (muestra declarada)

`logs/escala-5000.log` — **no se abrió la lista de 754 MB ni ninguna lista real**; la muestra se generó en memoria:

```text
canales            : 5000
bytes JSON         : 1567783  (1.50 MiB)
sha256 muestra     : 87a835416cc1693569c19b47cbab9ce0a8a6c7dbdf1cdfb896fee10ba98de41a
flag 0 · enrich (apagado)     0.10 ms   Δheap=  -0.0 MiB (gc forzado)
flag 1 · enrich               4.08 ms   Δheap=   2.4 MiB (gc forzado)
flag 1 · audit              202.07 ms   Δheap=   0.1 MiB (gc forzado)
flag 1 · enrich 2ª pasada    29.55 ms   Δheap=   4.1 MiB (gc forzado)
max_rss_process            : 185.9 MiB   (pico del proceso node COMPLETO, no solo el adaptador)
invariantes 7/7            : true (misma referencia, sha in==out, N preservado, audit N/N, idempotente, sin executed:true)
```

Lectura honesta: el `audit` es **O(n) con coste ~0,04 ms/canal** (la suite lo declara a 20 000 canales: `0.0440 ms/canal`, `logs/node-suite.log`). `maxRSS` incluye la muestra sintética y el propio runtime de Node; **no** es la memoria del adaptador aislado. Memoria *delta* con GC forzado: 2,4 MiB en `enrich`, 0,1 MiB retenidos tras `audit` — no hay fuga medible a esa escala.

---

## 5 · Evidencia antes/después: lo previo sigue byte-idéntico

No ejecuté `git` (regla de la misión), así que la prueba equivalente es de bytes, no de diff:

| Fichero del pipeline | sha256 en `BASELINE.md` §8.1 | sha256 medido ahora | |
|---|---|---|---|
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | `aa37dd44765c988ac39a117810310b0f243cd5da4b84588deb3521e6aedc002d` | `aa37dd44…c002d` | **IDÉNTICO** |
| `frontend/js/ape-v9/ape-profiles-config.js` | `09110948342d744b8577ac74d8e0ea2cd7d6b7bb62ea7941597ad56dbcda5c11` | `09110948…c5c11` | **IDÉNTICO** |
| `frontend/js/ape-v9/profile-manager-v9.js` | `d1d16ad7e8f2dcc8ab677a906405be1fc20c9f54187484b249044a2265582ccf` | `d1d16ad7…82ccf` | **IDÉNTICO** |
| `frontend/index-v4.html` | `a6991020308b33d950aaadc7c6c963d0267a4fd4a4a5c9e56ecf62026c29cc8b` | `a6991020…9cc8b` | **IDÉNTICO** |

Además: `grep` sobre `frontend/**/*.{js,html,mjs}` solo encuentra `APE_4K6K` / `ape-4k6k-audit-adapter` **en los dos ficheros nuevos**; `index-v4.html` **no carga** el adaptador. Consecuencia medida: el generador emite exactamente lo de antes, y el flag apagado es inalcanzable desde la UI (no hay punto de cableado). El índice `.agents/skills_index.json` sí cambió, pero **aditivo y validado**: `308` entradas, `308` nombres únicos, `0` duplicados, `has_nueva=true`, `totals` cuadra (`308 = 17 anchors + 291 satellites`).

---

## 6 · NO COMPUTADO (con motivo exacto)

| # | Qué | Por qué NO COMPUTADO |
|---|---|---|
| N1 | Auditoría/parche end-to-end de la **lista de 754 MB** y de la lista protegida | Solo lectura permitida; además el script Python **escribe un fichero nuevo** (`auditar_y_ampliar.py:290-294`, con `os.chmod(temp, 0o600)` que en NTFS no se aplica) preservando las URLs del proveedor tal cual — URLs que en este ecosistema pueden llevar credenciales en la query. Esa escritura requiere autorización del operador. De la lista protegida solo se leyeron **512 B** para probar que el 206 existe. |
| N2 | Efecto en **VPS / nginx / systemd / player / ADB** | Misión prohíbe escribir en producción. No se desplegó nada; cualquier afirmación sería inventada. |
| N3 | El adaptador **cableado** al generador | No está cableado (0 referencias en `index-v4.html` y en `tools/`); cablearlo exige tocar `m3u8-typed-arrays-ultimate.js` e `index-v4.html`, prohibidos en esta tarea. Por tanto el flag apagado se cumple **por construcción**, no por ejecución del pipeline. |
| N4 | Calidad visual real 4K/6K, latencia, tiempo de arranque | Fuera de alcance: son metadatos `requested_only` / `executed:false`; ninguna prueba sintética acredita calidad de imagen. |
| N5 | `#EXTSHIMOTT` más allá del contrato + fixture | Se verificó contrato real (`additionalProperties===false`) y que la línea queda byte-idéntica; **no** se ejecutó un consumidor real del payload. |
| N6 | 17ª prueba Python en Windows | Falla por NTFS (§2.1). En Linux pasa. No se corrigió (prohibido por la misión). |
| N7 | `gate_ape_crystal_flow.sh` en verde | Falla por estado del VPS (§2.2), no se tocó. |
| N8 | `ape-device-health.sh` en verde | Falla por dispositivo ausente (§2.3), no se tocó. |
| N9 | `vps_jit/server.js` marcado `[DEGRADA]` por el gate anti-degradación | El propio gate lo declara **línea base conocida** (`conocidas en linea base: 16`) y aun así da `PASS=8 FAIL=0`. No es de esta integración ni se modificó. |

---

## 7 · Reproducción exacta

```powershell
# Raíz del workspace (los gates viven aquí, no en la subcarpeta)
cd C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION

# 1) suite de la skill (17 pruebas; en NTFS falla la del permiso POSIX → ver §2.1)
python -m unittest discover -s .agents/skills/ape-iptv-auditoria-4k-premium6k/scripts -p "test_*.py" -v

# 2) suite del adaptador (177 aserciones)
node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-4k6k-audit-adapter.test.js

# 3) sintaxis
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-4k6k-audit-adapter.js
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ape-4k6k-audit-adapter.test.js

# 4) no-regresión del flag y escala (verificadores de esta tarea)
node IPTV_v5.4_MAX_AGGRESSION/artifacts/integracion-4k6k/verificar_no_regresion_flag.js
node --expose-gc IPTV_v5.4_MAX_AGGRESSION/artifacts/integracion-4k6k/medir_escala_sintetica.js 5000

# 5) gates node
node tools/check_anti_degradation_policy.js
node tools/check_crystal_4k_law.js
node tools/check_crystal_6k_law.js
node tools/check_app_continuity_wiring.js

# 6) gates bash (WSL2; no hay bash nativo en Windows)
bash tools/quality/gate_no_focus_steal.sh
bash tools/quality/gate_ape_crystal_flow.sh --json
bash tools/ops/ape-device-health.sh

# 7) suite Python en filesystem POSIX (prueba de que el fallo es NTFS)
wsl bash -c 'SK=/mnt/c/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/.agents/skills/ape-iptv-auditoria-4k-premium6k; T=$(mktemp -d); cp -r "$SK/scripts" "$T/scripts"; rm -rf "$T/scripts/__pycache__"; cd "$T" && python3 -m unittest discover -s scripts -p "test_*.py" -v'
```

---

## 8 · Veredicto

- **Integración aditiva y apagada por defecto: VERIFICADA.** Con flag 0, `enrich` devuelve la misma referencia y el sha256 de entrada y salida coincide (`e2130d85…`); los 4 ficheros núcleo del pipeline conservan su sha256 de baseline; el adaptador no está cableado a nada.
- **Suite node (177 aserciones): 177/177 PASS, exit 0.**
- **Suite Python de la skill: 17/17 PASS en POSIX, 16/17 en NTFS** — único fallo reproducido y aislado como limitación de permisos de Windows, no de la integración.
- **Gates del repo: 5 de 7 en verde (exit 0 con sus totales).** Los 2 restantes fallan por hechos externos (lista obsoleta 404 + upstream `noplaylist` 451 en el VPS; dispositivo ADB ausente), reproducidos de forma independiente y sin relación con los ficheros de la integración.
- **0 fallos atribuibles a la integración.**
- **Pendiente real:** cablear el adaptador al generador (requiere autorización y tocar ficheros prohibidos aquí) — hasta entonces el flag apagado se cumple por ausencia de punto de invocación, no por ejecución.
