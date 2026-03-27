---
description: Checklist de pre-generación M3U8 — verificar integridad del pipeline antes de generar listas. Incluye checks multi-servidor v10.4.
---

# 🛡️ Pre-Generation Integrity Checklist v10.4

> Ejecutar este workflow ANTES de generar cualquier lista M3U8 y DESPUÉS de cualquier
> modificación a los generadores, validators, o post-processors.
> Skill de referencia: `pipeline_blindaje_m3u8/SKILL.md`

// turbo-all

## Paso 1: Syntax Check de todos los archivos críticos

```powershell
$files = @("frontend/app.js","frontend/js/ape-v9/generation-validator-v9.js","frontend/js/ape-v9/m3u8-post-processor.js","frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js","frontend/js/m3u8-world-class-generator.js","frontend/js/m3u8-generator-v16-elite.js"); foreach($f in $files) { Write-Host "Checking $f..."; node -c $f }
```

**Resultado esperado**: Todos deben pasar sin errores.

## Paso 2: Verificar Canal Source (Contrato #1)

```powershell
Select-String -Path "frontend/app.js","frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js","frontend/js/m3u8-generator-v16-elite.js" -Pattern "getFilteredChannels"
```

**Resultado esperado**: Al menos 5 ocurrencias en los archivos correctos.

🔴 **ALERTA**: Si algún generador usa `this.state.channels` o `this.state.channelsMaster` directamente → ES UN BUG.

## Paso 3: Verificar Credential Isolation (Contrato #2)

```powershell
Select-String -Path "frontend/app.js","frontend/js/m3u8-world-class-generator.js","frontend/js/m3u8-generator-v16-elite.js","frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js" -Pattern "channelServerId"
```

**Resultado esperado**: Cada generador debe tener `channel._source || channel.serverId || channel.server_id`.

## Paso 4: Verificar Schema Gate NO tiene deduplicación (Contrato #5)

```powershell
Select-String -Path "frontend/js/ape-v9/generation-validator-v9.js" -Pattern "seenUrls|dedupeKey|\.has\(dedup"
```

**Resultado esperado**: CERO resultados. Si hay resultados → deduplicación presente → 🔴 REGRESIÓN CRÍTICA.

> **Contexto**: El Schema Gate (generation-validator-v9.js) NUNCA debe deduplicar.
> La deduplicación la hace `app.js → _deduplicateChannels()` con key `serverId:stream_id`.
> El Schema Gate con dedup mata 99.9% de canales (6799 de 6802).

## Paso 5: Verificar URL Validation Gate (Contrato #7)

```powershell
Select-String -Path "frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js" -Pattern "isValidStreamUrl"
```

**Resultado esperado**: Debe existir la validación que rechaza URLs que son solo hostnames.

🔴 Si no existe → `buildChannelUrl()` aceptará URLs truncadas como `http://line.tivi-ott.net` → BUG.

## Paso 6: Verificar Schema Gate Entry Point (Contrato #5)

```powershell
Select-String -Path "frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js" -Pattern "validateAndTranslate"
```

**Resultado esperado**: Debe existir la llamada en `generateM3U8()` entry point.

## Paso 7: Verificar Tag Order (Contrato #3)

En `app.js` función `generateM3U8()`, verificar que:

```text
1. content += `#EXTINF:-1 ${tags},${name}\n`;      ← PRIMERO
2. content += `#EXTHTTP:...`;                        ← SEGUNDO
3. content += `#EXTVLCOPT:...`;                      ← TERCERO
4. content += `${streamUrl}\n`;                       ← ÚLTIMO
```

## Paso 8: Verificar VLC Dedup (Contrato #4)

```powershell
(Select-String -Path "frontend/js/m3u8-world-class-generator.js" -Pattern "http-user-agent").Count
```

**Resultado esperado**: Solo **1** ocurrencia. Si > 1 → UAs duplicados → BUG.

## Paso 9: Verificar Post-Processor (Contrato #6)

```powershell
Select-String -Path "frontend/index-v4.html" -Pattern "m3u8-post-processor"
```

**Resultado esperado**: El script tag `m3u8-post-processor.js` debe estar presente.

## Paso 10: Verificar SchemaTranslator preserva serverId (Contrato #2 v10.4)

```powershell
Select-String -Path "frontend/js/ape-v9/generation-validator-v9.js" -Pattern "serverId: channel.serverId"
```

**Resultado esperado**: Debe existir `serverId: channel.serverId` en el return del `translate()` method.

🔴 Si no existe → SchemaTranslator elimina serverId → TODAS las URLs van al primer servidor.

## Paso 11: Verificar NO hay fallback servers[0] sin condición (Contrato #2 v10.4)

```powershell
Select-String -Path "frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js" -Pattern "servers\[0\]"
```

**Resultado esperado**: CERO resultados. Si hay resultados → lazy fallback presente → 🔴 REGRESIÓN.

> **Contexto**: En 2026-03-26 se descubrió que `servers[0]` fallback asignaba TODOS los canales
> sin serverId al primer servidor (TIVISION), ignorando Dream4K y KEMOTV.

## Paso 12: Verificar generation-controller sin firstKey fallback (Contrato #2 v10.4)

```powershell
Select-String -Path "frontend/generation-controller.js" -Pattern "firstKey"
```

**Resultado esperado**: CERO resultados. Si hay resultados → lazy fallback presente → 🔴 REGRESIÓN.

---

## Resultado Final

Si TODOS los 12 pasos pasan → ✅ Pipeline blindado, se puede generar.
Si CUALQUIER paso falla → 🔴 DETENER generación y revisar Skills:
- `pipeline_blindaje_m3u8/SKILL.md`
- `auditoria_forense_pipeline_m3u8/SKILL.md`
- `balanced_scorecard_m3u8/SKILL.md`
