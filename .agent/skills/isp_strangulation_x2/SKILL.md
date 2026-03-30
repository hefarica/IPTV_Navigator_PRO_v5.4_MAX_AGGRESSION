---
name: isp_strangulation_x2
description: ISP Strangulation x2 — REGLA ABSOLUTA. El resolver SIEMPRE pide el DOBLE de lo normal. Los valores del frontend (Gestor de Perfiles APE v9.0) son el PISO, y el resolver los escala exponencialmente en tiempo real según necesidad. NUNCA degradar calidad proactivamente.
---

# Skill: ISP Strangulation x2 — Regla de Agresión Máxima

## REGLA ABSOLUTA

> **El resolver SIEMPRE pide el DOBLE de lo que se pediría normalmente.**
> Los valores del frontend (Gestor de Perfiles APE v9.0) son el **PISO MÍNIMO**.
> El resolver los cuida, los respeta, y los **mejora exponencialmente en tiempo real** cuando detecta que los necesita.

## Filosofía

1. **NUNCA degradar proactivamente** — Si el stream tiene problemas, ESCALAR, no reducir
2. **Los valores del frontend son el PISO** — El resolver solo sube, nunca baja
3. **Exponencial en tiempo real** — Si hay cortes, ACRP escala buffers x1.5, luego x2, luego x3
4. **ISP = enemigo** — Asumir que el ISP throttlea. Combatir con DSCP 63, BBR, TCP paralelo, prefetch masivo

## Valores Aplicados (Anti-Cut Engine v1.1)

### P1-THERMONUCLEAR (antes NUCLEAR)

| Parámetro | Antes | Ahora (x2) |
|-----------|-------|-------------|
| buffer_max | 300,000ms | **600,000ms** |
| buffer_target | 60,000ms | **120,000ms** |
| network_caching | 80,000ms | **160,000ms** |
| live_caching | 80,000ms | **160,000ms** |
| file_caching | 300,000ms | **600,000ms** |
| prefetch_segments | 500 | **1,000** |
| prefetch_parallel | 250 | **500** |
| vlc_network_caching | 180,000ms | **360,000ms** |
| vlc_live_caching | 120,000ms | **240,000ms** |
| vlc_disc_caching | 300,000ms | **600,000ms** |
| vlc_file_caching | 300,000ms | **600,000ms** |
| parallel_segments | 4,6,8 | **8,12,16** |
| concurrent_downloads | 4,6,8 | **8,12,16** |
| aggression_multiplier | 10x | **20x** |
| reconnect_max | 500 | **999** |

### Todos los perfiles escalados:
- **P1** → THERMONUCLEAR (x2)
- **P2** → NUCLEAR (x2)
- **P3** → AGGRESSIVE (x2, DSCP 46→56)
- **P4** → STANDARD+ (x2, DSCP 34→46, seamless_failover=true)
- **P5** → AGGRESSIVE-MIN (x2, DSCP 26→46)

### Resolve caching caps
- `min(..., 600000)` → `min(..., 1200000)` en SNIPER SCALE

## Valores de Referencia del Frontend (Gestor de Perfiles APE v9.0)

Estos valores del frontend son el **PISO** que el resolver honra y escala:

```
P2 - 4K_EXTREME:
  Resolución: 4K (3840x2160)
  Códec: AV1 (Eco Max)
  FPS: 120
  Buffer Base: 15s
  Estrategia: Ultra aggressive
  Player Buffer: 51,000ms
  Buffer C1 (Network): 15,000ms
  Buffer C2 (Live): 15,000ms
  Buffer Total: 81,000ms
  Headers Count: 144
  Clock Jitter: 1,500ms
  
PREFETCH INTELIGENTE:
  Estrategia: Ultra-Agresivo
  Segmentos a precargar: 90
  Descargas paralelas: 40
  Buffer Objetivo: 81s
  BW Mínimo: 81 Mbps
  Adaptación Inteligente: ✅
  Predicción AI: ✅
```

## Escalamiento en Tiempo Real

El resolver (via SNIPER MODE + ACRP) escala así:

```
Canal IDLE       → Valores base del perfil
Canal RECENT     → x1.5 prefetch, x1.2 buffer
Canal STREAMING  → x3.0 prefetch, x2.0 buffer (SNIPER NUCLEAR)
ACRP COOLDOWN    → x2.0 prefetch (lock calidad 900s)
ACRP RECONNECTING → x3.0 prefetch, x2.0 buffer + 6 conexiones paralelas
Proxy activo     → +30% prefetch, +15% buffer adicional
```

## Verificación

```bash
# Valores P1 en anti-cut engine
grep -A5 "'P1'" /var/www/html/iptv-ape/rq_anti_cut_engine.php | grep buffer_max
# Esperado: 600000

# Caching caps en resolve
grep '1200000' /var/www/html/iptv-ape/resolve_quality.php | wc -l
# Esperado: >0

# DSCP en P3+
grep dscp /var/www/html/iptv-ape/rq_anti_cut_engine.php
# Esperado: 63, 56, 56, 46, 46
```
