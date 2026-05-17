---
name: ext-x-program-date-time-emitter
description: Use when emitting `#EXT-X-PROGRAM-DATE-TIME:YYYY-MM-DDThh:mm:ss.sssZ` to anchor playlist time to wall clock.
specialist: S1
kind: satellite
parent: hls-rfc8216-media-playlist-builder
---

# ext-x-program-date-time-emitter

## Cuándo usarla
Use when emitting `#EXT-X-PROGRAM-DATE-TIME:YYYY-MM-DDThh:mm:ss.sssZ` to anchor playlist time to wall clock.

## Especialista
**IPTV/HLS Architect** — HLS/M3U8.
Domain mission: RFC 8216 compliance, M3U Plus emission, channel ordering, dedup.

## Anchor skill
Sub-skill of: **hls-rfc8216-media-playlist-builder** (ver `.agents/skills/hls-rfc8216-media-playlist-builder/SKILL.md` para el marco completo).

## Cuándo NO usarla
- Cuando el cambio caiga fuera de su micro-scope (delegar al anchor).
- Sin haber ejecutado `iptv-cortex-init-mandatory` y `iptv-pre-edit-audit`.
- Cuando viole `iptv-omega-no-delete`, `iptv-lab-ssot-no-clamp`, `iptv-no-hardcode-doctrine`, `iptv-vps-touch-nothing`.

## Inputs / Outputs
- Inputs: target file(s) + valor(es) a emitir / validar / sanitizar.
- Outputs: cambio atómico + validación syntax + audit-report entry.

## Archivos del repo
Permitidos: definidos por la tarea (siempre Read antes de Write/Edit).
Prohibidos: snapshots `vps-live-snapshot-*`, `OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH/`, `_audit_snapshot/`.

## Validaciones obligatorias
- Sintaxis del archivo modificado (node -c / php -l / python -m py_compile / nginx -t).
- Cross-check con el anchor para coherencia de scope.
- Smoke E2E del flujo afectado (lista generada, manifest fetch, segment fetch).

## Riesgos
- Si emite un tag en el tipo de playlist equivocado (M3U Plus vs Master HLS vs Media HLS), rompe el player.
- Si toca headers, riesgo de 403/EOF en upstreams (ver `secure-header-profiler`).
- Si toca tuning de red/buffer, riesgo de freeze (ver `iptv-autopista-doctrine`).

## Comandos permitidos / prohibidos
Hereda del anchor `hls-rfc8216-media-playlist-builder` y del set permitido por la doctrina IPTV.

## Checklist éxito
Ver `checklist.md`.

## Rollback
Heredada del anchor + `git checkout HEAD <file>` para reversión local atómica.

## Métricas que mejora
Sub-set de las métricas del anchor `hls-rfc8216-media-playlist-builder` (QoE composite, error rate, compatibilidad player).
