# FASE 0/1 · Skills gate + canary 4K de UN canal — reporte (t36)

**Estado:** FASE 0 y FASE 1 **desplegadas y verificadas** en el VPS, canary **aislado** y
**rollback limpio**. Sin tocar `/sync`, `/ara`, `/lists/` ni el catálogo de 10.631 canales.
No se declara producción: el VPS sigue metadata-only; este canary es un experimento con límites.

## 1 · Run de GitHub Actions

| Dato | Valor |
|---|---|
| Run | **41180586351** · `success` |
| URL | https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/actions/runs/41180586351 |
| Head | `d8c7840` (`feat/adb-generic-visual-enhancement-installer`) |
| Job | `3c · FASE0/1 skills + canary 4K` (Environment `production`, aprobado) |
| Install stamp | **`20261031T072734Z`** |
| Backup | `/var/backups/ape-canary/20261031T072734Z/` |
| Evidencia | artefacto `fase01-canary-evidence` (install/gate/start/evidence/cpu/rollback/isolation) |

El run anterior **41180193935** midió `cpu_pct_avg=40.02` y **falló el gate** de CPU (no se
declaró PASS); sirvió para corregir la medición a CPU-only del encoder. No se oculta.

## 2 · FASE 0 · skills y gate

- Instalado `/etc/ara/skills/{SKILLS.md,skills.json,corpus/*.md}` (4 skills, hashes en
  `skills.json`) y `/usr/local/bin/ara-skill`.
- `ara-skill check` y `ara-skill check --for-canary` → **ARA-SKILL CHECK PASS**.
- Gate real: `ape-canary@.service` tiene
  `ExecStartPre=/usr/local/bin/ara-skill check --for-canary`; `ape-canaryctl start` repite el
  gate antes de arrancar. Sin skills/ffmpeg/libx265 el servicio no arranca.
- Corpus: `vps-visual-emulate.md`, `canary-isolation.md`, `s905x4-limits.md`.

## 3 · FASE 1 · canary de UN canal

| Campo | Valor |
|---|---|
| Session | `canary-41180586351` |
| Entrada | **un** canal, primera URL de `APE_LISTA_1793397700248_CDN.m3u8.gz` (URL no publicada) |
| Cadena | `deblock → dering(smartblur) → yuv444p → Lanczos(3840x2160) → grain(noise) → unsharp → eq → yuv420p` |
| Encoder | `libx265`, `-preset ultrafast -tune zerolatency`, `pools=1:frame-threads=1` |
| HLS | `hls_time 3`, `hls_list_size 20`, `independent_segments+delete_segments` |
| Muestreo | **5 fps**, 6 s (30 frames) — muestra, **no** vivo 25/30 fps |
| Salida | `/var/lib/ara/canary/canary-41180586351/` (retirada por rollback) |

### ffprobe (evidencia)

```
width=3840
height=2160
r_frame_rate=5/1
```

**Segmento canary = 3840x2160 real** (dos lecturas del `out1.ts`).

### CPU / memoria

- `CPUQuota=40%` (systemd), `MemoryMax=1G`, `RuntimeMaxSec=300`, `TimeoutStopSec=30`,
  `User=www-data`, `NoNewPrivileges`, `ProtectSystem=strict`.
- Medición del encoder (cgroup, baseline tras el gate): **`cpu_pct_avg=39.09`** (<40 %).
- Wall 170 s; encode 30 frames en 164.1 s (**0.18 fps**): **no es realtime**; se declara.
- Memoria pico del servicio: 565.6 MB (dentro de 1G).

### Rollback

```
rollback: canal origen HTTP 200 (URL redacted)
rollback_clean=1 /lists untouched
```

`ape-canaryctl rollback canary-41180586351` detuvo el servicio, retiró env/salida y verificó
el manifest original con GET 200. No quedan unidades activas ni `ffmpeg` del canary.

## 4 · Aislamiento

- `/lists/` sin cambios: `APE_LISTA_4K.m3u8` sha256 `144659b4…`, CDN list `9f302b8b…`
  (idénticos antes/después; `isolation.diff` vacío).
- `/etc/nginx/snippets/*` y `ara-sync.php` sin cambios en el baseline before/after.
- No se tocó auth `/sync`/`/ara`, ni el catálogo global, ni playback.
- El canary sólo escribió `/etc/ara/**`, `/usr/local/bin`, `/etc/systemd/system/ape-canary@.service`
  y `/var/lib/ara/canary/<id>` (backup en `/var/backups/ape-canary/<stamp>`).

## 5 · Límites reales declarados

- **S905X4 sin NPU**: el pipeline AI-SR/AI-PQ es VPP del SoC; no se inventa NPU.
- **8K = presentación**: nunca se emite `7680x4320`; el canary no declara 8K.
- **ffmpeg 6.1 Ubuntu no tiene filtro `dering`**: se usa `smartblur` (edge-aware) como sustituto
  declarado; el orden lógico se mantiene. Si se exige `dering` literal, el canary debe FAIL.
- **No realtime**: 4K x265 a 40 % de CPU en este VPS da 0.18 fps; la muestra de 6 s tarda ~164 s.
  No se usa como prueba de producción ni de transcode en vivo.
- **Producción**: sigue metadata-only; no se modificó `/sync`, `/ara` auth, `/lists/` ni canales.

## 6 · Comandos de verificación

```bash
bash -n _vps_stage/canary/ape-visual-emulate.sh   # PASS
bash -n _vps_stage/canary/install.sh              # PASS
ssh hetzner-iptv 'ara-skill check'                # ARA-SKILL CHECK PASS
```
