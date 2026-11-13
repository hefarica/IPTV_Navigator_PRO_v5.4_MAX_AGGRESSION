# La cadena real: el ONN consume `/pulse/` · 2026-11-12

**Lo que resuelve:** si el televisor estaba consumiendo el sistema o solo al proveedor. Respuesta medida: **consume el sistema, y el vídeo lo sirve el proveedor**. Esa es exactamente la arquitectura que la doctrina describe, y hasta hoy no estaba verificada desde el lado del servidor con el aparato reproduciendo.

## La petición, cruda

```
181.130.154.235 - - [13/Nov/2026:02:52:03 +0000]
"GET /pulse/548062.m3u8?u=http%3A%2F%2Fline.tivi-ott.net%2Flive%2F3JHFTC%2FU56BDP%2F548062.m3u8
 &d=eyJ0IjoiZ2VuZXJpYyIsInMiOiJ1bmtub3duIiwiciI... HTTP/2.0" 200 352
```

| Campo | Qué dice |
|---|---|
| `/pulse/548062.m3u8` | **El envoltorio pulse del sistema.** El televisor no va directo al proveedor: pasa por APE. |
| `u=` | Upstream: `http://line.tivi-ott.net/live/3JHFTC/U56BDP/548062.m3u8` — el proveedor |
| `d=` | Metadata base64 del cliente. Decodificado: **`{"t":"generic","s":"unknown",…}`** |

**`t=generic` y `s=unknown`**: el cliente declara tipo genérico y **pantalla desconocida**. El resolutor de perfiles se queda sin dato de capacidad y cae al comportamiento por defecto. Es el hueco de §5/§11 medido en producción, no en teoría.

*(El resto del base64 quedó cortado por mi recorte a 190 caracteres; no lo reconstruyo.)*

## Cadencia y zapping, medidos

- Peticiones al **mismo** canal `548062`: **cada ~20 s** (02:52:03 · 02:52:28 · 02:52:51 · 02:53:11 · 02:53:31 · 02:54:00 · 02:54:22 · 02:54:43 · 02:55:02 · 02:55:28).
- A las **02:55:46** pasa a `/pulse/548063.m3u8` → **cambio de canal observado**, con secuencia limpia (última petición al anterior, luego el nuevo).

## El vídeo NO pasa por el VPS — ahora sí está probado

La pregunta era si el VPS transporta media. Las **40 respuestas `206`** (Range) se agrupan así:

```
8 /lists/APE_PRUEBA_PERFILES.m3u8
8 /lists/APE_PRUEBA_ORDER_OK.m3u8
8 /lists/APE_LISTA_1794100720046.m3u8
8 /lists/APE_LISTA_1793926685925.m3u8
8 /lists/APE_LISTA_1793787155230.m3u8
```

**Todas son manifiestos de lista. Ninguna es un segmento.** Y las peticiones del cliente Android (`okhttp/4.12.0`) van a `/prisma/api/conviva-event.php` y `/prisma/api/ape-feedforward-stream.php` — telemetría, no vídeo.

**Conclusión medida: el VPS sirve listas y metadatos; los píxeles vienen del proveedor.** La doctrina «rebase-only» queda confirmada por el lado del servidor, no citada de un documento.

## Dos defectos que salen solos

| Ruta | Peticiones | Resultado |
|---|---|---|
| `/prisma/api/telemetry-full` | **23** | **404** |
| `/prisma/api/sentinel-status` | **23** | **404** |
| `/lists/APE_LISTA_1793589060441.m3u8` | **12** | **404** (la fixture retirada) |

Un cliente Android **pide dos endpoints que no existen, 23 veces cada uno en la ventana**. Es §7 (registro/conexión) parcialmente roto: el cliente llama a `telemetry-full` y `sentinel-status` y recibe 404. No lo arreglo aquí; queda medido y nombrado.

## Cómo llegué hasta aquí (y los dos falsos ceros que descarté)

1. `adb` decía `0 dispositivos`, `mdns` vacío, puertos cerrados → **no era «no hay aparato», era ADB apagado**.
2. Primer intento de logs: leí `access.log` y `apt.log` → **«0 peticiones de esa IP»**. Falso: el inventario del log mostró que `access.log` solo lleva health checks de `curl` local; el tráfico real está en `playlist_access.log`, `shield_access.log`, `ara_sync_access.log`.
3. Corregido a `/var/log/nginx/*access*.log` → 2327 líneas y **1351 peticiones de esa IP**.

Los dos ceros venían de instrumentos que no miraban el sitio correcto. El inventario del log fue lo que los cazó.

## Lo que sigue sin medirse

- **La imagen en el panel.** `screencap` vuelve negro (no captura el plano de vídeo por hardware) y solo el operador puede decir qué ve.
- **Frames perdidos.** El registro del códec trae `frame_rate:-1` y `operating_rate:-1`: este códec no los reporta.
- **Si `/pulse/` devolvió 200 con cabeceras APE correctas**: el log da `200` y 352 bytes, pero no inspeccioné el cuerpo. No afirmo que las directivas viajen.
- **TiviMate.**
