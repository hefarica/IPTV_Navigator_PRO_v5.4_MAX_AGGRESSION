# APE Stability Console

Entrada en la **barra lateral izquierda** del Harness y panel de **solo lectura** para la
estabilidad extrema de IPTV 4K en el ecosistema APE. Cuatro tarjetas, cuatro fuentes
medidas, y un `no computado` con su razon donde no se puede medir.

- Bundle: `@local/ape-stability-console` · panel id `ape-stability-console`
- Host half: `index.js` (dos rutas JSON same-origin + un unico sondeo ssh read-only)
- Client half: `client.js` (`sidebar.panellist` + `main`)
- Verificado: `selfcheck.mjs` **75/75**, `client-check.mjs` **55/55**, ronda live **83/83**

---

## 1. Que muestra, y de donde sale cada numero

| Tarjeta | Datos | Fuente exacta |
|---|---|---|
| **Disponibilidad** | estado `active/failed` de `nginx`, `php8.3-fpm`, `ape-jit`; los timers `ape-*` con su estado; veredicto del vigilante de 7 modulos | `systemctl is-active <u>`, `systemctl list-timers --all "ape-*.timer"`, `systemctl list-units --all "ape-*.timer"`, `cat /var/lib/ape/module-watchdog.json` |
| **Proyeccion (gate [11])** | bytes, canales, tags `#EXTSHIMOTT`, lineas `#EXT-X-APE-`, antiguedad | la medicion del propio gate (fila `proyeccion` del vigilante) + recuento real bajo demanda: `stat -c%s`, `grep -c '^#EXTINF'`, `grep -c '^#EXTSHIMOTT:'`, `grep -c '^#EXT-X-APE-'`, `stat -c%Y` |
| **Estabilidad** | score por canal, veredicto PASS/FAIL/SKIP | formula de la skill **`iptv-stream-stability-score`** §5 sobre `/var/log/nginx/playlist_access.log` |
| **Failover y errores** | ultimos 5xx/timeout reales, clasificacion de la ventana, si el failover esta armado | `/var/log/nginx/playlist_error.log`, `/var/log/nginx/playlist_access.log`, `nginx -T` |

### La formula de estabilidad, literal a la skill

```
S(c) = 100 · Σ(w_i · X_i) / Σ(w_i)      sobre los componentes COMPUTADOS
w: A=0.40 (disponibilidad)  L=0.20 (arranque)  C=0.30 (continuidad)  F=0.10 (frescura)

A = (n_2xx + n_3xx) / (n_2xx + n_3xx + n_5xx + n_4xx_prov + n_000)
L = clamp(1 − (p50(rt)/0.649 − 1)/2, 0, 1)      # p50_ref medido del stack (LIVE_CAPTURE:259)
C = 1 − min(1, gap_malo/gap_total)              # solo si la cadena /pulse → /seg es atribuible
F = 1.0 / 0.5 / 0.0 por tasa de stale=1         # requiere X-APE-Pulse persistido
```

Reglas que este plugin aplica y **no** reinventa:

- `401/403/407/429/451/461` cuentan como **bloqueo del proveedor** (`bloqueo_proveedor`), nunca
  como fallo de red; `499` (zapping del operador) queda **fuera** del denominador de `A` y de `L`.
- Los `502` (y todo 5xx) se excluyen de `L`: una latencia de 502 no es un zapping bueno.
- `n < 30` es **SKIP**, no un cero. Un `SKIP` **no lleva score**: evidencia insuficiente no es un 0.
- Si falta un componente, los pesos se **renormalizan** y el resultado lleva `confianza: parcial`.
- La banda `A ∈ [0.90, 0.98)` no tiene etiqueta en la skill: se declara **`SIN_VEREDICTO`** en vez
  de inventar una cuarta etiqueta.
- Un `FAIL` **no autoriza** degradar ni borrar nada (`NO CHANNEL LOSS`).

### Lo que NO se computa, y por que (medido, no supuesto)

| Componente | Estado | Razon medida |
|---|---|---|
| **C** (continuidad, peso 0.30) | NO COMPUTADO | las URIs `/seg/` son base64 de una URL del proveedor (`…/hls/<hash>/548065_827.ts`) que **no lleva id de canal**: medido `0 de 127` URIs muestreadas atribuibles. La skill prohibe estimarlo. |
| **F** (frescura, peso 0.10) | NO COMPUTADO | `log_format ape_playlist` no registra `$sent_http_x_ape_pulse` y el header no se persiste: sin serie historica no hay `F`. |
| 5xx **desde `playlist_error.log`** | reclasificado | ese fichero es el `error_log` de nginx (`error_log … warn`), **no** un access log: no contiene codigos de estado en formato de acceso. Los 5xx se cuentan desde `playlist_access.log`; del error log se extraen los **eventos de red** (`upstream timed out`, `prematurely closed`, `recv() failed`, …). |
| Ruido FastCGI | separado | de 1018 lineas `[error]`, **819 son mensajes PHP `ara-sync ok` por FastCGI** y solo **8** son eventos de red reales. Contarlas todas como "errores" seria mentir. |

---

## 2. Evidencia de la ultima lectura (2026-11-15T12:2x UTC)

Obtenida **a traves de la propia ruta del plugin dentro del Harness** (no de un script aparte):

```
GET  http://127.0.0.1:3090/ape-stability-console/api/state?probe=1&refresh=1   -> HTTP 200 · 32.972 B
POST http://127.0.0.1:3090/ape-stability-console/api/gate                      -> HTTP 200 · 32.927 B
GET  http://127.0.0.1:3090/ape-stability-console/api/gate                      -> HTTP 405
GET  http://127.0.0.1:3090/definitely-not-a-route-xyz                          -> HTTP 404   (control)
```

```
plugin      = @local/ape-stability-console@1.0.0
services    = nginx=active  php8.3-fpm=active  ape-jit=active
timers      = 11 listados   dead = ape-quality-watch.timer (inactive/dead)
watchdog    = OK  fallos=0  modulos=7
gate [11]   = ok   "186789613B · 21224 canales · 21224 tags"
recount     = canales=21224  tags=21224  ape=0  bytes=186789613   -> verdict ok
stability   = 68 canales en ventana · 563 muestras · 1 con n>=30 · PASS 0 / FAIL 0 / SKIP 68
failover    = armed=true  multiBackend=false  providerBlock=353  5xx=254  netEvents=8
remote      = 2616 ms · 1 intento ssh · BatchMode · publickey
```

Lectura honesta de esos numeros:

- **Los tres servicios y los 11 timers estan vivos**, pero `ape-quality-watch.timer` esta
  `inactive/dead`: declarado y **no armado**. El panel lo nombra en vez de contarlo como OK.
- **El gate [11] y el recuento en vivo coinciden exactamente** con la cifra del operador
  (186.789.613 B · 21.224 canales · 21.224 tags · 0 lineas APE). La lista servida esta intacta.
- **El score sale todo SKIP**: la ventana por defecto (12.000 lineas) solo da `n>=30` a 1 canal.
  Eso **no es un cero**, es falta de muestra. Se sube con `APE_STABILITY_CONSOLE_WINDOW`.
- **`failover` esta armado a medias**: hay `proxy_next_upstream error timeout;` en el plano de
  metadata, pero **0 bloques `upstream` con servidor `backup`** → no hay failover entre backends.
- **353 bloqueos del proveedor frente a 254 5xx** en la misma ventana: mezclarlos habria producido
  un diagnostico falso. El 407 medido viene del canary del propio vigilante contra
  `line.tivi-ott.net`, no de un fallo de red.

---

## 3. Activacion — estado real y comandos exactos

**Ya esta ACTIVADO y corriendo.** Lo instalo el plugin manager en el perfil `web`:

```
plugin_manager action=install_bundle
  target=C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\dsh-plugins\ape-stability-console

-> {"stage":"enable","target":"@local/ape-stability-console","enabled":true,"changed":true,
    "application":"applied","warnings":[]}
-> pnpm: "@local/ape-stability-console link:C:/…/dsh-plugins/ape-stability-console" (sin paquetes externos)
```

Verificacion del montaje (sin aprobaciones, dentro del propio Harness):

```
plugin_manager action=list_plugins  ->  {"entryId":"include:ape-stability-console",
                                          "moduleName":"@local/ape-stability-console",
                                          "enabled":true,"fiberPhase":"active",
                                          "patchId":"ape-stability-console"}
```

`fiberPhase: active` = la mitad Host esta **montada**, y sus dos rutas responden 200/405 como se
ve en §2. El perfil es `web` (`DSH_PROFILE=web`), cuyo `node_modules/@local/ape-stability-console`
es un junction al directorio de este repo.

Si algun dia hay que reinstalarlo desde cero, el comando exacto es:

```powershell
# 1. instalar + habilitar (idempotente; no descarga paquetes externos)
#    via la herramienta del agente:
#       plugin_manager action=install_bundle
#                     target=C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\dsh-plugins\ape-stability-console
# 2. verificar el montaje
#       plugin_manager action=list_plugins     (buscar include:ape-stability-console -> fiberPhase active)
# 3. abrir la GUI (http://127.0.0.1:3090), refrescar la pagina y mirar el sidebar:
#       "Estabilidad APE"  (orden 23, icono de monitor con traza)
```

> No se toco `agent.cordis.yml`, `preset.yml` ni ningun perfil a mano. El unico cambio de estado
> es la fila que `install_bundle` escribio en el patch del perfil `web` (id `ape-stability-console`).

## 4. ROLLBACK exacto

```powershell
# A) desactivar sin desinstalar (efecto inmediato, sin reiniciar nada)
#    plugin_manager action=set_bundle target=@local/ape-stability-console enabled=false
#
# B) desinstalar del perfil y borrar el enlace
#    plugin_manager action=remove_bundle target=@local/ape-stability-console
#
# C) borrar el codigo (solo si se quiere eliminar del repo)
#    Remove-Item -Recurse -Force "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\dsh-plugins\ape-stability-console"
```

Despues de A o B, refrescar la pagina de la GUI: la entrada del sidebar desaparece. El plugin no
escribe nada fuera de su propio directorio, asi que no hay mas estado que revertir. **El VPS no se
toca en ninguna direccion**: todo el trafico remoto es lectura (`systemctl is-active/list-timers/
list-units`, `stat`, `grep -c`, `tail`, `cat`, `nginx -T`).

## 5. Configuracion (variables de entorno, todas opcionales)

| Variable | Default | Para que |
|---|---|---|
| `APE_STABILITY_CONSOLE_HOST` | `178.156.147.234` | host del VPS |
| `APE_STABILITY_CONSOLE_USER` | `root` | usuario ssh |
| `APE_STABILITY_CONSOLE_PORT` | `22` | puerto ssh |
| `APE_STABILITY_CONSOLE_KEY` | `C:\Users\HFRC\.ssh\id_ed25519_hetzner` | clave privada |
| `APE_STABILITY_CONSOLE_SSH` | (vacio) | `off` desactiva el sondeo: las 4 tarjetas pasan a `no computado` con la razon |
| `APE_STABILITY_CONSOLE_TIMEOUT_MS` | `25000` | tope por lectura remota (2 s – 120 s) |
| `APE_STABILITY_CONSOLE_WINDOW` | `12000` | lineas de `playlist_access.log` analizadas (500 – 200.000) |
| `APE_STABILITY_CONSOLE_LIST` | `/var/www/html/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8` | fichero del gate [11] |
| `APE_STABILITY_CONSOLE_SSH_BIN` | `ssh` | binario ssh explicito |

**Para tener `n>=30` por canal** hay que ensanchar la ventana, porque el log rota a diario:

```powershell
$env:APE_STABILITY_CONSOLE_WINDOW = '120000'
# reiniciar el Harness para que el proceso Host tome la variable, o exportarla en el perfil
```

## 6. Garantias de seguridad (verificadas en `selfcheck.mjs`)

- **El comando remoto es una constante.** Ningun valor de la peticion HTTP llega al shell: la query
  solo elige que secciones ya whitelisteadas se ejecutan.
- **Solo lectura.** `selfcheck` falla si el script contiene `systemctl start|stop|restart|reload|
  enable|disable|mask|kill`, `nginx -s`, `sudo`, redirecciones a `/etc|/var|/opt|/root|/usr|/home`,
  o `rm|mv|cp|tee|dd|truncate|sed -i`.
- **Inyeccion y traversal rechazados.** `..` en la ruta de la lista y cualquier intento de inyeccion
  shell lanzan excepcion antes de ejecutar nada. Host/usuario/puerto se validan con patron estricto
  (un `-oProxyCommand=` en una variable de entorno no puede convertirse en opcion de ssh).
- **Bounded.** `BatchMode=yes` (nunca pregunta), `ConnectTimeout`, `kill` al vencer, salida capada
  a 4 MiB. Un VPS caido degrada a `no computado` en vez de colgar la pagina.
- **Cache 30 s** con deduplicacion de peticiones concurrentes: el panel no puede martillear el VPS.
- **El recuento de 186 MB es opt-in** (boton "medir ahora"): la tarjeta muestra por defecto la
  medicion que el propio gate ya hace cada 60 s. No se anade carga a produccion en cada apertura.

## 7. Verificacion reproducible

```powershell
cd C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\dsh-plugins\ape-stability-console

node -c index.js          # exit 0
node -c client.js         # exit 0
node -c selfcheck.mjs     # exit 0
node -c client-check.mjs  # exit 0
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"

node selfcheck.mjs        # 75/75 checks passed          (exit 0)
node client-check.mjs     # 55/55 checks passed          (exit 0)

# ronda REAL contra el VPS (read-only, necesita la clave del operador)
$env:APE_STABILITY_CONSOLE_LIVE='1'; node selfcheck.mjs   # 83/83 checks passed
```

`selfcheck.mjs` no instala nada y no toca el Harness: importa la mitad Host, la monta sobre un
contexto stub que captura las rutas, y ejecuta el pipeline puro (script remoto → parser de
secciones → cuatro builders → formula del score) contra un fixture congelado con la **forma** real
de la salida del VPS. La ronda live solo comprueba **forma y coherencia**, y anade el assert de que
la lista servida sigue siendo la del operador (186.789.613 B).

`client-check.mjs` no prueba lo que el usuario ve: prueba que las dos mitades coinciden en el
contrato de datos, cargando `client.js` como lo hace la pagina (`window.__ModuleLoader__.load`),
recuperando la entrada del sidebar y el panel de los registros de slot, y renderizando ambos contra
payloads producidos por los **builders reales** mas los estados vacio y de error.

## 8. Limites honestos

- **El sidebar no se pudo verificar visualmente desde esta sesion.** El canal de inspeccion Cliente
  (`Slots.listSubTree`) respondio *timeout* (la pagina no esta conectada a este proceso) y la shell
  HTML de la GUI devuelve 401 sin la cookie del operador. Lo verificado es: fila del Loader
  `enabled:true / fiberPhase:active`, rutas Host respondiendo 200/405 en vivo, y el arbol del
  Client half renderizando en `client-check`. **Confirmacion pendiente del operador:** refrescar
  `http://127.0.0.1:3090` y mirar si aparece **"Estabilidad APE"** en el sidebar izquierdo.
- **El score no ve el device.** Un canal con score 100 puede congelarse en un decoder que no soporta
  el perfil: eso es `iptv-profile-fallback-doctrine`, no esta consola.
- **El score de esta ventana es descriptivo**, no validado: los pesos son la propuesta de la skill y
  su paso de calibracion (§10) aun no se ha hecho. Con 1 canal a `n>=30`, hoy sirve para ordenar.
- **`p50(rt)` tiene granularidad de segundos** en el log, asi que no resuelve diferencias < ~1 s.
- La tarjeta de proyeccion **no reescribe ni regenera** nada: si el gate marca `fail`, el panel lo
  muestra y no actua. La correccion de la lista es decision del operador.

## 9. Creditos de concepto (sin copiar codigo)

- Formula de score, pesos, umbrales y etiquetas PASS/FAIL/SKIP: skill **`iptv-stream-stability-score`**
  de este repo (que a su vez toma el **concepto** de `ottstreamscore` (MIT) — pesos explicitos,
  ventana larga, ranking de duplicados — y las etiquetas de `christheradioguy/stream-manager`).
- Patron de bundle Host+Client, rutas same-origin, `sidebar.panellist` y `main`: el plugin de
  referencia **`dsh-plugins/ape-profile-studio/`** de este mismo repo (misma organizacion de 10 ficheros).
- **No se copio codigo de ningun repo externo.** Las citas son de concepto y estan nombradas arriba.

## 10. Ficheros

| Fichero | Bytes | Rol |
|---|---|---|
| `index.js` | 45166 | mitad Host: rutas, sondeo ssh read-only, parser, formula, 4 builders |
| `client.js` | 39020 | mitad Client: `sidebar.panellist` + panel con las 4 tarjetas |
| `selfcheck.mjs` | 18981 | 75 checks offline + ronda live opcional |
| `client-check.mjs` | 15823 | 55 checks de render y contrato de datos |
| `cordis.patch.yml` | 356 | fila del Loader (`id: ape-stability-console`) |
| `package.json` | 919 | manifest del bundle + `dsh.client` |
| `locale/es.json` | 621 | titulo/descripcion del bundle |
| `locale/en.json` | 603 | idem en |
| `icon.svg` | 310 | icono del sidebar (monitor + traza de senal) |
| `README.md` | — | este documento |
