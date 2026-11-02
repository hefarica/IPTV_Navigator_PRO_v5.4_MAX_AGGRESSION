# SECURITY.md — credenciales y preflight en `gen_demuxed_master.js`

> **Alcance:** `tools/ape-demuxed/gen_demuxed_master.js`. Nada de este documento toca el VPS, ni la lista de
> referencia, ni Excel, ni git. No se ha desplegado nada.

---

## 1. Dos modos de credenciales. **Nunca un gate universal.**

El error de diseño que este documento existe para impedir: tratar "la salida contiene usuario/password" como
un fallo **siempre**. No lo es. Hay dos artefactos legítimamente distintos y confundirlos produce una **lista
rota**.

| | **default** (reproducible) | **`--redact-credentials`** (para compartir) |
|---|---|---|
| Marker estampado tras `#EXTM3U` | `# APE-SENSITIVE: contains credentials, DO NOT DISTRIBUTE` | `# APE-SENSITIVE: redacted, NOT playable` |
| `playable` (reporte) | `true` | **`false`** |
| `sensitive` (reporte) | `true` | `false` |
| `distribution` | `DO-NOT-DISTRIBUTE` | `SAFE-TO-SHARE` |
| Credenciales en el URI del canal | **se conservan a propósito** | `***` (enmascaradas) |
| Gate aplicado | **RUTA** (preflight) | invariante de contenido |
| Qué pasa si el destino está en el repo git | **exit 6, no se escribe** | permitido (la salida no lleva credenciales) |
| Qué pasa si queda una credencial tras enmascarar | no aplica | **exit 1** (defecto del programa) |
| Alias aceptado | — | `--mask-credentials` |

`--mask-credentials` sigue aceptándose como **alias** de `--redact-credentials` por compatibilidad con las
corridas que ya lo usan (incluido el enunciado de t9). Es el mismo modo.

---

## 2. Por qué el gate es **dependiente del modo** (y no universal)

### Modo default: el gate correcto es de RUTA, no de contenido

Un gate que exija `grep -c "live/[^/]+/[^/]+" salida.m3u8 == 0` **en todos los modos** es incorrecto:

1. En el modo reproducible las credenciales **deben** estar; el gate fallaría **por diseño**.
2. Para "arreglarlo" habría que sustituir el par usuario/password por un hash en el path. Eso produce
   `http://host/live/<hash>/<hash>/3.m3u8`, y ese path **no existe en el proveedor**: el canal daría **404 al
   arrancar**. Se habría cambiado un riesgo de confidencialidad por una **lista rota** — exactamente lo que la
   ley anti-degradación y el sentido común prohíben.

Por eso, en default:

- **No se evalúa el contenido de la URI.** No hay juicio sobre si "parece" una credencial.
- El gate es **de RUTA**: si el destino resuelto cae **dentro del repositorio git**, **exit 6** y **no se
  escribe** el fichero. La sensibilidad se gestiona **por ubicación**, que es un control verificable, no por
  adivinar el contenido.
- El reporte **cuenta** la exposición (`credentials_present_unmasked`) para que el operador sepa qué tiene
  entre manos. Contar no es gatear.

### Modo redactado: el gate correcto es de contenido (invariante)

Aquí sí se puede exigir cero credenciales, porque el artefacto **no pretende reproducir**. Se enmascara cada
línea y se verifica que el enmascarado sea **idempotente**: aplicar `maskCredentials` a una línea ya
enmascarada no debe cambiar nada.

Si ese invariante falla, **no es un resultado de política**: es un **defecto del programa**. Por eso devuelve
**exit 1** (`INTERNAL_INVARIANT`), fuera de la tabla de política, en vez de reutilizar un código de política.

### Consecuencia declarada: el redactado **no es reproducible**

Se enmascara **todo par de segmentos no estructural**, así que también se pierden rutas que no eran
credenciales (`/lists/APE_LISTA…` → `/***/***/APE_LISTA…`). Es la dirección segura (**sobre-enmascarar antes
que filtrar**) y la razón por la que el modo se rotula `redacted, NOT playable`. No es un bug: es el
trade-off, y está escrito en la primera línea del artefacto.

---

## 3. Preflight: el fichero **no toca el disco**

Requisito del operador: en el modo default, un destino dentro del repo debe rechazarse **antes de abrir** el
fichero — no "escribir y borrar". Un archivo con credenciales no debe existir en el repo **ni un instante**.

### Lo que NO se promete

`strace -e openat` e `inotifywait -m .` **no están disponibles en este host (Windows)**. No se citan como
evidencia porque no se pudieron producir. Nada de artefactos citados y no obtenidos.

### Las tres pruebas que sí se produjeron

**(a) Tras el exit 6 el fichero no existe.**

```
PS> node gen_demuxed_master.js --in sample_in.m3u8 --out tools\ape-demuxed\_preflight_dentro.m3u8 …
exit = 6
PS> Test-Path -LiteralPath tools\ape-demuxed\_preflight_dentro.m3u8
False
PS> Get-Item -LiteralPath tools\ape-demuxed\_preflight_dentro.m3u8
ItemNotFoundException: No se encuentra la ruta de acceso '…' porque no existe.
```

**(b) El chequeo de ruta ocurre ANTES de cualquier apertura/escritura.** Evidencia estructural en el código:

```
L1067  if (probe.inside) { throw OUTPUT_PATH_INSIDE_REPO }   <- gate de ruta
L1122  fs.createWriteStream(opts.out, ...)                  <- apertura del destino
gate_antes_de_abrir = True
llamadas fs.(openSync|writeFileSync|createWriteStream) antes del gate: (ninguna)
```

El gate de ruta y el de colisión se evalúan en el **preflight** de `run()`, y `outStream` se construye
**después**. No hay ningún camino que abra el destino antes de esos dos chequeos.

**(c) Corrida de control: el MISMO código escribe cuando debe.** Misma invocación, destino fuera del repo:

```
PS> node gen_demuxed_master.js --in sample_in.m3u8 --out %TEMP%\ape_preflight_control.m3u8 …
exit = 0
fichero escrito -> True   bytes = 139692
```

Las tres juntas demuestran preflight real sin trazas de syscalls: **rechaza sin crear** (a+b) y **crea cuando
la política lo permite** (c).

---

## 4. Colisión de destino: `8`, no `6`

`fs.openSync(path,'wx')` falla si el archivo existe. Es correcto como protección, pero produce `EEXIST` en
una segunda corrida legítima. **Un `EEXIST` no es un rechazo de política**, y confundirlos rompería la
trazabilidad de los códigos.

Decisión (la recomendada por el capitán): **código propio `8 = OUTPUT_EXISTS`**.

| Código | Significado — uno solo por código |
|---|---|
| 3 | `VIDEO_DOWNSCALE_VIOLATION` — **sin cambios desde t7** |
| 6 | `OUTPUT_PATH_INSIDE_REPO` — rechazo de **política** por ruta |
| 8 | `OUTPUT_EXISTS` — **colisión** de destino |

`--force` permite la sobrescritura legítima. Evidencia:

```
1.ª corrida                    -> exit 0, fichero creado
2.ª sin --force                -> exit 8, hash del fichero INTACTO (no se truncó)
3.ª con --force                -> exit 0, contenido idéntico
```

**Por qué `3` no se renumeró** (justificación del capitán, citada): `3` ya está documentado en la cabecera del
script, en el README y en una corrida real. Moverlo convierte una garantía en una **regresión silenciosa** para
cualquier consumidor que lo lea. **Sumar es aditivo; renumerar no.** Y un gate automático que vea `3` debe poder
afirmar "hubo downscale" sin ambigüedad: con `6` para la ruta y `8` para la colisión, lo consigue.

---

## 5. Regla dura: **nunca un hash de la credencial en el path**

Si en algún momento se decide tokenizar en vez de enmascarar:

- **`***` en el path** (lo que se hace hoy) o **nada**. Nunca un hash.
- Un hash en el path **rompe el canal**: el proveedor espera el usuario/password reales en esa posición.
- Si hiciera falta un identificador estable, va **HMAC-SHA256 con un secreto local**, y el token se coloca en
  un **campo aparte** (metadato/header propio), **jamás** en el segmento de ruta del URI.

Motivo: el path de una URL Xtream **es** el mecanismo de autenticación. Alterarlo no ofusca: **inutiliza** el
manifiesto.

---

## 6. Qué se enmascara exactamente

| Patrón | Acción | Ejemplo |
|---|---|---|
| `scheme://user:pass@host` | `scheme://***:***@host` | idéntico al anterior |
| Par usuario/password en la ruta, tras prefijo estructural (`live`, `movie`, `series`, `vod`, `audio`, `hls`…) | ambos segmentos → `***` | `/live/USER/PASS/3.m3u8` → `/live/***/***/3.m3u8` |
| Par en la ruta sin prefijo conocido | ambos segmentos → `***` | `/USER/PASS/3.m3u8` → `/***/***/3.m3u8` |
| Segmentos ya enmascarados | **no se tocan** (idempotencia) | `/live/***/***/3.m3u8` → sin cambios |
| `token=`, `password=`, `pass=`, `user=`, `apikey=`, `jwt=`… en query | valor → `***` | `?token=abc` → `?token=***` |

**No se enmascara** (`#EXTINF`, `tvg-*`, nombres de canal, tags propios): se preservan verbatim, verificado en
la batería de 9 casos del arnés.

---

## 7. Límites (fail-honest)

1. **No hay verificación HTTP.** El generador no hace red: no puede confirmar que una URI exista ni que la
   playlist reproduzca. Rechaza **formas de fabricación** (placeholders, no-http) y exige que el operador
   **declare** `evidence: probed|in_source`. La garantía de existencia es del operador.
2. **El enmascarado sobre-enmascara a propósito** en modo redactado, así que ese artefacto **no es
   reproducible**. Declarado en el marker.
3. **La detección de "repo git" es por presencia de `.git`** subiendo por los directorios (archivo o carpeta,
   para worktrees/submódulos). No invoca `git`. Si el destino está en un **submódulo cuyo `.git` es un
   archivo**, también se detecta. Si el usuario trabaja en un árbol **sin** `.git` visible, el gate no aplica:
   se reporta `repo_path_gate.applicable=true, inside=false`.
4. **No se auditó el contenido del `#EXTHTTP`** de la lista para credenciales en esta tarea; t3 midió 0
   nombres de header credencial y 0 valores Bearer/JWT. Este documento cubre el **URI** del canal y el
   cuerpo emitido.
5. **El gate de contenido sólo protege lo que este programa escribe.** No protege copias hechas con otras
   herramientas ni artefactos previos a este cambio.

---

## 8. Artefactos y comandos

```bash
# Modo default (reproducible): debe salir 0 y estampar DO NOT DISTRIBUTE
node gen_demuxed_master.js --in <in.m3u8> --out <fuera-del-repo>/out.m3u8 --allow-muxed-passthrough --report r.json

# Gate de ruta: destino dentro del repo -> exit 6 y el fichero NO se crea
node gen_demuxed_master.js --in <in.m3u8> --out tools/ape-demuxed/x.m3u8   # exit 6
Test-Path tools/ape-demuxed/x.m3u8                                          # False

# Modo redactado (para compartir): 0 credenciales, marker NOT playable
node gen_demuxed_master.js --in <in.m3u8> --out <out.redacted.m3u8> --redact-credentials --report r.json

# Colisión: 2.ª corrida sin --force -> exit 8
node gen_demuxed_master.js --in <in.m3u8> --out <mismo destino>            # exit 8
```

Fixtures: `examples/fixture_t9_credentials.m3u8` (credencial sintética visible),
`examples/fixture_t9_audio_passthrough.m3u8`, `examples/fixture_t9_cap_candidates.m3u8`.
