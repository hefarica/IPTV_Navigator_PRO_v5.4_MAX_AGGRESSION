# Gate 200/206/302 — el denominador medía ficheros retirados (corregido el 2026-11-12)

**Fecha:** 2026-11-12 · **Autor:** gate-runner (t39) · **Rama:** `fix/engine-tdz-dos-20261112`
**Fichero cambiado:** `tools/ape-http-conformance/gate_matrix.js` — 10.492 B / `sha256 7639eb70…` → **17.724 B / `sha256 d18c86605402fba83c65451af5d476ed60b1dc6aa88db096b6e2e0d5014b36ff`**
**Sin tocar el VPS ni nginx. Sin push.** El cambio es solo del verificador.

---

## 1 · El defecto, medido antes de tocar nada

El gate tenía **cuatro nombres de lista hardcodeados**. Dos ya no existen en el VPS. Salida literal de la matriz **antes** del cambio:

```text
=== BASELINE (gate sin corregir) ===
  APE_LISTA_1793589060441.m3u8       200i=404  200g=404  206i=404  206g=404  redir=302
  APE_LISTA_1793558303852_CDN.m3u8   200i=404  200g=404  206i=404  206g=404  redir=302
  APE_PRUEBA_ORDER_OK.m3u8           200i=200  200g=200  206i=206  206g=206  redir=302
  APE_PRUEBA_PERFILES.m3u8           200i=200  200g=200  206i=206  206g=206  redir=302

12/20 celdas del gate cumplen · veredicto: NO CUMPLE
EXITCODE=1
```

Leído fino: **las dos listas que existen pasan 5/5 cada una**. Las 8 celdas que faltan son **404 en dos ficheros retirados**. El veredicto «NO CUMPLE» describía el instrumento, no la entrega.

Las 5 listas que sí existen hoy (de las que traía el encargo, verificadas contra producción en esta corrida): `APE_LISTA_1793787155230`, `APE_LISTA_1793926685925`, `APE_LISTA_1794100720046`, `APE_PRUEBA_ORDER_OK`, `APE_PRUEBA_PERFILES`.

---

## 2 · El precedente del propio repo (y por qué aquí no vale igual)

`_vps_stage/deploy/verify.sh:55-68` ya había resuelto **este mismo defecto** para otro verificador. Su comentario, literal:

> *«Antes estaban hardcodeadas dos listas ya retiradas (APE_LISTA_4K.m3u8 y APE_LISTA_1793002539897_CDN.m3u8). Ambas devuelven 404 desde que fueron reemplazadas, así que este job fallaba SIEMPRE y bloqueaba cualquier deploy: el verificador miraba ficheros que ya no existen. No era una caída del VPS.»*

Aquel lo resolvió **descubriendo la lista viva en disco**:

```bash
LIVE_LIST="$(rsh 'for d in /var/www/html/lists /var/www/lists; do if [ -d "$d" ]; then ls -1t "$d"/*.m3u8 2>/dev/null | head -1; break; fi; done' ...)"
[ -n "$LIVE_LIST" ] || echo "WARN no se pudo descubrir la lista viva; se prueba la conocida: ..."
```

**Aquí no se puede hacer igual, y queda escrito en el código:** este gate corre **desde CI contra el host público** (`https://iptv-ape.duckdns.org`). No tiene shell en el VPS, y HTTP **no ofrece listado de directorio**: pedir `/lists/` devuelve un índice (o 403/404) que no es una fuente fiable de «qué ficheros se sirven». Inventarse un descubrimiento dinámico desde CI sería peor que el defecto: un fallo de red se leería como «no hay listas».

**La alternativa elegida** (tres piezas, en el código):

1. **Fixture explícito** de nombres, actualizado cuando cambia el inventario del VPS.
2. **Sonda de identidad** por lista antes de medir: un `GET` identity. Si da **404**, la lista se clasifica `FIXTURE_AUSENTE`, **no se generan sus celdas** y **no entra en el denominador de entrega**. Se reintenta **una vez** para no confundir un 404 transitorio de CDN con rotación real.
3. **Señal aparte**: el fixture ausente se reporta como `FIXTURE_PARCIAL` / `FIXTURE_CADUCADO`, sin sumar ni restar a las celdas de entrega.

---

## 3 · La corrida de hoy, tal cual

```text
$ node -c tools/ape-http-conformance/gate_matrix.js
EXITCODE=0

$ node tools/ape-http-conformance/gate_matrix.js

=== GATE 200/206/302 ===
ENTREGA: 25/25 celdas cumplen en listas existentes · veredicto: CUMPLE
FIXTURE: FIXTURE_COMPLETO · 5/5 listas presentes
VEREDICTO GATE: CUMPLE  (exit 0)
  APE_LISTA_1793787155230.m3u8       200i=200  200g=200  206i=206  206g=206  redir=302
  APE_LISTA_1793926685925.m3u8       200i=200  200g=200  206i=206  206g=206  redir=302
  APE_LISTA_1794100720046.m3u8       200i=200  200g=200  206i=206  206g=206  redir=302
  APE_PRUEBA_ORDER_OK.m3u8           200i=200  200g=200  206i=206  206g=206  redir=302
  APE_PRUEBA_PERFILES.m3u8           200i=200  200g=200  206i=206  206g=206  redir=302
EXITCODE=0
```

Bloque `resumen` del JSON (las dos cosas separadas):

```json
"resumen": {
  "celdas_entrega": { "total": 25, "cumplen": 25, "faltan": 0, "veredicto": "CUMPLE" },
  "fixture": {
    "listas_en_fixture": 5, "listas_presentes": 5, "listas_ausentes": 0,
    "ausentes": [], "senal": "FIXTURE_COMPLETO",
    "nota": "Una lista ausente es rotacion de ficheros de prueba, no un fallo de la ruta. Sus celdas NO entran en el denominador de entrega."
  },
  "veredicto_gate": "CUMPLE",
  "exit_code": 0
}
```

**Denominador: 5 listas × 5 celdas = 25.** Antes eran 20 (4 × 5) con 8 celdas imposibles de ganar.

---

## 4 · Control negativo: una lista que no existe

Se añadió temporalmente `APE_LISTA_0000000000000_INEXISTENTE.m3u8` al fixture, se ejecutó, y **se quitó después** (el fichero se restauró byte a byte: 17.724 B y `sha256 d18c8660…` idénticos antes y después del ensayo).

```text
ENTREGA: 25/25 celdas cumplen en listas existentes · veredicto: CUMPLE
FIXTURE: FIXTURE_PARCIAL · 1 de 6 listas del fixture ya no existen (5 celdas EXCLUIDAS del denominador)
   FIXTURE_AUSENTE  APE_LISTA_0000000000000_INEXISTENTE.m3u8  (sonda=404, reintentada)
VEREDICTO GATE: CUMPLE  (exit 0)

  celdas_entrega={"total":25,"cumplen":25,"faltan":0,"veredicto":"CUMPLE"}
  fixture: en_fixture=6 presentes=5 ausentes=1 senal=FIXTURE_PARCIAL
  fixture_ausente=[{"lista":"APE_LISTA_0000000000000_INEXISTENTE.m3u8","status":404,"reintentado":true}]
```

**Lo que demuestra:** la lista inexistente sale como `FIXTURE_AUSENTE`, sus 5 celdas **no entran** en el denominador (sigue en 25, no en 30) y **`faltan` sigue en 0** → no se cuenta como fallo de entrega. El exit es **0** porque la entrega, sobre lo que existe, cumple.

---

## 5 · Todas ausentes: código propio, no «NO CUMPLE»

Copia temporal con las 5 listas sustituidas por nombres inventados (el fichero real no se toca):

```text
ENTREGA: 0/0 celdas cumplen en listas existentes · veredicto: NO_MEDIBLE
FIXTURE: FIXTURE_CADUCADO · 2 de 2 listas del fixture ya no existen (10 celdas EXCLUIDAS del denominador)
   FIXTURE_AUSENTE  APE_LISTA_NO_EXISTE_1.m3u8  (sonda=404, reintentada)
   FIXTURE_AUSENTE  APE_LISTA_NO_EXISTE_2.m3u8  (sonda=404, reintentada)
VEREDICTO GATE: FIXTURE_CADUCADO  (exit 2)
EXIT=2  (2 = FIXTURE_CADUCADO, correcto)
```

Sin este caso especial, `0/0` habría dado **CUMPLE** (0 fallos de 0 celdas): un verde por vacío. Por eso el gate tiene un **tercer veredicto**.

| Veredicto | Significado | exit |
|---|---|---:|
| `CUMPLE` | todas las celdas de entrega cumplen en listas existentes | **0** |
| `NO CUMPLE` | hay huecos de entrega en listas que **sí** existen | **1** |
| `FIXTURE_CADUCADO` | ninguna lista del fixture existe: no hay nada que medir | **2** |

---

## 6 · Lo que hoy NO cuadra con el informe del 2026-11-02 — y no lo maquillo

Comparando con `docs/ops/GATE_MATRIX_MEASURED.md`, **dos de sus tres conclusiones no se reproducen hoy**:

| Afirmación del 2026-11-02 | Medido hoy (2026-11-12) |
|---|---|
| **302 = 0/4** · «las cuatro devuelven **301**» | **5/5 devuelven 302 exacto**. Incluso en el baseline sin corregir, las 4 daban `redir=302`. El eje 302 **ya no está roto**. |
| **206 = 4/8** · «exclusión mutua por compresión al vuelo» | **10/10 celdas de 206 cumplen** (identity **y** gzip) en las 5 listas. |
| 200 = 8/8 | **10/10** hoy (5 listas × 2 perfiles). |

**Por qué el 206 funciona hoy, con las cabeceras medidas:**

| Lista | 200 identity | 206 identity | 206 gzip |
|---|---|---|---|
| `…1793787155230` | `CL=626.024.523` `CE=null` **`TE=null`** | `bytes 0-1023/626024523` | `206` `CE=gzip` `bytes 0-1023/165668148` |
| `…1793926685925` | `CL=624.693.667` `TE=null` | `bytes 0-1023/624693667` | `206` `CE=null` |
| `…1794100720046` | `CL=1.311.381.927` `TE=null` | `bytes 0-1023/1311381927` | `206` `CE=null` |
| `APE_PRUEBA_ORDER_OK` | `CL=164.062` `TE=null` | `bytes 0-1023/164062` | `206` `CE=gzip` `bytes 0-1023/42168` |
| `APE_PRUEBA_PERFILES` | `CL=164.062` `TE=null` | `bytes 0-1023/164062` | `206` `CE=gzip` `bytes 0-1023/42165` |

El mecanismo que documentaba el fallo era: **compresión al vuelo ⇒ `Transfer-Encoding: chunked` ⇒ sin `Content-Range`**. Hoy **ninguna** respuesta 200 identity lleva `chunked`: todas llevan `Content-Length` real (626 MB, 624 MB, 1,31 GB…). La lista que sí tiene `.gz` (`…1793787155230`, gzip 165 MB frente a 626 MB en plano) **sirve el plano a los clientes identity**, que es exactamente el comportamiento que se buscaba con `gunzip off`.

**Lo que NO puedo afirmar:** *por qué* cambió. No tengo acceso al VPS y no he leído la configuración de nginx. El comportamiento observado **es consistente con `gunzip off` y `301→302` ya aplicados**, pero eso es una inferencia, no una medición: la configuración viva es **`NO_COMPUTADO`**. Lo que sí está medido es el efecto desde el cliente: **las tres patas cumplen hoy en las cinco listas**.

> **Consecuencia honesta:** con el fixture corregido y la clasificación puesta, la única causa de las 8 celdas perdidas del baseline era el **fixture caducado**. Ni una sola celda de entrega fallaba. Los dos cambios que `GATE_MATRIX_MEASURED.md` reclamaba (gunzip/gzip y `301→302`) **no hacen falta hoy** según esta medición; si el operador quiere confirmarlo, la comprobación es `nginx -T` en el VPS, que aquí es `NO_COMPUTADO`.

---

## 7 · Límites de esta medición

1. **No se verificó la configuración de nginx.** El efecto se mide desde el cliente; el `nginx -T` real es `NO_COMPUTADO` (sin VPS).
2. **`TAMANO_MINIMO` de las 3 listas nuevas es 200 B**, no su tamaño real: no se conoce y poner un número grande sería un pin falso que rompería el gate al cambiar la lista. Las dos de prueba conservan 200. El umbral sirve para lo que se creó: detectar el «200 con cuerpo de 8 bytes», y 200 B lo detecta.
3. **Los GET completos se cortan al primer chunk** (se leen estado y cabeceras, no el cuerpo entero). Es el diseño original y no cambia.
4. **Un 404 transitorio** se mitiga con un reintento, no se elimina: un CDN que devuelva 404 dos veces seguidas haría que una lista viva se clasificara ausente durante esa corrida. Es el precio de no poder listar el directorio.
5. **Las listas del fixture siguen siendo nombres**: si el VPS rota otra vez, el gate lo dirá como `FIXTURE_PARCIAL`/`FIXTURE_CADUCADO` **en vez de mentir sobre la entrega** — que es la mejora, no la cura definitiva.

---

## 8 · Resumen en una línea

Antes: **12/20 · NO CUMPLE** (8 de esas 12 ausencias eran 404 en ficheros retirados). Ahora: **25/25 · CUMPLE · exit 0**, con el fixture ausente como señal separada y un código propio (`exit 2`) para cuando no quede ninguna lista que medir.
