---
name: h266-vvc-codec-string-builder
description: Use when emitting H.266/VVC codec string (`vvc1.X.X.X.X`) for VVC-capable HLS/DASH.
specialist: S3
kind: satellite
parent: codec-rfc6381-string-validator
---

# h266-vvc-codec-string-builder

## Cuándo usarla
Use when emitting H.266/VVC codec string (`vvc1.X.X.X.X`) for VVC-capable HLS/DASH.

## Especialista
**Video Codec Engineer** — Codec/Container.
Domain mission: H.264/H.265/H.266/AV1/VP9 profile-level coherence + RFC 6381 codec strings.

## Anchor skill
Sub-skill of: **codec-rfc6381-string-validator** (ver `.agents/skills/codec-rfc6381-string-validator/SKILL.md` para el marco completo).

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
Hereda del anchor `codec-rfc6381-string-validator` y del set permitido por la doctrina IPTV.

## Checklist éxito
Ver `checklist.md`.

## Rollback
Heredada del anchor + `git checkout HEAD <file>` para reversión local atómica.

## Métricas que mejora
Sub-set de las métricas del anchor `codec-rfc6381-string-validator` (QoE composite, error rate, compatibilidad player).
