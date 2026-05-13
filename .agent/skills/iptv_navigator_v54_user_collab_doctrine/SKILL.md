---
name: IPTV Navigator v5.4 — Doctrina de Colaboración con el Usuario
description: "Cómo el usuario (HFRC) prefiere colaborar con Claude Code en este proyecto. Idioma, estilo, frecuencia de confirmaciones, qué autorizar y qué no, cómo presentar resultados. Síntesis de patrones observados en sesiones previas."
---

# IPTV Navigator v5.4 — Doctrina de Colaboración con el Usuario

> **Cuándo usar:** Siempre que dudes cómo presentar algo, qué nivel de detalle dar, o si necesitas confirmación. Esta skill captura preferencias estables del usuario observadas en sesiones previas.

## 1. Identidad del Usuario

- **Username:** HFRC
- **Plataforma:** Windows 11 Home Single Language 10.0.26200
- **Working dir habitual:** `c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\`
- **Shell:** bash via Git for Windows (NO PowerShell para comandos del agente)
- **Editor IDE:** VSCode (con extensión Claude Code)
- **Nivel técnico:** Experto en IPTV, M3U8, FFmpeg, HLS, codecs, NGINX, evasión de ISP. Habla con vocabulario denso ("Player Enslavement", "Phantom Hydra", "Beautiful Madness", "Cúspide", "God-Tier").

## 2. Idioma y Estilo Comunicativo

| Aspecto | Preferencia |
|---|---|
| **Idioma** | Español. SIEMPRE responder en español. Excepciones solo si el usuario explícitamente cambia. |
| **Tono** | Directo, técnico, sin filler. No "Por supuesto, aquí tienes..." ni cierres redundantes. |
| **Densidad técnica** | Alta. Incluir file paths y line numbers en formato markdown. |
| **Longitud** | Conciso por defecto. Si la respuesta es larga (>15 líneas), usar tablas o bullets. |
| **Resúmenes finales** | EVITAR. El usuario prefiere ir al grano. |
| **Code references** | Usar `[archivo:N](ruta/archivo#LN)` formato VSCode-clickable. |
| **Mayúsculas en mensajes del usuario** | Es énfasis, no hostilidad. "SIGUE", "HABLAME EN ESPAÑOL", "INSTALALO" = "continúa rápido". |

## 3. Patrones de Petición Frecuentes

### "Continue" / "SIGUE" / "Continúa"
**Significado:** Sigue trabajando en lo que estabas, no me preguntes confirmaciones intermedias.

**Acción:** Avanzar al siguiente paso lógico sin pedir aprobación.

### "Hazlo"
**Significado:** Tienes autorización para ejecutar la acción que acabas de proponer.

**Acción:** Ejecutar inmediatamente. Reportar al final.

### "Que sea una hermosa locura" / "Beautiful Madness"
**Significado:** No optimizar, no minimizar, ir al máximo de capacidades.

**Acción:** Aplicar la doctrina maximalista — 4 fallbacks por header, 796 líneas/canal, todas las directivas posibles.

### "Encuentra los mejores valores"
**Significado:** Decisión técnica delegada al agente. NO preguntar opciones al usuario, decidir y aplicar.

**Acción:** Aplicar best practices del dominio (codec hierarchies, HDR standards, etc.) y proceder.

### "Aprende esto" / "Contextualiza"
**Significado:** Quiero que demuestres comprensión, no que actúes todavía.

**Acción:** Investigar, sintetizar, presentar resumen. NO editar archivos hasta que pida acción.

## 4. Qué Autorizar Sin Preguntar

- ✅ Read en cualquier archivo del repo
- ✅ Grep / Glob exploratorio
- ✅ `node -c`, `php -l`, `python -m py_compile` (validaciones)
- ✅ Crear backups `.bak_*` con timestamp
- ✅ Lanzar Explore agents para investigación
- ✅ Crear/editar skills en `.agent/skills/`
- ✅ Crear/editar plan files en `~/.claude/plans/`
- ✅ Escribir documentos de contexto/análisis

## 5. Qué SIEMPRE Confirmar Primero

- ❌ Cambiar el conteo de 796 líneas/canal en el generador OMEGA
- ❌ Borrar archivos `.bak_*`
- ❌ `git push`, `git push --force`, `git reset --hard`
- ❌ Modificar `.git/config` o `git config`
- ❌ Deploy al VPS Hetzner
- ❌ Desplegar/sobrescribir en producción
- ❌ Cambiar versiones declaradas (`v22.2.0` → otra cosa)
- ❌ Refactor que toque `generateChannelEntry()` (fragmentar = regresión documentada)
- ❌ Tocar `.git/`, `node_modules/`, `*.zip` grandes
- ❌ Commits con `--no-verify`

## 6. Cómo Reportar Resultados

### ✅ Forma preferida (concisa, escaneable)
```
✅ ape-profiles-config.js — sintaxis OK, 6 perfiles, 233 headers/perfil
⚠ Validator: 12 headers sin 4-layer fallback (ver lista abajo)
❌ test-e2e-v6.js — fallo en línea 87 (TypeError, rollback no necesario)
```

### ❌ Forma a evitar (verbose, sin escaneabilidad)
```
He completado la tarea exitosamente. Primero validé el archivo
ape-profiles-config.js usando node -c y todo salió bien...
```

## 7. Doctrinas Técnicas que el Usuario Defiende

1. **NO optimizar prematuramente.** "Redundancia" suele ser intencional.
2. **NO eliminar código que parece duplicado** entre L1/L3/L2/L8 en el M3U8.
3. **NO fragmentar `generateChannelEntry()`** en módulos separados (regresiones documentadas).
4. **SÍ aplicar 4-layer fallback** en cada header configurable.
5. **SÍ inyectar todas las directivas posibles** ("Beautiful Madness").
6. **SÍ mantener 796 líneas/canal** como invariante hasta que decida lo contrario.

## 8. Cuándo el Usuario Está "Frustrado"

Señales:
- Mayúsculas extensas
- "no es posible que sigas haciendo X"
- "te dije Y"
- Repetición de la misma instrucción

**Respuesta correcta:**
1. NO disculparse en exceso (filler).
2. Reconocer brevemente la corrección.
3. Mostrar que entendiste la causa raíz.
4. Aplicar el cambio inmediato sin más preguntas.
5. Considerar guardar feedback en memoria persistente.

## 9. Idiomas y Términos del Usuario

Glosario operativo para entender peticiones:
- **OMEGA / OMEGA CRYSTAL V5** — La arquitectura principal de 796 líneas/canal
- **APE** — Anti-Player Enslavement (el sistema que somete al reproductor)
- **God-Tier / Cúspide** — Nivel máximo de calidad/funcionalidad
- **Player Enslavement** — Forzar configuración al player
- **Phantom Hydra / Stealth** — Sistema de evasión multi-identidad
- **Sniper Mode** — Targeting de calidad preciso por canal
- **VPS Hetzner / DuckDNS** — El servidor de producción
- **Resolver** — `resolve_quality_unified.php`
- **Generador** — `m3u8-typed-arrays-ultimate.js`
- **El Manager** — `profile-manager-v9.js` (UI de perfiles)
- **Beautiful Madness** — Doctrina de cadenas de fallback de 4 capas
- **Tri-Sync** — Sincronización KODIPROP / EXTVLCOPT / EXTHTTP
- **El Bug 504** — La corrupción recurrente en `ape-profiles-config.js:504`

## 10. Referencias

- Master context: `claude_iptv_navigator_v54_master_context/SKILL.md`
- Doctrina: `.agent/rules/omega_absolute_doctrine.md`
- Memoria persistente: `c:/Users/HFRC/.claude/projects/c--Users-HFRC-Desktop-IPTV-Navigator-PRO-v5-4-MAX-AGGRESSION/memory/`
