# E7 · Observabilidad de la decisión (fase 6) — artefactos y cómo se usan

> Documento principal: [`docs/edge/E7_OBSERVABILITY.md`](../../../docs/edge/E7_OBSERVABILITY.md)
> Estado: **staged, NO desplegado**. La aplicación es de E10 (ventana §4 de `COORDENADAS_SESIONES.md`).

## Mapa rápido

```
lua/      5 módulos nuevos (librería + 3 handlers + endpoint) — se instalan en /etc/nginx/lua/
patches/  3 parches contra los bytes VIVOS (pineados por sha256)
stage/    copias de los ficheros vivos YA parcheados (referencia/auditoría)
live/     copia byte-exacta de los módulos vivos contra los que se generó todo
drift/    evidencia del cambio de producción del 2026-10-26 20:49:57Z (breaker fuera)
tests/    stub de ngx + 60 aserciones de la librería (Lua 5.1.5 real)
scripts/  preflight · apply · rollback · probe_remote · selftest_lua
tools/    e7_obs.mjs (probe | read | watch) — Node, 0 dependencias
runs/     evidencia: logs de preflight/selftest y los dos `probe` (con y sin breaker)
```

## Los tres comandos que importan

```bash
# 1 · baseline AHORA, sin desplegar nada (cabeceras X-APE-* + split primer/último hop)
node tools/e7_obs.mjs probe

# 2 · tras el despliegue: leer la ventana y contrastarla con el sobre esperado
node tools/e7_obs.mjs read --window 300
node tools/e7_obs.mjs read --strict          # exit 1 si algo rompe el sobre

# 3 · demostrar una mejora (o su ausencia): percentiles de la ventana Δ, no acumulados
node tools/e7_obs.mjs watch --window 300 --interval 300 --count 2
```

## Antes de aplicar (obligatorio)

```bash
scp -r _vps_stage/edge/E7_observability root@178.156.147.234:/tmp/e7-stage-src
ssh root@178.156.147.234 "STAGE=/tmp/e7-stage-src bash -s" < scripts/preflight_E7.sh
ssh root@178.156.147.234 "STAGE=/tmp/e7-stage-src bash -s -- --check" < scripts/apply_E7.sh
```

El preflight **aborta** si `ape_gateway.lua` (`2dc0fad8…`), `ape_obs.lua` (`f477741b…`) o
`conf.d/50-ape-meta-plane.conf` (`3e29b928…`) han cambiado: en ese caso hay que re-basar (ver §8 del
documento principal).

## Qué NO toca

`/var/www/lists`, `/lists/`, `gzip_static`/`gunzip`, la regla `.ts/.m4s/.mp4 → 404`, `resolve.php`,
`origins.php`, `ngx.exit(503)`, ningún circuit breaker, el gateway del 443 y ningún upstream. Solo añade
`log_by_lua` (fase log), un endpoint loopback y 5 ficheros Lua.
