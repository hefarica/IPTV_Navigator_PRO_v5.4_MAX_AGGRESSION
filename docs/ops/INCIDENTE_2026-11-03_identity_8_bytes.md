# INCIDENTE — el identity de la lista tiene 8 bytes. Lo rompí yo.

**Severidad: CRÍTICA**
**Detectado:** 2026-11-03, por el paquete externo `Benchmark_APE_REA_2026-11-03` que aportó el operador.
**Causa:** mi patch de nginx del 2026-11-02 (run `41536525879`).

---

## 1 · Qué pasa

```
A) GET sin Accept-Encoding
   HTTP/1.1 200 OK
   Content-Length: 8
   cuerpo: "#EXTM3U\n"                     <- LISTA VACÍA

B) GET con Accept-Encoding: gzip
   HTTP/1.1 200 OK
   Content-Length: 182222415
   Content-Encoding: gzip
   cuerpo descomprimido: 604.593.696 B     <- lista completa

C) GET con Range: bytes=0-1023, sin gzip
   HTTP/1.1 206 Partial Content
   Content-Range: bytes 0-7/8              <- 206 de un fichero de 8 bytes
```

**El fichero identity en disco tiene 8 bytes.** El `.gz` (182 MB) sí está completo.

## 2 · Por qué lo rompí yo

Los cuatro cambios que apliqué en el run `41536525879`:

| Cambio | Efecto bueno | Efecto que no vi |
|---|---|---|
| `gzip_static always` → `on` | no forzar `.gz` a quien no lo pide | — |
| **`gunzip on` → `off`** | **desbloquea el 206 (rango real)** | **elimina la descompresión en vuelo del `.gz`** |
| `gzip off` en el location | mata el gzip dinámico de las 2 listas pequeñas | — |
| `return 301` → `302` | la redirección | — |

**Antes del patch**, con `gzip_static always` + `gunzip on`, nginx servía el `.gz` a todos y **descomprimía en vuelo** → el cliente recibía los 604 MB aunque el fichero identity estuviera truncado.

**Después del patch**, un cliente sin `Accept-Encoding: gzip` recibe el identity: **8 bytes**.

El fichero identity ya estaba mal antes. Mi patch lo dejó **expuesto**.

## 3 · Por qué mi gate dio 20/20 y no lo detectó

`tools/ape-http-conformance/gate_matrix.js` prueba las piernas **pidiendo gzip explícitamente**. La matriz cubre:

- 200 identity, 200 gzip, 206 identity, 206 gzip, redirección

Pero **la «200 identity» también pedía gzip en la práctica**, o el servidor devolvía el `.gz` por `gzip_static`. **Nunca hubo una petición sin `Accept-Encoding` que verificara el tamaño del cuerpo.**

**Eso es un hueco del gate, no solo del servidor.** Un gate que no compara el tamaño del cuerpo con el esperado no prueba que la lista llegue.

## 4 · El arreglo correcto

**No es volver a `gunzip on`** — eso devuelve el 206 a 200 y perdemos el rango.

**Es regenerar el identity desde el `.gz`:**

```bash
# en el VPS, en el directorio de la lista
cp -a APE_LISTA_1793589060441.m3u8{,.bak_$(date -u +%Y%m%dT%H%M%SZ)}
gunzip -c APE_LISTA_1793589060441.m3u8.gz > APE_LISTA_1793589060441.m3u8.nuevo
# verificar ANTES de sustituir
sha256sum APE_LISTA_1793589060441.m3u8.nuevo   # debe ser 523d52a6...  y 604.593.696 B
mv APE_LISTA_1793589060441.m3u8.nuevo APE_LISTA_1793589060441.m3u8
```

Con el identity completo, `gzip_static on` sirve el `.gz` a quien lo pida y el identity a quien no. **Los cuatro cambios se quedan y el 206 también.**

**Verificación obligatoria tras el arreglo:**

```bash
curl -sS -o /dev/null -w '%{size_download}\n' <url>                      # 604593696
curl -sS --compressed -o /dev/null -w '%{size_download}\n' <url>         # 604593696
curl -sS -r 0-1023 -o /dev/null -w '%{http_code} %{size_download}\n' <url>  # 206 1024
```

## 5 · Lo que el paquete aporta además

- **`runtime/Validacion_filtro_FFmpeg.json`**: `ffmpeg_exit_code: 0` con `hqdn3d, yadif, unsharp, minterpolate`. **Pero es `synthetic_filter_compilation_smoke_test` y `production_quality_test: false`.** Usa `chroma_msize_x=3` — corrige el `0` que yo había señalado como defecto. Prueba que **la cadena compila**, no que la calidad de producción sea mejor.
- **D6 conservado**: 973 registros, 972 directivas, **685 nombres únicos**, 1.198 entradas del registro público.
- **59 pruebas, 0 fallos.**
- **`global_catalog_available: false`** — el paquete tampoco tiene el catálogo completo de 10.573; trabajó sobre una copia preservada.
- El Excel adjunto queda **sin cambios** (sha `72d1eca6…`).

## 6 · Lección que me llevo

**Un gate que no compara el tamaño del cuerpo con el esperado no prueba que la lista llegue.** Mi matriz de 20 celdas medía códigos de estado; ninguno de los 20 comparaba bytes. Por eso un `200` con 8 bytes pasó como éxito.

**Regla para adelante:** toda celda del gate debe exigir `size_download >= tamaño mínimo` además del código.
