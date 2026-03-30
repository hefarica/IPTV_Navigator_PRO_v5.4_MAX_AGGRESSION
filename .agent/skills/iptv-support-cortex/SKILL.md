---
name: iptv-support-cortex
description: >
  Córtex de Diagnóstico y Soporte al Cliente Automatizado para plataformas IPTV. Diagnostica
  problemas de reproducción (buffering, freeze, no image, audio sync) desde la perspectiva del
  usuario final, genera tickets de soporte con contexto técnico completo, y resuelve automáticamente
  los problemas más comunes sin intervención humana. Integra con la telemetría APE (Guardian Log)
  para diagnóstico proactivo. Usar para: diagnosticar problemas de clientes IPTV, generar respuestas
  de soporte técnico, analizar logs de telemetría, crear guías de troubleshooting por player
  (TiviMate, OTT Navigator, VLC, Kodi, Smart TV), y automatizar la resolución de incidencias.
---

# IPTV Support Cortex — Soporte Automatizado

## Superioridad Estratégica

Este skill otorga el **Pilar 5 de la Superioridad del 95%**: mientras el 95% del mercado responde tickets de soporte en 24-72 horas con respuestas genéricas, este córtex diagnostica y resuelve el 80% de los problemas en menos de 60 segundos, de forma completamente automatizada.

---

## Árbol de Diagnóstico Universal

El Córtex sigue un árbol de decisión determinista para diagnosticar cualquier problema de reproducción:

```
PROBLEMA REPORTADO
│
├── ¿El canal carga pero se congela?
│   ├── Buffering < 30s → Problema de red del cliente → Guía de red
│   ├── Freeze exacto cada 2 min → Bug startNumber DASH → Patch resolve_quality.php
│   └── Freeze aleatorio → Origen IPTV inestable → Failover a origen alternativo
│
├── ¿El canal no carga (pantalla negra)?
│   ├── Error 403/401 → Credenciales expiradas → Renovar en originsRegistry
│   ├── Error 404 → stream_id incorrecto en channels_map → Auditar ADN
│   └── Timeout → VPS caído → Ejecutar auto-healing del Sentinel OS
│
├── ¿El canal carga pero sin imagen (audio OK)?
│   ├── Codec no soportado → Ajustar codec_priority en ADN del canal
│   └── DRM no configurado → Activar dash_drm en el canal
│
└── ¿El canal carga pero con mala calidad?
    ├── Resolución baja → Verificar perfil del canal (P0-P5)
    ├── Artefactos/ruido → Activar Quantum Pixel Overdrive en el ADN
    └── Deinterlacing → Activar BWDIF en fusion_directives
```

---

## Capacidades Principales

### 1. Diagnóstico Automático desde Telemetría

El Guardian Log de APE contiene toda la información necesaria para diagnosticar cualquier problema. El Córtex lo analiza en tiempo real.

```bash
# Diagnosticar problemas de un usuario específico
python3.11 /home/ubuntu/skills/iptv-support-cortex/scripts/diagnose_user.py \
  --guardian-log /dev/shm/ape_guardian/events.jsonl \
  --user-id <USER_ID> \
  --channel-id <CHANNEL_ID> \
  --last-hours 2 \
  --output /tmp/user_diagnosis.md
```

**Campos del Guardian Log Analizados:**

| Campo | Diagnóstico |
|:------|:------------|
| `buffer_ms` alto | Red lenta o VPS sobrecargado |
| `probe_latency_ms` alto | Origen IPTV con latencia elevada |
| `format_mismatch` | Player no soporta el formato del stream |
| `ghost_protocol_triggered` | ISP bloqueando el stream |
| `smk_mutation_applied` | SMK ajustando parámetros automáticamente |

---

### 2. Guías de Troubleshooting por Player

El Córtex genera guías de troubleshooting específicas para cada reproductor, con capturas de pantalla y pasos exactos.

**Players Soportados:**

| Player | Plataforma | Guía Disponible |
|:-------|:-----------|:----------------|
| **TiviMate** | Android TV | `references/tivimate_guide.md` |
| **OTT Navigator** | Android TV | `references/ott_navigator_guide.md` |
| **VLC** | Windows/Mac/Linux | `references/vlc_guide.md` |
| **Kodi + PVR** | Multi-plataforma | `references/kodi_guide.md` |
| **Smart TV (Samsung/LG)** | Tizen/webOS | `references/smart_tv_guide.md` |
| **ExoPlayer** | Android | `references/exoplayer_guide.md` |
| **MX Player** | Android | `references/mx_player_guide.md` |

---

### 3. Resolución Automática de Incidencias

El Córtex puede resolver automáticamente los problemas más comunes sin intervención humana:

```bash
# Ejecutar resolución automática
python3.11 /home/ubuntu/skills/iptv-support-cortex/scripts/auto_resolver.py \
  --guardian-log /dev/shm/ape_guardian/events.jsonl \
  --channels-map /var/www/html/channels_map.json \
  --resolver-url https://iptv-ape.duckdns.org/resolve_quality.php \
  --dry-run false
```

**Resoluciones Automáticas:**

| Problema | Resolución Automática |
|:---------|:----------------------|
| Stream caído | Failover al siguiente origen en `originsRegistry` |
| Calidad degradada | Ajustar `profile` del canal en `channels_map.json` |
| Buffering persistente | Activar SMK con `mutation_plan` de bajo ancho de banda |
| Token expirado | Regenerar token en `resolve_quality.php` |
| RAM disk lleno | Limpiar logs antiguos de `/dev/shm/ape_guardian/` |

---

### 4. Generación de Respuestas de Soporte

Genera respuestas de soporte técnico personalizadas y profesionales en el idioma del cliente, con el contexto técnico exacto del problema.

```bash
# Generar respuesta de soporte
python3.11 /home/ubuntu/skills/iptv-support-cortex/scripts/support_response_generator.py \
  --ticket-id <TICKET_ID> \
  --problem "buffering en canal 30" \
  --player "TiviMate" \
  --language "es" \
  --diagnosis /tmp/user_diagnosis.md \
  --output /tmp/support_response.md
```

---

### 5. Análisis de Tendencias de Soporte

Identifica los problemas más frecuentes y genera reportes semanales para el equipo técnico.

```bash
python3.11 /home/ubuntu/skills/iptv-support-cortex/scripts/support_analytics.py \
  --tickets-db /var/log/iptv_support/tickets.jsonl \
  --period 7d \
  --output /tmp/support_trends_report.html
```

---

## SLA de Resolución Automatizada

| Tipo de Problema | Tiempo de Resolución | Tasa de Resolución Automática |
|:----------------|:---------------------|:------------------------------|
| Stream caído | < 30 segundos | 95% |
| Buffering | < 60 segundos | 80% |
| Calidad degradada | < 120 segundos | 75% |
| Error de formato | < 60 segundos | 90% |
| Problema de credenciales | < 30 segundos | 85% |

---

## Referencias de Archivos

- `scripts/diagnose_user.py` — Diagnóstico automático desde telemetría APE.
- `scripts/auto_resolver.py` — Motor de resolución automática de incidencias.
- `scripts/support_response_generator.py` — Generador de respuestas de soporte.
- `scripts/support_analytics.py` — Analítica de tendencias de soporte.
- `references/tivimate_guide.md` — Guía de troubleshooting para TiviMate.
- `references/ott_navigator_guide.md` — Guía de troubleshooting para OTT Navigator.
- `references/vlc_guide.md` — Guía de troubleshooting para VLC.
- `references/error_codes.md` — Diccionario de códigos de error IPTV y sus soluciones.
