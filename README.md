# IPTV Navigator PRO v5.4 — APE CRYSTAL FLOW

**Estado del arte del repo:** [`docs/architecture/ESTADO_DEL_ARTE_20261115.md`](docs/architecture/ESTADO_DEL_ARTE_20261115.md)

**Sistema vigente:** APE CRYSTAL FLOW — las cinco estaciones `GENERADOR -> CABLEADO -> AGENTE -> SHIM -> MEDICION`.
El documento enlazado dice qué es REAL (con su número y su comando), qué es ASPIRACIONAL (existe en el repo, no en producción) y qué está DESCARTADO (probado imposible aquí).

**Listón congelado:** [`docs/architecture/BASELINE_APE_CRYSTAL_FLOW_20261114.md`](docs/architecture/BASELINE_APE_CRYSTAL_FLOW_20261114.md). Si un número baja, es regresión aunque compile.

## Los gates

```bash
bash tools/quality/gate_no_focus_steal.sh     # estatico  · PASS 8/0
bash tools/quality/gate_ape_crystal_flow.sh   # flujo HTTP real · 8 PASS/0 en el VPS
bash tools/ops/ape-device-health.sh           # device por adb · 7 PASS/0 + 1 SKIP
```

Cualquiera que devuelva `exit 1` bloquea.

## Qué es y qué no es

Generador de listas + cableador en el VPS (envuelve cada canal en `/pulse/<id>`, un solo slot por lista) + agente Android + shim loopback + medidor. **El VPS no transporta vídeo**: es metadata-only.
