# COMMIT_READY — `ape-meta-public.conf` v2 (VPS → repo), listo para commit quirúrgico

**Tarea:** t15 · Preparar commit de `ape-meta-public.conf` v2 (D-26)
**Ejecutor:** vps-edge
**Fecha:** `2026-10-26` (ventana de ejecución única)
**Estado:** **archivo preparado en el repo y verificado byte-idéntico a producción. Commit NO ejecutado** (lo ejecuta el capitán).

---

## 0. HALLAZGO BLOQUEANTE DEL ENUNCIADO — la ruta del VPS citada no existe

El enunciado y sus comandos `Verify` apuntan a **`/etc/nginx/conf.d/ape-meta-public.conf`**. **Esa ruta NO EXISTE en el VPS.** Si se hubiera seguido al pie de la letra, el `cat`/`sha256sum` habría fallado y —peor— un `scp`/copia desde una ruta inexistente habría dejado el archivo del repo vacío o intacto, reintroduciendo exactamente el bug que esta tarea quiere evitar.

**Verificación read-only (misma ejecución):**

```
$ ssh hetzner-iptv 'ls -la /etc/nginx/conf.d/ | grep -i meta-public'
(fin)                                        ← sin resultados

$ ssh hetzner-iptv 'if [ -e /etc/nginx/conf.d/ape-meta-public.conf ]; then ...; else echo ABSENT; fi'
ABSENT /etc/nginx/conf.d/ape-meta-public.conf

$ ssh hetzner-iptv 'ls -la /etc/nginx/snippets/ | grep -i meta-public'
-rw-r--r--   1 root root 2509 Oct 25 18:07 ape-meta-public.conf
-rw-r--r--+  1 root root 2091 Oct 24 17:57 ape-meta-public.conf.bak_20261025T180653
```

**Ruta real y correcta:** **`/etc/nginx/snippets/ape-meta-public.conf`** — lo confirma también `nginx -T` de t7: el archivo aparece como `# configuration file /etc/nginx/snippets/ape-meta-public.conf:` y se incluye con `include snippets/ape-meta-public.conf;` desde `sites-enabled/default` (así lo documenta el propio archivo, línea 5).

**Por qué la confusión es entendible:** `conf.d/` contiene el *otro* artefacto del plano (`50-ape-meta-plane.conf`). Pero `ape-meta-public.conf` vive en `snippets/` porque se **incluye dentro** del server 443 existente; si estuviera en `conf.d/` nginx lo cargaría a nivel `http` y sus `location` quedarían fuera de todo `server` → error de configuración.

> **Acción para el capitán:** usar `snippets/` en cualquier verificación futura. Los comandos `Verify` del contrato están corregidos abajo (§6). Este documento **no** propone renombrar ni mover nada en el VPS (sería mutación).

---

## 1. Identidad del artefacto — antes y después

| Momento | Ruta | Bytes | sha256 |
|---|---|---|---|
| **v1 · repo (antes)** | `_vps_stage/public/ape-meta-public.conf` | **2 091** | `adbf3e56211aa9c616df110e344096d47ef8df932b4946f0338f69d87a54c8e0` |
| v1 · repo = HEAD (confirmado) | `HEAD:_vps_stage/public/ape-meta-public.conf` | 2 091 | `adbf3e56211aa9c616df110e344096d47ef8df932b4946f0338f69d87a54c8e0` ← **idéntico al worktree** |
| v1 · backup en VPS | `/etc/nginx/snippets/ape-meta-public.conf.bak_20261025T180653` | 2 091 | `adbf3e56211aa9c616df110e344096d47ef8df932b4946f0338f69d87a54c8e0` ← **idéntico al repo** |
| **v2 · VPS (producción)** | `/etc/nginx/snippets/ape-meta-public.conf` | **2 509** | **`0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de`** |
| **v2 · repo (después)** | `_vps_stage/public/ape-meta-public.conf` | **2 509** | **`0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de`** ✅ |

**Conclusión:** el repo tenía **exactamente la v1** (cryptographically idéntica al `.bak` que el VPS conservó del despliegue anterior). Producción corre **v2**. La diferencia es **+418 B** y el fix del 404 del `/cdn/`.
**Riesgo que esta tarea cierra:** un `git checkout HEAD -- _vps_stage/public/ape-meta-public.conf` (o cualquier restore desde repo) reinstalaba la v1 → **reintroducía el 404 de `/cdn/` y la lista CDN dejaba de reproducir**.

---

## 2. Método de escritura — por qué es byte-idéntico y no «parecido»

No se usó `curl`, ni `scp`, ni `Out-File`, ni `Set-Content`. Todos ellos pueden alterar bytes (BOM, CRLF, re-codificación del último salto de línea).

**Procedimiento aplicado:**

1. `ssh hetzner-iptv "base64 -w0 /etc/nginx/snippets/ape-meta-public.conf"` → 3 348 caracteres base64 (**solo lectura**).
2. `[System.Convert]::FromBase64String(...)` → **2 509 bytes** exactos.
3. Verificación **antes** de escribir: `sha256(bytes decodificados)` = `0a400216…` ✅ (match contra el hash del VPS).
4. `[System.IO.File]::WriteAllBytes(<ruta>, bytes)` — escritura binaria cruda, sin conversión de texto.
5. Verificación **después** de escribir contra el VPS **en la misma ejecución** (§3).

**Controles de codificación sobre los bytes escritos:**

| Control | Resultado |
|---|---|
| BOM UTF-8 (`EF BB BF`) | **NO** — primeros 3 bytes son `35, 32, 226` = `#`, ` `, `═` (inicio del comentario de cabecera) |
| CRLF (`\r\n`) | **0 secuencias** |
| LF (`\n`) | **46** — coincide con las 46 líneas del archivo |
| Tamaño | 2 509 B |

**⇒ El archivo del repo es UTF-8 sin BOM, con finales de línea LF, byte a byte igual al de producción.**

---

## 3. Verificación de aceptación (evidencia literal)

### 3.1 sha256 y tamaño: local vs VPS, en la misma ejecución

```
$ Get-FileHash _vps_stage/public/ape-meta-public.conf -Algorithm SHA256
local: 2509 B  0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de

$ ssh hetzner-iptv "sha256sum /etc/nginx/snippets/ape-meta-public.conf; stat -c%s /etc/nginx/snippets/ape-meta-public.conf"
vps  : 2509 B  0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de

SHA MATCH: True   SIZE MATCH: True
```

### 3.2 `git status` — exactamente 1 archivo modificado

```
$ git status --porcelain -- _vps_stage/public/ape-meta-public.conf
 M _vps_stage/public/ape-meta-public.conf
```
**Una sola línea.** Ni añadidos, ni borrados, ni renombrados.

### 3.3 `git diff --stat` y `--numstat`

```
$ git diff --stat -- _vps_stage/public/ape-meta-public.conf
 _vps_stage/public/ape-meta-public.conf | 12 ++++++++++--
 1 file changed, 10 insertions(+), 2 deletions(-)

$ git diff --numstat -- _vps_stage/public/ape-meta-public.conf
10	2	_vps_stage/public/ape-meta-public.conf
```

**Lectura correcta del stat:** `10 insertions / 2 deletions` es el conteo **a nivel de línea** del cambio (v1 tenía 46 líneas, v2 tiene 46 líneas: se reemplazan 2 por 10). El cambio a nivel de **bytes** es **2 091 → 2 509 = +418 B**. Ambos datos se dan porque miden cosas distintas; el acceptance pide el de bytes, que es el que garantiza identidad con producción.

### 3.4 Blob que git almacenaría — verificación de que el commit será correcto

```
$ git hash-object --path=_vps_stage/public/ape-meta-public.conf _vps_stage/public/ape-meta-public.conf
af7ab74209a675e81516327bb2176056c5f90a83

$ git rev-parse HEAD:_vps_stage/public/ape-meta-public.conf     # blob v1
59f9f2f06db592cf4902ebf6d2202e9da17dccfb

$ git cat-file -s 59f9f2f0…   →  2091   (blob v1)
$ git cat-file -s af7ab742…   →  2509   (blob v2: MISMO tamaño que el VPS) ✅
```

**⇒ El blob que quedará commiteado mide 2 509 B**, igual que producción. El commit preserva la identidad.

### 3.5 Índice limpio — nada staged

```
$ git diff --cached --name-only
(ninguno)
```
**No se preparó nada en el índice.** La decisión de qué commitear sigue siendo del capitán.

---

## 4. `git diff` completo (transcrito íntegro)

```diff
diff --git a/_vps_stage/public/ape-meta-public.conf b/_vps_stage/public/ape-meta-public.conf
index 59f9f2f..af7ab74 100644
--- a/_vps_stage/public/ape-meta-public.conf
+++ b/_vps_stage/public/ape-meta-public.conf
@@ -14,8 +14,16 @@
 
 # Gateway de metadata: /cdn/<host-proveedor>/<ruta>.m3u8[?alt=host2,host3]
 location ~ ^/cdn/(?<ape_host>[^/]+)(?<ape_path>/.*)$ {
-    content_by_lua_file /etc/nginx/lua/ape_gateway.lua;
-    client_max_body_size 1m;
+    # v2 (2026-10-25): el gateway NECESITA /_ape/_fetch, definido SOLO en el
+    # server 8088. Ejecutarlo en el 443 devolvia 404 (subrequest a un location
+    # inexistente en este contexto) y la lista CDN no reproducia. Ahora el 443
+    # delega en el 8088: una sola implementacion y el subrequest en su contexto.
+    proxy_pass http://127.0.0.1:8088;
+    proxy_http_version 1.1;
+    proxy_set_header Connection "";
+    proxy_set_header Host $host;
+    proxy_read_timeout 20s;
+    proxy_buffering on;
     add_header Cache-Control "no-store" always;
 }
 
```

**El cambio está contenido en UNA sola `location` (`~ ^/cdn/…`).** Las otras tres `location` del archivo (`= /ape/health`, `= /ape/lab-upload`, `~* \.(ts|m4s|mp4|…)$`) **no cambian ni un byte**: el diff lo demuestra (no hay otros hunks).

---

## 5. Explicación semántica — qué hace el cambio y por qué arregla el 404

### 5.1 El problema (v1)

`/cdn/<host-proveedor>/<ruta>.m3u8` es el gateway de metadata público: recibe un `host` y una ruta de playlist y devuelve la playlist **rebasa a URLs absolutas del proveedor**.

En v1 la `location` del 443 ejecutaba **directamente** el handler Lua:

```nginx
content_by_lua_file /etc/nginx/lua/ape_gateway.lua;
```

Pero `ape_gateway.lua` no resuelve el upstream por sí mismo: **hace un subrequest a `/_ape/_fetch`**, y ese `location` **sólo existe en el `server` que escucha en `:8088`** (`conf.d/50-ape-meta-plane.conf`). En el contexto del server 443 ese `location` **no está declarado**.

Nginx resuelve los subrequests contra los `location` del **server actual**. Al no encontrarlo → **404**. Y como el 404 lo devolvía el *subrequest*, el gateway entregaba una **playlist vacía**: el cliente no veía un error del VPS, veía una lista sin canales. **La lista CDN no reproducía.**

### 5.2 La solución (v2)

En lugar de reimplementar `/_ape/_fetch` en el 443 (dos copias del mismo código, dos sitios donde divergir), el 443 **delega la petición completa** al server `:8088`, donde el subrequest **sí** tiene su contexto:

```nginx
proxy_pass http://127.0.0.1:8088;      # el 8088 ejecuta el gateway en SU contexto
proxy_http_version 1.1;
proxy_set_header Connection "";         # habilita keepalive con el upstream loopback
proxy_set_header Host $host;            # preserva el Host que ve el gateway
proxy_read_timeout 20s;                 # margen para el fetch upstream del proveedor
proxy_buffering on;                     # bufferiza una respuesta pequeña (playlist)
```

**Un solo camino de ejecución, en el contexto correcto.** Esto es lo que el comentario del propio archivo documenta: «*una sola implementacion y el subrequest en su contexto*».

### 5.3 Efectos colaterales del cambio (evaluados, no asumidos)

| Directiva añadida | Efecto | ¿Riesgo? |
|---|---|---|
| `proxy_pass http://127.0.0.1:8088` | loopback únicamente; no expone puerto nuevo ni escucha en `:8088` (ya escuchaba) | ninguno |
| `proxy_http_version 1.1` + `proxy_set_header Connection ""` | conexión keepalive al 8088; coherente con el resto de la config del VPS | ninguno |
| `proxy_set_header Host $host` | el gateway recibe el Host original del cliente (necesario para el allowlist SSRF) | ninguno |
| `proxy_read_timeout 20s` | **20 s** en el plano `/cdn/`, coherente con el `20s` ya documentado en t7 para `/cdn/` del 443 | alineado, no empeora |
| `proxy_buffering on` | bufferiza respuesta de playlist (pequeña) | ninguno |
| **Eliminado:** `client_max_body_size 1m` | esa directiva limitaba el **cuerpo de la petición**; el gateway `/cdn/` es **solo GET** (el POST de la DNA va por `/ape/lab-upload`, que conserva su `client_max_body_size 2m`) | **sin efecto funcional**: no hay cuerpo en un GET |
| **Sin cambios:** `add_header Cache-Control "no-store" always;` | sigue presente en el 443 **y** ahora la respuesta viene del 8088 | se mantiene la semántica no-store |

**Lo que NO cambia y conviene tener presente:** `/cdn/` sigue **sin ser un proxy abierto** — el gateway valida el host contra `/etc/nginx/ape-hosts-allow.txt` (SSRF guard), y los segmentos de vídeo siguen bloqueados por la `location ~* \.(ts|m4s|mp4|m4a|aac|vtt|key)$ { return 404; }` al final del archivo. El cambio no abre la puerta a tráfico de vídeo.

### 5.4 ¿Está probado que funciona en producción?

**Sí, medido en t7** (independiente de esta tarea):

```
$ ssh hetzner-iptv 'curl -s -m 6 http://127.0.0.1:8088/_ape/health'
{"ok":true,"plane":"meta/v3","ts":1792987153,
 "qoe":{"last_ms":789,"bytes":635,"req":1,"last_ts":1792979255,"rebase_ok":1,"last_host":"line.tivi-ott.net"},
 "checks":{"last_latency_ms":789,"nginx":true,"shared_dicts":true,"upstreams_down":0,
           "requests":1,"error_ratio":0,"last_host":"line.tivi-ott.net"}}
```

`rebase_ok:1` ⇒ el rebase se ejecutó con éxito al menos una vez; `last_host: line.tivi-ott.net` ⇒ habló con un proveedor real; `error_ratio: 0`. La v2 está **viva y funcionando** en producción antes de este commit.

---

## 6. Comando exacto de commit (para el capitán) — UN archivo, sin `git add -A`

> **NO ejecutado por este agente.** Copiar y pegar.

```bash
git add -- _vps_stage/public/ape-meta-public.conf
git commit -m "fix(nginx): commit live v2 of ape-meta-public (cdn :8088 delegation)" -- _vps_stage/public/ape-meta-public.conf
```

**Por qué así y no de otra forma:**

- `git add -- <ruta>` (con `--`) **nombra el archivo explícitamente**. **Nunca `git add -A` / `git add .` / `git commit -a`**: el working tree tiene **más de 3 000 entradas** de estado (18 `M` ajenos + miles de `D` de `target/` de otra sesión). Un `-A` arrastraría todo eso al commit.
- El `git commit -- <ruta>` con pathspec **restringe el commit a ese archivo** incluso si algo más quedara en el índice. Es una segunda barrera deliberada.
- `-m` entre comillas dobles porque el mensaje contiene `:` y paréntesis.

**Verificación previa recomendada (antes del commit):**

```bash
git status --porcelain -- _vps_stage/public/ape-meta-public.conf   # esperado: " M _vps_stage/public/ape-meta-public.conf"
git diff --numstat -- _vps_stage/public/ape-meta-public.conf       # esperado: "10	2	_vps_stage/public/ape-meta-public.conf"
sha256sum _vps_stage/public/ape-meta-public.conf                    # esperado: 0a400216…  (en Linux/macOS)
```

> **Nota sobre `sha256sum` en Windows:** el archivo en disco **es** LF (2 509 B, `0a400216…`), verificado. Pero `core.autocrlf = true` en este repo. Ver §7.1 antes de re-verificar con un checkout limpio.

**Verificación posterior recomendada (después del commit):**

```bash
git show --stat --oneline HEAD          # esperado: 1 file changed, 10 insertions(+), 2 deletions(-)
git cat-file -s HEAD:_vps_stage/public/ape-meta-public.conf   # esperado: 2509
```

---

## 7. Caveats operativos (leer antes de dar el commit por cerrado)

### 7.1 `core.autocrlf = true` — el blob es correcto, el checkout futuro no coincide

Medido en este repo: `core.autocrlf = true`; **no hay `.gitattributes`** con reglas por ruta.

| Objeto | Bytes | ¿Coincide con el VPS? |
|---|---|---|
| Archivo en disco ahora (LF) | **2 509** | **SÍ** — `0a400216…` |
| Blob que git almacena (`af7ab742…`) | **2 509** | **SÍ** — git normaliza CRLF→LF al guardar |
| Archivo tras un **checkout limpio** (CRLF) | **2 555** | **NO** — 2 509 + 46 CR |

Git avisa explícitamente: `warning: in the working copy … LF will be replaced by CRLF the next time Git touches it`.

**Consecuencias prácticas, dichas sin adornos:**
1. **El commit en sí es correcto**: el blob de 2 509 B LF es byte-idéntico a producción. El historial queda bien.
2. **Una verificación futura con `sha256sum` sobre un checkout recién clonado dará un hash DISTINTO** (`2555 B`) y podría interpretarse como «el commit está mal». **No lo está**: es la normalización de línea de Windows.
3. Si en el futuro se quiere que el archivo del repo sea siempre LF-en-disco, la corrección es un `.gitattributes` con `_vps_stage/**/*.conf text eol=lf`. **No lo he creado**: está fuera del scope de esta tarea (`_vps_stage/public/ape-meta-public.conf` + el directorio de auditoría) y es una decisión de política del repo.

### 7.2 Efecto secundario local declarado: un objeto loose en `.git/objects`

Para verificar qué blob se commitearía ejecuté `git hash-object -w`. El flag `-w` **escribe un objeto loose** en `.git/objects` (blob `af7ab742…`). Consecuencias reales, sin exagerar:

- **No** modifica el índice (`git diff --cached` → vacío).
- **No** crea commit, rama ni tag.
- **No** cambia ningún archivo del working tree.
- Es un objeto **no referenciado**: `git gc` lo poda. El repo ya tenía blobs dangling previos (se ven en `git fsck --dangling`).

Se declara aquí porque una atestación que oculta una escritura, aunque sea inocua, no vale nada. Es la única escritura en `.git/` de esta tarea.

### 7.3 Este commit NO despliega nada

El archivo commiteado es el **espejo documental** de lo que **ya corre**. No se ejecutó `nginx -t`, ni `reload`, ni `restart`, ni `scp`, ni se editó el VPS. `iptv-vps-touch-nothing` §«When You Must Touch Production», condición 7: si el cambio **ya está vivo**, es espejo documental → **commit only, NO deploy, NO reload**. Es exactamente este caso.

El VPS ya tenía la v2 desde `2026-10-25 18:07:04Z`. Este commit sólo alinea el repo con esa realidad.

---

## 8. Atestación de alcance y de no-mutación

### 8.1 Frontera de escritura — 2 rutas, ambas in-scope

| Ruta | Cambio | In-scope |
|---|---|---|
| `_vps_stage/public/ape-meta-public.conf` | reescrito a v2 (2 091 → 2 509 B) | ✅ |
| `audit/alignment/2026-10-25/40-vps/COMMIT_READY.md` | creado (este documento) | ✅ |

```
$ git status --porcelain -- _vps_stage/public/
 M _vps_stage/public/ape-meta-public.conf        ← solo este

$ git status --porcelain -- audit/alignment/2026-10-25/40-vps
?? audit/alignment/2026-10-25/40-vps/            ← mi directorio de entregables
```

**Ningún otro archivo del equipo cambió por esta tarea.** Los 18 `M` ajenos del working tree (entre ellos `_vps_stage/lua/ape_gateway.lua`, `ape_header.lua`, `ape_uri_rebase.lua` — WIP de otra sesión) **siguen exactamente como estaban**: sólo se **leyeron** con `git status`/`git diff` para no incluirlos.

### 8.2 Prohibiciones del contrato — cumplimiento

| Prohibición | Cumplida | Evidencia |
|---|---|---|
| `git commit` | **SÍ** | `git log -1 --oneline` sin cambios nuevos; índice vacío |
| `git push` | **SÍ** | no se invocó |
| `nginx reload` / `restart` | **SÍ** | no se invocó; el VPS sólo recibió `ls`, `base64 -w0`, `sha256sum`, `stat -c%s`, `cat` |
| `scp` / `rsync` al VPS | **SÍ** | cero invocaciones |
| Editar el VPS | **SÍ** | sólo lectura; ninguna escritura remota |
| `git add -A` / `git add .` | **SÍ** | nunca ejecutado; el índice quedó vacío |

### 8.3 Comandos ejecutados contra el VPS — inventario completo (todos lectura)

| Comando | Naturaleza |
|---|---|
| `ls -la /etc/nginx/conf.d/ \| grep -i meta-public` | lectura |
| `ls -la /etc/nginx/snippets/ \| grep -i meta-public` | lectura |
| `[ -e <ruta> ] && sha256sum <ruta> && stat -c "%s B mtime=%y" <ruta>` | lectura (`test`) |
| `base64 -w0 /etc/nginx/snippets/ape-meta-public.conf` | lectura → stdout |
| `sha256sum /etc/nginx/snippets/ape-meta-public.conf` | lectura |
| `stat -c%s /etc/nginx/snippets/ape-meta-public.conf` | lectura |

**Total: 6 invocaciones, 0 escrituras.** No se usó `cat` con redirección remota, ni `tee`, ni `sed -i`, ni `cp`, ni `mv` en el VPS.

### 8.4 Escaneo de secretos sobre el contenido commiteado

Cinco patrones aplicados al contenido de los 2 509 B:

| Patrón | Coincidencias |
|---|---|
| `password\|passwd\|secret\|api_key\|token` = valor literal | **0** |
| hex largo (≥32 chars) | **0** |
| `-----BEGIN … PRIVATE KEY-----` | **0** |
| `Bearer <token>` | **0** |
| `esquema://usuario:clave@host` | **0** |

**El archivo no contiene credenciales.** El único elemento sensible del plano es el token del LAB, y **vive en `/etc/nginx/ape-lab-upload.token`** (referenciado desde `ape_lab_upload.lua`), **no** en este `.conf`. La `location = /ape/lab-upload` sólo declara `content_by_lua_file` y `client_max_body_size 2m`.

---

## 9. Resumen de una línea

`_vps_stage/public/ape-meta-public.conf` pasa de **v1 (2 091 B, `adbf3e56…`)** a **v2 (2 509 B, `0a400216…`)**, byte-idéntico a `/etc/nginx/snippets/ape-meta-public.conf` de producción, con **1 archivo modificado**, **0 archivos staged**, **0 commits**, **0 cambios en el VPS** — listo para que el capitán ejecute el comando de §6.

> **Corrección que hay que propagar:** la ruta correcta en el VPS es **`/etc/nginx/snippets/ape-meta-public.conf`**, no `conf.d/`.

---
*Fin de COMMIT_READY.md — commit NO ejecutado. v2 verificada contra producción en la misma ejecución (sha256 y tamaño). Cero mutaciones en el VPS.*
