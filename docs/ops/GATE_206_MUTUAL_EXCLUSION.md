# 206: no falla — es exclusión mutua, y son DOS directivas, no una

**Fecha:** 2026-11-02 · **Medición:** `node tools/ape-http-conformance/http_matrix.js` + captura de
cabeceras crudas · **Solo lectura, cero escrituras en el VPS.**

## 1 · Corrección de lo que yo mismo venía reportando

He estado reportando **«206 ❌ 0/4»**. Esa lectura es imprecisa y la corrijo con la medición de hoy:

> **Las cuatro listas SÍ devuelven 206.** Lo que no hace ninguna es devolver 206 a **ambos** perfiles
> de cliente a la vez. El 0/4 es de exclusividad, no de incapacidad.

| Lista | `Accept-Encoding: identity` | `Accept-Encoding: gzip` |
|---|---|---|
| `APE_LISTA_1793589060441.m3u8` (604 MB) | **200 chunked** | **206 ✓** |
| `APE_LISTA_1793558303852_CDN.m3u8` | **200 chunked** | **206 ✓** |
| `APE_PRUEBA_ORDER_OK.m3u8` (163.187 B) | **206 ✓** | **200 (gzip dinámico)** |
| `APE_PRUEBA_PERFILES.m3u8` | **206 ✓** | **200 (gzip dinámico)** |

## 2 · El mecanismo, por clase de lista (cabeceras crudas)

```
GRANDE   identity | 200 | CE=identity | TE=chunked | CL=-    | CR=-                  | AR=bytes
GRANDE   gzip     | 206 | CE=gzip     | TE=-       | CL=1024 | CR=bytes 0-1023/182222415 | AR=bytes
PEQUEÑA  identity | 206 | CE=identity | TE=-       | CL=1024 | CR=bytes 0-1023/163187     | AR=bytes
PEQUEÑA  gzip     | 200 | CE=gzip     | TE=chunked | CL=-    | CR=-                  | AR=bytes
```

**Listas grandes** — tienen `.gz` pregenerado. `gzip_static always` sirve el `.gz` a los clientes gzip y
ahí el Range funciona (206, `Content-Range` correcto). A los clientes identity les toca **`gunzip`**, y
nginx descomprime al vuelo: `CE=identity` + `TE=chunked` + **sin `Content-Range`**. El Range se pierde
porque el cuerpo se está transformando.

**Listas pequeñas** — no hay `.gz`. Los clientes identity reciben el plano con Range (206). Los clientes
gzip disparan **`gzip on` dinámico**, y la compresión al vuelo produce otra vez `TE=chunked` sin
`Content-Range`.

**Es la misma causa en las dos clases: compresión al vuelo ⇒ cuerpo sin longitud conocida ⇒ sin Range.**
Lo que cambia es *qué* directiva provoca la compresión en cada clase.

## 3 · Por eso una sola línea no arregla las cuatro

| Directiva | Qué arregla | Qué deja roto |
|---|---|---|
| `gunzip off` | las 2 **grandes** (identity pasa a recibir el plano con Range) | las 2 pequeñas siguen dando 200 a gzip |
| `gzip off` | las 2 **pequeñas** (gzip pasa a recibir el plano con Range) | las 2 grandes siguen dando 200 a identity |
| **las dos** | **4/4 a ambos perfiles** | — |

**`gzip off` solo no basta**, y eso es lo que yo venía diciendo como si bastara. Se necesitan las dos.

Efecto lateral de `gunzip off`: un cliente identity sobre la lista grande descarga el **plano completo**
en vez de la representación comprimida. Tamaños medidos hoy:

| Lista | Representación `identity` | Representación `gzip` | Ratio |
|---|---:|---:|---:|
| `…1793589060441` | 604.593.696 B (del fichero local) | **182.222.415 B** (del `Content-Range`) | 0,301 |
| `…1793558303852_CDN` | no declarada por HTTP | **182.548.572 B** | — |
| `APE_PRUEBA_ORDER_OK` | **163.187 B** | gzip dinámico, sin longitud | — |

**El tamaño de la representación `identity` de la lista grande lo da el fichero local, no HTTP.** Cuando
nginx descomprime al vuelo manda `Transfer-Encoding: chunked` sin `Content-Length`, así que por la red
ese número no existe. La matriz lo reporta como `null` en vez de inventarlo.

No es una degradación de imagen: es la misma lista, sin comprimir en tránsito. Queda con el número
delante para que la decisión no sea a ciegas.

## 4 · Una inconsistencia de protocolo que aparece en los cuatro casos

```
Accept-Ranges: bytes    ← se anuncia SIEMPRE, incluso en el 200 chunked
```

Nginx anuncia soporte de Range en los cuatro escenarios, pero cuando transforma el cuerpo **no lo
honra**. Un cliente que lee `Accept-Ranges: bytes` y pide un rango recibe `200` en vez de `206`. No es
lo que rompe la reproducción —un player que pide el fichero entero no usa Range— pero sí invalida la
declaración, y cualquier verificación que se fíe de `Accept-Ranges` dará un falso positivo.

## 5 · Estado del gate, sin adornos

```
200  ✅  4/4 — medido, con 27.396.744.407 B servidos sobre la lista grande
206  ⚠️  4/4 dan 206 al perfil correcto · 0/4 dan 206 a AMBOS perfiles
302  ⚠️  las 4 devuelven 301, no 302
```

**Ninguno de los dos arreglos de 206 está autorizado.** Son una línea cada uno en
`/etc/nginx/sites-enabled/default`, y este informe no las aplica.

## 6 · Lo que este informe NO dice

- No dice que `gzip off` sea seguro sin medir el efecto en el ancho de banda de las dos listas grandes.
- No ha probado `gunzip off` en producción: la deducción sale de las cabeceras, no de haberlo aplicado.
- No ha probado un cliente real (VLC/OTT/ExoPlayer) pidiendo rangos: los cuatro casos son peticiones mías.
