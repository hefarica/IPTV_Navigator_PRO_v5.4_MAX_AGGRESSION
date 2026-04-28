

# SOP: SHIELDED = Nombre de Archivo, NUNCA URLs Internas

> **REGLA CARDINAL INMUTABLE — 2026-04-28**

## Definición

SHIELDED en el ecosistema IPTV significa **SOLO** renombrar el archivo M3U8 con sufijo `_SHIELDED.m3u8` al subirlo al VPS. Las URLs internas de los canales son y DEBEN SER directas al proveedor (`http://proveedor/live/user/pass/id.m3u8`).

## Arquitectura

```
URL principal (SHIELDED):
  https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8
  ↑ Servida desde el VPS

URLs internas (DIRECTAS — correcto por diseño):
  http://nfqdeuxu.x1megaott.online/live/USER/PASS/123.m3u8
  http://tivigo.cc/live/USER/PASS/456.m3u8
  ↑ El WireGuard tunnel las captura y las rutea por NGINX

Player → WireGuard → VPS (DNS hijack + NGINX) → SurfShark → Proveedor
```

## Prohibiciones absolutas

1. **NUNCA** modificar `m3u8-typed-arrays-ultimate.js` para agregar `/shield/` a URLs
2. **NUNCA** modificar `generateChannelEntry()` para wrapping de URLs
3. **NUNCA** modificar `buildChannelUrl()` ni `buildUniversalUrl()` para shielding
4. **NUNCA** transformar `http://proveedor/` → `https://iptv-ape.duckdns.org/shield/{hash}/proveedor/`
5. **NUNCA** sugerir que los freezes se arreglan "shieldeando las URLs internas"

## Único punto de shielding en código

`gateway-manager.js` línea ~738: `finalFilename.replace(/\.m3u8$/i, '_SHIELDED.m3u8')`

## Evidencia

Lista `APE_LISTA_1777243113563_SHIELDED.m3u8`: 15,444 URLs directas, 0 con `/shield/`, funciona perfectamente via WireGuard tunnel.

## Aclaración — el sufijo es FUNCIONAL, no cosmético

El sufijo `_SHIELDED.m3u8` dispara **3 efectos funcionales** en el pipeline:

1. Renombra el filename del archivo generado (`gateway-manager.js` ~L738).
2. Determina la URL pública específica VPS que el player consume.
3. Mete al archivo entero por el VPS desde el primer byte (player descarga `.m3u8` del VPS, no del proveedor).

Las URLs **internas de canales** son VERBATIM directas al proveedor — esa parte es la que NUNCA se transforma. Distinción crítica: sufijo funcional vs URLs internas VERBATIM. Confundirlas = violación de doctrina.

## Documentos hermanos (triangulación cross-agent)

Esta SOP es la encarnación Gemini de una regla triangulada:

**4 documentos doctrinales:**
- `.agent/skills/shielded_architecture_immutable/SKILL.md` (Claude Code skill — doctrina + invariantes)
- `.agent/skills/shielded_architecture_immutable/WORKFLOW_BLOQUEANTE.md` (gate bash cross-agent)
- `.agent/skills/shielded_architecture_immutable/VPS_SHIELDED_MODULES.md` (inventario completo 12 capas A-L + §8 PRISMA injection model)
- `.gemini/settings/shielded-sop.md` (este archivo, audiencia Gemini CLI)

**5 documentos forenses (autoritativos — Claude Code workflows):**
- `.agent/workflows/sop-shielded-architecture-complete.md` — SOP unificado
- `.agent/workflows/sop-shielded-forensic-part1-doctrine.md` — 12 prohibiciones + pipeline 11 pasos
- `.agent/workflows/sop-shielded-forensic-part2-nginx-lua.md` — NGINX + 6 hooks Lua con código real
- `.agent/workflows/sop-shielded-forensic-part3-prisma-kernel.md` — PRISMA + PHP + Kernel sysctl + Systemd
- `.agent/workflows/sop-shielded-forensic-part4-operations.md` — Diagnóstico + invariantes + conteo (107 archivos / ~1.06 MB)

**1 snapshot código fuente real:**
- `IPTV_v5.4_MAX_AGGRESSION/vps/vps-live-snapshot-20260428/` — 38 archivos × 256 KB

Los 10 documentos son **sincrónicos**. Si uno se modifica, los otros DEBEN actualizarse en el mismo commit. Drift entre ellos → riesgo de violación de la doctrina por agentes desincronizados.
