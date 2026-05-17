---
name: nginx-openresty-streaming-proxy
description: Use when configuring nginx + OpenResty Lua as reverse proxy for HLS/CMAF (proxy_pass, timeouts, buffers, cache strategy, Lua phases).
specialist: S6
kind: anchor
---

# nginx-openresty-streaming-proxy

## 1. Nombre de la skill
nginx-openresty-streaming-proxy

## 2. Cuándo usarla
Use when configuring nginx + OpenResty Lua as reverse proxy for HLS/CMAF (proxy_pass, timeouts, buffers, cache strategy, Lua phases).

Anchored to specialist: **Nginx/OpenResty/Lua Engineer** (Edge/Proxy).
Mission: nginx -t, Lua phases, passthrough doctrine, no destructive cache

## 3. Cuándo NO usarla
- Cuando exista una skill satélite más específica que aplique al sub-problema.
- Cuando el cambio propuesto requiera tocar `iptv-vps-touch-nothing` o `iptv-omega-no-delete` sin autorización explícita del usuario.
- Cuando no se haya corrido el cortex init (`iptv-cortex-init-mandatory`).
- Cuando el contexto sea estrictamente legal/ético prohibido (DRM bypass, robo de señal, evasión de ISP).

## 4. Inputs esperados
- Ruta(s) de archivo objetivo (validados existentes vía Read antes de Edit).
- Estado git limpio (o lock declarado en `.agent/COORDINATION.md`).
- Outputs deseados (criterio de éxito medible).
- Si toca VPS o backend producción: confirmación explícita del usuario.

## 5. Outputs esperados
- Cambios atómicos en archivos del scope.
- Reporte de validaciones ejecutadas (node -c, php -l, python -m py_compile, nginx -t, etc.).
- Cero secretos commiteados (verificable con secret scanner).
- Cero regresión en suites de smoke test.
- Audit-report.md actualizado.

## 6. Archivos del repo que puede tocar
Definido por scope de la tarea. Sin autorización del usuario, NUNCA modifica:
- Archivos en `vps/vps-live-snapshot-*/` (snapshots históricos, read-only).
- Archivos en `_audit_snapshot/` (auditorías congeladas).
- Archivos `*.bak_*` (backups).
- Credenciales (`*.env`, `secrets/`, `*credentials*`).

## 7. Archivos que nunca puede tocar
- `.git/` (excepto via comandos git con autorización).
- `node_modules/`, `.venv/`, `vendor/` (deps gestionados).
- `OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH/` (warning literal).
- Archivos con sufijo `_BACKUP_*` o `_LEGACY` sin autorización.

## 8. Validaciones obligatorias
- Sintaxis: `node -c` (JS), `php -l` (PHP), `python -m py_compile` (Python), `nginx -t` (nginx), `luac -p` (Lua si disponible).
- JSON: `python -m json.tool` o `jq empty`.
- Funcional: smoke test del flujo end-to-end afectado.
- Seguridad: secret scan + dependency audit si tocó deps.
- Doctrina: cross-check con `iptv-omega-no-delete`, `iptv-lab-ssot-no-clamp`, `iptv-no-hardcode-doctrine`.

## 9. Riesgos
- Romper compatibilidad de player si se introducen tags HLS en playlist M3U Plus o viceversa.
- Romper continuidad de canal si timeout/buffer mal tuneado.
- Exponer secretos si .env no redactado.
- Drift entre LAB SSOT y código si se hardcodean valores.
- Regresión por not-reading-before-editing.

## 10. Comandos permitidos
- Read, Glob, Grep, Edit, Write (sobre archivos del scope).
- Bash (lecturas + validaciones syntax).
- TodoWrite, AskUserQuestion.
- Skill (cross-invocación de skills doctrinales).
- SSH a VPS solo con autorización explícita + backup + checklist `iptv-vps-touch-nothing`.

## 11. Comandos prohibidos
- `rm -rf /` o destructivos masivos.
- `git push --force` a master sin autorización.
- `git reset --hard` sobre commits compartidos.
- Modificar settings de Excel/PHP/nginx en producción sin checklist safe-mode.
- `curl | bash` desde fuentes no verificadas.
- Instalar dependencias sin auditoría previa.

## 12. Checklist de éxito
Ver `checklist.md`. Highlights:
- [ ] Cortex init ejecutado.
- [ ] Pre-edit audit por archivo.
- [ ] Backup pre-cambio donde aplica.
- [ ] Validaciones sintaxis OK.
- [ ] Smoke test E2E PASS.
- [ ] Cero secretos commiteados.
- [ ] Audit-report.md actualizado.
- [ ] Commit message convencional.

## 13. Rollback
- Frontend / Scripts: `git checkout HEAD <files>` + recargar Live Server.
- VPS Lua/PHP: `cp <bak> <target> && nginx -s reload` (NEVER restart si no se cambió proxy_cache_path).
- LAB Excel: restaurar `.bak_*` timestamped + verify hashes pre/post.
- DB / state: depende del cambio — siempre tener backup pre-write.

## 14. Métricas QoE / técnicas que debe mejorar
- Startup time (target <2s)
- Rebuffer ratio (target <0.5%)
- Stall count (target <1 / sesión 15 min)
- ABR switch frequency (target <2 / min)
- Manifest TTFB (target <100ms)
- Segment TTFB (target <500ms)
- Error rate 4xx (target <0.5%)
- EOF rate (target ~0%)
- VMAF score estimado (target >80 para variants top)
- MOS estimado (target >4.0)
