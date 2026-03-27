---
description: Protocolo de regresión M3U8 — ejecutar DESPUÉS de cualquier modificación a generadores, validators o post-processors para verificar que no se rompió ningún contrato. Incluye checks multi-servidor v10.4.
---

# 🔒 Post-Modification Regression Guard v10.4

> Ejecutar DESPUÉS de modificar cualquier archivo de generación M3U8.
> Si CUALQUIER paso falla → REVERTIR el cambio.
> Skill de referencia: `pipeline_blindaje_m3u8/SKILL.md`

// turbo-all

## Archivos Protegidos (disparar este workflow si se modifica alguno)

- `frontend/app.js` (funciones: generateM3U8, generateM3U8Pro, generateM3U8Ultimate)
- `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`
- `frontend/js/m3u8-world-class-generator.js`
- `frontend/js/m3u8-generator-v16-elite.js`
- `frontend/js/ape-v9/generation-validator-v9.js`
- `frontend/js/ape-v9/m3u8-post-processor.js`
- `frontend/generation-controller.js`
- `frontend/js/ape-v9/ape-module-manager.js`

---

## Paso 1: Syntax Check Total

```powershell
$files = @("frontend/app.js","frontend/js/ape-v9/generation-validator-v9.js","frontend/js/ape-v9/m3u8-post-processor.js","frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js","frontend/js/m3u8-world-class-generator.js","frontend/js/m3u8-generator-v16-elite.js"); foreach($f in $files) { Write-Host "Checking $f..."; node -c $f }
```

🔴 Si alguno falla → REVERTIR cambio inmediatamente.

## Paso 2: Contrato #1 — Canal Source

```powershell
Select-String -Path "frontend/app.js" -Pattern "generateM3U8Ultimate" -Context 0,5
```

**Verificar**: La línea `const channels = ...` debe ser `this.getFilteredChannels()`.

🔴 Si dice `this.state.channels` o `this.state.channelsMaster` → REGRESIÓN.

## Paso 3: Contrato #2 — Credential Isolation

```powershell
Select-String -Path "frontend/app.js","frontend/js/m3u8-world-class-generator.js","frontend/js/m3u8-generator-v16-elite.js" -Pattern "channelServerId"
```

**Verificar**: Al menos 3 archivos deben tener `channelServerId`.

🔴 Si algún generador usa `this.state.currentServer` directamente para construir URL → REGRESIÓN.

## Paso 4: Contrato #3 — Tag Order en PRO Basic

```powershell
Select-String -Path "frontend/app.js" -Pattern "EXTINF.*tags.*name|EXTVLCOPT|EXTHTTP" | Select-Object -First 10
```

**Verificar**: Las líneas de `#EXTINF` deben tener número de línea MENOR que `#EXTVLCOPT`.

🔴 Si EXTVLCOPT aparece con número menor que EXTINF → REGRESIÓN de tag order.

## Paso 5: Contrato #4 — VLC Dedup

```powershell
(Select-String -Path "frontend/js/m3u8-world-class-generator.js" -Pattern "http-user-agent").Count
```

**Verificar**: Debe ser exactamente **1**.

🔴 Si es > 1 → Duplicación de UAs → REGRESIÓN.

## Paso 6: Contrato #5 — Schema Gate NO tiene deduplicación

```powershell
Select-String -Path "frontend/js/ape-v9/generation-validator-v9.js" -Pattern "seenUrls|dedupeKey|\.has\(dedup"
```

**Verificar**: Debe retornar **CERO resultados**.

🔴 Si hay resultados → Deduplicación reintroducida → REGRESIÓN CRÍTICA.

> **Contexto histórico**: En 2026-03-25 se descubrió que la dedup del Schema Gate eliminaba
> 6799 de 6802 canales (99.9%) porque usaba `ch.id` (tvg-id) como key, que colisiona entre
> múltiples servidores. La dedup correcta la hace `app.js → _deduplicateChannels()`.

## Paso 7: Contrato #5 — Schema Gate Entry Point

```powershell
Select-String -Path "frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js" -Pattern "validateAndTranslate"
```

**Verificar**: Debe existir la llamada en el entry point de generación.

🔴 Si no existe → Schema Gate eliminado → REGRESIÓN CRÍTICA.

## Paso 8: Contrato #7 — URL Validation Gate

```powershell
Select-String -Path "frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js" -Pattern "isValidStreamUrl"
```

**Verificar**: Debe existir la validación en `buildChannelUrl()`.

🔴 Si no existe → URLs truncadas (solo hostname) serán aceptadas → BUG.

## Paso 9: Contrato #6 — Post-Processor

```powershell
Select-String -Path "frontend/index-v4.html" -Pattern "m3u8-post-processor"
```

**Verificar**: El script tag debe existir.

🔴 Si no existe → Post-Processor desconectado → REGRESIÓN.

## Paso 10: Contrato #8 — Channel Count Preservation

```powershell
Select-String -Path "frontend/js/ape-v9/generation-validator-v9.js" -Pattern "DEDUPLICATION REMOVED"
```

**Verificar**: Debe existir el comentario `v9.2: DEDUPLICATION REMOVED`.

🔴 Si no existe → Alguien reintrodujo dedup → VERIFICAR manualmente.

## Paso 11: Contrato #2 v10.4 — SchemaTranslator Passthrough

```powershell
Select-String -Path "frontend/js/ape-v9/generation-validator-v9.js" -Pattern "serverId: channel.serverId"
```

**Verificar**: Debe existir. SchemaTranslator.translate() DEBE preservar `serverId`.

🔴 Si no existe → SchemaTranslator elimina serverId → TODOS los canales van al primer servidor.

> **Contexto histórico**: En 2026-03-26 se descubrió que SchemaTranslator creaba objetos
> NUEVOS que eliminaban serverId, raw, stream_id, server_url. Esto causó que 100%
> de las URLs fueran de TIVISION cuando hay 3 servidores conectados.

## Paso 12: Contrato #2 v10.4 — No Lazy Server Fallback

```powershell
Select-String -Path "frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js","frontend/generation-controller.js" -Pattern "servers\[0\]|firstKey"
```

**Verificar**: Debe retornar **CERO resultados**.

🔴 Si hay resultados → lazy fallback presente → TODOS los canales sin serverId van al primer server.

## Paso 13: Contrato #2 v10.4 — Campos Críticos en translate()

```powershell
Select-String -Path "frontend/js/ape-v9/generation-validator-v9.js" -Pattern "stream_id: channel.stream_id|raw: channel.raw|server_url: channel.server_url"
```

**Verificar**: Debe retornar al menos **3 resultados** (stream_id, raw, server_url).

🔴 Si faltan → translate() no preserva campos de credential resolution → URLs rotas.

---

## Resultado

✅ 13/13 pasos PASS → Cambio aceptado, pipeline intacto.

🔴 Cualquier FAIL → **REVERTIR el cambio y consultar**:
- `pipeline_blindaje_m3u8/SKILL.md`
- `auditoria_forense_pipeline_m3u8/SKILL.md`
- `balanced_scorecard_m3u8/SKILL.md`
