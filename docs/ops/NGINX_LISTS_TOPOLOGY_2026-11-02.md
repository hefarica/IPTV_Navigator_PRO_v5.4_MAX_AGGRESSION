# Topología real de `/lists/` y causa raíz del HTTP 206

**Fecha:** 2026-11-02 · **Método:** sonda read-only vía GitHub Actions (`deploy-vps.yml`, job `inventory`) +
artefacto descargado. **Cero escrituras en el VPS.**

---

## 1 · Corrección de un diagnóstico previo (era mío)

En turnos anteriores diagnostiqué que el 206 fallaba por `gzip_static always` + `gunzip on` +
`add_header Accept-Ranges bytes always`, leyendo `IPTV_v5.4_MAX_AGGRESSION/backend/nginx-production.conf`.

**Ese archivo NO es la configuración viva.** Medido:

| Archivo | sha256 |
|---|---|
| `/etc/nginx/sites-available/default` (VIVO) | `e061407e36d6602aad51283b15572eafd074fe1b0cdc4356ebf17fb2e4a9872e` |
| `backend/nginx-production.conf` (repo) | `91c15c5f13b6212f12cbf31d77c2f142a0a397f93c495460a6d5a98f6b9d559e` |

Se buscó en **todos** los `.conf` del repo entre 1 KB y 60 KB: **ninguno** hashea al vivo.
Diagnosticar sobre el archivo del repo produjo una causa raíz falsa. Queda retirada.

---

## 2 · La causa raíz real

```nginx
location ^~ /lists/ {
    proxy_pass http://127.0.0.1:8080/;   # Guardian Engine
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_request_buffering off;
    add_header Access-Control-Allow-Origin "*" always;
    ...
}
```

**`/lists/` no lo sirve nginx.** Lo proxya a un servicio en `127.0.0.1:8080`.

Consecuencias medidas:

- `^~` da **prioridad sobre el regex** `~* \.m3u8$` (línea 288). O sea: el bloque que yo creía
  responsable **nunca atiende** `/lists/`.
- `gzip_static` y `gunzip` **no aparecen** en la config viva. La hipótesis del gunzip era del repo.
- `Accept-Ranges: bytes` y `ETag: W/"6ae800ab-adc7e4f"` viajan en la respuesta del **upstream**,
  no los añade nginx para respuestas proxeadas.

> **El 206 falla porque el servicio de :8080 anuncia `Accept-Ranges: bytes` y no implementa Range.**
> No es nginx. No es gzip. Es el Guardian.

---

## 3 · El Guardian no está en el repositorio

- No hay fuente Python del servicio de :8080 en el repo.
- `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md` registra `ape-realtime-guardian`: **sin unit**.
- El path `/guardian/` proxya a **:8081** (otra instancia), lo que confirma que son servicios distintos.

**Es el endpoint más importante del sistema (la playlist) servido por un proceso no versionado.**

---

## 4 · Correcciones de lecturas anteriores del inventario

| Lectura previa | Realidad medida |
|---|---|
| `nginx -t` «test failed» | **exit 0 · `test is successful`** (con y sin sudo) |
| `/etc/nginx/conf.d/` vacío | **10 archivos**, incluido `50-ape-meta-plane.conf` (12.389 B, Oct 31) |
| `sites-enabled/default` symlink a `sites-available/default` | **archivo regular** de 8.071 B; `sites-available/default` tiene el mismo hash |

El «test failed» y el «conf.d vacío» eran artefactos de la ventana filtrada del log. Fijado aquí.

---

## 5 · Las dos rutas reales para el 206

### Ruta A — tocar el Guardian (correcta)
Implementar `Range` en el servicio de :8080, o dejar de anunciar `Accept-Ranges: bytes`.
**Requiere el código del Guardian**, que no está en el workspace.

### Ruta B — saltarse el Guardian en nginx (rápida, con riesgo)
Cambiar `proxy_pass` por `root`/`try_files` en `location ^~ /lists/`.
Resuelve el 206 al instante (el módulo estático de nginx soporta ranges).
**Riesgo:** se pierde el rebase/procesamiento del Guardian; el contenido servido cambiaría.
Solo válido si el archivo en disco ya está final.

### Ruta C — honestidad
Dejar de anunciar `Accept-Ranges: bytes` y documentar que no hay 206.
Cumple la honestidad, **no** el requisito del operador.

---

## 6 · Estado de la evidencia

| Artefacto | Dónde |
|---|---|
| Config viva byte-exacta | artefacto `inventory` del run 41463926447 (`sites-available-default.conf`, 13.916 B) |
| Salida de la sonda | mismo artefacto (`nginx-probe.txt`, 1.772 B) |
| Verificador del 206 | `tools/ape-http-conformance/verify_http_matrix.js` (exit 1) |

**Nada se modificó en el VPS.** La sonda solo leyó y trajo el archivo.
