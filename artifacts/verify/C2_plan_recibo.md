# R16 — C2 del veredicto: versionar el recibo canary y re-emitirlo SOLO tras medir

`map-endpoint` · t46 · 2026-11-21. **No se tocó el VPS. No se re-emitió el recibo. No se cambió el gate.**

---

## 0. Estado de partida y qué bloqueaba C2

C2 (gate `tools/quality/check_jit_deploy_parity.js`) compara el `motor.sha256` del recibo canary con el
sha del fichero que despliega el manifiesto. Estaba en **NO COMPUTADO** por **dos** razones:

| # | razón | estado antes | estado ahora |
|---|---|---|---|
| 1 | el recibo es del **2026-11-12** y el canónico cambió el **2026-11-21** | NO COMPUTADO por antigüedad | **igual** (correcto: no se puede atestiguar el futuro) |
| 2 | el recibo estaba **ignorado por git** (`.gitignore:173 deliverables/`) → en CI **no existía** | NO COMPUTADO por **ausencia** | **RESUELTO**: versionado, C2 vuelve a dar la razón exacta por antigüedad |

Prueba de la razón 2 (antes):

```
$ git check-ignore -v docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json
.gitignore:173:deliverables/   docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json
```

Y el gate, en un checkout limpio, habría caído en la rama `no existe …` (`check_jit_deploy_parity.js:159-161`),
no en la de antigüedad (`:194-198`).

---

## 1. (a) Excepción mínima en `.gitignore` — aplicada y verificada

**Trampa medida primero:** la negación de una sola línea **NO funciona**. Git no re-incluye un fichero si su
directorio padre está excluido. Lo probé dejando sólo `!docs/canary/deliverables/12_…json`:

```
$ git check-ignore -v docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json
.gitignore:173:deliverables/   docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json   ← sigue ignorado
```

**Forma que sí funciona** (3 líneas: re-incluir el directorio, re-ignorar su contenido, abrir sólo el recibo):

```diff
 deliverables/
+# ── [R16 2026-11-21] EXCEPCION MINIMA: el recibo canary SE VERSIONA ──────────────────
+# Motivo medido: con `deliverables/` a secas, el recibo no entra al repo y en CI no
+# existe -> C2 caia en NO COMPUTADO por AUSENCIA, no por antiguedad.
+# Git NO re-incluye un fichero si su directorio padre esta excluido, asi que la
+# negacion de una sola linea NO funciona (medido: seguia ignorado). Hay que
+# re-incluir el directorio, re-ignorar su contenido y abrir SOLO este fichero.
+!docs/canary/deliverables/
+docs/canary/deliverables/*
+!docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json
 artifacts/
```

Verificación (exit codes reales, `git check-ignore -q`: **0 = ignorado**, **1 = NO ignorado**):

```
recibo      → exit 1  (ya NO ignorado)          ← el objetivo
01_…pdf     → exit 0  (SIGUE ignorado)          ← no se abrió el directorio entero
11_…json    → exit 0  (SIGUE ignorado)          ← ni los demás JSON
```

Y en `git status`, el directorio sólo muestra el recibo:

```
$ git status --short --untracked-files=all -- docs/canary/deliverables/
A  docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json
```

**Blast radius:** de 8 ficheros del directorio, 7 siguen ignorados (PDFs de 1,6 MB, patch, JSONs). Sólo el
recibo entra al repo.

> **Alternativa propuesta (NO aplicada, decisión del operador):** mover el recibo a una ruta no ignorada,
> p. ej. `artifacts/canary/12_CANARY_DEPLOYMENT_RECEIPT.json`, y apuntar el gate allí. **No lo hice** porque
> (i) cambiar la ruta del recibo en el gate roza lo prohibido ("cambiar el gate para que C2 pase") y (ii) el
> `.gitignore` ya ignora `artifacts/` (ver §5), así que habría que abrir otra excepción igual. La excepción
> de 3 líneas es la de menor superficie.

---

## 2. (b) Recibo HISTÓRICO versionado — sin re-emitir

Se versiona el recibo **tal como está**, con su contenido del 2026-11-12 intacto:

| campo | valor |
|---|---|
| ruta | `docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json` |
| bytes | **28 593** |
| sha256 | `c52a8e8f8e93119886ac582643aedc69b0b28e3dfd506283e29dbe8be2ed09f8` |
| blob en el índice | `d370860ab2a23260e4ec37d9a4063fb7ce021477` (modo 100644) |
| clave de despliegue | `deployment_2026_11_12` |
| motor declarado | `/opt/ape-jit/server.js` · **449 392 B** · `290b1103…aeb492` · `sha_en_origen_y_destino: true` |

`git ls-files --error-unmatch` → OK: **en un checkout limpio el fichero existirá**, que es lo que arregla la
razón 2. Efecto en el gate, medido después:

```
[NO COMPUTADO] C2 — el recibo canary (2026-11-12) es ANTERIOR a los bytes actuales del canonico (2026-11-21):
                pinea 290b1103… y atribuye la instalacion a tools/lab/ape-jit/server.js, mientras el
                manifiesto despliega ad37d894… · RESULTADO: 0 FALLA · 1 NO COMPUTADO · exit 2
```

Es exactamente el mensaje que queremos: **razón exacta**, no "ausente". El contenido NO se tocó.

---

## 3. (c) Emisor del recibo: `tools/quality/emit_canary_receipt.js`

**No se ejecutó contra el recibo real.** Dry-run por defecto; escribe sólo con `--write --confirm-deployed`
y `--receipt <copia>` en las pruebas.

### 3.1 Contrato que el gate lee (con líneas del gate)

| el gate busca | dónde | línea |
|---|---|---|
| objeto `motor` con `path === '/opt/ape-jit/server.js'` y `sha256` | en cualquier nivel, profundidad ≤ 6 | `check_jit_deploy_parity.js:132-140,169-170` |
| (opcional) fila con `destination === DEST` → `source`, `source_sha256` | arrays anidados | `:142-155,172-178` |
| antigüedad: clave `deployment_YYYY_MM_DD` **de fecha mayor** | nivel superior | `:110-116,193` |
| fecha de los bytes: **último commit** del canónico | git | `:119-126,194` |
| PASS ⇔ `motor.sha256 === sha del manifiesto` | | `:188-200` |

### 3.2 Guardas (fail-closed) — probadas

| guarda | condición | prueba ejecutada | salida |
|---|---|---|---|
| G1 | `--measured-sha` == **los dos** `SHA_PIN` de `deploy-vps.yml` | sha inventado `1111…` | `ABORTA: … NO es el pin del workflow` · exit 1 |
| G2 | `--measured-sha` == **blob de HEAD** del canónico | (cubierto en dry-run) | `blob HEAD: ad37d894… (coincide)` |
| G3 | fecha del recibo **≥** último commit del canónico | `deployment_2026_11_12` | `ABORTA: 2026-11-12 es ANTERIOR al commit (2026-11-21)` · exit 1 |
| G4 | sin `--confirm-deployed` no se escribe | `--write` sin la bandera | `ABORTA: …` · exit 1 |
| G5 | procedencia obligatoria | sin `--measured-from/--measured-output` | exit 2 |
| G6 | **auto-verificación** del JSON final (ver §3.3) | — | aborta si el gate leería otro motor |
| G7 | idempotencia: si el despliegue ya declara el mismo sha | — | `YA ATESTIGUADO … No se escribe` · exit 0 |

### 3.3 El bug que encontró la prueba (importa para el paso 3)

`findMotorBlock` del gate **recorre las claves en orden y devuelve el PRIMER `motor`** con `path === DEST`.
Mi primera versión añadía `deployment_2026_11_22` **al final** del objeto: el gate seguía leyendo el motor del
**2026-11-12** (`290b1103`) y, con la fecha ya actualizada a 2026-11-22, C2 habría pasado de NO COMPUTADO a
**FALLA** — con una medición correcta. Medido en la réplica:

```
antes:  primer_motor_sha=290b1103…  receipt_date=2026-11-22  → C2_seria_PASS=false  (FALLA)
después: primer_motor_sha=ad37d894… receipt_date=2026-11-22  → C2_seria_PASS=true
```

Corregido en el emisor: **la clave nueva va PRIMERA** (`const next = { [deploymentId]: node }; …`) y el
script **relee el JSON que va a escribir y comprueba con la misma lógica del gate** que el primer `motor` es
el medido y que la fecha que C2 calculará es la del despliegue. Si no cuadra, **no escribe**.

> **Deuda declarada del gate (NO corregida aquí):** `findMotorBlock` es dependiente del orden de claves. Es
> frágil por diseño. Se puede arreglar sin relajar nada (p. ej. elegir el `motor` del `deployment_*` de fecha
> mayor), pero eso **es cambiar el gate** — prohibido en esta tarea. Queda como propuesta para R17.

### 3.4 Comando exacto del paso (3) — cuando el motor YA esté desplegado y medido

```bash
# (2) medir por SSH lo que realmente corre (SOLO LECTURA)
SHA=$(ssh root@VPS 'sha256sum /opt/ape-jit/server.js' | cut -d' ' -f1)
B=$(ssh root@VPS 'stat -c %s /opt/ape-jit/server.js')

# (3) re-emitir con la medición en la mano (dry-run primero)
node tools/quality/emit_canary_receipt.js \
  --measured-sha "$SHA" --measured-bytes "$B" \
  --deployed-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --deployment-id "deployment_$(date -u +%Y_%m_%d)" \
  --measured-from 'ssh root@VPS: sha256sum /opt/ape-jit/server.js' \
  --measured-output "$SHA  /opt/ape-jit/server.js" \
  --service active --listener-3099 1 --health 200 \
  --run <run_id del workflow> --ref <rama> --commit <sha corto> --backup-stamp <stamp>

# si el plan cuadra:
node tools/quality/emit_canary_receipt.js <mismos args> --confirm-deployed --write
node tools/quality/check_jit_deploy_parity.js   # C2 debe pasar a PASS
```

Campos que escribe (sólo los medidos; lo no medido se omite en vez de inventarse):

```json
"deployment_YYYY_MM_DD": {
  "run": "...", "ref": "...", "commit": "...", "mode": "deploy", "backup_stamp": "...",
  "motor": { "path": "/opt/ape-jit/server.js", "bytes": 490421,
             "sha256": "ad37d894…", "sha_en_origen_y_destino": true,
             "servicio": "active", "listener_3099": 1, "health_interno": 200 },
  "deployed_at_utc": "2026-11-22T00:15:00Z",
  "measured_from": [{ "command": "ssh root@VPS: sha256sum /opt/ape-jit/server.js",
                      "output": "ad37d894…  /opt/ape-jit/server.js", "at_utc": "…" }]
}
```

La historia **no se pierde**: `deployment_2026_11_12` sigue en el fichero (y en el historial de git).

---

## 4. Secuencia correcta (orden que NO se puede invertir)

```
(0) operador autoriza el deploy            ← Environment "production" del workflow
(1) desplegar el motor (ad37d894)          ← deploy-vps.yml:761-789 (canónico + pin)
(2) medir por SSH: sha256 + bytes + servicio + listener     [sólo lectura]
(3) emit_canary_receipt.js con ESA medición   → C2 pasa a PASS
```

Si se invierte (re-emitir antes de desplegar) se atestiguan bytes que nunca corrieron: el emisor lo impide
por construcción — G1 exige que el sha medido sea el **pin**, y G2 que sea el **blob commiteado**; ninguna de
las dos se puede cumplir "de memoria".

---

## 5. Hallazgo colateral, misma clase de bug

`.gitignore:174` es `artifacts/` → **todo `artifacts/verify/*` que se cree de ahora en adelante queda
ignorado** y no entra en el commit sin `git add -f`. Los que ya están en el repo se salvan porque están
trackeados (la regla no afecta a ficheros ya versionados). Medido:

```
$ git check-ignore -v artifacts/verify/playlist_gigante.md
.gitignore:174:artifacts/   artifacts/verify/playlist_gigante.md     ← entregable de R14, ignorado
$ git check-ignore -v artifacts/verify/copias_server_js.md
(sin salida: ya está trackeado, por eso no se ignora)
```

Es la **misma causa raíz** que bloqueaba C2: evidencia que no puede entrar al repo. Este entregable se ha
añadido con `git add -f` (es el único camino sin abrir otra excepción). **Propuesta:** decidir si `artifacts/`
debe seguir ignorado (entonces todo entregable necesita `-f`, y hay que decirlo en el flujo) o abrir
`!artifacts/verify/` de forma explícita. No lo cambio aquí: fuera de alcance.

Nota menor: `.gitignore:169` es `"/ 2"` — un patrón frágil que parece residuo de un conflicto. Inofensivo
(ignora una ruta llamada ` 2`), pero conviene limpiarlo.

---

## 6. NO COMPUTADO (con razón)

1. **Qué bytes corren hoy en `/opt/ape-jit/server.js`** — el capitán midió `268bbd3a` (480 976 B) el
   2026-11-21 21:39/22:02 UTC, **antes** del commit `6ddd7b00` (22:58 UTC) que movió el canónico a
   `ad37d894`. No lo re-medí: esta tarea prohíbe tocar el VPS. Es el dato que el paso (2) debe refrescar.
2. **Que C2 pase a PASS** — no se puede demostrar sin el despliegue: depende de bytes que aún no están en el
   VPS. Lo máximo verificable hoy es la **réplica de la lógica del gate** sobre un recibo de prueba (C2
   sería PASS con `motor.sha256=ad37d894` y `deployment_2026_11_22`), no el gate real.
3. **Que el workflow de deploy acepte el recibo re-emitido** — no se lanzó ningún workflow (fuera de R16).

---

## 7. Ficheros tocados

| fichero | cambio |
|---|---|
| `.gitignore` | +7 líneas: excepción de 3 patrones + 4 de comentario (motivo y trampa medidos) |
| `docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json` | **versionado** (contenido intacto, sha `c52a8e8f…`, 28 593 B) |
| `tools/quality/emit_canary_receipt.js` | **nuevo**: emisor con 6 guardas + auto-verificación de orden |
| `artifacts/verify/C2_plan_recibo.md` | este informe (añadido con `git add -f`: ver §5) |

**Conteo:** 1 bloqueo resuelto (ausencia) · 1 bloqueo que sigue y **debe** seguir (antigüedad) · 4 guardas +
1 auto-verificación probadas · 1 bug de orden encontrado y corregido antes de tocar el recibo real ·
0 fabricaciones · 0 cambios en el gate · 0 accesos de escritura al VPS.
