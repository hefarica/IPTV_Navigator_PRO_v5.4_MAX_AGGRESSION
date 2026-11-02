# Telemetría de flujo real — qué pasa de verdad con las listas

**Fecha:** 2026-11-02 · **Fuente:** `/var/log/nginx/playlist_access.log` + rotaciones 1–4
**Herramienta:** `_vps_stage/deploy/flow_telemetry.sh` (read-only) · run `41474063364`

---

## 0 · Corrección de un error mío

Dije «no fluye» basándome en `access.log`, que tenía **0** entradas de `/lists/`. **Era falso.**

La config viva (`sites-enabled/default`, sha256 `6c8e507f…`, línea 55) declara:

```nginx
access_log /var/log/nginx/playlist_access.log;
```

`/lists/` se registra en **`playlist_access.log`**, no en `access.log`. Medir `access.log` y concluir
«no hay tráfico» era medir el fichero equivocado. El barrido de `/var/log/nginx/*` lo encontró:
**~1.463 coincidencias** de `/lists/` repartidas en el log activo y sus rotaciones.

## 1 · El tráfico real, por lista y código

| Lista | COD | Peticiones | Bytes |
|---|---:|---:|---:|
| `APE_LISTA_1793589060441.m3u8` | **200** | 91 | **27.396.744.407** |
| `APE_LISTA_1793531111695_CDN.m3u8` | 200 | 71 | 5.220.424.182 |
| `APE_LISTA_1793589060441.m3u8` | 206 | 25 | 25.600 |
| `APE_LISTA_1793531111695_CDN.m3u8` | **404** | **34** | 4.818 |
| `APE_LISTA_1793569066655_CDN_FAST.m3u8` | 200 | 6 | 64.516.222 |
| `APE_LISTA_1793569066655_AUDIO_CRYSTAL.m3u8` | 200 | 1 | 158.885.356 |
| `APE_LISTA_1793569066655_AUDIO_CRYSTAL_FAST.m3u8` | 200 | 1 | 787.160 |
| `APE_LISTA_1793589060441.m3u8.gz` | 200 | 1 | 344.064 |
| `APE_LISTA_1793589060441.m3u8` | 304 | 1 | 0 |
| `/lists/` | 403 | 4 | 1.388 |
| `APE_LISTA_1793589060441.m3u` | 404 | 1 | 548 |
| `APE_LISTA_1793569066655_CDN.m3u8` | 404 | 1 | 548 |
| `APE_LISTA_1793589060441.json` | 404 | 1 | 548 |
| `index.json` | 404 | 1 | 548 |
| `APE_LISTA_4K.m3u8` | 404 | 2 | 694 |
| `APE_LISTA_1793002539897_CDN.m3u8` | 404 | 1 | 146 |

**La lista grande se consume de verdad: 27,4 GB servidos en 91 respuestas 200.**

## 2 · El hallazgo que cambia la conversación del 206

```
206 → 25 peticiones × 1.024 B exactos = 25.600 B
```

**Todos los 206 son sondas mías de 1 KB.** No hay un solo cliente real pidiendo rangos: los clientes
descargan el fichero entero (200) o usan condicional (304, una vez).

Consecuencia honesta: **el 206 no es un requisito de los clientes que hoy consumen.** Es un requisito
tuyo, y sigue abierto — pero no está bloqueando a nadie hoy. Eso cambia la prioridad, no la meta.

## 3 · El defecto operativo real: 34 peticiones a una lista inexistente

```
/lists/APE_LISTA_1793531111695_CDN.m3u8   404   34   4.818 B
```

**34 intentos reales, todos 404.** Esa lista **no existe** con su nombre canónico, pero en el VPS viven:

- `APE_LISTA_1793531111695_CDN.m3u8.new` — 607.260.288 B, `-r--r--r--` (solo lectura)
- `APE_LISTA_1793531111695_CDN.m3u8.clean` — 586.763.324 B

Alguien la pide, no la encuentra, y reintenta. **Esto sí es un fallo en producción, medido, repetido y
sin arreglar.** El arreglo es del operador: renombrar o enlazar el `.new`/`.clean` al nombre canónico
(una escritura en el VPS, no autorizada).

## 4 · Otros 404 repetidos, señal de expectativas

`APE_LISTA_4K.m3u8` (2), `.m3u`, `.json`, `index.json` → un cliente espera artefactos que no se publican.
No es un fallo del servidor; es un catálogo de nombres que alguien consume y no existen.

## 5 · Lo que esta medición NO dice

- No distingue cliente por `User-Agent`: el `log_format` no lo separa por lista.
- La ventana es el log activo + 4 rotaciones; más atrás queda fuera y no se extrapola.
- `playlist_error.log` tiene 208 líneas con 3 menciones de `/lists/`: **no revisado aún**.

## 6 · Reproducir

```bash
gh workflow run deploy-vps.yml --ref feat/adb-generic-visual-enhancement-installer -f mode=dry-run
# artefacto: flow-telemetry.txt
```
