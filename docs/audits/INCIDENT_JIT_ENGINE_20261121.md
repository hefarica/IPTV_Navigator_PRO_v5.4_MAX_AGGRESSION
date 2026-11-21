# INCIDENTE · Motor JIT: cuatro identidades, un deploy que instaló el stub

**Fecha:** 2026-11-21 · **Rama:** `deploy/engine-restart-20261112` · **Entorno:** producción `iptv-ape.duckdns.org`

Este documento existe porque el incidente ocurrió y porque el sistema que lo permitió
sigue armado en la rama por defecto. Todo lo que sigue está medido; lo que no se midió
se declara al final.

---

## 1 · Lo que se descubrió antes de tocar nada

El motor JIT tenía **cuatro identidades distintas**, y ninguna era "el motor":

| artefacto | sha256 (16) | líneas | bytes | fecha |
|---|---|---|---|---|
| recibo canary r1 | `8c1a0085` | — | 468 210 | 2026-11-14 |
| `tools/lab/ape-jit/server.js` | `38c92b56` | 9 696 | 474 044 | 2026-11-15 |
| `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` | `a3c671a2` | 9 707 | 474 767 | 2026-11-21 |
| `/opt/ape-jit/server.js` (**en ejecución**) | `44d8bf84` | 9 801 | 480 253 | — |
| `vps_jit/server.js` (**fuente del workflow de deploy**) | `e400fa19` | 662 | 29 624 | 2026-11-02 |

`vps_jit/server.js` tiene **5 rutas** (`/capabilities.json`, `/catalog.json`, `/crystal.json`,
`/health`, `/playlist.m3u8`) y su propio `/capabilities.json` declara
`processing_domain: "vps_jit_legacy"`. **No es el motor de imagen: es el programa legacy.**

## 2 · La forma real de la divergencia

Los dos artefactos grandes no son versiones uno del otro: son **ramas hermanas** de un
ancestro común (`tools/lab`) que crecieron en direcciones opuestas.

```
tools/lab (ancestro)
  ├─ producción  = ancestro + 105 líneas   → POST /image/streaming-health-llm (objetivo 2026-11-16)
  └─ repo        = ancestro + 15/−4 líneas → piso de buffer 24 s · X-Buffer-Min 62.5 % · segment duration dinámico
```

Medido con `git diff --no-index --numstat`:
`prod vs tools/lab = 105/0` (superset estricto) · `repo vs tools/lab = 15/4` · `prod vs repo = 109/15`.

**Ninguna contiene a la otra.** Canonizar cualquiera de las dos por separado pierde trabajo:
una pierde el endpoint que el operador pidió el 2026-11-16; la otra pierde el trabajo de buffer
que ataca el rebuffering (0,80 % → objetivo 0,40 % → 0,30 %).

## 3 · La decisión: unión medida

`git merge-file` a 3 vías sobre el ancestro → **0 conflictos**.

| comprobación | resultado |
|---|---|
| `node -c` | OK |
| arranque real en `127.0.0.1:3199` | `LISTEN` ok |
| `/health` | `{"ok":true,…}` |
| `/capabilities.json`, `/image/lineup` | 200 |
| `POST /image/streaming-health-llm` con medición | 200 (y `400` sin medición) |
| `check_buffer_contract.js --jit <unión>` | **27 PASS / 0 FAIL** |
| `check_buffer_contract.js --jit <lo que corría>` | **23 PASS / 4 FAIL** |
| `test_canary_jit_contract.js` | **92/92 PASS** |

Canónico: `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js`, 9 812 líneas, 480 976 B,
sha256 `268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0`.

> **Trampa de bytes que casi se despliega:** el primer hash calculado (`24b02cea`) era del
> fichero de trabajo con **CRLF**. El repo normaliza a LF (`.gitattributes: text, eol=lf`), así
> que el blob real pesa 480 976 B y no 490 788 B. Pinear el hash del CRLF habría hecho fallar
> el gate en CI **aunque producción estuviera correcta**.

## 4 · Los tres punteros que había que mover juntos

1. `_vps_stage/deploy/manifest.tsv` fila 59 → ahora apunta al canónico.
2. `.github/workflows/deploy-streaming.yml` y `deploy-streaming-main.yml` → instalaban
   `vps_jit/server.js`. Ahora instalan el canónico, con guard de encogimiento y **rollback
   automático** si `/health` no responde en 20 s.
3. `contracts/canary_jit_contract_v1.json` → revisión 2 con path/sha/manifest **re-medidos**
   (y bloque `rebaseline` con evidencia y `not_measured`).

El test dejó de duplicar el sha del motor como literal: ahora lo lee del contrato
(`ENGINE_SHA`). Antes, re-pinear el contrato dejaba al propio test apuntando al motor viejo.

## 5 · El incidente

**Qué pasó.** Al despachar el deploy con `gh workflow run` **sin `--ref`**, el run salió de la
rama por defecto (`a344bf7a`), que todavía tiene el workflow viejo. Ese workflow hizo
`scp vps_jit/server.js` (29 624 B) sobre `/opt/ape-jit/server.js` y reinició el servicio:

```
/opt/ape-jit/server.js → e400fa19…  29624 B  mod=2026-11-21 21:37:57
backup automático:      /root/ape-jit-server.20261121T213757Z.bak  (480253 B)
```

El servicio quedó `active` y `/health` daba 200 — **el stub también tiene `/health`**. Las 56
rutas de imagen (`/image/*`, `/jit/*`) desaparecieron.

**Contención (medida).** Se instaló el canónico desde el repo, se reinició y se verificó:

```
/opt/ape-jit/server.js → 268bbd3a…  480976 B   service: active
pid 1377447  Sat Nov 21 21:38:47 2026  /usr/bin/node /opt/ape-jit/server.js
/health 200 · /capabilities.json 200 · /image/lineup 200 · /image/state 200 · /image/matrix 200
POST /image/streaming-health-llm 200  ({"source":"llm","verdict":{"state":"SUB_GATE",…}})
```

Rollback disponible en todo momento: `/root/ape-jit-server.20261121T213757Z.bak` (480 253 B).

## 6 · Lo que queda abierto (y no es del motor)

El workflow auditado (run `44952645689`, ref `63807eed`) dejó `Upload JIT server` en **success**
y falló solo en `Verify 200/206/302 and headers` (23 comprobaciones: 8 PASS / 15 FAIL).
**Los fallos no salen del motor**, medido:

```
http://127.0.0.1:3099/jit/live/1080/media_0.m3u8   → 404 "not found"      (el motor no tiene esa ruta)
https://iptv-ape.duckdns.org/jit/live/1080/media_0.m3u8 → 503 "PROVIDER_SLOT_BUSY: use provider-direct; source unchanged"  server: nginx
```

El 503 lo emite nginx (slot de proveedor), no Node. Además `/opt/ape-jit/channels.json` **no
existe** — el motor arranca sin mapa (`active:null`). Ese plano (HLS/DASH/CMAF de proveedor) es
otro sistema y no se tocó aquí.

Riesgos vigentes:

- **La rama por defecto sigue armada**: un `gh workflow run deploy-streaming.yml` sin `--ref`
  repite exactamente el incidente de las 21:37. Mientras no se mergee esta rama, despachar
  siempre con `--ref deploy/engine-restart-20261112`.
- `ape-jit-reconcile.service` sigue abortando (fail-closed) al comparar 11 222 canales contra
  21 224: no publica y el mapa queda intacto. El operador declaró el 2026-11-21 que la
  asignación de canales no es la prioridad; lo que importa es **la manera de armar los listados**.

## 7 · No medido (declarado)

- `/opt/ape-jit/channels.json`: no se inspeccionó (de hecho no existe); el canónico se probó con
  el mapa ausente.
- De las 61 rutas sólo se ejercitaron `health`, `capabilities.json`, `lineup`, `state`, `matrix`
  y `streaming-health-llm`.
- **No se hizo A/B contra el backup** para atribuir los 15 fallos de verificación: la atribución
  se sostiene en que el 503 lleva cuerpo y cabecera de nginx y en que esa ruta da 404 contra el
  motor.
- Nada de esto prueba calidad de imagen ni ausencia de freeze en un player real. El contrato de
  buffer (27/27) prueba la **lógica de buffer del motor**, no el comportamiento en pantalla.
