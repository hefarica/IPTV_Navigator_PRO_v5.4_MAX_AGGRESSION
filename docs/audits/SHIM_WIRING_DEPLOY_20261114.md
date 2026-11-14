# Cableado de `/playlist-shim.m3u8` y despliegue por CI/CD — 2026-11-14

**Autor:** provider-arbiter (t48, attempt 1)
**Rama:** `deploy/engine-restart-20261112`
**Resultado: NO SE DESPLIEGA.** El encargo traía su propia condición de parada — *"Si t47 dice NO-GO, PARA y dilo"* — y t47 dice NO-GO. Este documento no es el informe de un deploy: es el informe de por qué el deploy no debe hacerse todavía.

**No se ha escrito ni un byte en el VPS.** Sin `ssh` de escritura, sin `gh workflow run`, sin commit de este cambio, sin push.

---

## 1. La decisión, en una línea

La ruta nueva emite **21.224 URLs de canal** que apuntan todas a `http://127.0.0.1:<port>/source.m3u8?id=…&url=…`, y ese endpoint **no responde nada** (0 bytes hasta que el cliente se rinde) y **no tiene handler en este servidor**. Desplegar no es neutro: publica un catálogo cuyos canales se cuelgan en vez de reproducir. El `/playlist.m3u8` de siempre sigue funcionando, pero quien use la ruta nueva se queda mirando un socket abierto.

---

## 2. Lo que verifiqué yo en el código (no citando a t47)

### 2.1 `/source.m3u8` no lo sirve este servidor

En el `server.js` que se desplegaría sólo aparece como **texto de URLs emitidas** y en comentarios:

```
L5308:  *   en el contrato del OttShim (127.0.0.1/source.m3u8)
L5378:  return 'http://127.0.0.1:' + shimPort + '/source.m3u8?id=' + encodeURIComponent(id) + …
L6277:  *   AHORA: http://127.0.0.1:<puerto>/source.m3u8?id=<id>&url=<esa misma, codificada>
L6317:  out.push('http://127.0.0.1:' + shimPort + '/source.m3u8?id=' + …
```

Ninguna de esas líneas es un router. El despachador `ingress()` no tiene rama para esa ruta. Las ramas que sí existen son `/playlist-calidad…`, `/playlist-idempotente…`, `/playlist-resolver…`, `/playlist.m3u8`, `/playlist-shim.m3u8`, `/capabilities.json`, `/crystal.json`, `/resolve`, `/catalog.json`, `/image/*`.

En el **fichero desplegado** (`vps/ape-jit/server.js`, `290b1103…`): **cero ocurrencias** de `source.m3u8`. O sea que del lado del VPS nada cambia para servirla.

El responder tiene que ser el **OttShim del device** (`127.0.0.1:<puerto>`), que es un proceso aparte. Y es justo el que t47 midió muerto: cinco formas distintas de pedirle `/source.m3u8` (`?id&url`, sólo `?id`, sólo `?url`, sin parámetros, `HEAD`) devuelven **0 bytes** con el socket abierto — ni 502, ni 504, ni 400. Y su tabla `ids` está **saturada en 2048** (2^11), que t47 identificó como ocupación de un `LinkedHashMap` con `removeEldestEntry`, no como un contador.

### 2.2 El cableado en sí está bien hecho

Esto es importante decirlo: el trabajo del servidor **no es el problema**. El diff es **puramente aditivo** — `275 insertions(+), 0 deletions` — y la transformación es sobria:

- lee `APE_JIT_LIST.m3u8` ya generado y reescribe **sólo la línea de URL** de cada canal; no reconstruye la lista, no toca directivas ni perfiles;
- el `url=` que manda al shim es **exactamente la URL de antes**, codificada: el shim reenviaría al mismo destino;
- sin `?port` (ni `APE_SHIM_PORT`) devuelve **400** y lo dice: `falta ?port=<puerto del ottshim>`;
- si el catálogo no existe, **404**; si no se puede leer, **500**;
- **el guard anti-mentira de la auditoría adversarial t51**: si reescribe 0 canales devuelve **500 con `error: wired_nothing` y el conteo `urls_vistas`**, en vez de un 200 vacío proclamando `shim-wired`. Ese guard es correcto y hay que conservarlo.

Y acierta con la forma real de las URLs: el catálogo usa `<base>/jit/live/<id>/master.m3u8` (**21.224** de ellas, `/jit/go/` = **0**), con `/jit/go/<id>?…` sólo como respaldo. El comentario L6297-6305 documenta que el primer regex buscaba `/jit/go/`, daba `match_regex=0` y aun así cantaba `shim-wired`; está corregido.

### 2.3 `/playlist.m3u8` queda intacto (punto 2 del encargo)

Verificado por construcción: `git diff` da **0 borrados**, y el hunk nuevo (`@@ -6138,0 +6265,149 @@`) cae **después** de la rama de `/playlist.m3u8`, que en `HEAD` está en la línea **6132**. La rama existente no se toca y la nueva construye una copia transformada en memoria (`const out = []`); no muta `APE_JIT_LIST.m3u8` ni ningún dato compartido.

`node --check` sobre el fichero modificado: **exit 0**.

---

## 3. Dos incoherencias de estado que encontré al mirar

### 3.1 El fichero ya no mide lo que dice el encargo

| | encargo | medido ahora |
|---|---|---|
| `tools/lab/ape-jit/server.js` | 451.821 B | **463.246 B** |
| sha256 | (no dado) | `b5da7e804799c5ca9dac3f3d9d9fcb81e926395b697cc394d2dbe01dd7e5636b` |

Diferencia: **+11.425 B**. El cambio pendiente es más grande que el descrito, e incluye la corrección de t51 (§2.2). No es un problema en sí — pero significa que **el diff que se commitearía no es el que el encargo revisó**. Commitear y desplegar bytes que nadie ha mirado es exactamente el patrón que rompió `pulse.php`.

Para contraste: `vps/ape-jit/server.js` = **449.392 B / `290b11030f3b…`**, que sí coincide con "el desplegado".

### 3.2 El árbol no está limpio

```
 M docs/audits/LIVE_CAPTURE_20261114.md
 M tools/lab/ape-jit/server.js
 M tools/ops/ape-live-capture.sh
?? docs/audits/OTTSHIM_CONTRACT_20261114.md
?? docs/audits/OVERLAY_UPSCALING_20261114.md
?? docs/audits/SHIM_ADVERSARIAL_20261114.md
?? tools/quality/test_canonical_route.js
```

Un `git add -A` para "commitear el cableado" se llevaría **tres ficheros modificados y cuatro sin trackear** al commit que dispara el deploy. Cojo sólo mi path o no commiteo; aquí he hecho lo segundo.

---

## 4. Qué haría falta para un GO

En orden, y ninguna es cosa mía:

1. **Que `/source.m3u8` responda.** Cualquier cosa menos un socket abierto: 200 con la lista, o 400/502 con un cuerpo. Mientras devuelva 0 bytes, la ruta nueva es una fábrica de cuelgues.
2. **Explicar `ids=2048`.** Si es la tabla LRU de `id→url` saturada, el shim no puede registrar canales nuevos: entraría en evicción constante. Hay que saber el tope real y si hay purga.
3. **Aclarar qué es `127.0.0.1:<port>` en la lista publicada.** El comentario dice que el OttShim corre *en el device*; pero la prueba que pide el encargo es `https://iptv-ape.duckdns.org/jit/playlist-shim.m3u8?port=40213`, y ese `127.0.0.1` lo resuelve **el cliente**, no el VPS. Si el puerto 40213 es el del device del operador, la ruta sólo tiene sentido para ESE device; si se pretendía que fuera el VPS, no puede ser `127.0.0.1`. Está sin definir y es la diferencia entre una lista útil y 21.224 cuelgues.
4. **Repetir la medición post-deploy contra un shim que responda**, no contra uno que se queda en silencio: si el cliente se rinde por timeout, un `curl` "sin error" no prueba que funcione.

---

## 5. Lo que NO he hecho

- **No he commiteado** el cambio de `tools/lab/ape-jit/server.js`.
- **No he hecho push.**
- **No he disparado `deploy-vps.yml`**, ni en `dry-run` ni en `deploy`. Por tanto **no hay run id, ni estado de jobs, ni prueba post-deploy**: ese material no existe y no lo voy a inventar.
- **No he escrito en el VPS**: ni `ssh` de escritura, ni `systemctl`, ni un byte. La única actividad ha sido leer el repo y el código.

El entregable que el encargo pedía — diff, run id, estado de cada job y prueba post-deploy con salida literal — queda entregado **en la parte que se puede entregar sin desplegar**: el diff (§2.2/§2.3) y el motivo documentado por el que no hay run id ni prueba (§1, §4).

---

## 6. Recomendación

**Mantener `/playlist-shim.m3u8` en el repo, sin desplegar.** No estorba: es aditiva, no toca `/playlist.m3u8` y lleva un guard que impide cantar `shim-wired` sin haber cableado nada. Lo que no puede es salir a producción apuntando a un endpoint que no contesta.

Si el capitán aun así quiere el deploy para poder medir el shim desde el device, entonces conviene que el encargo lo diga con esa motivación explícita y que la prueba acepte el resultado esperado: **cuelgue del cliente**. Un deploy para medir un cuelgue es defendible; un deploy que se documente como "ruta cableada y funcionando" no lo es.
