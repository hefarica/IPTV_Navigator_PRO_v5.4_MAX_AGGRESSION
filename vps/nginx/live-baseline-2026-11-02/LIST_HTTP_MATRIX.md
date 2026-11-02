# Matriz HTTP real de TODAS las listas publicadas

**Fecha:** 2026-11-02 · **Método:** sonda read-only por GitHub Actions (run 41467900931, job inventory).
**Cero escrituras en el VPS.**

---

## 1 · Resultado medido

| Lista (en `/var/www/html/lists/`) | Plano | `.gz` | GET | Range+gzip | bytes | HEAD |
|---|---|---|---|---|---|---|
| `APE_LISTA_1793558303852_CDN.m3u8` | 8 B (stub) | 182.548.572 B | 200 | **206** | 1.024 | 200 |
| `APE_LISTA_1793589060441.m3u8` | 8 B (stub) | 182.222.415 B | 200 | **206** | 1.024 | 200 |
| `APE_PRUEBA_ORDER_OK.m3u8` | 163.187 B | **no** | 200 | **200** | 42.501 | 200 |
| `APE_PRUEBA_PERFILES.m3u8` | 163.187 B | **no** | 200 | **200** | 42.508 | 200 |

**Regla que sale de los datos, no de la teoría:**

> **206 solo si existe el compañero `.gz`.** Con `.gz`, `gzip_static` sirve el fichero comprimido y el
> módulo estático respeta el rango sobre él. Sin `.gz`, el `gzip on` del nivel `http` **comprime el
> fichero plano al vuelo**, y la compresión dinámica tampoco soporta rangos → 200 con el cuerpo entero.

Los 42.501 / 42.508 bytes no son el fichero completo (163.187): son lo que se alcanzó a transferir antes
del corte de 20 s, evidencia de que el servidor estaba mandando el cuerpo desde el byte 0.

## 2 · Ficheros que NO se sirven (órfanos y variantes)

Del listado real del directorio:

| Fichero | Estado |
|---|---|
| `APE_LISTA_CDN_2026-10-29.m3u8.gz` (140 MB) | `.gz` **sin** `.m3u8` plano → `try_files $uri =404` → **404**, no aparece en la matriz |
| `APE_LISTA_1793531111695_CDN.m3u8.clean` (586 MB) | extensión `.clean`, no matchea `location ~* \.m3u8$` |
| `APE_LISTA_1793531111695_CDN.m3u8.new` (607 MB, `-r--r--r--`) | extensión `.new`, no matchea |
| `APE_GPU_TEST.m3u8.bak.1782291261` | `.bak`, no matchea |
| `APE_LISTA_1780868608676_OMEGA_OPEN.m3u8.gz.bak_20260612_102007` | `.bak`, no matchea |
| `lists -> /var/www/html/lists` | symlink redundante |

**Consecuencia:** hay una lista publicada cuya `.gz` existe pero cuyo plano no, y que por tanto
**no se sirve en absoluto**. Ese es un fallo de publicación, no de transporte.

## 3 · Las tres configuraciones posibles y qué entrega cada una

| Configuración | Cliente con gzip | Cliente sin gzip |
|---|---|---|
| Lista **con** `.gz` (stub plano) | 200 + **206** | 200 chunked (gunzip) |
| Lista **sin** `.gz` (plano real) | 200 (gzip dinámico) | 200, y el rango **no** se cumple |
| `.gz` **sin** plano | **404** | **404** |

**Ninguna de las cuatro listas medidas entrega 206 a un cliente que no envíe `Accept-Encoding: gzip`.**

## 4 · Qué haría falta para el 206 universal

1. **Descomprimir** cada `.gz` a un plano real (604 MB en la lista grande) y **quitar `gunzip`**.
   Escritura en el VPS → requiere autorización explícita del operador.
2. O dejar de anunciar `Accept-Ranges: bytes` y aceptar que no hay 206.
3. O servir desde otra ruta sin `gzip` dinámico, para que el módulo estático dé rangos.

## 5 · Lo que este documento corrige

- El inventario del repo (`find /var/www -name '*.m3u8'`) devuelve **vacío**: es un **hueco de
  cobertura**, no un cero. El directorio real se listó con `ls -la` en esta sonda.
- `/var/www/lists` **no existe** (el inventario lo citaba). La ruta real es `/var/www/html/lists`.

## 6 · Evidencia

- Run: https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/actions/runs/41467900931
- Paso: `Matriz HTTP de todas las listas (read-only)` (job 125353523686)
- Artefacto: `list-matrix.txt`
- Verificador local que reproduce 200/206/302 sobre la lista viva: `tools/ape-http-conformance/verify_http_matrix.js`
