# Parche 206 dual: dos directivas, dos líneas, una celda sin medir

**Fecha:** 2026-11-02 · **Estado:** preparado, **NO aplicado** · **Requiere autorización del operador.**

## 1 · Por qué hacen falta dos directivas y no una

La ronda anterior demostró que las dos clases de lista fallan por el mismo motivo —compresión al vuelo,
que produce `Transfer-Encoding: chunked` y con ello se pierde `Content-Range`— pero **la dispara una
directiva distinta** en cada clase:

| Clase | Quién comprime hoy | Qué directiva lo apaga |
|---|---|---|
| listas **grandes** (con `.gz`) | `gunzip on` para clientes sin gzip | **`gunzip off`** |
| listas **pequeñas** (sin `.gz`) | `gzip on` dinámico para clientes gzip | **`gzip off`** |

Ninguno de los dos parches que ya había en el repo contiene las dos: `PATCHED.conf` tiene
`gunzip off` pero deja `gzip_static on` y no toca `gzip`; `PATCHED-gzipoff.conf` tiene `gzip off` pero
deja `gunzip on`. **Cada uno arregla la mitad.**

## 2 · El parche

`vps/nginx/live-baseline-2026-11-02/sites-enabled-default.PATCHED-206-dual.conf`

Construido a partir de la baseline verificada por hash (`6c8e507f…`), dentro de `location ~* \.m3u8$`.
El diff contra la baseline son **exactamente tres líneas de directiva**:

```diff
-        gzip_static always;
-        gunzip on;
+        gzip off;
+        gzip_static on;
+        gunzip off;
```

Verificado sobre el fichero resultante:

```
gzip_static always     ×0
gunzip on;             ×0
gzip off;              ×1
gzip_static on;        ×1
gunzip off;            ×1
llaves                 abre=21 cierra=21  BALANCEADO
```

Los comentarios de la baseline describían el comportamiento viejo («gunzip descomprime al vuelo»,
«streaming decompression»). Con estas directivas eso es falso, así que **se reescribieron**. Un
comentario que describe lo contrario de su directiva es peor que no tener comentario.

## 2-bis · Por qué `gzip_static on` y no `always` — esto cierra el hueco de medición

La primera versión de este parche mantenía `gzip_static always` y añadía `gunzip off`. Eso dejaba una
celda **predicha y no medida**: qué hace nginx cuando `always` le pide servir el `.gz` a un cliente que no
lo acepta y `gunzip` está apagado. Sin nginx en este host, no se podía observar.

**En vez de instalar nginx para responder esa pregunta, se diseñó fuera.**

Con `gzip_static on` —el valor por defecto de nginx— el `.gz` se sirve **solo** a clientes que envían
`Accept-Encoding: gzip`. Un cliente sin gzip recibe **el fichero plano**, que es un estático normal con
`Content-Length` y `Content-Range`. `gunzip` deja de participar por completo: nunca hay que descomprimir
para servir.

Resultado: **ninguna de las cuatro celdas depende de una interacción deducida.** Las dos celdas nuevas
—«grande + identity» y «pequeña + gzip»— se reducen al mismo caso: *nginx sirviendo un fichero plano
estático con Range*, que es exactamente el caso que **ya está medido hoy** en «pequeña + identity»
(163.187 B → 206). Cambia el tamaño del fichero, no el mecanismo.

`gunzip off` se mantiene como defensa explícita: si alguien vuelve a poner `always`, esa línea impide
que se sirva un `.gz` descomprimido en streaming a un cliente que no lo pidió.

## 3 · La matriz que predice

| Lista | `identity` | `gzip` | Mecanismo |
|---|---|---|---|
| grande | **206** | 206 (medido hoy) | plano con Range · `.gz` con Range |
| pequeña | 206 (medido hoy) | **206** | plano con Range · plano con Range |

Las dos celdas nuevas son «plano estático con Range», el camino más simple de nginx. **Sigue siendo una
predicción, no una medición en producción** — pero ya no depende de ninguna interacción entre directivas
que no haya visto funcionar: depende del mismo comportamiento que una celda de producción demuestra hoy.

## 4 · Cómo se verifica en cuanto se aplique

```bash
node tools/ape-http-conformance/http_matrix.js
```

Criterio de éxito, escrito antes de mirar el resultado:

```
"Listas que dan 206 a AMBOS tipos de cliente: 4/4"
```

Si sale **3/4** o menos, la celda predicha falló y el parche se revierte.

## 5 · Contrapartida, con el número delante

Un cliente sin gzip sobre la lista grande baja **604.593.696 B** en vez de **182.222.415 B**. Es la misma
lista sin comprimir en tránsito; no hay degradación de imagen. Son 3,3× más bytes para ese perfil.

## 6 · Aplicación y rollback (no ejecutado)

```bash
# 1. copia de seguridad con sello de tiempo
cp -a /etc/nginx/sites-enabled/default /var/backups/ape-deploy/nginx-default-$(date -u +%Y%m%dT%H%M%SZ)

# 2. subir el .PATCHED-206-dual.conf al VPS y sustituir

# 3. validar ANTES de recargar
nginx -t

# 4. recargar (no reiniciar)
systemctl reload nginx

# 5. medir
node tools/ape-http-conformance/http_matrix.js

# rollback: restaurar la copia del paso 1, nginx -t, systemctl reload nginx
```

`nginx -t` es obligatorio antes del reload: una config inválida en `reload` deja el proceso viejo
sirviendo, pero un `restart` con la misma config deja el servicio caído.

## 7 · Lo del 301 va aparte, y no lo mezclo

`/etc/nginx/sites-enabled/default` línea **21**:

```
        return 301 https://$host$request_uri;
```

Las cuatro rutas medidas (`/`, `/lists/`, y las dos listas) devuelven **301** por HTTP plano. El gate pide
**302**. Es un cambio de un token (`301`→`302`) **en otra decisión**: 301 lo cachean los clientes de forma
permanente, y si algún día cambia el destino del redirect, un cliente con 301 guardado no vuelve a
preguntar. Por eso no lo meto en el mismo parche: aprobar el 206 no debe aprobar de rebote un cambio de
semántica de caché.

**Dos decisiones separadas, no una.**

## 8 · Lo que este informe NO dice

- No dice que el parche funcione: **no está medido en producción**. La diferencia con la versión anterior
  es que ya no depende de una interacción deducida entre directivas, solo del comportamiento de servir un
  plano estático con Range, que una celda de producción demuestra hoy.
- No ha probado un cliente real (VLC/OTT/ExoPlayer) pidiendo rangos.
- No ha medido el impacto en CPU ni en ancho de banda del servidor.
- **No ha medido el efecto de `gzip_static on` en el tráfico de los clientes gzip sobre las listas
  pequeñas**: hoy reciben 200 comprimido; pasarán a recibir el plano. Son 163.187 B, despreciable, pero
  no está medido.
- No ha aplicado nada: el VPS sigue con cero escrituras esta sesión.
