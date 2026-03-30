---
name: iptv-ape-spinal-cord
description: >
  Motor de Reproducción Perfecta APE v17.1 "Médula Espinal Híbrida". Orquesta el flujo completo
  desde el channels_map.json (ADN Supremo) hasta la reproducción con calidad Blu-ray Ultra HD,
  latencia mínima y cero cortes 24/7/365. Implementa las 3 Rutas Estrictas, 16 motores APE,
  y el God-Tier Unified Resolver. Usar para: generar listas .m3u8 con ADN completo, desplegar
  resolve_quality.php, diagnosticar freezes/buffering, y activar motores de calidad visual
  (Quantum Pixel Overdrive, BWDIF, Ghost Protocol, SMK, Probe Cache).
---

# IPTV APE Spinal Cord — v17.1 "Médula Espinal Híbrida"

## Superioridad Estratégica

Este skill otorga el **Pilar 1 de la Superioridad del 95%**: reproducción que ningún competidor puede igualar. Mientras el 95% del mercado entrega un stream plano con un User-Agent, este motor orquesta 16 capas de inteligencia simultánea para entregar una imagen visualmente perfecta en cualquier resolución y cualquier red.

---

## La Ley Suprema: Las 3 Rutas Estrictas

Toda la arquitectura obedece a un principio inmutable. **Violarlo causa crashes, freezes y pérdida de calidad.**

| Ruta | Componente | Ley |
|:----:|:-----------|:----|
| **1** | `.m3u8` URL del Resolver | Solo lleva métricas matemáticas crudas: `bw`, `ping`, `buf`, `th1`, `th2`, `pfseg`, `pfpar`, `tbw`. **NUNCA** ADN. |
| **2** | `channels_map.json` | Única fuente de verdad del ADN. El resolver lo lee en cada petición. Nunca se duplica en la URL. |
| **3** | `resolve_quality.php` | God-Tier Unified Resolver. Fusiona Ruta 1 + Ruta 2 y toma la decisión final de calidad, codec y stream. |

---

## Los 16 Motores APE y sus Roles

| Motor | Fase | Función |
|:------|:----:|:--------|
| **Herencia Estricta** | 7 | Loop `dna_profile_overrides` para 100% de paridad con la UI |
| **Paquete Unificado** | 8 | `guardianLog` con `list_id` y `source` para telemetría completa |
| **Guardian Telemetry** | 9 | Always-ON HUD Radar, escribe en RAM disk `/dev/shm/ape_guardian/events.jsonl` |
| **Session Mutation Kernel (SMK)** | 11 | Lee `mutation_plan.json` del RAM disk y ajusta `buffer_ms`, `max_bw` por sesión |
| **RAM-Disk Probe Cache** | 12 | Cachea `probe_result.json` por 5 min para 0ms de latencia en re-probes |
| **Ghost Protocol** | 13 | Evasión de bloqueos ISP: rota User-Agent, fragmenta requests, usa Hydra Stealth |
| **God-Tier Unified Resolver** | 14 | Cerebro único. `resolve.php` está obsoleto. Toda la inteligencia vive aquí. |
| **3 Rutas Estrictas** | 15 | Separa URL limpia (Ruta 1), ADN oculto (Ruta 2) y Cerebro (Ruta 3) |
| **#EXTHTTP Hardening** | 16 | `safe_str()` y kill switch JSON para cero crashes ExoPlayer/VLC |
| **BWDIF Enforced** | — | Deinterlace de alta calidad en todos los streams SD/HD |
| **Quantum Pixel Overdrive** | — | `chroma_subsampling`, `color_depth`, `force_ai_sr`, `luma_denoise` |
| **Telchemy Metrics** | — | `vstq`, `vsmq`, `epsnr`, `mapdv`, `ppdv`, `tr101290_strict` |
| **QoE/QoS Engine** | — | `target_mos`, `jitter_ms_max`, `pl_tolerance`, `format` |
| **HW Decode Policy** | — | Fuerza decodificación por hardware en todos los perfiles |
| **Manifest Preference** | — | Prioriza DASH > HLS > TS según capacidad del player |
| **Codec Priority** | — | Jerarquía: AV1 > VP9 > HEVC > H.264, con fallback automático |

---

## Workflow de Implementación

### Paso 1: Generar la Lista M3U8 Limpia

```bash
python3.11 /home/ubuntu/skills/iptv-ape-architect/scripts/generate_clean_m3u8.py \
  --map /var/www/html/channels_map.json \
  --host https://iptv-ape.duckdns.org \
  --output /var/www/html/CLEAN_LIST.m3u8
```

### Paso 2: Desplegar el Cerebro Único en el VPS

```bash
scp /home/ubuntu/skills/iptv-ape-architect/templates/resolve_quality.v17.php \
    root@<VPS_IP>:/var/www/html/resolve_quality.php
scp /path/to/channels_map.json root@<VPS_IP>:/var/www/html/channels_map.json
ssh root@<VPS_IP> "
    mkdir -p /dev/shm/ape_guardian /dev/shm/ape_metrics /dev/shm/ape_guardian/mutation_plans
    chmod 777 /dev/shm/ape_guardian /dev/shm/ape_metrics
    systemctl reload php8.1-fpm && systemctl reload nginx
"
```

### Paso 3: Validar el Ecosistema

```bash
curl -s "https://iptv-ape.duckdns.org/resolve_quality.php?ch=30&p=P1&bw=80000000&ping=5" | head -5
ssh root@<VPS_IP> "tail -5 /dev/shm/ape_guardian/events.jsonl"
```

---

## Diagnóstico Rápido de Fallos

| Síntoma | Causa Probable | Solución |
|:--------|:---------------|:---------|
| `Unexpected token` en ExoPlayer | `#EXTHTTP` con valor no-string | Ejecutar validador JSON. Revisar `http_headers_overrides` en el ADN. |
| Freeze cada 2 minutos | `startNumber="1"` fijo en DASH | Verificar que `resolve_quality.php` usa `epochAnchor` dinámico. |
| Buffering constante | Ruta 1 violada (ADN en URL) | Verificar que la URL del resolver solo lleva `bw`, `ping`, `buf`. |
| Canales sin calidad 4K | `dna_profile_overrides` no aplicado | Verificar Fase 7 (Herencia Estricta) en `resolve_quality.php`. |
| Telemetría vacía | RAM disk no creado | Ejecutar `mkdir -p /dev/shm/ape_guardian` en el VPS. |

---

## Referencias de Archivos

- `scripts/generate_clean_m3u8.py` — Generador de listas v17.1 con 3 rutas estrictas.
- `templates/resolve_quality.v17.php` — God-Tier Unified Resolver con 16 motores.
- `references/motor_specs.md` — Especificaciones técnicas detalladas de cada motor APE.
- `references/visual_quality_arrays.md` — Arrays de calidad visual por perfil (P0-P5).
