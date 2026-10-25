# Alineación LAB → APP → LISTA → VPS (DNA 22.6.0-CRYSTAL-4K-UHD)

> Verificado **2026-10-24**. DNA desplegada en el VPS:
> `/var/www/html/prisma/config/lab_master_22.6.0.json` (280 065 B, sha256 `099a1707…`).
> El Excel es `APE_M3U8_LAB_v8_FIXED.xlsm` (55 hojas).

## 1. La cadena, ya cerrada de punta a punta

```
APE_M3U8_LAB_v8_FIXED.xlsm  (55 hojas; 15_FLOOR_LOCK_CONFIG, 6_NIVEL_2_PROFILES, 8_CODEC_LADDER…)
        │  macro exportPrismaConfig
        ▼
LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json   ← DNA (18 claves, 2886 directivas)
        │  desplegada en el VPS
        ▼
/var/www/html/prisma/config/lab_master_22.6.0.json
        │  ape_lab_bridge.lua  (lee, normaliza, cachea 60 s)
        ▼
plano Lua del borde (gateway /cdn/, /_ape/lab)  →  lista .m3u8 con metadata
        ▼
player / TV  (decodifica el bitstream real y el panel escala)
```

Antes de hoy el eslabón **DNA → plano Lua** no existía: los JSON del LAB se desplegaban para la
lane PHP/Prisma, pero el borde Lua no los leía. Ahora sí (`ape_lab_bridge.lua` v2) y los publica en
`/_ape/lab` (loopback).

## 2. Lo que dice la DNA (perfil por perfil)

| Perfil | Nombre | `resolution` | `codec_full` | floor | target | fps | HDR |
|---|---|---|---|---:|---:|---:|---|
| P0 | 8K Master | **7680x4320** | `dvh1.08.06` | 15 Mbps | 60 | 120 | HDR10 (+DV P8) |
| P1 | 4K UHD | **7680x4320** | `hvc1.2.4.L153.B0` | 12 Mbps | 22 | 120 | HDR10+ |
| P2 | 2K QHD | **3840x2160** | `hvc1.2.4.L150.B0` | 8 Mbps | 12 | 120 | HDR10 |
| P3 | FHD 1080p | **3840x2160** | `hvc1.1.6.L120.B0` | 5 Mbps | 9 | 120 | SDR |
| P4 | HD 720p | **3840x2160** | `avc1.64001f` | 3 Mbps | 6,5 | 120 | SDR |
| P5 | SD 480p | **3840x2160** | `avc1.42c01e` | 1,5 Mbps | 4 | 120 | SDR |

**Esto confirma la regla del propietario**: la DNA ya declara **4K para P2–P5** (sin importar la
fuente) y **8K para P0/P1**. El plano implementado (`uhd_auto`) hace exactamente eso:

| Fuente (resolución real de la variante top) | Plano emite | Coincide con DNA |
|---|---|---|
| < 3840 | `RESOLUTION=3840x2160` | P2–P5 ✔ |
| ≥ 3840 | `RESOLUTION=7680x4320` | P0–P1 ✔ |

Y `CODECS` **no se toca** en ningún caso: la DNA ya trae el códec real por perfil
(`dvh1`/`hvc1.2.4.L153`/`avc1.64…`) y ese es el que el decoder debe ver.

## 3. Otras coincidencias verificadas

| Parámetro DNA | Valor | Plano/implementación | Estado |
|---|---|---|---|
| `video_range` P0–P2 | `PQ` (ST 2084, TC=16, BT.2020, matrix 9) | doctrina PQ incondicional + flag `uhd_pq` (off por defecto por color-shift) | ⚠️ decisión |
| `video_range` P3–P5 | `SDR` | el plano **no** añade PQ a SDR | ✔ alineado |
| `floor_lock_enabled` | `true` | `/ape/lab` lo publica; `bw_adaptive_floor` lo usa | ✔ |
| `floor_lock_passthrough_when_unreachable` | `true` | autopista: nunca bloquea | ✔ |
| `prisma_fake_4k_upscaler_enabled` | **`false`** | el plano **no** aplica motor de fake-4K; solo declaración de resolución | ✔ |
| `fps` 120 (todas) | tag de vendor | `FRAME-RATE` estándar capado a 60 (D1) | ✔ |
| `codec_ladder_per_profile` (L183/L153/L150…) | cascada | el plano **no** reescribe códecs | ✔ |
| `tcp_initcwnd_target`, `tcp_notsent_lowat` | 400 / 131072 | publicados en `/ape/lab`; aplicados a nivel kernel es tarea aparte | ⚠️ |

## 4. DRIFT encontrado (importante): tres fuentes, dos fechas

| Valor | DNA 22.6.0 (2026-05-23) | Repo `vps/prisma/config/` (2026-05-19) | Desplegado en VPS (2026-05-19) |
|---|---:|---:|---:|
| `floor P0` | **15 000 000** | 18 000 000 | 18 000 000 |
| `floor P1` | **12 000 000** | 14 000 000 | 14 000 000 |
| `tcp_initcwnd_target` | 400 | 400 | **64** |
| `tcp_notsent_lowat` | 131072 | 131072 | 131072 |

Y dentro de la propia DNA hay dos tablas con números distintos:
`profiles_calibrated[P].settings.bandwidth_floor` (15/12/8/5/3/1,5 Mbps) vs
`prisma_lab_sync_v20.feature_sheets.15_FLOOR_LOCK_CONFIG` (p0=p1=p2=15 Mbps).

**El puente reporta el drift** en `/_ape/lab` (`drift[]`) y usa la tabla de `profiles_calibrated`
porque es la calibración específica de perfil. Decisión pendiente del propietario: qué tabla manda
y si se re-exporta el `floor_lock_config.json` para que el VPS y el repo queden idénticos a la DNA.

## 5. Compatibilidad: por qué esto no rompe reproducción

| Prueba | Resultado |
|---|---|
| `luatest` (LuaJIT real, incluye 11 asserts del puente LAB) | **68 asserts · 0 fallos** |
| `smoke.sh` (13 bloques: rebase, locks, sentinel, wake, failover, LL-HLS, QoE, 4K, 8K) | **OK** |
| 443 público (PHP + health legacy) | `200 / 200 / 503` idéntico |
| Video por el plano | `.ts/.m4s/.mp4/.aac` → **404** |

Razón de fondo: el plano **no cambia el bitstream**. Reescribe resolución declarada y URIs; el códec,
el perfil y el nivel se copian del proveedor. Por eso el decoder recibe lo que puede decodificar.

## 6. Acciones que faltan (para "alinear absolutamente todo")

1. **Unificar floors**: re-exportar `floor_lock_config.json` desde la DNA (o declarar la tabla
   `feature_sheets` como autoridad) y desplegarlo. Hoy el VPS tiene los valores viejos.
2. **`tcp_initcwnd_target`**: el VPS tiene 64, repo/DNA 400. Es un parámetro de kernel
   (`ip route change … initcwnd`); aplicarlo requiere tocar red del VPS (autorización aparte).
3. **PQ**: la DNA lo exige en P0–P2. Poner `uhd_pq=1` alinea con la DNA, pero un player sin daemon
   puede tener color-shift en SDR. Decisión del propietario por perfil.
4. **Sync repo ↔ VPS**: llevar el `floor_lock_config.json` del repo al VPS (o al revés) para que no
   haya dos números.
5. **La APP**: el generador debe emitir `/cdn/<host>/…` apuntando al plano (hoy emite URLs directas);
   ese es el cambio que hace que la lista "pase por el VPS" de forma efectiva.

## 7. Evidencia reproducible

```bash
# lo que el plano lee de la DNA
curl -s http://127.0.0.1:8088/_ape/lab | python3 -m json.tool

# contrato completo
bash /root/ape-meta-plane-20261024/scripts/smoke.sh http://127.0.0.1:8088
```
