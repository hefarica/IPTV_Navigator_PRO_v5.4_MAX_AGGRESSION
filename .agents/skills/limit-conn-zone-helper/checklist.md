# Checklist — limit-conn-zone-helper

## Pre-cambio
- [ ] `iptv-cortex-init-mandatory` ejecutado (5-layer scan).
- [ ] `iptv-pre-edit-audit` ejecutado por cada archivo objetivo.
- [ ] Git status limpio o lock declarado en `.agent/COORDINATION.md`.
- [ ] Backup tomado donde aplica (Excel `.xlsm.bak_TS`, VPS `*.bak_pre_change_TS`).
- [ ] Validación de scope: archivo objetivo NO está en `OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH/`.
- [ ] Especialista responsable identificado: **Nginx/OpenResty/Lua Engineer**.

## Durante el cambio
- [ ] Read antes de Edit/Write.
- [ ] Cambio atómico (1 archivo → 1 propósito → 1 commit cuando termine).
- [ ] Sin hardcode de valores que deberían venir de LAB SSOT.
- [ ] Sin eliminar funcionalidad existente sin reemplazo superior.
- [ ] Sin headers tóxicos (Range, If-None-Match, TE, Priority).
- [ ] Sin mezclar tags LL-HLS en playlists M3U Plus o viceversa.

## Post-cambio (validaciones obligatorias)
- [ ] Sintaxis: `node -c` / `php -l` / `python -m py_compile` / `nginx -t` según aplique.
- [ ] JSON / YAML validados con `jq empty` / `python -m json.tool` / `yamllint`.
- [ ] Smoke E2E del flujo afectado (lista generada → manifest fetch → segment fetch sin error).
- [ ] No hay secretos commiteados (`grep -rE "password|token|api_key" --include="*.{js,py,php,sh,json,yaml,md}"`).
- [ ] Cero regresión en suites smoke test existentes.
- [ ] `audit-report.md` actualizado con entrada timestamped.

## Deploy (solo si aplica + autorización explícita)
- [ ] Backup remoto antes de scp.
- [ ] Diff remoto vs local pre-change (cero drift inesperado).
- [ ] nginx -t en VPS si tocó conf.
- [ ] Reload vs restart correcto (proxy_cache_path → restart, simple Lua → reload).
- [ ] Smoke test post-deploy (curl real endpoint + tail error.log 60s).
- [ ] Real channel zap si tocó shield/proxy.
- [ ] Observación 15-60 min post-deploy.

## Rollback (si falla)
- [ ] Plan de rollback documentado ANTES de ejecutar deploy.
- [ ] Comando exacto + backup file + verificación post-rollback definidos.
- [ ] Tiempo a rollback bajo presión: <2 min.

## Comunicación
- [ ] Cambio commiteado con mensaje convencional (`type(scope): summary`).
- [ ] Memoria actualizada si surgió aprendizaje no-obvio (`reference_*.md` o `feedback_*.md`).
- [ ] Reporte al usuario incluye: scope, archivos tocados, validaciones, riesgos, rollback.
