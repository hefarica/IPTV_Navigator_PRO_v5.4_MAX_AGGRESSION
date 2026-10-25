# META-PLANE v3 — Multi-CDN · LL-HLS · QoE (y los límites de DRM/SSAI/8K)

> Desplegado y verificado en producción **2026-10-24 16:15 UTC**.
> Backup: `/root/ape-meta-plane-backup-20261024T155041Z/` · Bundle `/root/ape-meta-plane-20261024/`.
> Alineado con la auditoría `audit_teams_REA/` (D1, D2, D3, C4, C5, C7, `01_OWNER_RULE_LADDER_4K`).

## 1. Lo implementado (y probado en el VPS)

| Bloque | Estado | Evidencia |
|---|---|---|
| **Multi-CDN + failover** | ✅ real | `[10] status=200 cdn=127.0.0.1:8088 failover=true` |
| **LL-HLS servido** | ✅ (con límite físico) | `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,CAN-SKIP-UNTIL=9.000,PART-HOLD-BACK=1.500` + partes preservadas |
| **Telemetría QoE** | ✅ Lua nativa (sin PHP) | `/_ape/qoe` y `/_ape/health` con `req=4, failovers=2, rebase_ok=4, llhls_sc=2, bytes=1812, last_ms=1` |
| **Health 24/7** | ✅ endpoint real | `health.checks: nginx/shared_dicts/upstreams_down/error_ratio` |
| **Acceso firmado (HMAC)** | ✅ implementado, flag OFF | `auth` + `auth_secret` en `ape_flags`; 403 JSON si falta `sig`/`exp` |

### 1.1 Multi-CDN + failover
`GET /cdn/<host>[:puerto]/<ruta>.m3u8?alt=host2,host3`
- Intenta principal + `alt` en orden; el que responde 2xx/3xx gana.
- Host caído → castigo 15 s en `ape_hosts` (circuit-breaker suave, sin bloquear).
- Cabeceras: `X-APE-CDN`, `X-APE-Failover`, `X-APE-Upstream-Ms`.
- **Bug real depurado**: `set $ape_target ""` en el location interno **sobrescribía** la variable
  que pasa `ngx.location.capture` (el `set` corre en rewrite). Y nginx **no des-escapa** `$arg_*`
  en `proxy_pass` (`127.0.0.1%3a8089%2f... → could not be resolved`). Solución: `$arg_h/$arg_p/$arg_qs`
  crudos + validación estricta de charset en Lua.

### 1.2 LL-HLS
- Se preservan `#EXT-X-PART`, `#EXT-X-PART-INF`, `#EXT-X-PRELOAD-HINT` (el rebase los trata bien).
- Si la fuente **ya** trae partes, se inyecta `#EXT-X-SERVER-CONTROL` con
  `PART-HOLD-BACK = 3×PART-TARGET` (RFC 8216 §4.4.3.8) y `CAN-SKIP-UNTIL = 6×hold`.
- **Límite físico honesto**: no se inventan partes. Producir LL-HLS desde HLS clásico exige
  empaquetar en tiempo real (ffmpeg) y en este VPS (3 vCPU, 3,8 GB, sin GPU) es imposible sin
  romper la reproducción. Para fuentes clásicas, el edge **no** puede bajar la latencia.

### 1.3 QoE
`GET /_ape/qoe` → contadores del plano y hosts castigados. `GET /_ape/health` → estado + ratio de error.
Honestidad: son métricas **del plano de metadata** (playlist, upstream, failover). Rebuffer real del
player solo lo puede medir el player (Conviva/hls.js) o un observador de segmentos — que este VPS no
sirve porque **no** lleva video.

## 2. Por qué NO se implementó DRM multi-CDM ni SSAI

No es pereza ni falta de búsqueda: es imposible **sin** cambiar la naturaleza del sistema.

| Requisito DRM real | Estado aquí |
|---|---|
| Licencia Widevine / FairPlay / PlayReady | **No existe** (requiere contrato con Google/Apple/Microsoft) |
| License server + key server (KMS) | No desplegado; requiere infraestructura y secretos |
| Empaquetado cifrado (CENC/PSSH) | Exigiría re-empaquetar **en tiempo real** los bytes del proveedor |
| CDM en el player | El player ya trae el suyo; pero solo descifra **su** DRM, no uno nuestro |

Y hay un problema técnico decisivo: **los bytes son del proveedor**. Re-cifrarlos obliga a
decode+encode en el VPS (imposible en 3 vCPU) y **rompería la reproducción en todos los players**
que hoy funcionan, violando el invariante "0 freeze" de la doctrina.

**SSAI** (inserción de anuncios server-side): requiere ad server, inventario y decisión de campaña.
Inyectar cortes añade latencia y stitcheo → incompatible con "sin cortes ni lags".

**Lo que sí se implementó (legítimo y funcional):**
- **Control de acceso firmado** en el gateway (`auth`): `sig = HMAC-SHA1(secret, path:exp)`, `exp` epoch.
  Protege las listas sin tocar los bytes ni el player. Es el sustituto honesto de "DRM" para contenido propio.
- **Carril SSAI**: `#EXT-X-DATERANGE` y `URI="..."` se rebasan correctamente, así que si algún día hay
  marcadores de intersticial pasan íntegros. **No se inyecta ningún anuncio.**

## 3. Por qué NO se emitió "8K fake"

La propia auditoría lo prohíbe, con la firma del propietario:

- `01_OWNER_RULE_LADDER_4K.md` §2.3: *"La variante 4K debe ser REAL… Prohibido `RESOLUTION=3840x2160`
  sobre bytes 1920x1080"*.
- §5: *"Proveedor sirve 1080p → producir un 4K es upscale (caro e inútil en detalle). Aquí NO se
  fabrica 4K: se sirve 1080p honesto y el display escala."*
- `05_CODEC_TRUTH_CORRECTIONS.md` C7: Ley Cardinal 1 — `L153` es el techo 4K; `BANDWIDTH=384 Mbps` con
  L153 es imposible (L5.1 High = 160 Mbps).
- Freeze documentado del **2026-06-08** al declarar 8K@120.
- `D1`: el tag de vendor `#EXT-X-APE-FRAME-RATE:120` es inerte (RFC 8216 §6.3.1) pero el atributo
  estándar `FRAME-RATE=` **debe ser real y ≤ 60**. Nunca copiar 120.

**Lo que sí se implementó:** `#EXT-X-APE-PRESENTATION-TARGET:<target>,FRAME-RATE=<fps>,HONEST=1`
— tag de vendor inerte que **no** toca `RESOLUTION` ni `CODECS`, con fps capado a 60. Es cosmético
para los players; el realce real lo hace el VPS **no** (no hay transcode) sino el **VPP del dispositivo**
(AI-SR/AI-PQ) o un nodo GPU, según `docs/VPS_UPSCALE_4K_DESIGN.md`.

## 4. Alineación con la auditoría (checklist)

| Regla | Cómo se cumple |
|---|---|
| D1 FRAME-RATE ≤ 60 en atributo estándar | el hint capa a 60 (`math.min(fps,60)`) |
| D2 P_MAX principal / P_SAFE alterno | el plano no reordena perfiles; el gateway solo rebasa |
| D3 HDCP por tier | el plano **no** emite HDCP-LEVEL (no toca esa decisión) |
| C5 `CHINA_BOX_FAKE_4K=true` desactiva LEVER B | el gateway **no** aplica virtual_4K; flag `hint` OFF por defecto |
| C7 Ley Cardinal 1 | cero declaraciones de nivel/resolución nuevas |
| 01_OWNER §2.3 | no se declara 4K sobre bytes 1080p |
| Anti-509 / 1 URL por canal | el plano no añade URLs al catálogo |

## 5. Estado operativo

- Todo corre en **:8088**, **cerrado desde internet** (000). El 443 público quedó **idéntico**
  (200/200/503 verificado tras el despliegue).
- Rollback: `bash /root/ape-meta-plane-20261024/scripts/rollback.sh`
- Tests: `scripts/validate-offline.sh` (aislado :8089) y `scripts/smoke.sh` (12 bloques, **OK** en
  producción).

## 6. Para 24/7 real (siguiente paso, no hecho)

El endpoint `/_ape/health` existe; falta el vigilante: unidad `systemd` con `WatchdogSec`,
`Restart=on-failure`, y un chequeo externo cada 60 s contra `/_ape/health`. Eso convierte
"disponible" en "auto-reparable". No se instaló para no tocar systemd sin autorización explícita.
