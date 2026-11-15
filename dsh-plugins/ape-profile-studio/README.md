# APE Profile Studio — plugin de DSH

Entrada en la **barra lateral izquierda** de la Harness Web UI + panel de **solo lectura**
del ecosistema APE: el contrato de perfiles, el clasificador por canal y el estado medido
de la lista servida.

> Regla que gobierna todo el panel: **lo que no se puede medir se declara `no computado`
> con su razón**. No hay perfiles, canales, conteos ni códigos HTTP inventados, y el plugin
> no escribe jamás en el generador M3U8, en la lista servida, en los perfiles ni en el runtime
> del Harness.

## Qué añade

| Pieza | Dónde | Efecto |
|---|---|---|
| Icono `APE Profile Studio` | slot `sidebar.panellist` (barra lateral izquierda, orden 21) | Selecciona el panel `ape-profile-studio` |
| Panel | slot `main`, key `ape-profile-studio` | Contrato de perfiles + clasificador + estado de la lista + artefactos medidos |
| Ruta `GET /ape-profile-studio/api/state` | mitad Host | Lee el contrato, el clasificador y el config; sondea la lista servida (`?probe=0\|1`, `?refresh=1`) |
| Ruta `POST /ape-profile-studio/api/classify` | mitad Host | Ejecuta el clasificador del proyecto sobre un bloque `#EXTINF` pegado |

Las dos rutas son **same-origin** y de **solo lectura**: existen porque el navegador no puede
leer el disco del workspace y una petición cross-origin a `iptv-ape.duckdns.org` la bloquearía
CORS. No aceptan escritura de ficheros.

## Secciones del panel

1. **Contrato de perfiles** — lee `contracts/ape_profiles_12.json`.
   - Si existe: tabla con las columnas que el documento realmente trae (ID, nombre, nivel, tier,
     resolución, códec, fallback, canales), más `path`, `shape`, bytes y sha256. Si el documento
     declara un número de perfiles distinto de las filas que lista, **se muestran los dos números
     tal como se leyeron**, sin reconciliar.
   - Si no existe: estado vacío explícito **«Contrato no encontrado»** con la ruta sondeada y su
     errno. La tabla **no se rellena con nada**.
   - Formas aceptadas: array, `{profiles: []}`, `{profiles: {P0: {...}}}`, `{perfiles: ...}` y
     cualquier objeto con una única propiedad que sea array de objetos. Otra forma se reporta
     como `unrecognized_shape` con las claves vistas.
2. **Clasificador** — pega un bloque `#EXTINF` (línea + tags + URL) y pulsa *Clasificar*.
   Muestra `{profile, fallback, confidence, reason}` y la interfaz usada.
   - Si el clasificador **no existe**: mensaje honesto y botón deshabilitado; no se simula nada.
   - Si existe pero no expone una interfaz usable: `unsupported_interface` + la lista de
     interfaces probadas con su motivo.
3. **Lista servida** — URL, origen de la URL, estado HTTP, `content-type`, `content-length`,
   `etag`, `last-modified` y una **muestra etiquetada como muestra** (líneas y tags de los
   primeros bytes, nunca presentados como el total). El `conteo completo de canales` queda
   siempre como `no_computado` con su razón (descargar ~186 MB no es aceptable para un panel).
   - Si el endpoint no responde: `no computado` con el motivo exacto (timeout, DNS, refused) y
     los intentos registrados.
4. **Artefactos medidos** — tabla de los tres artefactos (contrato, clasificador, config del
   generador) con estado, bytes y sha256, más la raíz de workspace resuelta y cómo se resolvió.
5. **Alcance honesto** — recordatorio de que el panel no modifica nada.

## Cómo entra el bloque pegado al clasificador

El clasificador del proyecto **no recibe texto**: `classify(channel, opts)` documenta
`channel = {name, group, url, probe:{width,height,codec,fps,hdr,bitrate,verified}, truth?}`
(`IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js:354-359`). Por eso el endpoint
**mapea el bloque pegado a esa forma** y solo rellena lo que el texto realmente trae:

| Campo | Origen |
|---|---|
| `name` | texto tras la primera coma del `#EXTINF` (o `tvg-name` si no hay coma) |
| `group` | atributo `group-title` |
| `url` | primera línea que no empieza por `#` |
| `tvgId` / `tvgName` | atributos, preservados |
| `probe` | **nunca se inventa**: un bloque pegado no aporta medición, y la rama sin probe del clasificador es la respuesta honesta a ese caso |

El panel muestra en el resultado **qué canal leyó** (`name · group`), la interfaz usada
(`module:classify`), el `score`, las `signals` y la `reason` que devolvió el clasificador —
incluida su propia advertencia cuando el resultado es una hipótesis y no una medida.

Orden de interfaces (se reporta cuál funcionó en `via`):

1. **Módulo**: importa el script y usa el primer export función entre `classify`,
   `classifyChannel`, `classifyExtinf`, `classifyExtInf`, `classifyLine`, `classifyExtinfLine`,
   `export default`, o la misma lista dentro de `default` (módulos CommonJS).
2. **CLI**: `node <clasificador> --json` con el bloque por `stdin` — **solo si el script lee
   `stdin`**. Este clasificador no lo lee: su `require.main === module` imprime un caso demo
   interno (`DAZN F1 4K` 1080p, `ape-profile-classifier.js:612-625`). Invocarlo habría devuelto
   la clasificación de **otro** canal; el panel lo omite y lo declara en `tried`.

Si ninguna interfaz responde, el panel **no inventa** una clasificación: muestra
`unsupported_interface` con las interfaces esperadas y las probadas.

## Estructura

```
package.json        manifest del bundle (dsh.bundle.patch + dsh.client)
cordis.patch.yml    inserta la fila del Loader (id: ape-profile-studio)
index.js            mitad Host: rutas /ape-profile-studio/api/state y /api/classify
client.js           mitad Cliente: entrada lateral + panel (locale en/es)
locale/en.json      meta.title / meta.description (en)
locale/es.json      meta.title / meta.description (es)
icon.svg            icono original (currentColor): escalera de perfiles en un marco
selfcheck.mjs       verificación reproducible de la mitad Host (sin instalar nada)
client-check.mjs    prueba de render de la mitad Cliente contra el payload real del Host
README.md           este documento
```

Estilos: solo tokens del tema (`--dsw-alias-*`, `--dsw-radius-*`, `--ds-font-family-code`), así
el panel sigue claro/oscuro. Textos vía servicio de locale del cliente (`apeProfileStudio`, en/es).

## Activación

Este bundle **no se instala solo**. Dos vías equivalentes:

1. **Interfaz**: Settings → Plugins → instalar bundle desde el directorio
   `dsh-plugins/ape-profile-studio` (ruta absoluta del workspace).
2. **Herramienta** `plugin_manager` con `action: install_bundle` y `target` = ruta absoluta del
   directorio del bundle. Requiere aprobación del operador (la política de aprobación de la
   sesión manda).

Tras instalar: los cambios afectan a **todas** las sesiones del perfil y sobreviven al reinicio.
`application: applied` en el resultado es lo que decide si el cambio está vivo; los logs no.
La entrada aparece en la barra lateral izquierda sin reiniciar el servidor web.

Nota: instalar escribe en el perfil del Harness (`install_bundle` hace ese trabajo). **No** hay
que editar a mano el `package.json` del perfil, ni `cordis.patch.yml` del perfil, ni crear paquetes
bajo `$DSH_HOME`.

## Desactivación (rollback)

Rollback en un paso, sin resto: el plugin solo registra la fila del Loader y dos rutas.

1. **Interfaz**: Settings → Plugins → desinstalar `@local/ape-profile-studio`.
2. **Herramienta**: `plugin_manager` con `action: remove_bundle`, `target:
   '@local/ape-profile-studio'`.

Efecto: desaparecen la entrada del sidebar, el panel y las dos rutas `/ape-profile-studio/api/*`.
No hay migraciones, ni ficheros de datos, ni caché que limpiar: el plugin **no escribe nada** en
el workspace, en la lista servida ni en las configuraciones de perfiles. Alternativa más suave
(reversible, sin desinstalar): desactivar la fila con `plugin_manager` `action: set_plugin`,
`target: ape-profile-studio`, `enabled: false`.

## Variables de entorno (opcionales)

| Variable | Efecto | Default |
|---|---|---|
| `APE_PROFILE_STUDIO_WORKSPACE` | Raíz del workspace contra la que se resuelven las rutas | `cwd` del proceso del Harness (se valida con marcadores; el panel muestra la raíz y las candidatas) |
| `APE_PROFILE_STUDIO_LIST_URL` | URL de la lista servida a sondear | `https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8` |

El panel muestra de dónde salió cada valor (`source: env | default`), así que un override mal
puesto se ve en pantalla en vez de adivinarse.

## Verificación (medida, reproducible)

Desde la raíz del repositorio:

```bash
node -c dsh-plugins/ape-profile-studio/index.js          # exit 0
node -c dsh-plugins/ape-profile-studio/client.js         # exit 0
node -e "JSON.parse(require('fs').readFileSync('dsh-plugins/ape-profile-studio/package.json','utf8'))"   # exit 0
node dsh-plugins/ape-profile-studio/selfcheck.mjs        # 47/47, exit 0
node dsh-plugins/ape-profile-studio/client-check.mjs     # 36/36, exit 0
```

`selfcheck.mjs` monta la mitad Host en un contexto stub, comprueba que registra las dos rutas,
verifica el parser del contrato (array, mapa, clave en español, forma desconocida), normaliza
salidas del clasificador, ejerce el degradado `classifier_missing`, y sondea una lista de prueba
en loopback (200 con `Range` → `computed`) y un endpoint inalcanzable (→ `no_computado` con
motivo). `client-check.mjs` carga `client.js` como lo hace la página, monta el plugin, recupera
la entrada del sidebar y el panel de los registros de slot, y **renderiza el panel contra el
payload real del Host** (comprobando que el sha256 medido del config y la raíz del workspace
llegan a la pantalla).

## Estado medido de los artefactos (2026-11-15, este workspace)

Medido a las 01:58 (America/Bogota). Los dos artefactos que dependen de otras tareas del
equipo **aparecieron mientras se construía el plugin**, y la tabla se llenó sin tocar código:

| Artefacto | Estado medido |
|---|---|
| `contracts/ape_profiles_12.json` | **existe** — 12 filas, 28 145 B, sha256 `72fa47d27922ec…`, forma `object.profiles[array]` (6 canónicos P0–P5 + 6 emulados 6K P0.5–P5.5) |
| `IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js` | **existe** — 32 630 B, sha256 `69969fa450ff77…`, export CommonJS `classify(channel, opts)` |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js` | existe — 411 497 B, sha256 `2961d1ba4d799c…` |

Ambos ficheros siguen vivos (sus bytes cambiaron entre dos mediciones separadas por minutos:
26 760 → 28 145 B el contrato, 30 892 → 32 630 B el clasificador), así que los tamaños de arriba
son una foto con hora, no un invariante.

Clasificación real medida a través del plugin (bloque `DAZN 1 FHD 4K HDR`, `group-title="Deportes 4K"`,
2 líneas, sin probe): `profile=P1`, `fallback=P2`, `confidence=low`, `score=25`,
`signals=token:4K token:FHD token:HDR token:DAZN`, `via=module:classify`, 11 ms, y la `reason` del
propio clasificador: *«se usa el perfil superior de la cadena implicada por los tokens … ES UNA
HIPOTESIS, no una medida: confidence baja»*. El panel reproduce esa advertencia tal cual.

## Limitaciones honestas

- **No se ha instalado en el perfil desde esta tarea**: la instalación exige aprobación del
  operador y está fuera del scope de escritura (solo `dsh-plugins/ape-profile-studio/**`). Por
  eso **la entrada del sidebar no se ha visto renderizada en el navegador**: está verificada por
  contrato de slots (mismo patrón que `dsh-plugins/upscale-lab`, `sidebar.panellist` + `main`) y
  por la prueba de render con hooks stubbeados, no visualmente.
- El sondeo de la lista servida es **una muestra**: HEAD + `Range: bytes=0-4095`. El conteo real
  de canales (21 224 declarados por el operador) **no** se calcula; se declara `no_computado`.
- Desde este host el endpoint público **no fue alcanzable** (`curl` y `fetch`: timeout), así que
  el estado de la lista servida se verá como `no computado` con su motivo hasta que haya red.
- El panel **no** lee `DEFAULT_PROFILES` del config del generador (6 perfiles) porque cualquier
  extracción por regex sería una aproximación no verificada: la fuente es el contrato, que ya
  resuelve los 12 perfiles (6 canónicos + 6 emulados 6K) con nombre, nivel, tier, resolución,
  fps, HDR, códec y fallback.
- El resultado del clasificador sin probe **es una hipótesis del propio clasificador**
  (`confidence: low`, `score: 25` en la medición de arriba), no una medida del stream. El panel
  la muestra con esa etiqueta y nunca la presenta como verificada.
- El contrato y el clasificador son artefactos de otras tareas del equipo y siguen cambiando:
  el panel es tolerante a la forma (array, `profiles`/`perfiles` en array o mapa, alias de
  campos) y reporta `unrecognized_shape` con las claves vistas si la forma cambia a algo que no
  reconoce.
