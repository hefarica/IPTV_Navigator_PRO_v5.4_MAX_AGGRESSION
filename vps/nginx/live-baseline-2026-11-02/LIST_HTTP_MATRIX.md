# Matriz HTTP de las listas — CORREGIDA a dos ejes (2026-11-02)

**Sustituye** a la versión anterior de este archivo. Aquella medía **un solo perfil de cliente**
(`Range` sin `Accept-Encoding`) y de ahí concluyó «206 falla en dos listas». **Era falso.** El 206 no
«falla»: depende del cliente. Herramienta: `tools/ape-http-conformance/http_matrix.js`.

---

## 1 · La matriz real

`Range: bytes=0-1023` sobre la URL pública, dos perfiles de cliente:

| Lista | tiene `.gz` | **cliente CON gzip** | **cliente SIN gzip** |
|---|:--:|---|---|
| `APE_LISTA_1793589060441.m3u8` | sí | **206** · `Content-Range: bytes 0-1023/182222415` | 200 chunked |
| `APE_LISTA_1793558303852_CDN.m3u8` | sí | **206** | 200 chunked |
| `APE_PRUEBA_ORDER_OK.m3u8` | no | 200 · `Content-Encoding: gzip` | **206** · `…/163187` |
| `APE_PRUEBA_PERFILES.m3u8` | no | 200 · `Content-Encoding: gzip` | **206** · `…/163187` |

```
Listas que dan 206 a AMBOS perfiles: 0 / 4
```

## 2 · Qué significa exactamente

**Cada configuración sirve a un perfil y solo a uno.** No es que el servidor esté roto: es que la
configuración actual obliga a elegir cliente.

| Configuración | Mecanismo | Quién recibe 206 | Quién recibe 200 |
|---|---|---|---|
| `.gz` + `gzip_static always` + `gunzip on` | sirve el comprimido incluso si no se pide | el que pide gzip | el que no lo pide (se descomprime al vuelo, sin rangos) |
| plano, sin `.gz`, `gzip on` (dinámico) | comprime al vuelo | nadie | el que pide gzip (comprime, sin rangos) · el que no lo pide **sí recibe 206** |

La línea brillante: **las listas planas ya dan 206 a los clientes sin gzip.** Lo que las rompe es el
gzip **dinámico**, que se dispara solo cuando el cliente anuncia `Accept-Encoding: gzip`.

## 3 · El arreglo, ahora sí con la pieza correcta

### Mitad gratis — `gzip off;` en `location ~* \.m3u8$`

Desactiva el gzip **dinámico**. Consecuencias medidas y deducidas:

| Lista | Antes | Después de `gzip off` |
|---|---|---|
| planas | 206 a sin-gzip, 200 a con-gzip | **206 a AMBOS** (no hay `.gz` que servir; sin gzip dinámico el fichero plano conserva sus rangos) |
| con `.gz` | 206 a con-gzip, 200 a sin-gzip | **sin cambio**: `gzip_static` es independiente de `gzip off` y sigue sirviendo el `.gz` |

Resultado: **2 de 4 listas pasan a servir a los dos perfiles**, sin escribir un solo byte de datos.

### Mitad costosa — para las dos listas grandes

`gunzip off` **solo funciona si existe un plano real que servir**: hoy el `.m3u8` de 8 bytes es un stub y
el contenido vive únicamente en el `.gz` (182.222.415 B). Descomprimir ≈ 604 MB escritos en el VPS.
Sin eso, `gunzip off` dejaría a los clientes sin gzip con un stub de 8 bytes: **regresión**, por eso se
retiró ese parche.

## 4 · Consecuencia para el gate 200/206/302

| Código | Estado |
|---|---|
| **200** | ✅ todas las listas |
| **302** | ✅ redirección del origen |
| **206** | ⚠️ **por perfil de cliente**, no global. 0/4 listas a ambos perfiles |

El gate no puede declararse superado mientras una lista no dé 206 a los dos perfiles. Con la mitad
gratis, quedan 2/4; con la descompresión, 4/4.

## 5 · Reproducir

```bash
node tools/ape-http-conformance/http_matrix.js
```

Sin credenciales, sin escrituras, 8 peticiones `Range` de 1 KB.

## 6 · Lo que esta corrección invalida

Afirmaciones anteriores de esta sesión que **no se sostienen**:

- «Ninguna lista da 206 a un cliente sin gzip» → **falso**: dos lo dan.
- «206 falla» → impreciso: falla **para un perfil** en cada lista.
- La matriz de un solo eje → reemplazada por esta de dos ejes.
