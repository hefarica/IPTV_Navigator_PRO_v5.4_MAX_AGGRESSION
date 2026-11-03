# Alineación de la cadena completa — EXCEL >> LAB >> APP >> LISTAS >> VPS >> ARA

**Fecha:** 2026-11-03
**Deploy:** run `41642740119` **success** · deploy + verify aplicados · rollback no necesario
**Rama:** `feat/adb-generic-visual-enhancement-installer` · PRs #14 #15 #16 #17 mergeados a master

---

## 1 · Auditoría eslabón por eslabón

| Eslabón | Medición | Estado |
|---|---|---|
| **1 · EXCEL → LAB** | `omega_v1_bulletproof_20261026` · P0-P5 · P4 = 587 fields · `dnr_calibration` y `prisma_lab_sync_v20` presentes | **alineado** |
| **2 · LAB → APP** | 15 familias SSOT · **0 sin fuente** · 26 homólogos · **0 con valor propio escrito en código** | **alineado** |
| **3 · APP → LISTAS** | 1.939 líneas generadas · CA11 PASS · cadena escala **3840×2160 @ 120 fps** | **alineado** |
| **4 · LISTAS → VPS** | 200 sin-gzip = **604.593.696 B** · 206 = **1.024 B** · CDN 200 | **alineado** |
| **5 · VPS → ARA** | sync smoke **7/7 OK** · HMAC completo (401/200/413/429) | **alineado** |

---

## 2 · Lo que hubo que arreglar para que el deploy corriera

Cuatro defectos, ninguno del código de negocio. Los cuatro bloqueaban el pipeline.

### 2.1 · `deploy-vps.yml` apuntaba a un directorio que nginx no sirve

`LISTS_DIR: /var/www/lists` cuando nginx sirve `/var/www/html`. El propio fichero lo admitía en un
comentario: *«mientras /var/www/html/lists no existía pese a servirse en producción»*.

**Es la misma clase de defecto que costó horas hoy** con `sites-available` vs `sites-enabled`. Corregido a
`/var/www/html/lists`.

### 2.2 · El árbol `_vps_stage` no estaba en master

`workflow_dispatch` ejecuta desde la rama por defecto. El pipeline orquesta inventory → preflight → dry-run →
validate → deploy → verify → rollback desde scripts dentro de `_vps_stage/`. Sin ese árbol en master el
dry-run moría en `chmod` y en el módulo de paridad.

**Y el fallo lo causé yo**: al inicio de la sesión añadí `_vps_stage/` al `.gitignore` mientras limpiaba
ruido. 493 ficheros, 6,6 MB. Restaurado y llevado a master.

### 2.3 · Seis fuentes del manifiesto faltaban en master

La aserción de paridad compara cada fuente del manifiesto contra el repo. Faltaban seis, y eran
precisamente **el eslabón ARA**: `ara-sync.php`, tres `ara-sync*.conf`, `ara_x_sync.lua` y
`ape-lab-library.php`.

**La aserción funcionaba**: se negaba a desplegar un manifiesto cuyas fuentes no estaban todas.

### 2.4 · El smoke del deploy fallaba en una lista retirada

```
FAIL /lists/APE_LISTA_4K.m3u8: HTTP 404 (esperado 200)
RESUMEN SYNC SMOKE: 4/5 OK · 1 FAIL
```

`APE_LISTA_4K.m3u8` fue retirada. `verify.sh` ya lo tenía documentado en su cabecera —*«su 404 hacía fallar
este job SIEMPRE, bloqueando cualquier deploy»*— pero `sync-smoke.js` no se había corregido.

**Corregido sin fijar otro nombre a mano**: `APE_SMOKE_LIST` con la lista viva principal por defecto.

**Y el rollback se negó a actuar**: *«NO se revierte a ciegas: falta el stamp de esta corrida»*. Eso es el
fail-safe funcionando, no un defecto.

---

## 3 · Estado tras el deploy

### Listas

| Consulta | Resultado |
|---|---|
| 200 sin `Accept-Encoding` | **604.593.696 B** |
| 206 con `Range: bytes=0-1023` | **1.024 B** |
| CDN | **200** |

### ARA

| Endpoint | Código | Qué significa |
|---|---:|---|
| `/ara/events` | **401** | exige token — correcto |
| `/ara/enroll` | **403** | enroll deshabilitado — correcto |
| `/prisma/api/ara-sync.php` | **405** | exige POST, no GET — correcto |
| `/prisma/api/ape-lab-library.php` | **400** | exige parámetros — correcto |

### Sync smoke completo

```
ok  401 sin HMAC: HTTP 401 (esperado 401)
ok  401 key desconocida: HTTP 401 (esperado 401)
ok  413 body >16 KB: HTTP 413 (esperado 413)
ok  200 HMAC válido: HTTP 200 (esperado 200)
ok  200 firma de respuesta: HTTP 200 (esperado 200)
ok  429 rate-limit: HTTP 429 (esperado 429)
ok  /lists/APE_LISTA_1793589060441.m3u8: HTTP 200 (esperado 200)
RESUMEN SYNC SMOKE: 7/7 OK · 0 FAIL
```

### Paridad repo ↔ VPS

```
PARIDAD-OK  /var/www/html/prisma/api/ape-field-homologator.js
PARIDAD-OK  /var/www/html/prisma/api/list-activate.php
SMOKE OK (todos 200 con #EXTM3U)
```

---

## 4 · Commits de la sesión

| Commit | Qué |
|---|---|
| `9ae446a4` | 21 modificados + 3 borrados de sesiones previas; ruido de sesión a `.gitignore` |
| `d0f8ac29` | 206 ficheros: ARA, VPS, docs edge, scripts, tools |
| `4cba30a0` | binarios de test y `app-dist` fuera del árbol |
| `b37bc2e3` | directorios de trabajo de sesión ignorados |
| `8fc0f898` | árbol `_vps_stage` restaurado (yo lo había roto) |
| `a3aff73c` | `deploy-vps` a la ruta que nginx sirve |
| `602411c9` | smoke del deploy sin la lista retirada |

**Y en master, vía PR:** #14 (ruta), #15 (`_vps_stage`), #16 (eslabón ARA), #17 (smoke).

---

## 5 · Lo que NO está verificado

- **El generador no se despliega por este manifiesto.** El pipeline lleva `ape-field-homologator.js` y los
  endpoints, no `m3u8-typed-arrays-ultimate.js`. **Mis cambios de las cadenas de filtros son de la APP
  (navegador), y llegan al usuario cuando se sirve el frontend — no por este deploy.**
- **No verifiqué que el frontend servido en `/var/www/html` tenga la versión con las cadenas corregidas.**
  Eso requiere un deploy del frontend, que este pipeline no hace.
- **No hay medición de calidad de imagen.** El deploy es transporte y endpoints; nada aquí dice que la
  imagen mejore.
- **`APE_LISTA_4K.m3u8` sigue devolviendo 404** y hay ~20 scripts legacy que la referencian
  (`postdeploy_remote*.sh`, `state.sh`, `e9_invariants.sh`, `probe_vps.sh`…). **El smoke del pipeline ya no
  la usa, pero esos scripts sí.** No los toqué.

---

# ADENDA — el frontend ya está desplegado (cierre del último hueco)

**Ronda 2.** El documento anterior declaraba un hueco: *«este pipeline no despliega el generador»*. Cerrado.

## El hallazgo

El VPS servía **840.087 bytes** del generador con `pp=ac/dr/ci` ×3, `scd=5` ×6 y `zscale=bt1886` ×5.
El repo tenía **827.257 bytes** ya corregidos. **Las mejoras no estaban en producción.**

**Causa estructural:** `deploy-vps.yml` manifiesta endpoints y la capa Lua/PHP. Su manifiesto **no incluye**
`m3u8-typed-arrays-ultimate.js`, que es frontend de navegador servido desde `/var/www/html`.

## El deploy, y las tres trampas que hubo que resolver

Workflow nuevo: `ape-deploy-frontend.yml`. Run **`41644272400` success**.

| Trampa | Síntoma | Corrección |
|---|---|---|
| **1 · Aserción sobre comentarios** | el deploy se negaba: «el repo aún tiene `pp=ac/dr/ci`» — pero las 2 ocurrencias eran **comentarios que explican el defecto** | contar solo líneas de código, no comentarios |
| **2 · El `.js` no es lo que se sirve** | tras instalar con sha coincidente, la URL seguía dando 840.087 B | **regenerar el `.gz` hermano** (`gzip_static` manda) |
| **3 · Verificar solo el tamaño** | un sha coincidente no dice qué contiene el fichero | descargar la URL y **comprobar contenido**, no bytes |

**La trampa 2 es la misma que dejó la lista en 8 bytes:** lo que el servidor manda no es lo que se instala.

## Verificación final, independiente

```
generador servido : 827.257 B
sha servido       : f5c387338c34871ea099763218d4f736f4cbe28068b8688d62c7a17c13c9ea74
sha local         : f5c387338c34871ea099763218d4f736f4cbe28068b8688d62c7a17c13c9ea74   ← iguales

colorspace=iall=bt709            OK x1
strength=0.51                    OK x5
scale=w=3840:h=2160:flags=lanczos OK x5

pp=ac/dr/ci        AUSENTE (bien)
:scd=5             AUSENTE (bien)
zscale=transfer=bt1886  AUSENTE (bien)

200 lista principal : http=200 bytes=604593696
206 rango           : http=206 bytes=1024
/ara-sync.php       : http=405 (exige POST, correcto)
```

## Estado de la cadena, completo

| Eslabón | Producción | Estado |
|---|---|---|
| **EXCEL → LAB** | `omega_v1_bulletproof_20261026` · P4=587 fields | alineado |
| **LAB → APP** | 15 familias · 0 sin fuente · 0 hardcodeo | alineado |
| **APP → LISTAS** | 1.939 líneas · CA11 PASS · escala 4K@120 | alineado |
| **LISTAS → VPS** | 200 = 604.593.696 B · 206 = 1.024 B | alineado |
| **VPS → ARA** | sync smoke 7/7 · HMAC completo | alineado |
| **APP → FRONTEND servido** | **sha idéntico al repo · correcciones presentes · defectos ausentes** | **alineado** |

## Commits de esta ronda

`e88bfe87` (workflow) · `f23aa548` (comentarios) · `4e0e699f` (gz)
**Master:** PRs #18 #19 #20.

## Lo que sigue sin verificarse

- **Ningún reproductor abrió la lista generada.** Que el generador servido tenga las cadenas corregidas no
  prueba que VLC las aplique: le faltan 3/4 a 5/6 de los módulos.
- **No hay medición de calidad.** Sin VMAF, sin SSIM, sin A/B. Escalar un grafo no es mejorar una imagen.
- **~20 scripts legacy siguen citando `APE_LISTA_4K.m3u8`** (404). El smoke del pipeline ya no la usa.
