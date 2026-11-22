# ¿Conviven el rewrap CDN y `/pulse/`? — investigación medida

**Tarea:** t15 · **Fecha de medición:** 2026-11-21 · **Autor:** verificador
**Pregunta del operador:** ante la pérdida de cobertura del rewrap CDN, *"investigar antes de decidir"*.
**Alcance:** sólo lectura sobre el producto. Los únicos artefactos escritos son este informe y scripts de sonda en `%TEMP%` (borrados). No se modificó generador, panel, tests ni VPS.
**Este informe NO decide ni recomienda implementación.** Mide y entrega evidencia.

---

## 1. Veredicto

### `CONSERVAR` — el rewrap sigue teniendo efecto observable, pero sólo en una clase de URL

La respuesta a "¿sigue teniendo efecto con `/pulse/` activo?" es **condicional, y está medida en las dos direcciones**:

| Clase de URL del canal | ¿El envoltorio la cablea? | Con flag `true`, ¿actúa el rewrap? | Evidencia |
|---|---|---|---|
| Con **id numérico** reconocible (`/live/user/pass/<id>.m3u8`, `/<id>.ts`, `/<id>.mp4`) — la forma Xtream habitual | **Sí** → la línea sale `/pulse/…` | **NO. Cero reescrituras**: 0 URIs `/cdn/`, 0 apariciones del host del relay | casos C', E (§H3) |
| **Sin id numérico** (p. ej. `/live/usuario/clave/manifest.m3u8`) | **No** — `_apePulseWrap` devuelve la URL intacta si no casa el patrón (`m3u8-typed-arrays-ultimate.js:13356-13358`) | **SÍ**: la línea se reescribe a `https://<base>/cdn/<host>/<ruta>` | caso H (§H10) |

Por eso el veredicto es `CONSERVAR`: **el rewrap no es código muerto**. Funciona como **red de seguridad precisamente para las URLs que el envoltorio no puede cablear**, y mantiene su efecto pleno cuando el flag está en `false`. Para la mayoría del catálogo (URLs con id) su efecto es hoy **cero**.

> **Corrección honesta de una observación previa.** En mi verificación de t7 (y en la de t6) concluí "el rewrap ya no aparece en la URI emitida" a partir de un fixture de **2 canales, ambos con id numérico**. Esa conclusión era **incompleta**: el fixture no contenía ninguna URL sin id. La medición H10 la corrige. La cobertura de test que se perdió en t6 era, por tanto, **más valiosa de lo que parecía**: era la única que miraba una conducta que **sigue viva**.

**Ámbito exacto**:
- Salidas con flag `true` (VPS, DIRECTO, AMBAS, LIGHT — t6): rewrap **sin efecto** sobre líneas cableadas; **con efecto** sobre las no cableables.
- Salidas con flag `false` (export JSON; y DIRECTO si el operador invirtiera la decisión de t6): rewrap **plenamente activo** (casos D' y F).
- El rewrap **nunca** se aplicó al fichero `_DIRECTA` (casos B y D): el controller no le pone transform. Su único destino fue siempre el fichero `_CDN`.

---

## 2. Método y alcance

- Código leído en el repo (`HEAD` + working tree), citando `archivo:línea`.
- Medición **empírica con el pipeline real** (controller + generador + rewrap + finalizer), no con lógica reimplementada: se reutiliza el arnés de `frontend/tests/rea-generation-dispatch.test.js` (carga los ficheros de producción en un `vm` con dobles de `document`/`localStorage`/`fetch`), cortado en su línea 159 y con una sonda propia añadida. Todo en `%TEMP%`, con junctions a `js/` y `contracts/`; nada se escribió en el repo.
- La sonda ejecuta el controller real y **lee la URI emitida** de los ficheros generados (Blob/FS simulados), decodificando `u=` con `decodeURIComponent` sin la conversión `+`→espacio.
- Fixture: 2 canales (`audit.invalid` — dentro de la allowlist; `outside.invalid` — fuera), `ape_cdn_mode=allowlist`, `ape_cdn_hosts=audit.invalid`, `ape_cdn_base=https://relay.invalid`, `APE_PULSE_BASE` por defecto (`https://iptv-ape.duckdns.org`). Para H10 se añadió un **tercer canal sin id numérico** en la copia del arnés (sólo en `%TEMP%`).

**Integridad de la cadena de medición.** Los tres ficheros que producen el resultado son `ape-cdn-rewrap.js` (mtime 16:20:42), `m3u8-typed-arrays-ultimate.js` (18:05:00) y `generation-controller.js` (14:24:00): **ninguno fue modificado durante esta investigación**. Nota de concurrencia: a las **19:08:03 / 19:08:38** otro actor editó `generation-output-panel.js` (+8 líneas) y `gen-output-panel-format.test.js` (ahora 34 casos); esos ficheros **no intervienen** en la cadena medida y la decisión `pulseWrapForOutput()` sigue siendo `!isJsonMetadataOutput()`, así que el ámbito declarado en §1 no cambia. No fui yo quien los tocó (mi único escrito es este informe).

**Reproducción** (esencia; el script completo son ~25 líneas):

```js
// head = rea-generation-dispatch.test.js líneas 1..159 (arnés ya existente)
function uParam(uri){var m=String(uri).match(/[?&]u=([^&]*)/);return m?decodeURIComponent(m[1]):null;}
const env = environment();                      // arnés del test
env.ctx.APE_PULSE_WRAP = true;                  // o false
await env.ctx.APEGenerationController.prepublishAndGenerateDual({dual:'cdn',filename:'probe',hud:false});
const files = await fileBytes(env);             // arnés del test
// imprimir cada URI + uParam + si contiene '/pulse/', '/cdn/', el host del relay
```

---

## 3. Hechos medidos

### H1 · Dónde y en qué orden se aplica el rewrap

El rewrap **no vive en el generador**: lo aplica el **controller**, línea a línea, sobre el texto que el generador ya emitió.

| Eslabón | Artefacto | Evidencia |
|---|---|---|
| 1. El generador envuelve cada URI al emitirla | `m3u8-typed-arrays-ultimate.js:13368` | `lines.push(\`${_apePulseWrap(finalUrl)}\`)` (bloque 13342-13367; base por defecto en `:13350`) |
| 2. El controller reescribe el fichero `_CDN` | `generation-controller.js:909` (`_cdnOnlyWrite`, `lineFn` en `:904-912`) | `var out = window.apeCdnRewrap(line);` |
| 2'. Ídem en la salida dual, sólo el destino B | `generation-controller.js:966` (`_dualWrite`, `lineFn` en `:961-969`; destino A sin transform en `:972`) | `var out = window.apeCdnRewrap(line);` |
| 3. La reescritura | `ape-cdn-rewrap.js:69-117` | `mode==='off'` corta (`:74`); allowlist (`:92-96`); salida `c.base + '/cdn/' + rest` (`:111`) |

**Orden, por tanto: envoltorio primero, rewrap después.** El rewrap ve una URL cuyo host ya es el del VPS.

### H2 · Por qué el rewrap se queda sin efecto (mecanismo)

El rewrap sólo reescribe si el host está en `ape_cdn_hosts` (`ape-cdn-rewrap.js:92-96`). Tras el envoltorio, el host de la línea es el del VPS (`m3u8-typed-arrays-ultimate.js:13350`), que **no está** en `ape_cdn_hosts` (que lista hosts de proveedor). Resultado: `skipped++`, la línea sale intacta.

Nótese que `ape_cdn_base` por defecto (`ape-cdn-rewrap.js:43`) y la base del envoltorio (`m3u8-typed-arrays-ultimate.js:13350`) son **el mismo host** (`https://iptv-ape.duckdns.org`). La comprobación de "ya envuelto" del rewrap busca el prefijo `<base>/cdn/` (`:87-89`); una URL `/pulse/...` no lo cumple, así que tampoco cae por esa rama: simplemente se descarta por allowlist.

### H3 · Matriz de medición (flag `true` vs `false`)

| Caso | Salida | `APE_PULSE_WRAP` | URI[0] emitida (recortada) | ¿`/pulse/`? | ¿`/cdn/`? | ¿host relay? | `u=` |
|---|---|---|---|---|---|---|---|
| A | DIRECTO | true | `https://iptv-ape.duckdns.org/pulse/1.m3u8?u=…&d=…` | sí | **no** | no | `https://audit.invalid/live/u%2B/p%2F/1.m3u8?sig=a%2Bb%26c&x=1` |
| B | DIRECTO | false | `https://audit.invalid/live/u%2B/p%2F/1.m3u8?sig=a%2Bb%26c&x=1` | no | no | no | (sin `u=`) |
| C | AMBAS · `_DIRECTA` | true | `…/pulse/1.m3u8?u=…` | sí | no | no | prístina |
| C' | AMBAS · `_CDN` | true | `…/pulse/1.m3u8?u=…` | sí | **no** | no | prístina |
| D | AMBAS · `_DIRECTA` | false | `https://audit.invalid/…` | no | no | no | (sin `u=`) |
| D' | AMBAS · `_CDN` | false | `https://relay.invalid/cdn/audit.invalid/live/u%2B/p%2F/1.m3u8?sig=…` | no | **sí** | **sí** | (sin `u=`) |
| E | CDN_ONLY | true | `…/pulse/1.m3u8?u=…` | sí | **no** | no | prístina |
| F | CDN_ONLY | false | `https://relay.invalid/cdn/audit.invalid/…` | no | **sí** | **sí** | (sin `u=`) |
| G | CDN_ONLY (edge) | true + host del VPS en allowlist | `https://relay.invalid/cdn/iptv-ape.duckdns.org/pulse/1.m3u8?u=…` | sí | **sí** | **sí** | prístina |

Salida literal de la sonda (recortada a lo probatorio):

```
### E · CDN_ONLY flag=true
  FILE probe_CDN.m3u8
    HEADERS /cdn/: ["#EXT-X-APE-CDN-PLANE:v4","#EXT-X-APE-CDN-BASE:https://relay.invalid/cdn/",…]
    URI[0] https://iptv-ape.duckdns.org/pulse/1.m3u8?u=https%3A%2F%2Faudit.invalid%2F…&d=eyJ0…
           has/pulse/=true has/cdn/=false hasRelay=false u=https://audit.invalid/live/u%2B/p%2F/1.m3u8?sig=a%2Bb%26c&x=1

### F · CDN_ONLY flag=false (rewrap deberia actuar)
  FILE probe_CDN.m3u8
    URI[0] https://relay.invalid/cdn/audit.invalid/live/u%2B/p%2F/1.m3u8?sig=a%2Bb%26c&x=1
           has/pulse/=false has/cdn/=true hasRelay=true u=(no u=)
    URI[1] https://outside.invalid/live/u/p/2.ts?token=%2Fexact%3D
           has/pulse/=false has/cdn/=false hasRelay=false u=(no u=)
```

En F se ve además que la allowlist funciona como está documentada: el canal `outside.invalid` **no** se reescribe.

### H4 · El fichero `_CDN` sigue declarando un plano `/cdn/` que ya no usa

Con flag `true`, el fichero `_CDN` conserva el bloque inerte de trazabilidad (8 directivas) y **cero URIs `/cdn/`** (caso E). El bloque lo emite `_cdnPlaneBlock()` (`generation-controller.js:693-709`, base en `:699`), aplicado como `block:` en el transform (`:916` y `:974`), **sin condicionarse a que el rewrap haya reescrito algo**.

Medido: `HEADERS /cdn/: ["#EXT-X-APE-CDN-PLANE:v4","#EXT-X-APE-CDN-BASE:https://relay.invalid/cdn/","#EXT-X-APE-CDN-FAILOVER:…","#EXT-X-APE-CDN-302:…","#EXT-X-APE-CDN-LLHLS:…","#EXT-X-APE-CDN-UHD:…","#EXT-X-APE-CDN-QOE:…","#EXT-X-APE-CDN-LAB:…"]` en el caso E, cuyas URIs son todas `/pulse/`.
El propio código lo declara inerte (`generation-controller.js:690-692`: *"Bloque INERTE … NO altera ningún tag existente"*), y **ningún componente del VPS lo consume**: búsqueda de `APE-CDN-BASE` en `IPTV_v5.4_MAX_AGGRESSION/vps` (excluyendo `_deployed_mirror` y snapshots) → **0 coincidencias**. Es decir: no hay mentira operativa, pero el fichero documenta una ruta que su cuerpo no recorre.

### H5 · Caso límite G: si el host del VPS entrara en la allowlist, el rewrap **doblemente envuelve**

Con `ape_cdn_hosts='audit.invalid,iptv-ape.duckdns.org'` y flag `true`, la URI emitida es:

```
https://relay.invalid/cdn/iptv-ape.duckdns.org/pulse/1.m3u8?u=https%3A%2F%2Faudit.invalid%2F…&d=…
```

Es decir `/cdn/` **alrededor** de `/pulse/`. Hoy no ocurre porque `ape_cdn_hosts` no incluye el host del VPS, pero es un acoplamiento latente entre dos configuraciones independientes (allowlist del rewrap ↔ base del envoltorio). No se ha medido ninguna configuración de producción (ver §7).

### H6 · Qué contiene `u=` en cada caso

- Con flag `true`: `u=` = **URL prístina del proveedor**, byte a byte, incluidos escapes y orden de query (A, C', E; en A se comprueba `u=https://audit.invalid/live/u%2B/p%2F/1.m3u8?sig=a%2Bb%26c&x=1`, idéntica a la fuente del fixture).
- Con flag `false`: **no hay `u=`**, porque no hay envoltorio (B, D', F).
- No se ha observado **ningún** caso en que `u=` lleve la URL del relay. Eso es exactamente lo que evita el doble salto.

### H7 · Qué implicaría que `u=` llevara la URL del relay (doble salto)

`pulse.php` toma `u=` de la query (`vps/prisma/api/pulse.php:170`), la valida (`:211-216`) y en el modo por defecto **redirige**:

- `pulse.php:14` → *"m=redirect (defecto) -> 302 Location: <u> VERBATIM (shielding: el vídeo va …)"*.
  Con `u=` apuntando a `https://<vps>/cdn/<prov>/<ruta>`, el 302 devolvería al **mismo VPS**: el player haría `/pulse/ → /cdn/ → proveedor`, un salto extra por el mismo host (doble salto) y una dependencia circular de la ruta que se quería evitar.
- En modo `proxy` hay guarda explícita: `ape_pulse_norm_upstream()` normaliza `/cdn/<prov>/<resto>` → `<prov>/<resto>` (`pulse.php:311-325`) y, si no puede normalizar, responde **502 `upstream_self_reference`** (`pulse.php:569-577`) en vez de proxear a sí mismo.

Conclusión medida: el sistema **ya tiene** la guarda contra el doble salto en el camino de proxy, y la configuración actual (u= prístina) lo hace innecesaria en el camino de redirect.

### H8 · Consumidores que dependan del rewrap CDN

| Consumidor | ¿Depende del rewrap del frontend? | Evidencia |
|---|---|---|
| **JIT `reconcile.js`** | **No.** Depende de `u=`, no del rewrap: reconstruye `/cdn/<host><ruta>` **él mismo** a partir de la URL del proveedor leída de `?u=` de la línea `/pulse/`. | `vps/ape-jit/reconcile.js:14-16` (lee `?u=` y "la reescribe como /cdn/<host><ruta>"); `toCdn()` en `:139-146` (`BASE + '/cdn/' + u.host + '/' + rest`) |
| **VPS `/cdn/` (nginx + gateway)** | No depende de que el frontend lo genere; sigue sirviendo la ruta, con candados propios. | `vps/nginx/sites-enabled-default.conf:63,68`; `pulse.php:308-325` |
| **Fichero `_CDN`** | No: sus URIs las decide el envoltorio, y el bloque de cabecera es inerte y no consumido (§H4). | `generation-controller.js:690-709`; grep `APE-CDN-BASE` en `vps` = 0 |
| **Híbrido / LIGHT / JIT propios del panel** | No se encontró dependencia del rewrap: el híbrido emite `#EXT-X-APE-DASH-CONTAINER` desde `genOpts().hybrid` (panel `:90`, `:1166`) y LIGHT publica la base en el VPS por `list-publish.php`. | `generation-output-panel.js:90,1166`; `runLight` (publicación) |

**Ningún componente localizado requiere que el rewrap reescriba las líneas para funcionar.** El consumidor más cercano (`reconcile.js`) se abastece de `u=`, que hoy contiene la URL prístina — precisamente lo que el envoltorio garantiza.

### H9 · La aserción eliminada por t6 era la única, y ya estaba ROJA en `HEAD`

- En `HEAD`, la única expectativa sobre el rewrap era `rea-generation-dispatch.test.js:119`:
  `const expected = cdn && i === 0 ? channels[i].url.replace('https://', 'https://relay.invalid/cdn/') : channels[i].url;`
  seguida de `assert.equal(uris[i].split('|')[0], expected, 'exact source/auth URI')` (`:122`).
- **Esa aserción ya fallaba en `HEAD`** — ejecutada la versión de `HEAD` en `%TEMP%`:
  ```
  AssertionError [ERR_ASSERTION]: exact source/auth URI
  + 'https://iptv-ape.duckdns.org/pulse/1.m3u8?u=…&d=…'
  - 'https://audit.invalid/live/u%2B/p%2F/1.m3u8?sig=a%2Bb%26c&x=1'
      at checkPlaylist (…/rea-head.test.js:122:16)   [EXITCODE=1]
  ```
  El rewrap esperado (`relay.invalid/cdn/…`) **nunca se alcanzaba a comprobar**: el test abortaba antes, en el fichero `_DIRECTA`, contra la expectativa de URL prístina. Es decir: la conducta del rewrap **llevaba tiempo sin cobertura efectiva**; t6 no la retiró, la dejó al descubierto.
- Tras el diff de t6, en el test actual no queda **ninguna** aserción sobre el rewrap: las únicas apariciones de `relay.invalid`/`/cdn/` son el seed del fixture (`:22`) y un comentario (`:141`). Verificado por búsqueda.
- Conductas que el diff **sí** conservó o reforzó: igualdad de la URI de origen (ahora como `u=` byte-idéntico, `:145-152`), una URI por canal (`:133`), prefijo del envoltorio con el id correcto (`:138-139`), `d=` presente (`:154`), REA por canal (`:156`). Única conducta perdida: **la reescritura `/cdn/`**.

### H10 · El rewrap SÍ actúa todavía cuando el envoltorio no puede cablear la URL (hallazgo que corrige el panorama)

`_apePulseWrap` sólo envuelve si la URL casa `/live/<x>/<y>/<id>.m3u8|ts|mp4` o `/<id>.m3u8|ts|mp4`; si no casa, **devuelve la URL intacta** (`m3u8-typed-arrays-ultimate.js:13356-13358`, `if (!m) return rawUrl;`). Esa línea no cableada sí es reescrita por el rewrap.

Medición con 3 canales (2 con id, 1 sin id; `dual:'cdn'`):

```
### CDN_ONLY flag=true (3 canales: 2 con id numerico, 1 sin id)
  URI[0] https://iptv-ape.duckdns.org/pulse/1.m3u8?u=…            pulse=true  cdn=false
  URI[1] https://iptv-ape.duckdns.org/pulse/2.m3u8?u=…            pulse=true  cdn=false
  URI[2] https://relay.invalid/cdn/audit.invalid/live/usuario/clave/manifest.m3u8?sig=abc
                                                                  pulse=false cdn=true  u=(no u=)
### CDN_ONLY flag=false (mismos 3 canales)
  URI[0] https://relay.invalid/cdn/audit.invalid/live/u%2B/p%2F/1.m3u8?sig=…   cdn=true
  URI[1] https://outside.invalid/live/u/p/2.ts?token=%2Fexact%3D               cdn=false (fuera de allowlist)
  URI[2] https://relay.invalid/cdn/audit.invalid/live/usuario/clave/manifest.m3u8?sig=abc   cdn=true
```

Lectura: con el envoltorio activo, el canal sin id **no pasa por `/pulse/`** y **sí pasa por `/cdn/`**. Conviven los dos planos en el mismo fichero. Esto convierte el "0 `/cdn/`" de H3 en un resultado **dependiente del fixture**: sólo es 0 si todos los canales tienen id cableable.

---

## 4. Lo NO COMPUTADO (y por qué)

| # | Qué no se midió | Razón |
|---|---|---|
| N1 | Que el VPS real sirva hoy `/pulse/<id>.m3u8` para estas listas | Requeriría peticiones de red al VPS; esta tarea es de sólo lectura local y no hace tráfico. |
| N2 | El valor **real** de `ape_cdn_hosts` / `ape_cdn_mode` en el navegador del operador | Viven en `localStorage` del cliente; no están en el repo. Sin ese dato no se puede afirmar si el rewrap está activo hoy en producción. |
| N3 | Si `relay.invalid` corresponde a un relay real | Es el host del **fixture** del test. El `ape_cdn_base` por defecto del producto es `https://iptv-ape.duckdns.org` (`ape-cdn-rewrap.js:43`). |
| N4 | Paridad repo ↔ VPS desplegado para `/cdn/` y `/pulse/` | No se diffeó `vps/_deployed_mirror` (2026-11-18, sin trackear) contra el repo; sería otra investigación. |
| N5 | Componentes llamados "HIT" y "HLS PT" | No existe en el repo ningún componente con esos nombres (búsqueda por nombre = 0 coincidencias pertinentes); no se pudo evaluar su dependencia. |
| N6 | Efecto del rewrap sobre segmentos, gzip y binarios | Fuera de alcance: el rewrap sólo toca líneas que empiezan por `http(s)://` (`ape-cdn-rewrap.js:84`); no se midió el pipeline binario. |
| N7 | Qué hace un player real con una URI `/cdn/` vs `/pulse/` | No hay reproducción física en esta investigación. |
| N8 | **Qué proporción del catálogo real del operador cae en la clase "sin id numerico"** (la única donde el rewrap sigue actuando con flag `true`) | Requeriría la lista real de canales del proveedor; no está en el repo. Sin este dato **no se puede dimensionar el impacto práctico** del hallazgo H10. |
| N9 | Si el host del VPS aparece hoy en el `ape_cdn_hosts` real | Mismo motivo que N2 (configuración en `localStorage` del cliente). Determina si el caso G (doble envoltura) es alcanzable hoy. |

---

## 5. Qué NO prueba este informe

- No prueba reproducción, calidad de imagen ni QoE: mide **texto de lista generado**, no vídeo.
- No prueba que el VPS acepte o rechace ninguna de las dos rutas (N1).
- No prueba que la configuración de producción sea la del fixture (N2, N3).
- La matriz se obtuvo con 2 canales sintéticos y `ape_cdn_base=https://relay.invalid`; los valores concretos de producción pueden cambiar el caso G. **El "0 `/cdn/`" de los casos C/E depende de que TODOS los canales tengan id cableable**: con un canal sin id, ese mismo fichero contiene una URI `/cdn/` (H10).
- `physical_playback_verified=false` en todos los casos, igual que declara el arnés origen.

---

## 6. Anexo · Comandos ejecutados

```powershell
# 1) Sonda A–G: arnés de rea-generation-dispatch.test.js (líneas 1..159) + sonda propia, en %TEMP% con junctions a js/ y contracts/
node $T\IPTV_v5.4_MAX_AGGRESSION\frontend\tests\probe.js      # EXITCODE=0
# 1b) Sonda H10: mismo arnés + un 3er canal SIN id numerico (copia en %TEMP%)
node $T\IPTV_v5.4_MAX_AGGRESSION\frontend\tests\probe3.js     # EXITCODE=0
# 2) Versión de HEAD del test, para datar la aserción del rewrap
git show HEAD:IPTV_v5.4_MAX_AGGRESSION/frontend/tests/rea-generation-dispatch.test.js > $T\...\rea-head.test.js
node $T\IPTV_v5.4_MAX_AGGRESSION\frontend\tests\rea-head.test.js   # EXITCODE=1, falla en :122
# 3) Cobertura actual del rewrap en el test
Select-String -Path ...\rea-generation-dispatch.test.js -Pattern 'relay\.invalid|/cdn/|toCdn|rewrap'
# 4) Consumidores
Select-String -Path ...\vps\ape-jit\reconcile.js -Pattern 'toCdn|u='
Select-String (recursivo, vps) -Pattern 'APE-CDN-BASE|APE_CDN_BASE'      # 0 coincidencias
```

Temporales borrados. Ningún archivo de producto modificado (único escrito por esta tarea: este informe).
