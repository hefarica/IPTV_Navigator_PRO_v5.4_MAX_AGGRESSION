# REVIEW t20 — T15 «commit v2 de `ape-meta-public.conf`» (independiente)

> **Revisor:** `coord-sesiones` · tarea **t20** (attempt `fa793bd0-06b7-49f8-a30f-dfbf2b998bdc`)
> **Revisado:** t15 — commit `3de6b0a51012425f9ea9aff79940847c8b394c73`
> **Ventana de medición:** `2026-10-25T23:37:33` → `23:39` (America/Bogota)
> **Naturaleza:** revisión **de solo lectura**. No modifiqué el commit, el repo, ni el VPS.
>
> ## VEREDICTO: `needs_revision`
>
> **No por un defecto de T15**: el commit es técnicamente correcto y su blob es exactamente el que se
> afirma. Falla **un** criterio de aceptación (el nº 2) porque **producción cambió 11 segundos antes de
> mi medición**, y el commit quedó 40 s por debajo de la doctrina autopista. Detalle en §3 y §5.

---

## 1 · Criterios de aceptación — resultado

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | El commit existe en `origin/feat/adb-generic-visual-enhancement-installer` y su blob mide **2509 B** con sha256 **`0a400216…91de`** | ✅ **PASS** | objeto `commit` presente; `git merge-base --is-ancestor` → `True`; `git branch -r --contains` → `origin/feat/…`; blob extraído y hasheado byte a byte: **2509 B / `0A4002166054834C756D5451DA49F8E9AA6327F5672A1E625A9C044DF9FF91DE`** |
| 2 | Contra el VPS real, el sha256 **sigue siendo** `0a400216…` y 2509 B → el commit refleja producción | ❌ **FAIL (medido)** | live = **`a39e8de902cf5449553822eb1682d1a9d481390c1ce136a218d91fbe1ee4ac39`**, 2509 B, mtime `2026-10-26 04:37:14Z`. Diferencia textual: **1 línea** (`proxy_read_timeout 20s` → `60s`). Producción era exactamente `0a400216…` hasta las `04:37:03Z` (§2) |
| 3 | El commit toca **exactamente 1 archivo**, sin secretos, y el mensaje explica el riesgo de rollback (404 de `/cdn/`) | ✅ **PASS** | `--stat`: `1 file changed, 10 insertions(+), 2 deletions(-)`; 10 patrones de secreto → **0 coincidencias**; el mensaje dice: *«El repo tenia la v1 (2091 B, adbf3e56…) identica al .bak_20261025T180653 del VPS, asi que un restore desde git reintroducia el bug»* |
| 4 | El rollback documentado es ejecutable (`/root/nginx-bak/` + `nginx -t` + reload), sin comandos inventados | ⚠️ **PASS con reserva** | El comando real existe y es correcto **pero en otro documento** (`VPS_REMEDIATION_LOG.md` L286); `COMMIT_READY.md` **no** documenta el rollback del snippet. Los ingredientes existen y `nginx -t` pasa hoy (§4) |

**3 PASS · 1 FAIL · 1 PASS-con-reserva.** Un criterio fallido ⇒ `needs_revision` (no `pass`).

---

## 2 · El hallazgo que decide el veredicto: producción se movió a las 23:37:03

Secuencia medida (todo solo lectura):

| Hora (Bogotá) | Hecho | Evidencia |
|---|---|---|
| 23:14:32 | t15 escribe su evidencia `COMMIT_READY.md` | mtime, 20.727 B, sha256 `B725EF6CF356EA1D…` |
| 23:15:59 | se crea el commit `3de6b0a` | `%ad` del commit |
| — | El VPS corre **exactamente** el contenido del commit | `.bak_20261026T043703Z` = **`0a400216…91de` / 2509 B** |
| **23:37:03** | **se respalda** el fichero vivo → `ape-meta-public.conf.bak_20261026T043703Z` | `ls -la /root/nginx-bak/` |
| **23:37:14** | **se reescribe** el fichero vivo (20 s → **60 s**) | `stat -c %y` + `sha256sum` |
| 23:37:33 | **yo mido** (19 s después) → `a39e8de9…` | esta revisión |

**La diferencia es una sola línea, y es doctrinalmente correcta:**

```diff
  location ~ ^/cdn/(?<ape_host>[^/]+)(?<ape_path>/.*)$ {
      proxy_pass http://127.0.0.1:8088;
      ...
-     proxy_read_timeout 20s;
+     proxy_read_timeout 60s;
      add_header Cache-Control "no-store" always;
  }
```

Esto **no es un fallo del commit**: el invariante autopista del repo exige `proxy_read_timeout >= 60s`
(`CLAUDE.md` §«VPS NET SHIELD AUTOPISTA»), así que la producción de las 23:37 está **más alineada** que
el commit. El problema es de **trazabilidad**: si alguien hace hoy `git checkout` del snippet —o `cp` del
blob— **baja el timeout a 20 s** en producción.

**Atribución honesta:** hay evidencia de una pasada de remediación concurrente que elevó `5s → 60s` en
`/etc/nginx/conf.d/50-ape-meta-plane.conf` a las **04:33:31–04:34:12Z** (`VPS_REMEDIATION_LOG.md` L5, L14),
con su propio `.bak_20261026T043331Z` y marcador `.last_ts`. La escritura de las **04:37:03/04:37:14** sobre
el snippet es **posterior**, deja su propio `.bak_20261026T043703Z` + `.last_ts2`, y cambia exactamente la
misma directiva. **No puedo afirmar quién la ejecutó** (no hay log de autoría); sí puedo afirmar que el
patrón, el backup y la directiva son consistentes con la misma pasada de remediación.

---

## 3 · Verificación del criterio 1 (blob del commit) — byte a byte

```text
git cat-file -t 3de6b0a                → commit
git merge-base --is-ancestor 3de6b0a origin/feat/adb-…
                                       → True (y `git branch -r --contains` lo lista)
git show 3de6b0a:_vps_stage/public/ape-meta-public.conf > blob   (redirección binaria, sin re-encode)
  bytes  = 2509                     (esperado 2509)     ✅
  sha256 = 0A4002166054834C756D5451DA49F8E9AA6327F5672A1E625A9C044DF9FF91DE
           = 0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de  ✅ (idéntico, case-insensitive)
  CRLF = 0 · LF = 46 · BOM = False   (hash independiente de la plataforma)
```

El blob **coincide con el `.bak` que el VPS tomó del fichero vivo a las 04:37:03Z** — es la prueba más
fuerte de que el commit fue, en su momento, un espejo fiel: el propio VPS respaldó `0a400216…` como
«lo que estaba corriendo».

---

## 4 · Criterio 4 — ¿el rollback es ejecutable?

**Lo que existe y funciona (verificado hoy, solo lectura):**

| Ingrediente | Estado |
|---|---|
| Directorio `/root/nginx-bak/` | existe, `mode 700`, fuera de `/etc/nginx` → no servible por nginx |
| Backup del estado **anterior** al cambio de las 23:37 | `/root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z` · **2509 B** · `0a400216…` ✅ |
| Backup de la v1 (anterior a la v2 del commit) | `/etc/nginx/snippets/ape-meta-public.conf.bak_20261025T180653` (la v1 de 2091 B que reintroduce el 404) |
| `nginx -t` | `syntax is ok` / `test is successful` ✅ (ejecutado **sin** reload) |
| Comando de rollback real, ya usado en esta campaña | `cp -p /root/nginx-bak/<bak> <destino> && nginx -t && systemctl reload nginx` (`VPS_REMEDIATION_LOG.md` L286) |

**Reserva (por eso no es PASS limpio):** ese bloque de rollback está documentado para
`conf.d/50-ape-meta-plane.conf`, **no** para `snippets/ape-meta-public.conf`, y `COMMIT_READY.md` —el
documento que el propio commit cita como evidencia— **no contiene sección de rollback** (sus §0–§9 son:
hallazgo, identidad, método, verificación, diff, semántica, comando de commit, caveats, atestación).
No hay comandos inventados; hay un **hueco de documentación**: falta nombrar el `.bak` exacto del snippet.

**Comando de rollback que se deriva de los hechos (no inventado):**

```bash
cp -p /root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z \
      /etc/nginx/snippets/ape-meta-public.conf \
  && nginx -t \
  && systemctl reload nginx
```

---

## 5 · Hallazgos (con el fix mínimo)

| ID | Sev | Problema | Fix requerido |
|---|---|---|---|
| **F1** | **high** | El criterio 2 no se sostiene al momento del review: producción = `a39e8de9…` (60 s), commit = `0a400216…` (20 s). Un restore desde git **degrada** producción (20 s < 60 s del invariante autopista) | Publicar un **commit v3** con `proxy_read_timeout 60s`, **o** dejar constancia en `COMMIT_READY.md` del mapa commit↔producción con el timestamp de divergencia (`2026-10-26T04:37:14Z`) y el sha vivo `a39e8de9…`. Sin eso, el repo miente sobre producción |
| **F2** | medium | `COMMIT_READY.md` no documenta el rollback del snippet ni cita `ape-meta-public.conf.bak_20261026T043703Z` | Añadir el bloque de §4 con el nombre de backup exacto y el gate `nginx -t` |
| **F3** | low | El `--stat` muestra `client_max_body_size 1m;` **eliminado** sin mención en el mensaje | Declarar que el límite pasa a heredarse del contexto (`http`/`server`); si el server 443 define otro valor, documentarlo |
| **F4** | info | `proxy_read_timeout 20s` en el commit está por debajo del piso doctrinal de 60 s (`CLAUDE.md`, autopista) | Se resuelve con F1 (v3 a 60 s) |

> **F4/F1 explican por qué la producción de ahora es mejor que el commit**: la doctrina pedía 60 s; el
> commit congeló 20 s. T15 no se equivocó al fotografiar producción; se equivocó el criterio de qué
> timeout era aceptable — y quien lo corrigió en el VPS a las 23:37 hizo lo correcto.

---

## 6 · Lo que verifiqué y **sí** está bien (para no bloquear por gusto)

- **La premisa técnica del cambio es cierta**: `/_ape/_fetch` es un `location = /_ape/_fetch { internal; … }`
  en `/etc/nginx/conf.d/50-ape-meta-plane.conf:187`, dentro de un `server { listen 8088; }` (línea 57).
  Ejecutar el gateway en el 443 (v1) no tenía ese location → 404. Delegar en `:8088` **es** la solución
  correcta y de una sola implementación.
- `:8088` está escuchando (4 workers de nginx), `:443` también.
- El snippet está **incluido** de verdad: `/etc/nginx/sites-enabled/default:34: include snippets/ape-meta-public.conf;`
- El candado de segmentos sigue en el archivo (`location ~* \.(ts|m4s|mp4|m4a|aac|vtt|key)$ { return 404; }`)
  → coherente con «metadata-only, no transporta vídeo».
- **Cero secretos** en el diff (10 patrones: AWS, private key, gh/sk tokens, password=, api_key=, user:pass@,
  Bearer, token=, proxy_pass con credenciales → todos 0).
- El commit **no despliega nada** y lo declara (`COMMIT_READY.md` §7.3): es espejo documental → no hubo
  `nginx -t`, ni `reload`, ni `scp` como parte de T15. Correcto según `iptv-vps-touch-nothing`.

---

## 7 · Atestación de solo lectura (qué ejecuté contra el VPS)

| Comando | Mutación |
|---|---|
| `sha256sum`, `stat -c`, `ls -la /root/nginx-bak/` | ninguna |
| `grep -rn` sobre `/etc/nginx/` | ninguna |
| `ss -tlnp` (filtrado :8088/:443) | ninguna |
| `sed -n '180,200p'` de `conf.d/50-ape-meta-plane.conf` | ninguna (lectura por stdout) |
| `cat /etc/nginx/snippets/ape-meta-public.conf` | ninguna |
| `nginx -t` | **test de sintaxis, sin recargar** — no aplica cambios |

**0 `scp`, 0 `rsync`, 0 `systemctl reload/restart`, 0 escrituras, 0 `sed -i`, 0 `git checkout`, 0 commits.**
En el repo: solo `git show` / `git cat-file` / `git ls-remote` / `git merge-base` (lectura) y la escritura
de **este documento**.

---

## 8 · Recomendación al capitán

1. **No revertir nada.** El commit es útil: es el único registro de que producción corrió `0a400216…`.
2. **Cerrar con un v3** (1 línea: `proxy_read_timeout 60s`) o con la nota de divergencia del F1. Es trabajo
   de minutos y elimina el riesgo de degradar producción en el próximo `checkout`.
3. **No tocar el VPS** para «alinearlo con el commit»: al contrario, el VPS está ahora más correcto.
4. Cuando T15 publique v3, **la verificación es de 3 comandos**: blob (`git show <sha>:<path> | sha256sum`),
   `sha256sum` del vivo, y comparación con el `.bak` de las 04:37:03.
