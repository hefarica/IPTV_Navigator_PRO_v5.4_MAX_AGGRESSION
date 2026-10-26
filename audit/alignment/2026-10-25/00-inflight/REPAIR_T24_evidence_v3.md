# REPAIR t24 — evidencia para el commit v3 de `ape-meta-public.conf` (NO commiteado por mí)

> **Estado:** `BLOCKED_BY_CONCURRENT_REMEDIATION` — no por una escritura observada, sino por **propiedad**:
> `t22` (vps-edge) sigue `in_progress` y es el **owner** de `_vps_stage/public/ape-meta-public.conf` y de
> `_vps_stage/nginx/meta-plane.conf`. Instrucción del capitán (D-62): *«Tú no commiteas: deja la evidencia
> y el comando propuesto»*.
>
> **Tarea:** t24 (repair, ronda 2, fixes de t20/F1) · attempt `234e1aa4-5823-490f-b39f-7cfa45f29221`
> **Ventana:** `2026-10-25T23:42:41` → `23:43:48` (America/Bogota) = `04:42:45Z` → `04:43:52Z`

---

## 0 · Transparencia primero: hice un commit y lo revertí

**Antes** de que llegara tu mensaje (el mensaje entró entre mi `git commit` y el `git push`), creé el commit
local `b4c6008f01327a85da8ae1b00e33ecdd4ab128a9` — `fix(nginx): mirror live ape-meta-public v3
(proxy_read_timeout 20s -> 60s)`, **1 archivo, +1/−1**.

Al recibir tu instrucción lo **revertí de inmediato**, y **nunca se publicó**:

| Comprobación | Resultado |
|---|---|
| ¿Llegó a `origin`? | **NO** — `git ls-remote origin` devolvía `ffb01e66…` **antes** del reset, y sigue devolviéndolo |
| `git reset --soft HEAD~1` + `git restore --staged` | HEAD vuelve a `ffb01e6650c17f799da6cbbb9fff782a668b88ea` (= origin) |
| ¿Se tocó el contenido del archivo? | **NO** — sigue `2509 B / A39E8DE9… / mtime 23:37:46` (la escritura de T22) |
| Estado git del archivo | vuelve a ` M`, **0 archivos staged** |
| El objeto `b4c6008` | queda *dangling* en el reflog local (recuperable ~90 días); **no** está en `HEAD` ni en `origin` |

Si tu pase de docs prefiere que ese commit exista, el comando de abajo lo reproduce en 3 líneas.

---

## 1 · Lo que encontré: el contenido YA está bien, lo que falta es el commit

El objetivo del contrato («dejar en el repo el contenido exacto de lo que corre») **ya está satisfecho por
el trabajo de T22**, no por mí:

| Artefacto | Bytes | SHA-256 | mtime | Estado |
|---|---|---|---|---|
| `_vps_stage/public/ape-meta-public.conf` (repo, worktree) | 2509 | `A39E8DE902CF5449553822EB1682D1A9D481390C1CE136A218D91FBE1EE4AC39` | 23:37:46 | ` M` (sin commitear) |
| `/etc/nginx/snippets/ape-meta-public.conf` (VPS live) | 2509 | `A39E8DE9…` **idéntico** | `2026-10-26 04:37:14Z` | vivo |
| `HEAD:_vps_stage/public/ape-meta-public.conf` (commit `ffb01e6`) | 2509 | `0A4002166054834C756D5451DA49F8E9AA6327F5672A1E625A9C044DF9FF91DE` | v2 de `3de6b0a` | commiteado, **obsoleto** |
| `/root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z` | 2509 | `0A400216…` (= v2) | dir `04:37:03Z` | backup |

- **`proxy_read_timeout` en el worktree: `60s`** (L25). En el blob commiteado: `20s`.
- `git diff` del archivo = **exactamente 1 línea**: `- proxy_read_timeout 20s;` / `+ proxy_read_timeout 60s;`
- `git status --porcelain` = ` M _vps_stage/public/ape-meta-public.conf` (un solo archivo; índice limpio).

**Conclusión:** no hay nada que editar. Editar el espejo sería duplicar a T22 (instrucción 2 del capitán).

---

## 2 · Dos mediciones del VPS separadas 67 s (regla 1 del capitán: T22 sigue `in_progress`)

| # | Hora UTC | Live SHA-256 | Bytes | mtime del fichero vivo | backup `.bak_20261026T043703Z` |
|---|---|---|---|---|---|
| 1 | `2026-10-26T04:42:45Z` | `a39e8de902cf5449553822eb1682d1a9d481390c1ce136a218d91fbe1ee4ac39` | 2509 | `04:37:14.406976410Z` | `0a400216…` · 2509 B · mtime `2026-10-25 18:07:04Z` |
| 2 | `2026-10-26T04:43:52Z` | `a39e8de9…` (**idéntico**) | 2509 | `04:37:14.406976410Z` (**sin cambio**) | `0a400216…` (**idéntico**) |

**Lectura honesta:** en la ventana de 67 s **no se observó ninguna escritura** (mtime del fichero vivo
clavado en `04:37:14Z`). Eso **no** me autoriza a declarar el estado «estable»: la remediación T22 sigue
abierta y es la dueña del archivo. Por eso reporto `BLOCKED_BY_CONCURRENT_REMEDIATION` **por propiedad**,
no por escritura detectada — y con las dos fotos fechadas para que se pueda re-evaluar sin repetir trabajo.

Evidencia del directorio de backups (contexto de la carrera, medición 1):

```text
2026-10-26 04:37:03.547878508Z  .                          <- /root/nginx-bak creado
2026-10-26 04:37:03.547878508Z  .last_ts2                  <- marcador de esta pasada
2026-10-24 17:59:36.904964754Z  50-ape-meta-plane.conf.bak_20261026T043331Z   10939 B
2026-10-25 18:07:04.138271850Z  ape-meta-public.conf.bak_20261026T043703Z      2509 B
2026-10-26 04:33:31.553040338Z  .last_ts                   <- pasada anterior (conf.d)
```

→ confirma lo que dije en t20: entre `04:37:03Z` (backup del v2) y `04:37:14Z` (escritura del 60 s) hay
**11 s**, y el `.bak` de ese instante es **exactamente el blob `0a400216…` del commit `3de6b0a`**.

---

## 3 · Efecto concreto si alguien restaura desde git (el riesgo que esta tarea cierra)

```text
git checkout ffb01e6 -- _vps_stage/public/ape-meta-public.conf   (o un checkout del repo)
  -> instala el blob 0A400216… = proxy_read_timeout 20s
  -> producción baja de 60s a 20s  ⇒ por debajo del piso autopista (>= 60s, CLAUDE.md)
     y además NO reproduce el estado real: el VPS sigue en 60s
```

Un `restore` **no** reintroduce el 404 de `/cdn/` (eso lo arregló la v2), pero **degrada el timeout**. El
riesgo es de trazabilidad y de regresión doctrinal, exactamente como quedó en `X-010`.

---

## 4 · Comando propuesto (lo ejecuta quien tenga la propiedad: T22 o el capitán)

```bash
# 1. verificar que el espejo sigue siendo el vivo (las 3 fuentes deben dar A39E8DE9…)
git show HEAD:_vps_stage/public/ape-meta-public.conf | sha256sum   # -> 0A400216… (v2, obsoleto)
Get-FileHash _vps_stage/public/ape-meta-public.conf -Algorithm SHA256   # -> A39E8DE9… (worktree)
ssh hetzner-iptv "sha256sum /etc/nginx/snippets/ape-meta-public.conf"   # -> A39E8DE9…

# 2. commit quirúrgico de UN archivo (nunca `git add -A`)
git add -- _vps_stage/public/ape-meta-public.conf
git diff --cached --name-status          # debe listar EXACTAMENTE 1 archivo: M
git commit -F <mensaje>                  # ver §5
git show --stat --oneline HEAD           # 1 file changed, 1 insertion(+), 1 deletion(-)

# 3. publicar y verificar
git push origin HEAD:refs/heads/feat/adb-generic-visual-enhancement-installer   # sin --force
git ls-remote origin refs/heads/feat/adb-generic-visual-enhancement-installer  # == git rev-parse HEAD

# 4. re-verificación de aceptación (los 3 comandos del contrato)
git show <sha>:_vps_stage/public/ape-meta-public.conf | sha256sum                          # (a)
ssh hetzner-iptv "sha256sum /etc/nginx/snippets/ape-meta-public.conf"                      # (b)
ssh hetzner-iptv "sha256sum /root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z"     # (c)
```

> En Windows, `git show <sha>:<path> | sha256sum` no existe nativamente: el equivalente byte-exacto usado
> en t20/t24 es `cmd /c "git show <sha>:<path> > %TEMP%\blob"` + `Get-FileHash`.

---

## 5 · Mensaje de commit propuesto (listo para `git commit -F`)

```text
fix(nginx): mirror live ape-meta-public v3 (proxy_read_timeout 20s -> 60s)

El VPS reescribio /etc/nginx/snippets/ape-meta-public.conf a las
2026-10-26T04:37:14Z subiendo proxy_read_timeout de 20s a 60s, que es el
piso doctrinal del repo (autopista: proxy_read_timeout >= 60s). Bytes vivos:
2509 B, sha256 a39e8de902cf5449553822eb1682d1a9d481390c1ce136a218d91fbe1ee4ac39.

El repo quedaba en la v2 (commit 3de6b0a, blob 0a400216..., 20s), asi que un
restore desde git degradaba produccion por debajo del piso.

Verificado (3 fuentes): repo A39E8DE9... / VPS A39E8DE9... / bak 0A400216...
(este ultimo = v2 previo, /root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z).

Cambio quirurgico: 1 archivo, 1 linea. NO se toca el VPS (espejo documental:
0 reload, 0 restart, 0 scp).
Evidencia: audit/alignment/2026-10-25/00-inflight/REPAIR_T24_evidence_v3.md
Cierra: t20 / F1 (X-010).
```

---

## 6 · Observaciones que NO son blockers (quedan para el pase de docs, D-63)

| ID | Observación | Por qué no la toco |
|---|---|---|
| **F2** | `COMMIT_READY.md` no documenta el rollback del snippet ni cita `ape-meta-public.conf.bak_20261026T043703Z`; el patrón existe en `VPS_REMEDIATION_LOG.md` L286 para **otro** archivo | el contrato de t24 excluye F2 explícitamente («necesita decisión humana»); el bloque de rollback propuesto está en §4 y en mi review de t20 |
| **F3** | El diff de la v2 eliminó `client_max_body_size 1m;` y el mensaje no lo menciona | fuera del contrato de t24; es higiene de documentación, no un defecto funcional |
| F4 | El valor `20s` del blob commiteado está bajo el piso de 60 s | se cierra con el commit de §4 |

---

## 7 · Discrepancia en el contrato automático (para que no se propague)

El criterio de aceptación generado dice *«…el mapa commit↔producción con el timestamp
**2026-10-26T04:14Z**…»*. **La medición real es `2026-10-26T04:37:14Z`** (dos fuentes: `stat` del fichero
vivo en dos mediciones y el `mtime` del `.bak` a `04:37:03Z`). `04:14Z` no aparece en ninguna evidencia:
es un error de transcripción del generador del contrato. **Uso siempre `04:37:14Z`**; si el pase de docs
copia `04:14Z`, introduce una fecha que nadie puede verificar.

---

## 8 · Atestación

- **VPS:** solo `sha256sum`, `stat`, `date`, `ls`, `grep -n`. **0** `scp`, **0** `rsync`, **0** reload,
  **0** restart, **0** `sed -i`, **0** escrituras. El VPS **no se tocó**.
- **Repo:** `git show/status/diff/ls-remote/rev-parse/reset/restore` + escritura de **este** documento.
  Un commit local **creado y revertido** (§0), **nunca publicado**.
- **Espejos de T22:** no editados (`_vps_stage/public/ape-meta-public.conf` y
  `_vps_stage/nginx/meta-plane.conf` intactos, mtimes 23:37:46 / 23:36:52).
