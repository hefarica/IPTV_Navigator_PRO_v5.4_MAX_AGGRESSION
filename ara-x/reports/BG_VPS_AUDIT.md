# BG3 · Auditoría VPS read-only del contrato de bandas

**Tarea:** `t40` · **Modo:** **SOLO LECTURA** · **Fecha UTC:** 2026-10-31T08:27–08:32Z
**Deploy:** **NO** · **Escrituras en el VPS:** **0** · **Cambios en repo:** sólo este informe.

Alcance: existencia/coherencia de `/etc/ara/bitrate-floor.json`, endpoint `bitrate-report.php` y su
dependencia `auth_sync.php`, y viabilidad de bloquear variantes `<floor` en el manifest real de CH1
sin spoof peligroso. No se ejecutó ningún canary, PHP ni reload de nginx.

---

## 1 · Resumen ejecutivo

| Pregunta | Resultado |
|---|---|
| ¿Existe `/etc/ara/bitrate-floor.json`? | **NO** (AUSENTE). Tampoco `bitrate_floor.json` ni `bandas.json`. |
| ¿Coincide con `by_source`/`upscale_demand` del usuario? | **NO EVALUABLE**: el contrato del usuario no está en el repo ni en el VPS (0 coincidencias). |
| ¿Existe `bitrate-report.php`? | **NO** en rutas candidatas; HTTPS `/ara/bitrate-report.php` → **404**. |
| ¿Existe `auth_sync.php`? | **NO**; HTTPS `/ara/auth_sync.php` → **404**. |
| ¿Existe el manifest real de CH1? | **NO**: no hay fichero CH1 en `/var/www`/`/etc/nginx`; `/crystal/CH1.m3u8` → **404**. |
| ¿Se pueden bloquear variantes `<floor` sin spoof? | **NO con lo desplegado**: el gateway sólo inyecta/relaja directivas de suelo (`adaptive-minbitrate` / `min_bandwidth`), **no elimina variantes**; `floor_lock_filter.lua` no está desplegado. |
| Veredicto | **NO-GO** para F1/F2/F3; no crear artefactos ni ejecutar filtrado. |

---

## 2 · Evidencia medida

### 2.1 Configuración de bandas

```
stat: cannot statx '/etc/ara/bitrate-floor.json': No such file or directory
AUSENTE /etc/ara/bitrate-floor.json
AUSENTE /etc/ara/bitrate_floor.json
AUSENTE /etc/ara/bandas.json
grep -RIl -E "by_source|upscale_demand|bitrate.floor|bitrate_floor" /etc/ara
SIN-COINCIDENCIAS
```

`/etc/ara` vivo contiene sólo lo de otras fases: `canary/`, `codec-caps.json`, `install.stamp`,
`profiles/`, `skills/`. No hay fichero de bandas.

**Observación lateral (no tocada):** `/etc/ara/profiles` está en modo **666** (world-writable,
root:root), 12 perfiles Crystal. No es el objeto de BG3, pero es un riesgo de integridad de config
a corregir en una tarea autorizada.

### 2.2 Endpoints de reporte y auth

```
AUSENTE /var/www/ara/bitrate-report.php
AUSENTE /var/www/html/ara/bitrate-report.php
AUSENTE /var/www/html/prisma/api/bitrate-report.php
AUSENTE /var/www/html/prisma/api/auth_sync.php
AUSENTE /var/www/html/prisma/lib/auth_sync.php
AUSENTE /var/www/ara/auth_sync.php
```

Pruebas HTTPS (sólo GET, sin credenciales):

| URL | HTTP |
|---|---|
| `https://iptv-ape.duckdns.org/ara/bitrate-report.php` | **404** |
| `https://iptv-ape.duckdns.org/ara/auth_sync.php` | **404** |

`nginx -T` no contiene rutas `bitrate`/`floor`; los `location /ara/*` existentes son
`/ara/install`, `/ara/agent.apk`, `/ara/version`, `/ara/events`, `/ara/enroll`.
No hay tabla/flujo de auth `auth_sync` desplegado.

### 2.3 CH1

- No existe `/var/www/crystal/CH1.m3u8` (ni `/var/www/html/crystal/CH1.m3u8`).
- `https://iptv-ape.duckdns.org/crystal/CH1.m3u8` → **404**.
- Únicas referencias a CH1 en el repo son documentación/self-skills
  (`ara-x/skills/self/S-18.md`, `S-27.md`) y `ara-x/vps/crystal/bench_final.md`, que dice
  literalmente: **“HLS CH1 no validado (runner sin metadata, fuente placeholder)”**.
- Por tanto **no hay manifest real de CH1** que auditar.

### 2.4 Config de floor existente (no es la del usuario)

`/var/www/html/prisma/config/floor_lock_config.json` existe, 1.741 B, `644 www-data:www-data`,
sha256 `b0e10bd0e39181bd12d896852080eff463a3df15cb5c051bbd9f86ebe6dab645` (2026-10-24).
Contiene:

- `floor_lock_min_bandwidth_p0..p5` = 15/12/8/5/3/1.5 Mbps + `default` 8 Mbps;
- `floor_lock_passthrough_when_unreachable=true`;
- `x_min_bitrate_upstream_header=15000000`, `x_max_bitrate_upstream_header=80000000`;
- **no** contiene `by_source` ni `upscale_demand`.

No es `/etc/ara/bitrate-floor.json` ni cumple el contrato del usuario. Es la config estática de la
DNA; no se modificó.

### 2.5 ¿Se pueden bloquear variantes `<floor`?

Lo desplegado:

- `/etc/nginx/lua/bw_adaptive_floor.lua` (9.075 B, `644 root:root`, sha256
  `b1a22492bef2ee4874e4f1b6179ccb5898095352b8965f2e4c3837883f77cedc`) implementa
  `adaptive_floor`/`escalation_floor` como funciones **puras**; su propio comentario dice que
  `combined_body_filter` las llamaría en un “paso cableado, GATEADO + aprobado”. No elimina
  variantes por sí solo.
- `/etc/nginx/lua/floor_lock_filter.lua` **NO existe**.
- `ape_gateway.lua` (23.797 B, sha256 `11b45f8f5293821b44baeb8f7c650000187b15949c8872316501fa5b74ea0954`)
  hace un fusible de suelo: inyecta `#EXTVLCOPT:adaptive-minbitrate=` y
  `#KODIPROP:inputstream.adaptive.min_bandwidth=` y luego los **relaja**; publica
  `X-APE-Floor-Fuse` y garantiza `fuse_bps <= design_bps`. **No reescribe ni filtra
  `EXT-X-STREAM-INF`/`BANDWIDTH`**, no borra variantes y no toca `CODECS/RESOLUTION/FRAME-RATE`.
- `floor_lock_config.json` se usa vía `ape_lab_bridge.floor_for()` para ese suelo de diseño;
  `passthrough_when_unreachable=true`.

**Conclusión:** bloquear variantes `<floor` en servidor exigiría un reescritor de master playlist
(eliminar `EXT-X-STREAM-INF`/variantes), que **no está desplegado**; hacerlo con spoof de
`BANDWIDTH`/headers o con el gateway actual sería peligroso (puede romper ABR, selección de
variante y continuidad). **No se ejecuta.**

---

## 3 · Recomendaciones (no ejecutadas)

1. **F1:** definir el contrato `by_source`/`upscale_demand` en un fichero versionado y luego
   `/etc/ara/bitrate-floor.json` con dueño/modo estrictos (0600, fuera de webroot); no reutilizar
   `floor_lock_config.json` como sustituto silencioso.
2. **F2:** crear `bitrate-report.php` + `auth_sync.php` en una tarea autorizada, con auth de
   dispositivo, sin exponer `/ara` ni `/sync`, y con tests; hoy **NO-GO**.
3. **F3/CH1:** obtener un manifest real de **un** canal con evidencia (`ffprobe`/variantes) antes de
   prometer bloqueo; no hay CH1 desplegado.
4. **Filtrado de variantes:** si se autoriza, hacerlo con un body filter declarativo y allowlist,
   conservando al menos la variante máxima (MAX IMAGE FIRST / NO CHANNEL LOSS) y sin spoof; probar
   ABR y rollback. No ejecutar sobre `/lists/` ni el catálogo global.
5. Corregir el modo 666 de `/etc/ara/profiles` en la tarea de config que corresponda.

---

## 4 · Límites de esta auditoría

- **Read-only**: `stat`, `ls`, `grep`, `nginx -T`, `curl -sk` GET; 0 escrituras, 0 reload, 0 deploy.
- No se ejecutó PHP (`php -l`/endpoint) ni se inspeccionó el contenido de `auth_sync` porque **no
  existe**.
- El contrato del usuario (`by_source`/`upscale_demand`) no está disponible en repo/VPS; no se pudo
  comparar campo a campo.
- CH1 no está desplegado; no se puede afirmar nada sobre sus variantes ni sobre un bloqueo real.
- No se tocó `/lists/`, `/sync`, `/ara`, auth, canary, nginx ni el catálogo de 10.631 canales.

## 5 · Comandos representativos

```bash
ssh hetzner-iptv 'stat /etc/ara/bitrate-floor.json'                 # AUSENTE
ssh hetzner-iptv 'for p in /var/www/.../bitrate-report.php ...; do stat "$p"; done'
ssh hetzner-iptv 'curl -sk -o /dev/null -w "%{http_code}" https://iptv-ape.duckdns.org/ara/bitrate-report.php'  # 404
ssh hetzner-iptv 'find /var/www /etc/nginx -iname "*CH1*"'          # sin CH1
ssh hetzner-iptv 'nginx -T | grep -nE "location .*ara|bitrate|floor"'  # sin ruta de bandas
```
