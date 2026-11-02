# El 5 % que sirve playlists grandes mejor que el 95 % — con fuentes primarias

**Fecha:** 2026-11-02 · **Método:** documentación oficial de nginx + lista de correo del vendor + medición propia
contra la URL pública (`https://iptv-ape.duckdns.org/lists/APE_LISTA_1793589060441.m3u8`).

---

## 1 · Lo que dice el vendor (no un blog)

> «The `ngx_http_gunzip_module` module is a filter that **decompresses responses with
> `Content-Encoding: gzip` for clients that do not support gzip** encoding method.»
> — [nginx.org · ngx_http_gunzip_module](https://nginx.org/en/docs/http/ngx_http_gunzip_module.html)

> «I found that whenever `Content-Encoding: gzip` is on. Nginx will return **200 instead of 206**.
> When gzip is off, nginx will return **range request normally**.»
> — [nginx mailing list, ago-2014](http://mailman.nginx.org/pipermail/nginx/2014-August/044873.html)

Dos hechos de los que se deduce todo lo demás:

1. **`gunzip` es el camino de compatibilidad**, no el principal: existe para quien *no* habla gzip.
2. **Una respuesta comprimida al vuelo no puede dar rangos.** El vendor lo dice; nosotros lo medimos
   doce años después con nginx 1.28.3.

## 2 · Lo que medimos nosotros (2026)

| Petición | Respuesta |
|---|---|
| `Range: bytes=0-1023` sin `Accept-Encoding` | **200** · `Transfer-Encoding: chunked` · sin `Content-Range` |
| `Range: bytes=0-1023` + `Accept-Encoding: gzip` | **206** · `Content-Range: bytes 0-1023/182222415` · `Content-Length: 1024` |

Y el matiz que une las dos fuentes: los `206` de la segunda fila son rangos **sobre el `.gz`**
(182.222.415 es el tamaño comprimido, no el descomprimido). Eso es HTTP correcto: el rango es sobre la
representación que viaja.

**Conclusión operativa:** `gzip_static` (fichero `.gz` en disco) **sí** puede dar 206; `gzip` dinámico
y `gunzip` **no**. Los tres conviven en el mismo `location` y por eso el comportamiento cambia según la
cabecera del cliente.

## 3 · Lo que hace el 5 % y el 95 % no

| Práctica | Por qué es del 5 % |
|---|---|
| Servir **identidad** (sin comprimir) lo que necesita rangos | Con `gzip off` el módulo estático da 206 sin trucos. Es la respuesta que da el propio vendor. |
| **No mezclar** `gzip` dinámico con contenido que requiere `Range` | El 95 % activa `gzip on` global «porque comprime», y rompe los rangos sin darse cuenta. |
| **Declarar `Accept-Ranges` solo si se cumple** | Anunciar `bytes` y responder 200 es una mentira medible. El 95 % la tiene puesta. |
| **Pre-comprimir a `.gz` en disco** y servir con `gzip_static`, no comprimir al vuelo | Ahorra CPU y **conserva** los rangos sobre el comprimido. |
| **Un `location` por tipo de contenido** | Playlist (rango, sin compresión dinámica) ≠ segmentos (sin rango, con caché) ≠ estáticos. |

## 4 · Las dos mitades del arreglo, y solo una es gratis

### Mitad gratis — listas que ya tienen plano real (sin `.gz`)

`APE_PRUEBA_ORDER_OK.m3u8` y `APE_PRUEBA_PERFILES.m3u8` (163.187 B cada una) hoy dan **200** al Range
porque el `gzip on` del nivel `http` las comprime al vuelo.

Añadir **`gzip off;`** dentro de `location ~* \.m3u8$` les da **206 inmediato**, con **cero escrituras
de datos**. Es una línea de configuración.

### Mitad que cuesta una escritura — listas con `.gz` y stub de 8 B

`APE_LISTA_1793589060441.m3u8` y `APE_LISTA_1793558303852_CDN.m3u8` tienen un plano de **8 bytes** y el
contenido real solo en el `.gz`. Con `gunzip off` un cliente sin gzip recibiría 8 bytes: **listas rotas**.

Para que **todos** los clientes reciban 206 hace falta **descomprimir a disco** (~604 MB la grande) y
solo después:

```nginx
gzip off;            # sin compresión dinámica → rangos intactos
gzip_static on;      # sirve el .gz a quien lo pida, con rangos sobre el comprimido
gunzip off;          # el detector-mentiras desaparece porque ya no hay mentira que tapar
```

Resultado: cliente con gzip → 206 sobre el `.gz`; cliente sin gzip → 206 sobre el plano. **Los dos.**
Sin escritura, la mitad que se puede es la de las listas planas.

## 5 · La alternativa que no rompe nada y no da 206

Quitar `add_header Accept-Ranges bytes always;` — o condicionarlo a `$gzip_static`/`$sent_http_content_encoding`.

Deja de mentir, no mejora nada, y **no cumple el requisito** del operador. Se documenta porque es la
opción honesta si no se autoriza la escritura.

## 6 · Fuentes

- [nginx.org · ngx_http_gunzip_module](https://nginx.org/en/docs/http/ngx_http_gunzip_module.html) — semántica de `gunzip`, contextos y `gunzip_buffers`.
- [mailman.nginx.org · «Range request not working for gzipped content» (2014)](http://mailman.nginx.org/pipermail/nginx/2014-August/044873.html) — gzip on ⇒ 200; gzip off ⇒ rangos normales.
- Medición propia 2026-11-02 contra la URL pública y contra el `.gz` (182.222.415 B).
- Matriz por lista: `LIST_HTTP_MATRIX.md` (este mismo directorio).
- Configuración viva byte-exacta: `sites-enabled-default.conf` (sha256 `6c8e507f…764f`, verificado contra el VPS).
