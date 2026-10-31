# Revisión MIGRACION_VAST vs repo actual

**Fecha:** 2026-10-31  
**Paquete:** `C:\Users\HFRC\Downloads\MIGRACION_VAST`  
**Veredicto:** **NO portar completo**. Es una migración de dominio a una instancia Vast que todavía no existe; el bundle no está testeado y su data-plane no encaja con el VPS actual metadata-only. Solo hay dos patrones reutilizables y deben ir a staging, no a la config viva.

---

## 1. Qué contiene

| Archivo | Función | Estado |
|---|---|---|
| `MIGRATION_RUNBOOK.md` | Plan de corte Hetzner → Vast, dominio, SSL DNS-01, rsync, rollback | No ejecutado; la instancia no existe (`:126`) |
| `PROVISION.sh` | Aprovisiona Vast: apt, rsync, systemd, certbot, nginx | Sintaxis OK (`bash -n=0`), pero destructivo/hardcodeado |
| `nginx-domain.conf` | Server block del dominio, loop-break UA, GPU local, PHP | No testeado; PHP 8.1 y SNI faltante |
| `ape_gpu_worker_v3.py` | Transcode 4K NVENC continuo, HLS, watchdog, prewarm | Sintaxis OK (`py_compile=0`), pero expuesto y con riesgos |

---

## 2. Qué es adaptable sin regresión

### A. Loop-break por UA (concepto)

`nginx-domain.conf:6,34-39` separa la ingesta del worker (`APE-GPU-Worker`) del player. Es un patrón correcto y reusable **como snippet aislado** cuando exista un GPU; hoy no hay ruta `/shield/` viva ni worker.

**Adaptación segura:** snippet `vps/nginx/snippets/ape-gpu-loopbreak.conf` con el `map`, sin incluirlo en la config viva. No toca `autopista-trap.conf` ni el vhost público.

### B. Watchdog/self-heal (concepto)

`ape_gpu_worker_v3.py:219-241,322-334` tiene watchdog de estancamiento, reinicio de ffmpeg y limpieza. El **concepto** es bueno para un futuro worker; el código no se puede copiar tal cual:
- `cleanup_orphans` hace `pkill -9 -f hevc_nvenc` (`:325`), que mata **todos** los NVENC del host, no solo los hijos del worker.
- No hay validación de `ck`; `os.path.join(ROOT, ck, fn)` (`:283`) permite path traversal si `ck` llega como `..`.
- El worker escucha `0.0.0.0:17326` (`:350`) sin auth; el runbook además mapea 17326 (`:45`), exponiéndolo.

**Adaptación segura:** si se porta, debe escuchar `127.0.0.1`, validar `ck` como `[a-f0-9]{16}`, usar `basename`, matar solo sus `Popen`, y montar un test de path traversal antes de activar.

---

## 3. Qué NO se puede portar tal cual

| Bloqueo | Evidencia | Por qué |
|---|---|---|
| Migración de dominio a Vast | `MIGRATION_RUNBOOK.md:19,31,126` | No hay instancia, no hay 443 externo garantizado, es spot, y el bundle no está testeado. |
| `PROVISION.sh` | `:24` apt, `:28` rsync desde Hetzner, `:51-52` systemd/nohup, `:67` email hardcodeado, `:74-75` borra `sites-enabled/default` y recarga | Cambios destructivos en host nuevo; no es un parche del repo; no hay rollback probado. |
| `nginx-domain.conf` | `:68` `php8.1-fpm.sock`; `:37,39` `proxy_pass` en `if`; `:58-63` proveedor sin `proxy_ssl_server_name` | El VPS actual usa PHP 8.3; el `if` y el SNI deben probarse; un fallo tira el dominio. |
| Worker 4K NVENC | `:100` `scale_cuda=3840:2160` siempre; `:101` `hevc_nvenc`; `:43` `MAX_CHANNELS=2` | Exige GPU/NVENC real y transcode; el VPS actual no transporta vídeo. Añade CPU/GPU y un punto de fallo nuevo. |
| `INDEPENDENT-SEGMENTS` | `:106` `-hls_flags ... independent_segments`; `:305` master lo declara | Ya corregido en I07: no se declara sin prueba de GOP. No se debe reintroducir. |
| Playlist warming | `:267` `#EXT-X-MEDIA-SEQUENCE:0` sin PDT | Contradice I03/I04; el player puede reiniciar secuencia. |
| Prewarm | `:37-45` comenta que prewarm 4K Main10 causa freezes en una GPU | El propio autor lo desactiva; no activarlo. |
| `pkill` global | `:325` | Puede matar encoders de otros procesos/tenants. |
| Path traversal | `:257-258,283` `ck` sin validar | Riesgo de lectura fuera de `ROOT` si se expone. |

---

## 4. Matriz de opciones

| Opción | Nivel | Reutiliza | Reversibilidad | Riesgo | Alineación | Coste | Decisión |
|---|---|---:|---:|---:|---:|---:|---|
| O1 mantener el bundle como referencia; no tocar producción | N0 | runbook/worker como documentación | 5 | 0 | 5 | 1 | **ELEGIDA ahora** |
| O2 extraer solo loop-break + watchdog a `vps/gpu-transcode/` staging, sin include vivo | N2 | `nginx-domain.conf:6,34-39` + worker `:219-241` | 4 | 1 | 4 | 3 | **siguiente, tras APLICA y test** |
| O3 migración completa a Vast | N4 | todo el bundle | 1 | 5 | 2 | 5 | **NO-GO** hasta instancia/443/E2E |

**Criterio:** O1 no puede romper nada. O2 es el máximo valor seguro, pero requiere un test de path traversal, bind 127.0.0.1, auth y `nginx -t` en staging. O3 no cumple "sin regresiones" porque no hay host, ni rollback probado, ni E2E.

---

## 5. Plan de adaptación seguro (si se autoriza O2)

1. Copiar **solo** el `map` y el bloque `/shield/` a un snippet staging; no incluir en `sites-enabled`.
2. Worker staging en `vps/gpu-transcode/`:
   - bind `127.0.0.1`;
   - `ck` validado `^[a-f0-9]{16}$`;
   - `fn = basename`;
   - `cleanup_orphans` mata solo PIDs hijos, nunca `pkill -f`;
   - `INDEPENDENT-SEGMENTS` solo si el encode lo garantiza;
   - `MEDIA-SEQUENCE`/PDT desde el contrato, no `0`.
3. Verificar: `python -m py_compile`, test de path traversal, `nginx -t` con wrapper staging, y E2E local con un fixture.
4. No cambiar DNS, no borrar `sites-enabled/default`, no tocar Hetzner.

**No se implementó O2 en esta revisión**; solo se documenta para no introducir un worker GPU no probado en el repo activo.
