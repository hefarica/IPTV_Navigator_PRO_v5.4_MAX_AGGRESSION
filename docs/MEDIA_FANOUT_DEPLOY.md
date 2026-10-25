# Media Fan-Out — Guía de despliegue, límites y rollback

**Sistema:** on-demand media fan-out (una sola conexión upstream por canal activo)
**Estado:** **staging validado, NO desplegado en producción**
**VPS de staging:** `178.156.147.234` · **Producción:** intacta (este documento no la modifica)
**Última verificación medida:** V3 (`docs/MEDIA_FANOUT_FINAL_VERIFICATION.md`, `PASS`, 28/28 invariantes)
**Integración en el generador:** flag `ape_session_mode` **OFF por defecto** (§7)

> **Regla de oro del despliegue:** el despliegue es un **paso aparte con aprobación explícita del
> propietario**. Nada de este documento se ejecuta solo. Todo cambio de nginx/systemd va con backup,
> `nginx -t` obligatorio y rollback probado (§8).

---

## 1. Veredicto y alcance

| Pregunta | Respuesta medida |
|---|---|
| ¿N peticiones simultáneas al mismo canal abren **una** conexión al proveedor? | **SÍ.** `origin max_active=1` en todas las fases (1/5/50/100 clientes, snapshot, aislamiento, fencing). 1 proceso `ffmpeg`. Tasa de aceptaciones del origen plana (0,99 → 1,04 → 1,06/s al pasar de 1 a 50 y 100 clientes). |
| ¿Todos los clientes ven **la misma secuencia**? | **SÍ.** 1.100 playlists, MSN 3→15, `signature_mismatches=0`, `duplicate_segments=0`, `window_holes=0`, `msn_regressions=0`; 5/5 snapshots byte-idénticos. |
| ¿Saltos de timestamps? | **NO.** 6 segmentos / 300 packets: `gaps_fuera_rango=0`, `dts_back=0`. |
| ¿Aislamiento entre clientes y fencing en reinicios? | **SÍ.** 100 % de éxito con 50 clientes; gen nueva 2 y gen vieja `302 stale_generation` + jump-to-live; 1 worker y 1 ffmpeg tras el reinicio. |
| ¿Degrada el 4K? | **NO se ofrece.** Transcode 4K es **NO-GO** en este VPS (§6.4). El perfil 4K escalado queda **gateado y apagado** por defecto. |
| ¿Se etiqueta HDR algo escalado/remuxeado? | **NUNCA.** El remux `-c copy` conserva el bitstream; no se inventa HDR (§6.5). |

---

## 2. Arquitectura

```
       ┌───────────────────────────────┐
       │  GENERADOR (frontend)         │  frontend/js/ape-v9/generation-controller.js
       │  flag ape_session_mode        │  OFF por defecto = lista DIRECTA (comportamiento actual)
       │  ON ⇒ 1 URL /sess/ por canal  │  ON = lista de sesión (una sola URL por canal)
       └───────────────┬───────────────┘
                       │  https://<host>/sess/<proveedor>/<canal>/live.m3u8
                       ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │ BORDE: nginx 1.24 + ngx_http_lua 0.10.26 (NO OpenResty, NO resty-lock)     │
   │ _vps_stage/nginx/media-fanout.conf                                        │
   │  · /sess/<prov>/<canal>/live.m3u8 → 302 /mf/src/…                         │
   │  · /mf/<key>/<gen>/{index.m3u8,segNNNNN.ts,…} → sendfile/aio desde tmpfs   │
   │  · /mf/<key>/live.m3u8 → coordinador: playlist ABSOLUTA + X-MF-Gen (O2)    │
   │  · /mf/health, /mf/metrics, POST /mf/ctl (loopback)                        │
   └───────────────┬───────────────────────────────────────────────────────────┘
                   │ (Lua puro; el borde NO procesa vídeo)
                   ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │ COORDINADOR: _vps_stage/lua/ape_session.lua                               │
   │  · single-flight por key = hash(proveedor|canal) (diccionario + TTL)      │
   │  · registro de sesión + marcas de espectador (TTL 30 s) + gauges          │
   │  · límites MAX_SESSIONS / viewers por sesión / viewers totales (503)      │
   │  · fencing: sólo la generación VIGENTE se sirve; vieja ⇒ 302 jump-to-live │
   │  · linger 25 s tras el último espectador (tope duro 90 s)                  │
   └───────────────┬───────────────────────────────────────────────────────────┘
                   │ UDS /run/mediafanout/supervisor.sock (timeout 250 ms)
                   ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │ SUPERVISOR: _vps_stage/media/ape-supervisor.sh + ape-supervisor.lua       │
   │  · autoridad de lifecycle (systemd NO reinicia: RestartPreventExitStatus) │
   │  · idem → URL con credenciales: /etc/mediafanout/urls.conf (0640)         │
   │  · allowlist de proveedores: /etc/mediafanout/providers.allow             │
   │  · escribe spec atómico /run/mediafanout/spec/<key>.env (tmp+rename)      │
   │  · gen++ ANTES de cada start; publish relay al coordinador                │
   └───────────────┬───────────────────────────────────────────────────────────┘
                   │ systemctl start ape-ingest@<key> (Type=notify)
                   ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │ WORKER: /usr/local/bin/ape-ingest.sh  (unidad ape-ingest@.service)        │
   │  · UN ffmpeg por sesión: `-c copy` (remux, sin transcode)                 │
   │  · ventana deslizante en tmpfs /dev/shm/mf/<key>/<gen>/                   │
   │  · cota dura 8 segmentos / 80 MiB + janitor por edad y presupuesto        │
   │  · logs redactados (0600) y saneado de credenciales                       │
   └───────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Recorrido de una petición de player

1. El player pide `GET /sess/<proveedor>/<canal>/live.m3u8`.
2. El borde responde `302 /mf/src/<proveedor>/<canal>/live.m3u8` (`X-APE-Sess-Alias: 1`).
3. El coordinador normaliza el idem (`hash(proveedor|canal)`), aplica **single-flight**: si no hay
   sesión, pide al supervisor `OPEN`; si ya hay una, **espera** a la misma generación (nunca abre
   otra conexión upstream).
4. El supervisor resuelve `urls.conf`, comprueba `providers.allow`, escribe el spec y hace
   `systemctl start ape-ingest@<key>` (Type=notify: `READY=1` llega al preparar el directorio).
5. El worker abre **la única** conexión al proveedor, hace remux y publica la playlist de la ventana.
6. El coordinador sirve la playlist **con URIs absolutas** `/mf/<key>/<gen>/<segmento>` y cabecera
   `X-MF-Gen` (hallazgo O2 cerrado). El player no conoce la generación.
7. Los segmentos se sirven con `sendfile`/`aio threads` desde tmpfs: la ruta caliente **no pasa por
   Lua** y no hay `proxy_pass` al worker.
8. Si el player pide una generación muerta o un segmento que ya salió de la ventana:
   `302 /mf/<key>/live.m3u8` + `X-MF-Jump-To-Live: 1` + `X-APE-Reason: window_gap|stale_generation`
   (jamás 500 en bucle, jamás basura).
9. Cuando el último espectador se va: **linger 25 s** (tope 90 s) → `CLOSE` → `ExecStopPost
   --cleanup --own-gen` borra la generación si el `flock` está libre.

### 2.2 Invariantes del fan-out (F1–F5 del borde)

- **F1** sólo se sirve la generación vigente (el fichero viejo en tmpfs no se sirve aunque exista).
- **F2** generación obsoleta/sesión cerrada ⇒ 302 jump-to-live (`?strict=1` ⇒ 410 con motivo).
- **F3** hueco de ventana ⇒ 302 jump-to-live, nunca bloqueo.
- **F4** aislamiento: sin locks compartidos en la ruta caliente; `limit_conn` documentado y **apagado**
  por defecto (si se enciende, alto y por IP: 64).
- **F5** el candado de vídeo del plano público no se reutiliza: bajo `/mf/` no hay `proxy_pass`, ni
  zona `limit_conn` de producción, ni reglas del shield. Los segmentos viven **sólo** bajo `/mf/`.

### 2.3 Ficheros y destino de instalación

| Staging (repo) | Destino en el VPS | Modo | Notas |
|---|---|---|---|
| `_vps_stage/media/ape-ingest.sh` | `/usr/local/bin/ape-ingest.sh` | `0755` | **Nunca bajo `/run`** (Hallazgo 1) |
| `_vps_stage/media/ape-ingest@.service` | `/etc/systemd/system/ape-ingest@.service` | `0644` | plantilla `%i` = key16 |
| `_vps_stage/media/ape-supervisor.sh` | `/opt/mediafanout/ape-supervisor.sh` | `0755` | UDS en `/run/mediafanout` |
| `_vps_stage/media/ape-supervisor.lua` | `/opt/mediafanout/ape-supervisor.lua` | `0644` | lo invoca el `.sh` |
| `_vps_stage/media/ape-supervisor@.service` | `/etc/systemd/system/ape-supervisor@.service` | `0644` | plantilla; en el VPS `%i` = `main` |
| `_vps_stage/lua/ape_session.lua` | `/etc/nginx/lua/ape_session.lua` | `0644` | `lua_package_path` global (una sola vez) |
| `_vps_stage/nginx/media-fanout.conf` | include **dentro de `http {}`** de la instancia | `0644` | staging: instancia dedicada `:8090` |
| `_vps_stage/media/providers.allow.example` | `/etc/mediafanout/providers.allow` | `0640` | hosts autorizados |
| — (operador) | `/etc/mediafanout/urls.conf` | `0640` | `proveedor\|canal=URL` con credenciales |

---

## 3. Prerrequisitos medidos (BLOQUEANTES)

Los **hallazgos 1–3 están medidos** en el VPS de staging; las cuentas, modos y directorios son los que
exigen la unidad de ingesta, el supervisor y `media-fanout.conf`. Si falta algo, el sistema **no
arranca** o arranca inseguro: no saltarse ninguno.

### 3.1 Usuario de sistema y permisos

```bash
# 1) cuenta de servicio SIN home (el worker no necesita shell ni escritura en $HOME)
useradd --system --no-create-home --shell /usr/sbin/nologin mediafanout

# 2) grupos: el worker hereda gid www-data para leer el spec y hablar con el socket
usermod -aG www-data mediafanout

# 3) directorios de estado y ventana
install -d -m 0755 -o root -g root       /etc/mediafanout
install -d -m 0750 -o root -g www-data   /run/mediafanout
install -d -m 0750 -o root -g www-data   /run/mediafanout/spec
install -d -m 0770 -o root -g www-data   /run/mediafanout/locks     # flock fijo (F4)
install -d -m 0770 -o root -g www-data   /dev/shm/mf                # ventana (tmpfs)
install -d -m 0750 -o root -g www-data   /var/lib/mediafanout       # estado persistido (gen, sesiones)
```

| Elemento | Modo | Propietario | Obligatorio |
|---|---|---|---|
| `/etc/mediafanout/urls.conf` | `0640` | `root:www-data` (o `mediafanout:www-data` si la cuenta debe rotarlo) | sí — único sitio con credenciales; lo lee el supervisor (root) |
| `/etc/mediafanout/providers.allow` | `0640` | `root:www-data` | sí — host fuera de la lista ⇒ `provider_not_allowed` |
| `/run/mediafanout/spec/<key>.env` | `0640` | `mediafanout:www-data` | sí — lo escribe el supervisor (atómico) |
| `/run/mediafanout/supervisor.sock`, `mf.sock` | `0660` | `mediafanout:www-data` | sí |
| `/run/mediafanout/locks/` | `0770` | `root:www-data` | sí — **el lock NO vive bajo la ventana** (F4) |
| `/dev/shm/mf/<key>/<gen>/` | `0770` | `root:www-data` | sí — ventana deslizante |
| `/var/lib/mediafanout/` | `0750` | `root:www-data` | sí — gen persistido (fencing) |

En la unidad de ingesta el proceso debe correr como **`User=mediafanout`** y **`Group=www-data`**.
El fichero de staging trae `User=root`/`Group=root` a propósito mientras no exista la cuenta
(documentado en la cabecera de `ape-ingest@.service`); al crear `mediafanout` hay que cambiarlo y
verificar que el worker sigue pudiendo (a) leer el spec `0640`, (b) escribir en la ventana `0770` y
(c) conectar al socket `0660`.

### 3.2 Stack nginx: **PROHIBIDO `apt install`**

| Componente | Versión medida | Consecuencia |
|---|---|---|
| nginx | **1.24.0 (Ubuntu)** | no es OpenResty; `nginx -V` sin `--add-module` custom |
| ngx_http_lua | **0.10.26-2** (`libnginx-mod-http-lua`, `modules-enabled/50-mod-http-lua.conf`) | hay `ngx.shared.DICT`, `ngx.timer`, cosockets, `ngx.sleep` |

- **NO instalar OpenResty ni paquetes nuevos** (`apt install` está **prohibido** en este VPS: el
  stack actual ya cubre todo lo que necesita el coordinador).
- El coordinador usa **ngx_http_lua puro**: nada de `lua-resty-lock` ni `lua-resty-http`.
- `lua_package_path` debe incluir el directorio de `ape_session.lua`; se declara **una sola vez** en el
  `http {}` (duplicarlo rompe `nginx -t`).
- Verificación previa (no cambia nada):

```bash
nginx -v                                   # nginx/1.24.0 (Ubuntu)
nginx -V 2>&1 | tr ' ' '\n' | grep -i lua  # debe aparecer el módulo lua
ls -l /etc/nginx/modules-enabled/50-mod-http-lua.conf
```

### 3.3 Hallazgo 1 (medido) — `/run` es `noexec`: el worker va en `/usr/local/bin`

`/run` está montado **`noexec`** en este VPS. Un `ExecStart` que apunte a un script bajo `/run`
falla con **`203/EXEC`** (systemd no puede ejecutarlo), aunque el fichero sea `0755`.

```bash
findmnt -no OPTIONS /run      # ... noexec ...
```

⇒ **el worker se instala en `/usr/local/bin/ape-ingest.sh`** (el supervisor, por su propia unidad, en
`/opt/mediafanout/ape-supervisor.sh`). `/run/mediafanout` es sólo para **estado** (spec, sockets,
locks), nunca para binarios.

### 3.4 Hallazgo 2 (medido) — `ProtectSystem=strict` + `PrivateDevices=yes` y la ventana en `/dev/shm`

Con `ProtectSystem=strict` **todo el sistema de ficheros es de sólo lectura** salvo lo declarado, y
`PrivateDevices=yes` da un `/dev` privado. Medido en este host:

- `/dev/shm/mf` **sigue escribible sólo si** se declara `ReadWritePaths=/dev/shm/mf`.
- `/run` queda de **sólo lectura** en el proceso (los sockets/locks los escribe el supervisor, no el
  worker).
- `ReadWritePaths=-/run/mediafanout` se declara con `-` (opcional) por si se usa la raíz alternativa.

La unidad ya lo refleja (`ape-ingest@.service`); cualquier cambio de raíz de ventana exige
revisar `ReadWritePaths` **y** `RequiresMountsFor=`.

### 3.5 Hallazgo 3 (seguridad, medido) — la URL con ticket aparece en `/proc/<pid>/cmdline`

`ffmpeg 6.1` **no acepta la URL desde un fichero** (no hay `-i @file` equivalente para la entrada
HTTP), así que la URL con credenciales/ticket viaja como argumento: queda visible en
`/proc/<pid>/cmdline` y en `ps`. **En los logs NO aparece** (`redact_url`/`redact_ffmpeg_stderr`
verificado: `userinfo` → `***:***@`, `path`/`query` de la URL → `/<redacted>`, `user=`/`password=`/
`token=`/`ticket=`/`key=` → `***`).

Mitigación obligatoria en el despliegue:

1. **`ProtectProc=invisible`** en la unidad (hace el `/proc` de otros procesos inaccesible al worker).
2. **`User=mediafanout`** + directorios `0770` (§3.1): un usuario sin privilegios no puede leer el
   `cmdline` de procesos de otros usuarios.
3. `redact_ffmpeg_stderr` + logs `0600` dentro de un `STATE_DIR` `0700` (ya implementado).
4. Ticket/TTL corto del proveedor (renovación por el supervisor), no persistir la URL en ningún log.

**Riesgo residual honesto:** mientras ffmpeg 6.1 no lea la URL de un fichero, un proceso con
privilegios de `root` en el mismo host puede ver el `cmdline` durante la vida del proceso. La
mitigación es de *superficie* (usuario sin privilegios + `ProtectProc` + redacción), no criptográfica.
No se puede eliminar sin cambiar de motor de ingesta (fuera de alcance y NO-GO por ahora).

### 3.6 Configuración de datos

**`/etc/mediafanout/providers.allow`** — un host por línea (host canónico, sin scheme, con puerto
sólo si no es 80/443; se ignora `#`). Host fuera de la lista ⇒ `OPEN` devuelve
`ERR code=provider_not_allowed` y **no** se arranca nada.

```
line.tivi-ott.net
# cdn.example.net:8443
```

**`/etc/mediafanout/urls.conf`** — `proveedor|canal=URL` (la URL lleva credenciales; jamás se loguea
ni se devuelve):

```
line.tivi-ott.net|1001=http://line.tivi-ott.net:8080/live/<user>/<pass>/1001.m3u8
line.tivi-ott.net|1002=https://line.tivi-ott.net/live/<user>/<pass>/1002.m3u8
```

Normalización (idéntica en el supervisor y en el generador, §7.4):
`norm_provider` = minúsculas, sin scheme, sin path, sin `:80`/`:443`, sin punto final, ≤190 chars y
sólo `[a-z0-9._:-]`. `norm_channel` = último segmento del path, sin query, sin `.m3u8`/`.ts`, ≤64
chars y sólo `[A-Za-z0-9_.-]`.

> Si el generador emite `/sess/<prov>/<canal>/live.m3u8`, ese par `<prov>|<canal>` **debe** existir en
> `urls.conf` y `<prov>` en `providers.allow`. Los que no estén habilitados **siguen directos** (§7.3).

---

## 4. Instalación en staging (reversible)

```bash
# 0) copiar SOLO staging al VPS (no toca /etc/nginx de producción ni /run/mediafanout)
scp -r _vps_stage/* root@<vps>:/tmp/mf_stage/

# 1) binarios (NUNCA bajo /run: Hallazgo 1)
install -m 0755 /tmp/mf_stage/media/ape-ingest.sh /usr/local/bin/ape-ingest.sh
install -d -m 0755 /opt/mediafanout
install -m 0755 /tmp/mf_stage/media/ape-supervisor.sh  /opt/mediafanout/ape-supervisor.sh
install -m 0644 /tmp/mf_stage/media/ape-supervisor.lua /opt/mediafanout/ape-supervisor.lua

# 2) unidades: ingesta (plantilla por key) + supervisor (plantilla por perfil, %i=main)
install -m 0644 /tmp/mf_stage/media/ape-ingest@.service      /etc/systemd/system/ape-ingest@.service
install -m 0644 /tmp/mf_stage/media/ape-supervisor@.service /etc/systemd/system/ape-supervisor@.service
systemctl daemon-reload

# 3) coordinador Lua (lo carga nginx)
install -m 0644 /tmp/mf_stage/lua/ape_session.lua /etc/nginx/lua/ape_session.lua

# 4) configuración/estado (§3.1) y datos (§3.6)
install -d -m 0750 -o root -g www-data /run/mediafanout /run/mediafanout/spec
install -d -m 0770 -o root -g www-data /run/mediafanout/locks /dev/shm/mf
install -d -m 0750 -o root -g www-data /var/lib/mediafanout
install -m 0640 -o root       -g www-data /tmp/mf_stage/media/providers.allow.example /etc/mediafanout/providers.allow
# urls.conf lo escribe el operador (0640; root:www-data o mediafanout:www-data); NO se versiona.

# 5) nginx: instancia DEDICADA de staging (:8090), con su propio prefijo/pid/logs
#    (validación aislada, ver cabecera de media-fanout.conf; NUNCA el nginx de producción)
sed -e 's#/etc/nginx/lua/ape_session.lua#/tmp/mf_i3/ape_session.lua#g' \
    -e 's#unix:/run/mediafanout/supervisor.sock#unix:/tmp/mf_i3/sup.sock#g' \
    -e 's#"/dev/shm/mf"#"/tmp/mf_i3/window"#g' \
    -e 's#listen 8090;#listen 127.0.0.1:18093;#g' /tmp/mf_stage/nginx/media-fanout.conf \
    > /tmp/mf_i3/nginx-i3.conf
nginx -t -p /tmp/mf_i3/ -c /tmp/mf_i3/nginx-i3.conf

# 6) arrancar supervisor y comprobar salud
systemctl start ape-supervisor@main.service
curl -fsS http://127.0.0.1:18093/mf/health | head -c 400
```

**Producción (443):** exponer el plano público es un paso **aparte** (snippet tipo
`ape-meta-public.conf`, backup del vhost + `nginx -t` + `reload`; ver `scripts/expose-443.sh` como
patrón) y **requiere aprobación explícita**. Hasta entonces el plano vive en loopback/puerto alto.

---

## 5. Activación y desactivación

### 5.1 Activación (dos mitades)

**(a) VPS** — el plano sirve sesiones:

```bash
systemctl start ape-supervisor@main.service
systemctl status ape-supervisor@main.service --no-pager
curl -fsS http://127.0.0.1:<puerto-del-plano>/mf/health
# providers.allow y urls.conf deben cubrir los canales que se quieran enrutar
```

**(b) Generador** — el flag está **OFF por defecto**; se enciende explícitamente:

```js
// En la consola del navegador, ANTES de generar:
window.APE_SESSION_MODE = true;
window.APE_SESSION_PROVIDERS = ['line.tivi-ott.net'];        // = hosts de providers.allow
// opcional: window.APE_SESSION_BASE = 'https://iptv-ape.duckdns.org';  // default: origen del endpoint de probe
await window.APEGenerationController.prepublishAndGenerate();
```

o por llamada (sin estado global):

```js
await window.APEGenerationController.prepublishAndGenerate({
    ape_session_mode: true,
    ape_session_providers: ['line.tivi-ott.net'],
    filename: 'APE_LISTA_SESION.m3u8'
});
```

o persistente en el navegador (`localStorage.ape_session_mode = '1'`,
`localStorage.ape_session_providers = 'line.tivi-ott.net'`). Precedencia:
**opciones de la llamada → `window.APE_SESSION_*` → `localStorage` → default (OFF)**.

### 5.2 Desactivación

| Nivel | Acción | Efecto | Riesgo |
|---|---|---|---|
| **1. Sólo generador** | borrar `window.APE_SESSION_MODE` (o `localStorage.removeItem('ape_session_mode')`) | las listas vuelven a salir **DIRECTAS** (comportamiento actual, byte a byte) | nulo; no toca el VPS |
| **2. Plano en reposo** | `systemctl stop ape-supervisor@main.service` | no se abren sesiones nuevas; las listas de sesión dejan de servir (el borde devuelve error de sesión) | las listas de sesión ya publicadas dejan de reproducir |
| **3. Plano retirado** | `systemctl disable --now ape-supervisor@main.service` + quitar el include de nginx + `nginx -t` + `reload` | desaparece `/sess/` y `/mf/` | exige el rollback de §8 |
| **4. Limpieza** | `systemctl stop ape-ingest@<key>` (su `ExecStopPost` ejecuta `--cleanup --own-gen`) + borrar `/etc/mediafanout`, `/run/mediafanout`, `/var/lib/mediafanout`, `/dev/shm/mf` | estado a cero | destructivo: guardar antes `urls.conf` |

> **Regla:** para "apagar el producto" basta el **nivel 1** (es el interruptor real del propietario);
> los niveles 2–4 son operaciones de infraestructura y requieren aprobación.

---

## 6. Límites medidos y criterios de capacidad

### 6.1 Límites de configuración (staging = producción propuesta)

| Límite | Valor | Dónde | Base |
|---|---:|---|---|
| **`MAX_SESSIONS`** | **12** (techo medido **16**) | coordinador (`set $mf_max_sessions "12"`, `ape_session.lua`) y supervisor (`MF_MAX_SESSIONS`) | memoria (`~139 MiB`/sesión con ventana 8 seg), tmpfs y margen de 800 MiB libres |
| `MAX_VIEWERS_PER_SESSION` | 24 | coordinador | egress y aislamiento |
| `MAX_TOTAL_VIEWERS` | 120 | coordinador | `120 × 5,5 Mbps < 1 Gbit/s` |
| Ventana | **8 segmentos** (`HLS_LIST_SIZE=8`) | worker | 6 s de segmento ⇒ ~48 s de ventana |
| **Cota de ventana** | **80 MiB** (`MF_WINDOW_MAX_BYTES=83886080`) | worker | peor caso 8 × 10 s × 7,6 Mbps ≈ 76 MiB |
| `MemoryMax` / `MemoryHigh` | **180 M** / 150 M | unidad | RSS medido 65 MiB + margen |
| `CPUQuota` | **60 %** de un core | unidad | remux usa ~1,1 % de un core; el límite sólo evita runaway |
| `TasksMax` / `LimitNOFILE` | 64 / 4096 | unidad | — |
| `WatchdogSec` | 15 s | unidad | medido: con `WATCHDOG=1` cada 3 s sobrevive; sin pings muere a los 15 s |
| `TimeoutStartSec` / `TimeoutStopSec` | 30 s / 15 s | unidad | 30 s > timeout interno de arranque (20 s) |
| `StartLimitBurst` | 5 / 300 s | unidad | última red anti-martilleo |
| Linger / tope | 25 s / 90 s | coordinador | sesión zombi acotada |
| `session_ttl` / `viewer_ttl` | 180 s / 30 s | coordinador | refresco por heartbeat/publish |
| `MIN_FREE_BYTES` | 96 MiB | worker | no empezar a ingerir sin margen en tmpfs |

### 6.2 Presupuesto medido por sesión (remux `-c copy`)

| Medición | Valor |
|---|---:|
| CPU por segundo de contenido | **0,0108 core** (1,08 % de un core) ⇒ 3 cores = 277 sesiones teóricas (**la CPU no es el límite**) |
| RSS de ffmpeg | **65 MiB** |
| Ventana tmpfs (8 seg, peor caso 7 Mbps) | ~70 MiB |
| Buffers nginx por cliente | ~0,06 MiB |
| **Total por sesión** | **~139 MiB** |
| Sesiones por memoria (2 600 MiB útiles) | ~18 |
| Sesiones por tmpfs (cap 1,2 GB) | ~17 |
| **Techo seguro simultáneo** | **16** |
| **Recomendado en producción** | **12** |

### 6.3 Egress

| Escenario | Mbps | Veredicto (1 Gbit/s nominal) |
|---|---:|---|
| 12 sesiones × 5 Mbps × 1 espectador | 60 | GO |
| 12 sesiones × 5 Mbps × 10 espectadores | 600 | GO (60 % del puerto) |
| 12 sesiones × 5 Mbps × 20 espectadores | 1 200 | **NO** (satura) |

### 6.4 4K escalado = **NO-GO** en este VPS (por eso va apagado y gateado)

| Prueba | fps | speed | CPU | core·s / s de contenido | Cores para 1× en 3 vCPU | RSS |
|---|---:|---:|---:|---:|---:|---:|
| **x265 1080p→2160p** `ultrafast` (contenido real) | **8,9** | **0,356×** | 269 % | **7,61** | **0,39×** | 542 MiB |
| x265 2160p30 sintético `ultrafast` | 12 | 0,412× | 264 % | 6,42 | 0,47× | 480 MiB |
| x265 2160p30 sintético `medium` | 5,9 | 0,194× | 245 % | 12,62 | 0,24× | 572 MiB |
| x264 1080p→2160p `ultrafast` | 39 | 1,56× | 230 % | 1,50 | 2,0× (1 stream) | 243 MiB |

Un solo stream 4K HEVC en tiempo real exige **7,6 cores**; el VPS tiene **3 vCPU**. GPU: **no hay**
(`virtio`, VAAPI falla con `resource allocation failed`). ⇒ **4K por transcode: NO-GO.**
El perfil 4K escalado queda en el diseño con `state: off` y gate por hardware; **no** se activa por
defecto y no forma parte de esta integración.

### 6.5 HDR — verdad, no marketing

- Remux `-c copy`: el bitstream **es el de la fuente**; si la fuente es HDR, se conserva HDR.
- **NUNCA** se etiqueta HDR algo que sólo fue escalado o remuxeado (NO-GO explícito).
- Sin GPU ni transcode, el sistema **no produce** HDR nuevo: sólo preserva el real.

### 6.6 Criterios de capacidad (cuándo escalar o recortar)

1. **Sesiones**: mantener `sessions_active` ≤ **12**. Con 12–16, subir sólo con evidencia de memoria
   libre > 800 MiB y tmpfs < 60 %. Por encima de 16 ⇒ **nodo nuevo** (no forzar este).
2. **Egress**: con 12 sesiones, el techo práctico es ~10 espectadores/ sesión simultáneos
   (`max_total_viewers=120`). Si se satura el puerto, bajar `max_total_viewers`, no `MAX_SESSIONS`.
3. **tmpfs**: si el janitor empieza a borrar por presupuesto (`--cleanup` con motivo `budget`), hay
   más sesiones que ventana: recortar sesiones o subir el montaje dedicado (`/run/mediafanout`, 1,2 GiB).
4. **Arranque**: cold start medido **p50 3.310,3 ms / p95 3.324,6 ms** (50 clientes simultáneos).
   Si p95 supera ~5 s de forma sostenida, revisar latencia del proveedor antes de tocar límites.
5. **Denegaciones**: los motivos `max_sessions` / `max_viewers` / `max_total_viewers` son **esperados**
   con 503 + `Retry-After: 1`; no son fallos. Cualquier otro `X-APE-Reason` sí es incidencia.

---

## 7. Integración en el generador (G1)

### 7.1 El flag

`frontend/js/ape-v9/generation-controller.js` incorpora el flag **`ape_session_mode`**
(alias `apeSessionMode`, `sess_mode`) con **default `false`**.

| Estado | RFC 8216 / anti-509 | Salida |
|---|---|---|
| **OFF (default)** | — | **byte-idéntica** a la lista actual. El controlador no añade opciones al generador ni transforma ninguna línea. |
| **ON + allowlist** | 1 URL por canal | cada canal habilitado emite **una** URL absoluta `…/sess/<proveedor>/<canal>/live.m3u8`; el resto sigue **directo** |
| **ON sin allowlist** | — | no se enruta nada; aviso al operador y lista **DIRECTA** (cobertura intacta) |

### 7.2 Qué emite exactamente (ON)

```
https://<base>/sess/<proveedor>/<canal>/live.m3u8
```

- **`<base>`** = `ape_session_base` → `window.APE_SESSION_BASE` → `localStorage` → default =
  **origen del endpoint de probe** (`https://iptv-ape.duckdns.org`). `''` ⇒ rutas relativas
  (avanzado; un fichero local en un player no resuelve relativas).
- **`<proveedor>`/`<canal>`** = los mismos tokens del supervisor (§3.6); si no cumplen, el canal
  **queda directo** (nunca se pierde).
- La entrada por defecto es **`live.m3u8`** (`ape_session_entry` admite `live|playlist|index.m3u8`).

**Por qué 3 segmentos y no `/sess/<prov>/<canal>.m3u8`:** la única `location` que enruta el borde es
`^/sess/(?<sess_provider>[^/]+)/(?<sess_channel>[^/]+)/(?:live|playlist|index)\.m3u8$`
(`media-fanout.conf:348`); la forma corta cae en `location /sess/` → **404**
(`media-fanout.conf:353`). Por eso el emisor añade el fichero de entrada, y el test lo comprueba
contra la regex real del borde.

**Anti-509:** si un bloque de canal trajera más de una URI, la primera se reescribe a la sesión y las
extra se convierten en tag **inerte** `#EXT-X-APE-SESSION-EXTRA:<url>` (RFC 8216 §6.3.1: los tags
desconocidos se ignoran). El player nunca abre una segunda conexión directa al proveedor.

**Directivas intactas:** `#EXTHTTP`, `#EXTVLCOPT`, `#KODIPROP`, `#EXT-X-APE-*` y cualquier otro tag se
emiten sin tocar; sólo cambia la línea URI del canal. `LF`/`CRLF` se preservan.

**Cabecera inerte de trazabilidad** (sólo en modo sesión), tras `#EXTM3U`:

```
#EXT-X-APE-SESSION-MODE:on
#EXT-X-APE-SESSION-ENTRY:live.m3u8
#EXT-X-APE-SESSION-PROVIDERS:line.tivi-ott.net
#EXT-X-APE-SESSION-SINGLE-URL:yes
#EXT-X-APE-SESSION-DOC:docs/MEDIA_FANOUT_DEPLOY.md
```

### 7.3 Cobertura: **el número de canales no se toca**

**Reglamento del propietario (2026-10-25):** la diferencia entre listas (23.510 catálogo completo vs
~10.520 seleccionados a mano por calidad) es **INTENCIONAL**. El generador **emite exactamente el
conjunto que recibe**: no filtra, no deduplica, no "corrige" y no recorta por host.
En modo sesión, **los canales de hosts no habilitados siguen DIRECTOS** con su URL original byte a
byte (así se evita el fallo histórico 23.510 → 10.520). Verificación medida: 10 canales de entrada ⇒
10 `#EXTINF` y 10 líneas URI en la salida (7 sesión + 3 directos).

### 7.4 Verificación de la integración (reproducible)

```bash
# sintaxis y presencia del flag (contrato de la tarea)
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/generation-controller.js
cd IPTV_v5.4_MAX_AGGRESSION && node -e "const s=require('fs').readFileSync('frontend/js/ape-v9/generation-controller.js','utf8'); if(!/ape_session_mode|apeSessionMode|sess_mode/.test(s)){console.error('FALTA EL FLAG');process.exit(1)} console.log('FLAG_OK')"
```

Banco de la integración (Node, sin navegador: carga el controlador en un `vm` con stubs del
generador y compara contra los bytes de `HEAD`):

| Medición | Resultado |
|---|---|
| OFF: opciones (`merged`) y canales entregados al generador vs versión previa | **idénticos** (comparación JSON exacta) |
| OFF: ruta de emisión DUAL (lista DIRECTA y lista CDN) antes vs después | **sha256 idénticos** (la lista directa es exactamente la salida del generador) |
| OFF: ¿se usa la ruta de transformación? | **no** (`generateStream` no se invoca) |
| ON: 10 canales con 2 hosts habilitados | 10 `#EXTINF`, **10 líneas URI**, 7 `/sess/` + 3 directos, 1 extra neutralizada |
| ON: forma de las URLs | 100 % casan con la `location` real del borde; base/entry configurables |
| ON: credenciales | la lista publicada **no contiene** usuario, contraseña ni token (quedan en `urls.conf`) |
| ON: directivas | `EXTHTTP`/`EXTVLCOPT`/`KODIPROP`/`CODEC` intactas; CRLF preservado |
| ON sin allowlist | cae a la ruta clásica y avisa (ningún canal se pierde) |

### 7.5 Auditoría en modo sesión

Con el flag ON el pipeline **no** prueba URLs del proveedor desde el navegador (eso multiplicaría
peticiones fuera del `single-flight`). La salud se lee en el coordinador:
`GET /mf/health`, `GET /mf/metrics` (Prometheus) y los contadores `deny:*`.

---

## 8. Rollback

### 8.1 Rollback del generador (inmediato, sin VPS)

```js
delete window.APE_SESSION_MODE;                     // o window.APE_SESSION_MODE = false
localStorage.removeItem('ape_session_mode');        // si se activó persistente
```

La siguiente lista sale **directa** (comportamiento previo, byte a byte). El flag nunca escribe en el
repo ni en el VPS: no hay nada más que revertir.

### 8.2 Rollback del plano (infraestructura)

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ); B=/root/media-fanout-rollback-$TS
mkdir -p "$B"

# 1) estado actual (para poder volver a subir)
cp -a /etc/nginx/lua/ape_session.lua "$B"/ 2>/dev/null || true
cp -a /etc/systemd/system/ape-ingest@.service \
      /etc/systemd/system/ape-supervisor@.service "$B"/ 2>/dev/null || true
cp -a /opt/mediafanout "$B"/opt-mediafanout 2>/dev/null || true
nginx -T > "$B/nginx-T-before.txt" 2>/dev/null || true

# 2) parar el plano (sin tocar el nginx de producción)
systemctl stop ape-supervisor@main.service 2>/dev/null || true
systemctl disable ape-supervisor@main.service 2>/dev/null || true
#    cada stop dispara ExecStopPost=-/usr/local/bin/ape-ingest.sh --cleanup --instance %i --own-gen,
#    que borra la generación si el flock está libre (es la vía MEDIDA en F2: no hace falta
#    invocar el script a mano; `--cleanup` exige key/instancia y la recibe del EnvironmentFile)
for k in $(ls /run/mediafanout/spec/*.env 2>/dev/null | sed 's#.*/##; s#\.env$##'); do
    systemctl stop "ape-ingest@$k" 2>/dev/null || true
done
systemctl list-units 'ape-ingest@*' --no-pager   # debe quedar vacío

# 3) quitar binarios/unidades/módulo
rm -f /usr/local/bin/ape-ingest.sh
rm -rf /opt/mediafanout
rm -f /etc/systemd/system/ape-ingest@.service /etc/systemd/system/ape-supervisor@.service
systemctl daemon-reload
rm -f /etc/nginx/lua/ape_session.lua

# 4) si se había expuesto en 443: quitar el include y validar SIEMPRE antes de recargar
#    (patrón de scripts/rollback.sh + expose-443.sh: backup del vhost, quitar snippet, nginx -t)
nginx -t && systemctl reload nginx

# 5) estado y ventanas (los datos NO se borran solos: contienen credenciales)
ls -la /dev/shm/mf /run/mediafanout 2>/dev/null
#    /etc/mediafanout/urls.conf y providers.allow se conservan salvo decisión explícita:
#    rm -rf /etc/mediafanout /run/mediafanout /var/lib/mediafanout /dev/shm/mf
```

**Criterio de rollback seguro:** si `nginx -t` falla en cualquier paso, **restaurar** desde `$B` y
**no recargar**. El rollback nunca debe dejar el nginx de producción sin recargar válidamente.

### 8.3 Rollback de la unidad (systemd)

`ape-ingest@.service` tiene `RestartPreventExitStatus` con **13 códigos + 23 señales (36 tokens)**:
systemd **nunca** reejecuta el worker con el mismo spec. El único que reinicia (con `gen++` y spec
nuevo) es el supervisor. `StartLimitBurst=5` es la última red. Si hubiera que volver a la unidad
anterior: `cp "$B/ape-ingest@.service" /etc/systemd/system/ && systemctl daemon-reload`.

---

## 9. Prueba crítica (V1 / V3) — qué demuestra y cómo repetirla

**Qué demuestra (medido, `--shim-delay 0`, sin trampas):**

| Criterio | Evidencia |
|---|---|
| **N → 1** conexión upstream | `origin max_active=1` en cold/1/5/50/100/snapshot/aislamiento/fencing; sonda `ss`: 20 hits, 72 muestras positivas, `max_ss_lines=1`, `max_proc_tcp=1`, 1 `ffmpeg`; aceptaciones del origen 0,99 → 1,04 → 1,06/s (no escala con N) |
| **Misma secuencia** | 1.100 playlists, MSN 3..15, `signature_mismatches=0`, `duplicate_segments=0`, `window_holes=0`, `msn_regressions=0`; 5/5 snapshots byte-idénticos |
| **Timestamps** | 6 segmentos / 300 packets: `gaps_fuera_rango=0`, `dts_back=0` |
| **Entrada de player O2** | 50 clientes, 500 peticiones, **500 HTTP 200**, `X-MF-Gen` 500/500, 0 URIs relativas, 4.000 absolutas, 500/500 segmentos 200 |
| **F1 (credenciales)** | URL con `user:pass` + token: 0 logs no-`0600`, 0 coincidencias del secreto, probe ffmpeg redactado |
| **F2 (fencing/tmpfs)** | SIGKILL del grupo ⇒ playlist vieja congelada; `--cleanup --own-gen` 2.381.368 B → **0 B**, key dir ausente, cierre 11 s; gen nueva 2; gen vieja 302 `stale_generation`; 1 worker / 1 ffmpeg |
| **Límites** | 2 sesiones (máx. reducido en staging), 3ª 503 `max_sessions`; viewer 4 → 503 `max_viewers`; 6º global → 503 `max_total_viewers`; conectados 12/12 y 6/6 intactos |
| **Cold start** | 50/50 HTTP 200; p50 **3.310,3 ms**, p95 **3.324,6 ms** |
| **Prod intacta** | nginx `MainPID` idéntico antes/después, sha de `nginx.conf` sin cambios, `journal_events=0`; `/dev/shm/mf` final 0 B/0 entradas |

**Cómo repetirla (requiere aprobación: arranca procesos de ingesta en staging):**

```bash
scp -r _vps_stage/* root@<vps>:/tmp/mf_stage/
MF_STAGE_SRC=/tmp/mf_stage bash /tmp/mf_stage/tests/fanout_concurrency.sh --shim-delay 0 --keep
# → RESULT=PASS_INVARIANT, exit 0; evidencia en /tmp/mf_v1/evidence.txt
```

**Qué invalida este informe:** cualquier cambio en `ape-ingest.sh`, `ape-ingest@.service`,
`ape-supervisor.sh/.lua`, `ape_session.lua`, `media-fanout.conf` o `fanout_concurrency.sh` respecto a
los SHAs de `docs/MEDIA_FANOUT_FINAL_VERIFICATION.md` §1. Los SHAs de esa tabla son la referencia.

**Limitaciones honestas:** la corrida de staging usa un origen HLS local (no el proveedor real); los
topes de la fase de límites se reducen para provocar los 503 (el camino de código es el mismo); el
4K y el HDR no forman parte de la verificación (están apagados/gateados).

---

## 10. Operación y observabilidad

| Recurso | Uso |
|---|---|
| `GET /mf/health` | JSON saneado (público): sesiones, generaciones, salud de supervisor |
| `GET /mf/metrics` | Prometheus (**sólo loopback**) |
| `POST /mf/ctl?op=…` | control del plano (**sólo loopback**) |
| `gauge:sessions_active`, `deny:*` | sesiones vivas y motivos de denegación (`max_sessions`, `max_viewers`, …) |
| `X-MF-Gen`, `X-MF-Gen-Current` | generación servida / vigente |
| `X-MF-Jump-To-Live`, `X-APE-Reason` | desvío a live y motivo (`stale_generation`, `window_gap`) |
| logs del worker | `0600` en `STATE_DIR` `0700`, redactados, borrados al parar (salvo `--keep-logs`) |
| janitor | al arrancar y en `--cleanup`: barre por edad (300 s) y presupuesto (80 % tmpfs) respetando sesiones con worker vivo |

Comandos útiles:

```bash
systemctl status ape-supervisor@main.service --no-pager
systemctl list-units 'ape-ingest@*' --no-pager
ls -la /dev/shm/mf                     # ventanas
du -sh /dev/shm/mf                     # presupuesto tmpfs
journalctl -u 'ape-ingest@*' -n 50 --no-pager
ls /run/mediafanout/spec/*.env 2>/dev/null | wc -l   # sesiones con spec (no lee su contenido)
```

> `MF_UPSTREAM_URL` contiene credenciales: **no** volcar ese fichero en un ticket ni en un log.

---

## 11. Riesgos residuales y prohibiciones

| Riesgo | Estado | Mitigación |
|---|---|---|
| URL con ticket visible en `/proc/<pid>/cmdline` | abierto (ffmpeg 6.1 no acepta fichero) | `ProtectProc=invisible`, `User=mediafanout`, dirs `0770`, logs redactados (§3.5) |
| Usuario `mediafanout` aún no existe en staging | pendiente de despliegue | §3.1; mientras tanto la unidad corre como `root` con el resto del aislamiento |
| Idem = `host\|último-segmento-del-path` | limitación del diseño | si un proveedor sirve **streams distintos** con el mismo último segmento bajo el mismo host, **no habilitar** ese host hasta que `urls.conf` pueda desambiguar |
| `/dev/shm` compartido con otras cachés | aceptado en staging | producción: montaje dedicado 1,2 GiB en `/run/mediafanout` (W1 §5.2) |
| Topes de límites no ejercitados numéricamente con 12/24/120 | honesto | el camino de código y los motivos 503 son los mismos; la fase de límites usó topes reducidos |
| 4K escalado | **NO-GO** en este VPS | apagado y gateado; sólo nodo con GPU (§6.4) |

**Prohibido (doctrina del propietario):**

- `apt install` en el VPS (nginx 1.24 + ngx_http_lua 0.10.26 ya cubren todo).
- Instalar binarios bajo `/run` (`noexec` ⇒ `203/EXEC`).
- Buffer infinito: la ventana **siempre** acotada (8 / 80 MiB) + descarte + jump-to-live.
- Etiquetar HDR algo escalado o remuxeado.
- Transcode en la ruta por defecto (el default es **remux `-c copy`**).
- Tocar la producción del VPS sin aprobación explícita y sin backup + `nginx -t`.
- Cambiar el número de canales de la lista (ni filtrar, ni deduplicar, ni "corregir").
- Publicar credenciales: en modo sesión viven **sólo** en `urls.conf` (`0640`).

---

## 12. Estado y pendientes para producción

**Hecho y verificado (staging):** worker + supervisor + coordinador + borde, single-flight, secuencia
única, aislamiento, fencing, límites, F1/F2, cold start, O2 (playlist absoluta con `X-MF-Gen`),
selftests (`--selftest` 156/156 worker; 171/171 con remux; 63/63 coordinador; 67/67 supervisor) y la
integración del generador con el flag **OFF por defecto**.

**Pendiente (requiere aprobación, en este orden):**

1. Crear el usuario `mediafanout` y ajustar permisos/unidad (§3.1) — **bloqueante** de producción.
2. Montaje dedicado de la ventana (1,2 GiB) si se superan ~8 sesiones.
3. Exposición en 443 con snippet, backup del vhost y `nginx -t` + `reload` (paso aparte).
4. Prueba end-to-end con un **player real** (VLC/hls.js/TiviMate) sobre un canal del proveedor
   autorizado, midiendo time-to-first-frame y rebuffer.
5. Activar el flag del generador **después** de que (1)-(4) estén verdes, y empezar con **un** host en
   `APE_SESSION_PROVIDERS` = `providers.allow`.
6. Repetir la prueba crítica V1/V3 contra el proveedor real (con URL autorizada) — hoy medida con
   origen local.

---

### Referencias

- `docs/MEDIA_FANOUT_FEASIBILITY.md` — viabilidad, medidas de CPU/RAM/tmpfs, 4K NO-GO, versiones.
- `docs/MEDIA_FANOUT_CONCURRENCY_REPORT.md` — V1: 50→1, coherencia, aislamiento, fencing, límites.
- `docs/MEDIA_FANOUT_FINAL_VERIFICATION.md` — V3 final: veredicto PASS, 28/28 invariantes, SHAs.
- `docs/VPS_UPSCALE_4K_DESIGN.md` — diseño del perfil 4K (gateado).
- `frontend/js/ape-v9/generation-controller.js` — flag `ape_session_mode` (default OFF).
